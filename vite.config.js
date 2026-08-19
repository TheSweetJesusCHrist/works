import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// base: './' 让构建产物使用相对路径。
// vite-plugin-singlefile 把 JS/CSS 全部内联进 index.html，去掉"外部 module 文件 fetch"。
// 之后的 strip-module-script 钩子再把内联 <script type="module"> 改成普通 <script>，
// 因为 ES module 在 file:// 下会被浏览器 CORS 拦截、整段脚本不执行
//（表现为：双击 dist/index.html 后标题/选虫屏只是静态 HTML、按钮和贴图全失效）。
// 改成经典内联脚本后，双击即可直接运行。
//
// 但 singlefile 不会复制 public/ 文件夹，也不会内联"运行时字符串路径"引用的图片
//（本游戏所有贴图都以相对路径字符串写在 characters.json / Background.js 里，
// 例如 sprites/sprite_001.png、characters/...、textures/dog/...）。若不处理，
// 双击 dist 时即使 JS 跑起来了，这些 <img src> 仍指向不存在的 dist/sprites/... → 贴图全空。
//
// 因此 inline-public-assets 插件在【构建时】把 public/ 下每个真实存在的文件读成
// base64 data URI，并把源码里对应的相对路径字符串整字替换成 data URI。
// 这样最终 dist/index.html 是完全自包含的（JS + 全部贴图都内联），双击即玩。

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inlinePublicAssets() {
  const publicDir = path.resolve(__dirname, 'public');
  // manifest: 相对路径(含与不含 './' 两种写法) -> data URI
  const manifest = {};
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
  };
  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const relPath = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { walk(full, relPath); continue; }
      const ext = e.name.split('.').pop().toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      try {
        const b64 = fs.readFileSync(full).toString('base64');
        const uri = `data:${mime};base64,${b64}`;
        manifest[relPath] = uri;
        manifest['./' + relPath] = uri;
      } catch { /* 读不到就跳过，运行时该贴图走兜底 */ }
    }
  }
  walk(publicDir, '');

  const keys = Object.keys(manifest);

  return {
    name: 'inline-public-assets',
    enforce: 'pre',
    // 仅在构建时内联，保证 dev 模式仍走 public/ 静态服务（HMR 快、改动小）
    apply: 'build',
    transform(code, id) {
      if (id.includes('node_modules')) return null;
      const norm = id.replace(/\\/g, '/');   // Vite/Rollup 用正斜杠规范 id，跨平台统一判断
      const isTarget =
        norm.endsWith('characters.json') ||
        (norm.includes('/src/') && /\.(js|json)$/.test(norm));
      if (!isTarget) return null;

      let out = code;
      for (const rel of keys) {
        // 整字匹配被引号包裹的相对路径（支持 ' " ` 三种引号）
        const re = new RegExp("(['\"\`])" + escapeRegExp(rel) + "\\1", 'g');
        out = out.replace(re, '"' + manifest[rel] + '"');
      }
      if (out === code) return null;
      return { code: out, map: null };
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    inlinePublicAssets(),
    viteSingleFile(),
    {
      name: 'fix-script-timing',
      enforce: 'post',
      closeBundle() {
        const file = path.resolve(__dirname, 'dist', 'index.html');
        if (!fs.existsSync(file)) return;
        let html = fs.readFileSync(file, 'utf8');

        // A) 去掉 type="module"（file:// 下 ES module 会被 CORS 拦截）
        html = html.replace(/<script type="module"[^>]*>/g, '<script>');

        // B) 修复 <style> 标签：vite-plugin-singlefile 给内联 style 加了
        //    rel="stylesheet" crossorigin（这是 <link> 的属性，不是 <style> 的），
        //    某些浏览器/场景下可能导致样式表被忽略
        html = html.replace(/<style[^>]*>/, (match) => {
          return match.replace(/\s+rel=["'][^"']*["']/g, '')
                     .replace(/\s+crossorigin/g, '');
        });

        // C) 把 <head> 中的内联脚本移到 </body> 前
        //    singlefile 输出的 <script> 在 <head> 里、<body> 之前，
        //    脚本立即执行时 DOM 还没解析完，getElementById 全返回 null → 崩溃
        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        let injected = null;   // 供写入后自检比对（逐字节containment）
        if (scriptMatch) {
          const jsContent = scriptMatch[1];
          // 从 head 中删除原脚本。
          // 用索引切片而非 html.replace(scriptMatch[0], '')：replace 的第一个参数是字符串时虽然按
          // 字面匹配，但整体语义容易被后续维护者照抄到"替换值含 $"的场景（见下方 D 段血案）。
          // 这里统一用切片，全程不依赖 replace 语义。
          html = html.slice(0, scriptMatch.index) + html.slice(scriptMatch.index + scriptMatch[0].length);

          // 注入错误可见化：只在出错时才显示红框，正常启动完全无感
          const errorReporter = `
(function(){
  var errBox = null;
  function ensureBox(){
    if(!errBox){
      errBox = document.createElement('div');
      errBox.id = '__err_report__';
      errBox.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c00;color:white;padding:16px;font-family:monospace;font-size:14px;max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-all;';
      document.documentElement.appendChild(errBox);
    }
  }
  function showErr(msg){ensureBox();errBox.textContent += msg + '\\n---\\n';}
  window.onerror = function(msg, src, line, col, err) {
    showErr('[ERROR] ' + msg + '\\n  at ' + src + ':' + line + ':' + col +
        (err && err.stack ? '\\n' + err.stack : ''));
    return false;
  };
  window.__showErr = showErr;
})();
`;
          const wrappedJs = errorReporter + 'try{' + jsContent + '}catch(e){window.__showErr("[FATAL] " + e.message + "\\n" + e.stack);}';

          // D) 门禁 1：内联脚本正文中绝不允许出现 HTML 结束标签。
          //    浏览器的 HTML 解析器在 <script> 内部遇到 </script、</body、</html 会提前关闭标签，
          //    后半段 JS 被当成 HTML 文本 → SyntaxError: Unexpected token '<' → 整个脚本一行都不执行
          //    → 所有事件监听器挂不上 → 表现为"白屏 / 标题屏按钮点了完全没反应"。
          //    这种包绝不能悄悄产出，直接让 npm run build 失败，把问题拦在交付前。
          //    注意：不要试图"自动转义"修复（例如把 </body 换成 "<"+"/body"）——若该子串出现在
          //    代码位置而非字符串字面量里，转义本身就会造出新的语法错误（历史踩坑：Unexpected token '&'）。
          const danger = [...wrappedJs.matchAll(/<\/(?:script|body|html)\b/gi)];
          if (danger.length) {
            const d = danger[0];
            throw new Error(
              `[fix-script-timing] 内联脚本正文出现 ${danger.length} 处 HTML 结束标签，` +
              `会截断 <script> 导致整站 JS 失效，已中止构建。首处 @${d.index}: ` +
              JSON.stringify(wrappedJs.slice(Math.max(0, d.index - 80), d.index + 40))
            );
          }

          // E) 放到 </body> 前（此时所有 DOM 已解析完毕，不需要 DOMContentLoaded）
          //
          //    ⚠️⚠️ 绝对不要写成 html.replace('</body>', wrapped + '\n</body>')  ⚠️⚠️
          //    String.replace 的【替换字符串】里 $ 是元字符：
          //      $&  = 整个匹配项（即 '</body>'）
          //      $'  = 匹配之后的全部内容
          //      $`  = 匹配之前的全部内容
          //      $$  = 字面量 $        $1..$9 = 捕获组
          //    压缩后的 JS 大量使用 $ 作变量名，只要 terser 恰好压出 `$&&x` 这类序列，
          //    $& 就会被展开成 '</body>' 硬塞进代码里 → const A=</body>&$.complete → SyntaxError。
          //    因为每次构建变量名不同，这个 bug 表现为"时好时坏"，极难定位（本项目已为此付出两轮排查）。
          //    这里改用索引切片拼接，不经过任何 replace 语义，从构造上根治。
          const wrapped = '<script>' + wrappedJs + '</script>';
          const bodyIdx = html.lastIndexOf('</body>');
          if (bodyIdx === -1) throw new Error('[fix-script-timing] dist/index.html 中找不到 </body>，无法注入脚本');
          html = html.slice(0, bodyIdx) + wrapped + '\n' + html.slice(bodyIdx);
          injected = wrapped;
        }

        fs.writeFileSync(file, html);

        // F) 门禁 2：写入后自检。重新读回磁盘文件，确认注入的脚本片段逐字节完整存在，
        //    且整个文件只有 1 个 </body>（即没有任何 HTML 标签被意外注入进脚本正文）。
        //    任何一项不符 → 抛错中止，保证 dist 要么可用、要么根本不产出。
        if (injected) {
          const back = fs.readFileSync(file, 'utf8');
          if (back.indexOf(injected) === -1) {
            throw new Error('[fix-script-timing] 写入后自检失败：脚本正文与注入前不一致（疑似被字符串替换语义破坏），已中止');
          }
          const bodyCount = (back.match(/<\/body>/gi) || []).length;
          if (bodyCount !== 1) {
            throw new Error(`[fix-script-timing] 写入后自检失败：文件中有 ${bodyCount} 个 </body>（应为 1），脚本可能被截断，已中止`);
          }
          console.log(`[fix-script-timing] OK — script moved to end-of-body, self-check passed (${(back.length / 1048576).toFixed(1)}MB, </body>×1)`);
        } else {
          console.log('[fix-script-timing] fixed style attrs (no inline script found)');
        }
      }
    }
  ],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    // emptyOutDir:false —— 在本沙箱环境里，Vite 的 outDir 清理会对 dist/ 下 200+ 文件做批量删除，
    // 触发 safe-delete 的「>50 文件需确认」守卫而中止构建（表现为 build failed / trash 操作被中止）。
    // 关闭后 Vite 改为「覆盖写入」而非「先清空」，不会触发任何删除，构建可正常完成；
    // 产物 index.html 引用的都是本次构建新生成的资源路径，旧的孤儿资源只是多占空间，不影响运行。
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000
  }
});
