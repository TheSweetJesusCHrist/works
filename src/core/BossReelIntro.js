// ===== core/BossReelIntro.js — 神吞入场动画（boss-reel 主包内嵌迁移，无 iframe）=====
// 点击 DoG 后先播放三段动画：Ceaseless Void → Signus → Storm Weaver（自 public/reel/boss-reel.html 机械迁移）。
// 文字：'Andy' 字体 + 青↔洋红动态渐变（CSS animation）；右上角 Skip：白字 hover 变黄、无文本框（用户确认）。
// 动画完 / 点 Skip → cancelled 停掉全部 rAF → 白屏流程 → onDone() 进游戏（剧烈震屏由 Scourge entrance 冲刺启动时触发，随冲刺可见）

let layer = null;
let cancelled = false;     // 置 true → 三个动画的 loop 停止调度（skip / 结束 / 退出选人）
let finished = false;
let onDoneCb = null;
let inited = false;        // 三个动画模块是否已初始化（懒初始化：必须在导出函数内调用，避免被 tree-shake）

/** 上报动画阶段错误（带标记定位：VOID / SIGNUS / STORM + 阶段） */
function reportReelErr(tag, e) {
  const msg = '[REEL ' + tag + '] ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  if (window.__showErr) window.__showErr(msg);
  else console.error(msg);
}

function createDOM() {
  if (layer) return;
  if (!document.getElementById('dog-reel-style')) {
    const st = document.createElement('style');
    st.id = 'dog-reel-style';
    st.textContent = `
#dog-reel-layer{position:fixed;left:0;top:0;width:100%;height:100%;z-index:900;background:#05000a;}
#dog-reel-layer canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#05000a;}
#dog-reel-layer #signusCanvas,#dog-reel-layer #stormCanvas{display:none;}
#dog-reel-layer #black{position:absolute;inset:0;background:#05000a;z-index:8;opacity:1;transition:opacity 1s ease;pointer-events:none;}
#dog-reel-layer #titleText{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;color:#00FFFF;font-family:'Andy','Microsoft YaHei',sans-serif;font-size:46px;letter-spacing:6px;font-weight:600;text-shadow:0 0 18px rgba(160,32,240,0.9),0 0 40px rgba(120,0,200,0.6);opacity:0;transition:opacity 1s ease;pointer-events:none;text-align:center;padding:0 24px;animation:dogReelTitleColor 2s ease-in-out infinite alternate;}
@keyframes dogReelTitleColor{from{color:#00FFFF;}to{color:#FF00FF;}}
#dog-reel-skip{position:absolute;top:24px;right:28px;z-index:10;font-family:'Andy','Microsoft YaHei',sans-serif;font-size:26px;letter-spacing:3px;font-weight:600;color:#fff;background:none;border:none;padding:6px 12px;cursor:pointer;}
#dog-reel-skip:hover{color:#FFD700;}
#dog-reel-white{position:fixed;left:0;top:0;width:100%;height:100%;background:#ffffff;z-index:910;pointer-events:none;opacity:0;transition:opacity 0.6s ease;}
`;
    document.head.appendChild(st);
  }
  layer = document.createElement('div');
  layer.id = 'dog-reel-layer';
  layer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:900;background:#05000a;';
  // 三个动画 canvas（id 必须与迁移代码 getElementById 一致）
  for (const id of ['voidCanvas', 'signusCanvas', 'stormCanvas']) {
    const cv = document.createElement('canvas');
    cv.id = id;
    layer.appendChild(cv);
  }
  // 黑屏过渡层
  const black = document.createElement('div');
  black.id = 'black';
  black.style.cssText = 'position:absolute;inset:0;background:#05000a;z-index:8;opacity:1;transition:opacity 1s ease;pointer-events:none;';
  layer.appendChild(black);
  // 标题文字（Andy + 青↔洋红渐变，CSS 动画）
  const title = document.createElement('div');
  title.id = 'titleText';
  title.style.cssText = 'position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;color:#00FFFF;font-family:\'Andy\',\'Microsoft YaHei\',sans-serif;font-size:46px;letter-spacing:6px;font-weight:600;text-shadow:0 0 18px rgba(160,32,240,0.9),0 0 40px rgba(120,0,200,0.6);opacity:0;transition:opacity 1s ease;pointer-events:none;text-align:center;padding:0 24px;animation:dogReelTitleColor 2s ease-in-out infinite alternate;';
  layer.appendChild(title);
  // 右上角 Skip：白字、hover 变黄、无文本框
  const skip = document.createElement('button');
  skip.id = 'dog-reel-skip';
  skip.textContent = 'Skip';
  skip.style.cssText = 'position:absolute;top:24px;right:28px;z-index:10;font-family:\'Andy\',\'Microsoft YaHei\',sans-serif;font-size:26px;letter-spacing:3px;font-weight:600;color:#fff;background:none;border:none;padding:6px 12px;cursor:pointer;';
  skip.addEventListener('click', () => finish('skip'));
  layer.appendChild(skip);
  // 白屏（进游戏瞬间渐隐）—— ★ 挂到 body 而非 layer：finish 时可先隐藏 layer（动画层）而白屏继续独立淡出，
  //   白屏淡出时直接露出游戏画面，不会出现"黑色层背景盖住游戏"（用户反馈"白屏后还是黑的"）
  const white = document.createElement('div');
  white.id = 'dog-reel-white';
  white.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#ffffff;z-index:910;pointer-events:none;opacity:0;transition:opacity 0.6s ease;display:none;';
  document.body.appendChild(white);
  // 迁移代码引用的隐藏按钮/loading（防 null）
  for (const id of ['voidReplay', 'loading', 'signusAction', 'stormActionBtn', 'stormLoading']) {
    const el = document.createElement('div');
    el.id = id;
    el.style.display = 'none';
    layer.appendChild(el);
  }
  document.body.appendChild(layer);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function showTitle(text) {
  const t = document.getElementById('titleText');
  t.textContent = text; t.style.opacity = '1';
  await sleep(2100); t.style.opacity = '0'; await sleep(1000);
}

async function run() {
  const black = document.getElementById('black');
  const titleText = document.getElementById('titleText');
  const voidCanvas = document.getElementById('voidCanvas');
  const signusCanvas = document.getElementById('signusCanvas');
  const stormCanvas = document.getElementById('stormCanvas');
  window.__seq = { voidEnd: null, signusEnd: null, stormEnd: null };
  black.style.transition = 'none'; black.style.opacity = '1'; titleText.style.opacity = '0';
  void black.offsetWidth; black.style.transition = '';
  await showTitle('Servants of Scourge'); if (cancelled) return;
  await showTitle('Ceaseless Void'); if (cancelled) return;
  voidCanvas.style.display = 'block'; signusCanvas.style.display = 'none';
  black.style.opacity = '0';
  if (window.__voidStart) window.__voidStart();
  await new Promise(r => window.__seq.voidEnd = r); if (cancelled) return;
  black.style.opacity = '1'; await sleep(1000); if (cancelled) return;
  await showTitle('Signus'); if (cancelled) return;
  signusCanvas.style.display = 'block'; voidCanvas.style.display = 'none';
  black.style.opacity = '0';
  if (window.__signusStart) window.__signusStart();
  else { const t = setInterval(() => { if (window.__signusStart) { clearInterval(t); window.__signusStart(); } }, 50); }
  await new Promise(r => window.__seq.signusEnd = r); if (cancelled) return;
  black.style.opacity = '1'; await sleep(1000); if (cancelled) return;
  await showTitle('Storm Weaver'); if (cancelled) return;
  stormCanvas.style.display = 'block'; signusCanvas.style.display = 'none';
  black.style.opacity = '0';
  if (window.__stormStart) window.__stormStart();
  else { const t = setInterval(() => { if (window.__stormStart) { clearInterval(t); window.__stormStart(); } }, 50); }
  await new Promise(r => window.__seq.stormEnd = r); if (cancelled) return;
  black.style.opacity = '1';
  await sleep(1500);
  if (!cancelled) finish('done');
}

/** 懒初始化：创建 DOM + 初始化三段动画。必须在导出函数内调用（保证 rollup 不 tree-shake 掉动画函数体） */
function ensureInited() {
  if (inited) return;
  inited = true;
  createDOM();
  initVoid();
  initSignus();
  initStorm();
}

/** 播放入场动画：动画完成或点 Skip → 白屏流程（淡入→保持→震屏+onDone→淡出）→ onDone() */
export function playBossReel(onDone) {
  ensureInited();
  onDoneCb = onDone;
  finished = false;
  cancelled = false;
  layer.style.display = '';
  const skip = document.getElementById('dog-reel-skip');
  if (skip) skip.style.display = '';        // ★ 恢复 Skip（上次 finish 隐藏了；否则第二次进入没有 Skip 按钮）
  const white = document.getElementById('dog-reel-white');
  if (white) { white.style.opacity = '0'; white.style.display = 'none'; }
  run();
}

function finish(reason) {
  if (finished) return;
  finished = true;
  cancelled = true;            // 停掉三个动画的 rAF
  // ★ 立即隐藏动画 canvas + Skip：白屏淡出时底层应是游戏画面，
  //   否则露出动画最后一帧残影 + Skip 按钮（用户反馈"跳过动画后还是动画界面/画面黑"）
  for (const id of ['voidCanvas', 'signusCanvas', 'stormCanvas']) {
    const cv = document.getElementById(id);
    if (cv) cv.style.display = 'none';
  }
  const skip = document.getElementById('dog-reel-skip');
  if (skip) skip.style.display = 'none';
  const white = document.getElementById('dog-reel-white');
  const cb = onDoneCb;
  onDoneCb = null;
  if (!white) { if (cb) cb(); setTimeout(() => { if (layer) layer.style.display = 'none'; }, 50); return; }
  // ★ 2026-08-19 入场节奏（用户确认）：动画完已渐黑 → 渐渐白屏(0.8s淡入) → 全白保持1.5s
  //   → onDone(进游戏) + 立即隐藏动画层 → 白屏渐渐消失(0.8s淡出，直接露出游戏画面) → 淡出0.3s后剧烈震动 + 虫冲刺进场
  white.style.display = '';
  void white.offsetWidth;      // ★ 强制 reflow：display 从 none 恢复后同一帧改 opacity 不会触发 transition（表现为"突然白屏/突然消失"）
  white.style.transition = 'opacity 0.8s ease';
  white.style.opacity = '1';   // 渐渐白屏
  setTimeout(() => {
    if (cb) cb();                       // → Game.maybeEnter → enterGame（虫在屏外，entranceDelay 0.5s 计时开始）
    if (layer) layer.style.display = 'none';  // ★ 动画层立即隐藏（白屏是 body 独立元素，不受影响）
    white.style.opacity = '0';          // 白屏渐渐消失（0.8s）——底下直接是游戏画面，无黑层间隔
    setTimeout(() => { white.style.display = 'none'; }, 950);
  }, 800 + 1500);
}

/** 退出选人时清理（未播完也停） */
export function stopReel() {
  cancelled = true; finished = true;
  if (layer) layer.style.display = 'none';
  const white = document.getElementById('dog-reel-white');
  if (white) { white.style.opacity = '0'; white.style.display = 'none'; }
}

// ========== 迁移自 boss-reel.html：Ceaseless Void 动画 ==========
function initVoid() {
const canvas = document.getElementById('voidCanvas');
        const ctx = canvas.getContext('2d');
        const replayBtn = document.getElementById('voidReplay');
        const loading = document.getElementById('loading');

        let W, H, cx, cy;
        function resize() {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
            cx = W / 2; cy = H / 2;
        }
        window.addEventListener('resize', resize);
        resize();

        // 贴图路径
        const ASSETS = {
            boss: 'reel/assets/ceaselessvoid/CeaselessVoid.png',
            bossGlow: 'reel/assets/ceaselessvoid/CeaselessVoidGlow.png',
            orb: 'reel/assets/ceaselessvoid/DarkEnergy.png',
            orbGlow: 'reel/assets/ceaselessvoid/DarkEnergyGlow.png',
            dust: 'reel/assets/ceaselessvoid/CeaselessDust.png',
            map: 'reel/assets/ceaselessvoid/dungeon_background.jpg',
            gore1: 'reel/assets/ceaselessvoid/gore1.png',
            gore2: 'reel/assets/ceaselessvoid/gore2.png',
            gore3: 'reel/assets/ceaselessvoid/gore3.png'
        };

        // 加载贴图
        function loadImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = src;
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('无法加载 ' + src));
            });
        }

        window.__voidStart = function() {
        Promise.all([
            loadImage(ASSETS.boss),
            loadImage(ASSETS.bossGlow),
            loadImage(ASSETS.orb),
            loadImage(ASSETS.orbGlow),
            loadImage(ASSETS.dust),
            loadImage(ASSETS.map),
            loadImage(ASSETS.gore1),
            loadImage(ASSETS.gore2),
            loadImage(ASSETS.gore3)
        ]).then(([bossImg, bossGlowImg, orbImg, orbGlowImg, dustImg, mapImg, gore1Img, gore2Img, gore3Img]) => {
            var l = document.getElementById('loading'); if (l) l.style.display = 'none';
            startAnimation(bossImg, bossGlowImg, orbImg, orbGlowImg, dustImg, mapImg, gore1Img, gore2Img, gore3Img);
        }).catch(err => {
            var l = document.getElementById('loading'); if (l) l.textContent = err.message;
        });
    };

        // 预渲染发光 sprite（性能关键：避免在每帧给大量粒子用 shadowBlur）
        function makeGlowSprite(size, c0, c1) {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            grad.addColorStop(0, c0);
            grad.addColorStop(0.45, c1);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(0, 0, size, size);
            return c;
        }
        const DUST_GLOW = makeGlowSprite(64, 'rgba(230,140,255,0.95)', 'rgba(180,30,240,0.35)');

        // 动画参数
        const CONFIG = {
            floatSpeedX: 2.0,
            floatSpeedY: 1.88,
            floatAmpX: 55,       // Boss 活动范围放大
            floatAmpY: 42,
            orbRotSpeed: 0.012,
            orbPulseSpeed: 3.5,   // 径向呼吸频率（越大，沿连线进出越明显）
            orbMinR: 120,        // 半径呼吸下限（保持在本体外侧）
            orbMaxR: 210,        // 半径呼吸上限（沿连线大幅进出）
            orbFadeTime: 0.8,    // 爆炸后能量球渐隐时长
            explodeLifeDecay: 0.005, // 爆炸粉尘消散速度（越小越慢）
            explodedHoldTime: 2.5,   // 爆炸后维持秒数（越大越久）
            lifeTime: 6,        // 正常状态持续秒数（到时触发坍缩）
            collapseTime: 2.5,  // 坍塌吸力持续秒数
            fps: 12,            // Boss/Orb 像素动画帧率（越高待机动画越利落）
            mapZoom: 1.3,       // 背景地图放大倍率（>1 放大，居中裁切）
            skyDarkness: 0.55,  // 星空深色滤镜不透明度（越大越深，地图越暗、星空感越强）
            starOpacity: 0.9    // 星星亮度（在深色滤镜之上的可见度）
        };

        function startAnimation(bossImg, bossGlowImg, orbImg, orbGlowImg, dustImg, mapImg, gore1Img, gore2Img, gore3Img) {
            // 帧参数
            const bossFrames = 6;
            const bossW = bossImg.width;
            const bossH = bossImg.height / bossFrames;
            const orbFrames = 8;
            const orbW = orbImg.width;
            const orbH = orbImg.height / orbFrames;
            const dustFrames = 3;
            const dustW = dustImg.width;
            const dustH = dustImg.height / dustFrames;

            // 状态
            let time = 0;
            let state = 'alive'; // alive -> collapsing -> exploded -> ended
            let stateTimer = 0;
            let deathCountdown = CONFIG.lifeTime;
            let shake = 0;
            let bossScale = 1;
            let orbAlpha = 1;
            let orbs = [];
            let dusts = [];
            let gores = [];
            let stars = [];
            let bgPulse = 0;

            // 初始化星空
            for (let i = 0; i < 120; i++) {
                const isTwinkler = Math.random() < 0.45; // 约 45% 星星参与随机闪烁，避免齐闪
                stars.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    s: Math.random() * 1.5 + 0.3,
                    a: Math.random() * 0.6 + 0.2,
                    twinkle: Math.random() * Math.PI * 2,
                    twSpeed: 1 + Math.random() * 3,              // 每颗闪烁频率不同
                    twAmt: isTwinkler ? (0.6 + Math.random() * 0.4) : 0  // 非闪烁星恒定亮度
                });
            }

            // 初始化 8 个能量球
            for (let i = 0; i < 8; i++) {
                orbs.push({
                    index: i,
                    angle: (Math.PI * 2 / 8) * i,
                    phase: i * 0.6,
                    animFrame: i % orbFrames,
                    animTimer: 0
                });
            }

            replayBtn.addEventListener('click', reset);

            function reset() {
                time = 0;
                state = 'alive';
                stateTimer = 0;
                deathCountdown = CONFIG.lifeTime;
                shake = 0;
                bossScale = 1;
                orbAlpha = 1;
                dusts = [];
                gores = [];
                bgPulse = 0;
                orbs.forEach((o, i) => {
                    o.angle = (Math.PI * 2 / 8) * i;
                    o.animFrame = i % orbFrames;
                    o.animTimer = 0;
                });
                replayBtn.style.display = 'none';
            }

            // 粒子类
            class Dust {
                constructor(x, y, mode) {
                    this.x = x;
                    this.y = y;
                    this.mode = mode; // 'collapse' 被吸入, 'explode' 向外爆发
                    const a = Math.random() * Math.PI * 2;
                    const sp = mode === 'explode'
                        ? Math.random() * 10 + 2
                        : Math.random() * 3 + 1;
                    this.vx = Math.cos(a) * sp;
                    this.vy = Math.sin(a) * sp;
                    this.life = 1;
                    this.maxLife = 1;
                    this.scale = Math.random() * 1.8 + 0.6;
                    this.frame = Math.floor(Math.random() * dustFrames);
                    this.animTimer = 0;
                    this.color = mode === 'explode'
                        ? (Math.random() > 0.35 ? '#c020ff' : '#ff20c0')
                        : '#a060ff';
                    this.glow = mode === 'explode' ? '#e080ff' : '#a020f0';
                    this.drag = mode === 'explode' ? 0.96 : 0.92;
                    this.rotation = Math.random() * Math.PI * 2;
                    this.rotSpeed = (Math.random() - 0.5) * 0.3;
                }

                update(targetX, targetY) {
                    if (this.mode === 'collapse') {
                        // 被吸入 Boss 中心
                        const dx = targetX - this.x;
                        const dy = targetY - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
                        const pull = 220 / (dist + 20);
                        this.vx += dx / dist * pull;
                        this.vy += dy / dist * pull;
                        this.life -= 0.015;
                } else {
                    // 爆炸 outward
                    this.vx *= this.drag;
                    this.vy *= this.drag;
                    this.vy += 0.04; // 轻微重力
                    this.life -= CONFIG.explodeLifeDecay;
                }
                this.x += this.vx;
                this.y += this.vy;
                this.scale *= 0.992;
                    this.rotation += this.rotSpeed;

                    // 帧动画
                    this.animTimer += 1;
                    if (this.animTimer > 5) {
                        this.animTimer = 0;
                        this.frame = (this.frame + 1) % dustFrames;
                    }
                }

                draw(ctx) {
                    const alpha = Math.max(0, this.life);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(this.x, this.y);
                    ctx.rotate(this.rotation);

                    // 发光外圈（仅爆炸模式叠加紫光；坍塌吸力用暗紫漩涡尘，不发光）
                    if (this.mode === 'explode') {
                        const gs = this.scale * 7;
                        ctx.drawImage(DUST_GLOW, -gs / 2, -gs / 2, gs, gs);
                    }

                    // 粉尘帧（像素贴图，禁用平滑）
                    ctx.imageSmoothingEnabled = false;
                    const ds = this.scale * (this.mode === 'explode' ? 3 : 2);
                    ctx.drawImage(
                        dustImg,
                        0, this.frame * dustH, dustW, dustH,
                        -dustW / 2 * ds, -dustH / 2 * ds, dustW * ds, dustH * ds
                    );

                    ctx.restore();
                }
            }

            // 尸块（Gore）类：Boss 死亡瞬间向外飞溅的像素碎块
            const GORE_IMGS = [gore1Img, gore2Img, gore3Img];
            class Gore {
                constructor(x, y, img, vx, vy) {
                    this.img = img || GORE_IMGS[Math.floor(Math.random() * GORE_IMGS.length)];
                    // 速度可外部指定（忠实源码：velocity * randomSpread）
                    if (vx !== undefined && vy !== undefined) {
                        this.vx = vx;
                        this.vy = vy;
                    } else {
                        const a = Math.random() * Math.PI * 2;
                        const sp = Math.random() * 9 + 3;
                        this.vx = Math.cos(a) * sp;
                        this.vy = Math.sin(a) * sp - 2; // 略向上爆发
                    }
                    this.x = x + (Math.random() - 0.5) * 40;
                    this.y = y + (Math.random() - 0.5) * 40;
                    this.rotation = Math.random() * Math.PI * 2;
                    this.rotSpeed = (Math.random() - 0.5) * 0.4;
                    this.scale = Math.random() * 0.8 + 0.8;
                    this.life = 1;
                    this.drag = 0.96;
                }

                update() {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.vx *= this.drag;
                    this.vy *= this.drag;
                    this.vy += 0.12; // 重力
                    this.rotation += this.rotSpeed;
                    this.life -= 0.006; // 约 2.8s 淡出
                }

                draw(ctx) {
                    const alpha = Math.max(0, this.life);
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(this.x, this.y);
                    ctx.rotate(this.rotation);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(
                        this.img,
                        -this.img.width / 2 * this.scale,
                        -this.img.height / 2 * this.scale,
                        this.img.width * this.scale,
                        this.img.height * this.scale
                    );
                    ctx.restore();
                }
            }

            function drawMap() {
                if (!mapImg) return;
                // 以 cover + 居中放大方式铺满画布，保持像素清晰
                ctx.imageSmoothingEnabled = false;
                const zoom = CONFIG.mapZoom;
                const imgRatio = mapImg.width / mapImg.height;
                const canvasRatio = W / H;
                let dw, dh, dx, dy;
                if (canvasRatio > imgRatio) {
                    dw = W * zoom;
                    dh = W * zoom / imgRatio;
                    dx = (W - dw) / 2;
                    dy = (H - dh) / 2;
                } else {
                    dh = H * zoom;
                    dw = H * zoom * imgRatio;
                    dx = (W - dw) / 2;
                    dy = (H - dh) / 2;
                }
                ctx.drawImage(mapImg, dx, dy, dw, dh);
            }

            function drawStars() {
                ctx.fillStyle = '#ffffff';
                stars.forEach(s => {
                    const tw = 1 - s.twAmt + s.twAmt * (0.5 + 0.5 * Math.sin(time * s.twSpeed + s.twinkle));
                    ctx.globalAlpha = s.a * tw * CONFIG.starOpacity;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            }

            function drawBoss(bx, by) {
                const frame = Math.floor(time * CONFIG.fps) % bossFrames;
                const scale = bossScale;

                ctx.save();
                ctx.translate(bx, by);
                ctx.scale(scale, scale);

                // 环境辉光（紫青色）
                const glowR = 160 * scale;
                const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
                g1.addColorStop(0, 'rgba(160, 32, 240, 0.22)');
                g1.addColorStop(0.5, 'rgba(0, 200, 255, 0.08)');
                g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g1;
                ctx.beginPath();
                ctx.arc(0, 0, glowR, 0, Math.PI * 2);
                ctx.fill();

                // 绘制 Boss 本体
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(
                    bossImg,
                    0, frame * bossH, bossW, bossH,
                    -bossW / 2, -bossH / 2, bossW, bossH
                );

                // 绘制 Boss 发光层（ additive 混合）
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(
                    bossGlowImg,
                    0, frame * bossH, bossW, bossH,
                    -bossW / 2, -bossH / 2, bossW, bossH
                );
                ctx.globalCompositeOperation = 'source-over';

                ctx.restore();
            }

            function drawOrb(o, bx, by) {
                // 呼吸半径（沿球↔本体连线做径向进出，即"在连线上运动"）
                const pulse = 0.5 + 0.5 * Math.sin(time * CONFIG.orbPulseSpeed + o.phase);
                const radius = CONFIG.orbMinR + (CONFIG.orbMaxR - CONFIG.orbMinR) * pulse;

                // 纯圆轨道（无额外垂直偏移，避免变成椭圆）
                const ox = bx + Math.cos(o.angle) * radius;
                const oy = by + Math.sin(o.angle) * radius;

                // 保存当前半径用于死亡混乱
                o.currentR = radius;
                o.ox = ox; o.oy = oy;

                ctx.save();
                ctx.globalAlpha = orbAlpha; // 爆炸后渐隐
                ctx.translate(ox, oy);

                // 能量球环境辉光
                const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 45);
                og.addColorStop(0, 'rgba(200, 60, 255, 0.45)');
                og.addColorStop(0.5, 'rgba(0, 180, 255, 0.15)');
                og.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = og;
                ctx.beginPath();
                ctx.arc(0, 0, 45, 0, Math.PI * 2);
                ctx.fill();

                // 贴图
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(
                    orbImg,
                    0, o.animFrame * orbH, orbW, orbH,
                    -orbW / 2, -orbH / 2, orbW, orbH
                );

                // 发光层
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(
                    orbGlowImg,
                    0, o.animFrame * orbH, orbW, orbH,
                    -orbW / 2, -orbH / 2, orbW, orbH
                );
                ctx.globalCompositeOperation = 'source-over';

                ctx.restore();
            }

            function updateOrbs(dt) {
                orbs.forEach(o => {
                    o.angle += CONFIG.orbRotSpeed;
                    o.animTimer += dt;
                    if (o.animTimer > 1 / CONFIG.fps) {
                        o.animTimer = 0;
                        o.animFrame = (o.animFrame + 1) % orbFrames;
                    }

                    if (state === 'collapsing') {
                        o.angle += (Math.random() - 0.5) * 0.15;
                    }
                });
            }

            function spawnCollapseDust(bx, by) {
                if (dusts.length >= 300) return; // 总量上限，避免卡顿
                // 在屏幕四周生成被吸入的粉尘
                const count = 4;
                for (let i = 0; i < count; i++) {
                    const side = Math.floor(Math.random() * 4);
                    let x, y;
                    const margin = 40;
                    switch (side) {
                        case 0: x = Math.random() * W; y = -margin; break;
                        case 1: x = W + margin; y = Math.random() * H; break;
                        case 2: x = Math.random() * W; y = H + margin; break;
                        default: x = -margin; y = Math.random() * H; break;
                    }
                    dusts.push(new Dust(x, y, 'collapse'));
                }
            }

            function spawnExplosionDust(bx, by) {
                // 忠实源码分层：40 + 140 = 180 颗 PurpleCosmilite 发光粉尘
                for (let i = 0; i < 180; i++) {
                    const d = new Dust(bx + (Math.random() - 0.5) * 60, by + (Math.random() - 0.5) * 60, 'explode');
                    if (i < 40) {
                        // 前 40 颗：velocity*3, Scale 2
                        d.vx *= 3; d.vy *= 3; d.scale *= 2;
                        if (Math.random() > 0.5) d.scale *= 0.5;
                    } else {
                        // 后 140 颗：源码 70 次循环 ×2（*5 Scale3 / *2 Scale2）
                        if (i % 2 === 0) {
                            d.vx *= 5; d.vy *= 5; d.scale *= 3;
                        } else {
                            d.vx *= 2; d.vy *= 2; d.scale *= 2;
                        }
                    }
                    dusts.push(d);
                }
            }

            function spawnGore(bx, by) {
                // 忠实源码：固定 5 块 gore —— CeaselessVoid×1, CeaselessVoid2×2, CeaselessVoid3×2
                // 每块速度 = 基础向外爆发 * (1 + randomSpread*0.5)，randomSpread ∈ [-2, 2]
                const layout = [gore1Img, gore2Img, gore2Img, gore3Img, gore3Img];
                for (const img of layout) {
                    const spread = Math.random() * 4 - 2; // [-2, 2]，对应源码 randomSpread
                    const a = Math.random() * Math.PI * 2;
                    const burst = Math.random() * 4 + 3;  // 基础向外爆发速度
                    const vx = Math.cos(a) * burst * (1 + spread * 0.5);
                    const vy = Math.sin(a) * burst * (1 + spread * 0.5) - 1.5;
                    gores.push(new Gore(bx, by, img, vx, vy));
                }
            }

            let last = performance.now();
            function loop(now) {
    if (cancelled) return;
                try {
                const dt = Math.min((now - last) / 1000, 0.05);
                last = now;
                time += dt;

                // Boss 位置：极慢浮动（提前计算，供状态机与绘制共用）
                const bx = cx + Math.sin(time * CONFIG.floatSpeedX) * CONFIG.floatAmpX;
                const by = cy + Math.cos(time * CONFIG.floatSpeedY) * CONFIG.floatAmpY;

                // 更新状态机
                if (state === 'alive') {
                    deathCountdown -= dt;
                    if (deathCountdown <= 0) {
                        state = 'collapsing';
                        stateTimer = 0;
                    }
                } else if (state === 'collapsing') {
                    stateTimer += dt;
                    shake = Math.max(shake, 8 + stateTimer * 10);
                    bossScale = 1; // 坍缩期保持原大小，仅表现吸力
                    bgPulse = Math.sin(stateTimer * 15) * 0.5 + 0.5;
                    if (Math.random() < 0.7) spawnCollapseDust(bx, by);
                    if (stateTimer >= CONFIG.collapseTime) {
                        state = 'exploded';
                        stateTimer = 0;
                        shake = 30;
                        bossScale = 0;   // 本体瞬间消失（非缩小）
                        orbAlpha = 1;    // 能量球开始渐隐
                        spawnExplosionDust(bx, by);
                        spawnGore(bx, by);
                    }
                } else if (state === 'exploded') {
                    stateTimer += dt;
                    shake *= 0.92;
                    orbAlpha = Math.max(0, 1 - stateTimer / CONFIG.orbFadeTime); // 能量球渐隐
                    if (stateTimer > CONFIG.explodedHoldTime) {
                        state = 'ended';
                        if (true) {
                            window.__seq.voidEnd(); // 嵌入合集页时通知主控切换下一段
                        } else {
                            replayBtn.style.display = 'block';
                        }
                    }
                }

                updateOrbs(dt);

                // 地图背景
                drawMap();

                // 星空深色滤镜（半透明遮罩，营造空间感，地图透出但变深）
                ctx.fillStyle = `rgba(5, 0, 12, ${CONFIG.skyDarkness})`;
                ctx.fillRect(0, 0, W, H);

                // 背景脉冲
                if (state === 'collapsing') {
                    const g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(W, H));
                    g.addColorStop(0, `rgba(120, 0, 180, ${0.12 * bgPulse})`);
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, W, H);
                }

                drawStars();

                // 屏幕震动
                ctx.save();
                if (shake > 0.5) {
                    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
                    shake *= 0.95;
                }

                // 绘制能量球（无连线）
                orbs.forEach(o => drawOrb(o, bx, by));

                // 绘制 Boss
                if (state !== 'ended' || bossScale > 0.05) {
                    drawBoss(bx, by);
                }

                // 更新并绘制粉尘
                for (let i = dusts.length - 1; i >= 0; i--) {
                    dusts[i].update(bx, by);
                    dusts[i].draw(ctx);
                    if (dusts[i].life <= 0 || dusts[i].scale <= 0.05) {
                        dusts.splice(i, 1);
                    }
                }

                // 更新并绘制尸块（在粉尘之上，保持像素碎块清晰）
                for (let i = gores.length - 1; i >= 0; i--) {
                    gores[i].update();
                    gores[i].draw(ctx);
                    if (gores[i].life <= 0) {
                        gores.splice(i, 1);
                    }
                }

                ctx.restore();

                } catch(e) { reportReelErr('VOID state=' + state, e); cancelled = true; return; }
                requestAnimationFrame(loop);
            }

            requestAnimationFrame(loop);
        }
}

// ========== 迁移自 boss-reel.html：Signus 动画 ==========

function initSignus() {
'use strict';

// ========== 画布与基础 ==========
const canvas = document.getElementById('signusCanvas');
const ctx = canvas.getContext('2d');
const actionBtn = document.getElementById('signusAction');

// 被合集页(iframe)装载时隐藏播放按钮，由父页面自动触发
if (true) {
  actionBtn.style.display = 'none';
}

// 资源路径清单（全部走 assets/signus/，不再 base64 内嵌）
const TEX = {
  signus:            'reel/assets/signus/signus.png',
  signusGlow:        'reel/assets/signus/signusGlow.png',
  signusAlt:         'reel/assets/signus/signusAlt.png',
  signusAltGlow:     'reel/assets/signus/signusAltGlow.png',
  signusAlt2:        'reel/assets/signus/signusAlt2.png',
  signusAlt2Glow:    'reel/assets/signus/signusAlt2Glow.png',
  cosmicMine:        'reel/assets/signus/cosmicMine.png',
  cosmicLantern:     'reel/assets/signus/cosmicLantern.png',
  cosmicLanternGlow: 'reel/assets/signus/cosmicLanternGlow.png',
  dust1_1:           'reel/assets/signus/dust1_1.png',     // 显形凝聚粒子（紫粉星点）
  dust1_2:           'reel/assets/signus/dust1_2.png',     // 拖尾粒子（淡紫星点）
  dust2:             'reel/assets/signus/dust2.png',       // 地雷爆炸放射条
  scythe:            'reel/assets/signus/scythe.png',      // 四角旋转镰刀
  gore1:             'reel/assets/signus/gore1.png',       // 爆体碎块
  gore2:             'reel/assets/signus/gore2.png',
  gore3:             'reel/assets/signus/gore3.png',
  gore4:             'reel/assets/signus/gore4.png',
  gore5:             'reel/assets/signus/gore5.png',
  underworld:        'reel/assets/signus/underworld.png'
};

const images = {};
let loaded = 0;
const totalImages = Object.keys(TEX).length;

function loadImages() {
  for (const key in TEX) {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === totalImages) {
        initLanterns(3);
        // 待机海报：灯笼与本体均可见
        lanterns.forEach(L => { L.alpha = 1; L.targetAlpha = 1; });
        bossAlpha = 1; bossTargetAlpha = 1;
        eyeAlpha = 0;  eyeTargetAlpha = 0;
        drawIdle();
        window.__signusReady = true; window.__signusStart = startAnim;
      }
    };
    img.onerror = () => { console.error('加载失败:', TEX[key]); };
    img.src = TEX[key];
    images[key] = img;
  }
}

// ========== 帧尺寸常量 ==========
const FRAME_W = 176;
const FRAME_H = 196;
const ALT2_FRAME_H = 94;     // signusAlt2 / signusAlt2Glow 都是 176x564 → 6 帧 @176x94（冲刺形态）
const MINE_W = 34;
const MINE_H = 36;
const LANTERN_W = 26;
const LANTERN_H = 44;
const LANTERN_FRAME_COUNT = 4;
const LANTERN_FRAME_Y = [0, 44, 88, 132];

const FLOAT_AMP = 22;
const FLOAT_SPEED = 0.06;
const SPEED = 0.65;

// ========== 运行时状态 ==========
let animState = 'idle';
let frameTimer = 0;
let phaseT = 0;
let acc = 0;
let running = false;
let posX = canvas.width / 2;
let posY = canvas.height / 2;
let floatOffset = 0;
let floatPhase = 0;

// 多囊灯笼（替代旧版单灯笼）
let lanterns = [];

// Boss 与眼睛亮纹透明度（独立控制 → 可实现"亮纹先现，本体后现"）
let bossAlpha = 1, bossTargetAlpha = 1;
let eyeAlpha = 0,  eyeTargetAlpha = 0;

let mines = [];
let particles = [];
let scythes = [];
let gores = [];             // 爆体碎块
let flip = false;
let animTimer = 0;
let animId = null;

// 爆体终幕状态
let bossFlashT = 0;         // >0 时本体闪烁（帧计数）
let shakeAmt = 0;           // 本体震动幅度(px)，0=不震
let shX = 0, shY = 0;       // 本帧震动偏移（step 里算好，drawBoss/drawEyeGlow 使用）
let berserkX = 0, berserkY = 0;   // 狂暴横跳目标位置
const GORE_KEYS = ['gore1','gore2','gore3','gore4','gore5'];
const GORE_SCALE = 1.8;
let flashCanvas = null;     // 本体闪烁遮罩画布（复用，避免每帧新建）

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (animState === 'idle' && !animId) {
    posX = canvas.width / 2;
    posY = canvas.height / 2;
  }
}
window.addEventListener('resize', resize);

// ========== 灯笼 ==========
function spawnLantern(i, total) {
  const angle = (Math.PI * 2 / total) * i + (Math.random() * 0.4 - 0.2);
  const radius = 95 + Math.random() * 35;
  return {
    baseAngle: angle,
    angle: angle,
    orbitRadius: radius,
    orbitSpeed: 0.007 + Math.random() * 0.003,
    x: posX + Math.cos(angle) * radius,
    y: posY + Math.sin(angle) * radius * 0.55,
    vx: 0, vy: 0,
    floatPhase: Math.random() * Math.PI * 2,
    floatSpeed: 0.02 + Math.random() * 0.015,
    floatAmp: 8 + Math.random() * 6,
    alpha: 0,
    targetAlpha: 0,
    frameOffset: Math.floor(Math.random() * 100)
  };
}

function initLanterns(count) {
  lanterns = [];
  for (let i = 0; i < count; i++) lanterns.push(spawnLantern(i, count));
}

function updateLanterns() {
  for (const L of lanterns) {
    L.angle += L.orbitSpeed;
    const vf = Math.sin(frameTimer * L.floatSpeed + L.floatPhase) * L.floatAmp;
    const tx = posX + Math.cos(L.angle) * L.orbitRadius;
    const ty = posY + Math.sin(L.angle) * L.orbitRadius * 0.55 + vf;
    const k = 0.025, d = 0.90;
    L.vx += (tx - L.x) * k; L.vy += (ty - L.y) * k;
    L.vx *= d; L.vy *= d;
    L.x += L.vx; L.y += L.vy;
    // 平滑趋近目标 alpha：淡出比淡入更慢 → 爆体后灯笼"渐渐消失"
    L.alpha += (L.targetAlpha - L.alpha) * (L.targetAlpha < L.alpha ? 0.02 : 0.06);
  }
}

function drawLanterns() {
  for (const L of lanterns) {
    if (L.alpha <= 0.01) continue;
    const frameIdx = Math.floor((frameTimer + L.frameOffset) / 14) % LANTERN_FRAME_COUNT;
    const sy = LANTERN_FRAME_Y[frameIdx];
    const drawX = L.x - LANTERN_W / 2;
    const drawY = L.y - LANTERN_H / 2;
    ctx.save();
    ctx.globalAlpha = L.alpha;
    // 光晕
    const lightR = 110 * L.alpha;
    const lightGrad = ctx.createRadialGradient(L.x, L.y, 4, L.x, L.y, lightR);
    lightGrad.addColorStop(0,   'rgba(180, 250, 255, 0.55)');
    lightGrad.addColorStop(0.35,'rgba(60, 200, 255, 0.22)');
    lightGrad.addColorStop(0.7, 'rgba(20, 100, 180, 0.07)');
    lightGrad.addColorStop(1,   'rgba(0, 40, 100, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(L.x, L.y, lightR, 0, Math.PI * 2);
    ctx.fill();
    // glow
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18 * L.alpha;
    ctx.drawImage(images.cosmicLanternGlow, 0, sy, LANTERN_W, LANTERN_H, drawX, drawY, LANTERN_W, LANTERN_H);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(images.cosmicLantern, 0, sy, LANTERN_W, LANTERN_H, drawX, drawY, LANTERN_W, LANTERN_H);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ========== 背景 / 氛围 / 黑暗 ==========
function drawUnderworld() {
  if (!images.underworld) return;
  const img = images.underworld;
  const sw = img.width, sh = img.height / 2;
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.max(cw / sw, ch / sh);
  const dw = sw * scale, dh = sh * scale;
  const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
  ctx.globalAlpha = 0.95;
  ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

function drawAtmosphere() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const maxR = Math.max(canvas.width, canvas.height) * 0.75;
  const grad = ctx.createRadialGradient(cx, cy, maxR * 0.15, cx, cy, maxR);
  grad.addColorStop(0,    'rgba(8,2,14,0)');
  grad.addColorStop(0.55, 'rgba(6,0,10,0.40)');
  grad.addColorStop(1,    'rgba(2,0,4,0.90)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSignusDarkness(x, y) {
  const r = 240;
  const grad = ctx.createRadialGradient(x, y + 20, 25, x, y + 20, r);
  grad.addColorStop(0,    'rgba(12, 0, 22, 0.62)');
  grad.addColorStop(0.4,  'rgba(10, 0, 18, 0.42)');
  grad.addColorStop(0.75, 'rgba(6, 0, 12, 0.18)');
  grad.addColorStop(1,    'rgba(3, 0, 6, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y + 20, r, 0, Math.PI * 2);
  ctx.fill();
}

// ========== 待机静态帧 ==========
function drawIdle() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawUnderworld();
  drawAtmosphere();
  updateLanterns();
  drawLanterns();
  drawSignusDarkness(posX, posY);
  const fy = Math.floor(frameTimer / 14) % 6;
  const drawY = posY - FRAME_H / 2;
  const drawX = posX - FRAME_W / 2;
  ctx.save();
  ctx.globalAlpha = bossAlpha;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(images.signusGlow, 0, fy * FRAME_H, FRAME_W, FRAME_H, drawX, drawY, FRAME_W, FRAME_H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(images.signus, 0, fy * FRAME_H, FRAME_W, FRAME_H, drawX, drawY, FRAME_W, FRAME_H);
  ctx.restore();
  frameTimer++;
}

// ========== Boss 绘制（三形态：冲刺/二阶段/一阶段身体） ==========
// 一阶段(intro/scythe)身体由 drawBoss 画 signus，亮纹由 drawEyeGlow 独立画 signusGlow，
// 便于实现"亮纹先现、本体后现"的渐隐序列。
// 冲刺(dash1/dash2)与二阶段(lanternAdd/hold)的亮纹直接画在 drawBoss 内。
function drawBoss() {
  const isDash = (animState === 'dash1' || animState === 'dash2');
  const isPhase2 = (animState === 'lanternAdd' || animState === 'hold');
  let tex, glowTex, fH, fCount;
  if (isDash) {
    tex = images.signusAlt2; glowTex = images.signusAlt2Glow;
    fH = ALT2_FRAME_H; fCount = 6;
  } else if (isPhase2) {
    tex = images.signusAlt; glowTex = images.signusAltGlow;
    fH = FRAME_H; fCount = 6;
  } else {
    // 一阶段：只画身体，亮纹交给 drawEyeGlow（screen 叠加 + 独立 alpha）
    tex = images.signus; glowTex = null;
    fH = FRAME_H; fCount = 6;
  }
  const fy = Math.floor(frameTimer / 12) % fCount;
  const drawY = posY + floatOffset - fH / 2 + shY;
  const drawX = posX - FRAME_W / 2 + shX;

  ctx.save();
  ctx.globalAlpha = bossAlpha;
  if (flip) {
    ctx.translate(posX + shX, 0); ctx.scale(-1, 1); ctx.translate(-(posX + shX), 0);
  }

  // 冲刺残影（仅冲刺形态）
  if (isDash) {
    for (let a = 1; a <= 4; a++) {
      const ax = drawX + (flip ? -a * 30 : a * 30);
      ctx.globalAlpha = 0.12 * (5 - a) * bossAlpha;
      ctx.drawImage(tex, 0, fy * fH, FRAME_W, fH, ax, drawY, FRAME_W, fH);
    }
    ctx.globalAlpha = bossAlpha;
  }

  // 亮纹（冲刺与二阶段在此画；一阶段由 drawEyeGlow 负责，避免 alpha 串扰）
  if (glowTex) {
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(glowTex, 0, fy * fH, FRAME_W, fH, drawX, drawY, FRAME_W, fH);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(tex, 0, fy * fH, FRAME_W, fH, drawX, drawY, FRAME_W, fH);

  // 狂暴闪烁：只用"本体不透明像素"闪白——把身体贴图快照到临时画布，
  // source-in 保留本体像素后染白，透明/半透明区域完全不受影响（不闪贴图方块、不闪全屏）
  if (bossFlashT > 0) {
    const strobe = Math.abs(Math.sin(bossFlashT * 0.35));   // 直接强 strobe，无缓升
    if (strobe > 0.1) {
      if (!flashCanvas) {
        flashCanvas = document.createElement('canvas');
        flashCanvas.width = FRAME_W; flashCanvas.height = FRAME_H;
      }
      const fc = flashCanvas.getContext('2d');
      fc.globalCompositeOperation = 'source-over';     // 关键：复位上一帧遗留的合成模式，否则快照画不上
      fc.clearRect(0, 0, FRAME_W, FRAME_H);
      fc.globalAlpha = 1;
      fc.drawImage(tex, 0, fy * fH, FRAME_W, fH, 0, 0, FRAME_W, fH);   // 本体快照
      fc.globalCompositeOperation = 'source-in';                       // 只保留本体像素
      fc.globalAlpha = strobe;
      fc.fillStyle = '#ffffff';
      fc.fillRect(0, 0, FRAME_W, fH);                                  // 本体像素染白（alpha=strobe）
      fc.globalCompositeOperation = 'source-over';                     // 复位，避免下帧污染
      ctx.globalAlpha = 1;
      ctx.drawImage(flashCanvas, drawX, drawY, FRAME_W, fH);           // 透明区无影响
    }
  }
  ctx.restore();
}

// 一阶段亮纹（signusGlow）：signusGlow 帧亮区 (50,35) 与 signus 眼睛 (50,35) 同坐标系，
// → 与身体帧完全对齐，零偏移。
function drawEyeGlow() {
  if (eyeAlpha <= 0.01) return;
  // 仅在一阶段绘制（冲刺/二阶段由 drawBoss 画自己的亮纹）
  if (animState !== 'intro' && animState !== 'scythe') return;
  const fy = Math.floor(frameTimer / 12) % 6;
  const drawY = posY + floatOffset - FRAME_H / 2 + shY;
  const drawX = posX - FRAME_W / 2 + shX;
  ctx.save();
  ctx.globalAlpha = eyeAlpha;
  if (flip) {
    ctx.translate(posX + shX, 0); ctx.scale(-1, 1); ctx.translate(-(posX + shX), 0);
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(images.signusGlow, 0, fy * FRAME_H, FRAME_W, FRAME_H, drawX, drawY, FRAME_W, FRAME_H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// ========== 镰刀（四角三阶段：飞向角点 → 急停变慢 → 冲出屏幕） ==========
function spawnScythes() {
  scythes = [];
  const W = canvas.width, H = canvas.height;
  const cx = posX, cy = posY;
  // 四角（相对画布，留 14%~18% 内边距）
  const pts = [
    [W * 0.14, H * 0.18],
    [W * 0.86, H * 0.18],
    [W * 0.14, H * 0.82],
    [W * 0.86, H * 0.82]
  ];
  for (const [tx, ty] of pts) {
    const a = Math.atan2(ty - cy, tx - cx);
    scythes.push({
      x: cx, y: cy,
      tx, ty,
      state: 'toCorner', t: 0,
      outAngle: a,                   // 冲出方向（沿中心→角点继续向外）
      spin: Math.random() * Math.PI * 2,
      spinSpeed: ((Math.random() < 0.5) ? -1 : 1) * (0.18 + Math.random() * 0.12)
    });
  }
}

// 顺时针环形镰刀：12 把按角度均匀分布，delay 逐帧递增 → 顺时针扫出
function spawnRingScythes() {
  const N = 12;
  const cx = posX, cy = posY;
  const R = Math.min(canvas.width, canvas.height) * 0.34;   // 停驻半径（急停点）
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 / N) * i;                        // 0,30,60...330（y 向下坐标系即顺时针）
    scythes.push({
      x: cx, y: cy,
      tx: cx + Math.cos(a) * R, ty: cy + Math.sin(a) * R,
      state: 'toCorner', t: 0,
      outAngle: a,                                          // 冲出方向（沿原角度继续向外）
      spin: Math.random() * Math.PI * 2,
      spinSpeed: 0.18 + Math.random() * 0.12,
      delay: i * 9                                          // 顺时针错峰发射（隔 9 步发一把 → 12 把到 ~134 步发完，与第3波地雷(135)同刻收尾）
    });
  }
}

function updateScythes() {
  for (let i = scythes.length - 1; i >= 0; i--) {
    const s = scythes[i];
    if (s.delay > 0) { s.delay--; continue; }               // 顺时针错峰：未到发射时刻原地待命
    s.spin += s.spinSpeed;
    s.t++;
    if (s.state === 'toCorner') {
      s.x += (s.tx - s.x) * 0.18;
      s.y += (s.ty - s.y) * 0.18;
      if (Math.hypot(s.tx - s.x, s.ty - s.y) < 6) {
        s.state = 'stopSlow'; s.t = 0;
      }
    } else if (s.state === 'stopSlow') {
      // 急停变慢
      s.x += (s.tx - s.x) * 0.04;
      s.y += (s.ty - s.y) * 0.04;
      if (s.t > 18) { s.state = 'out'; s.t = 0; }
    } else if (s.state === 'out') {
      // 快速冲出屏幕
      const speed = 14;
      s.x += Math.cos(s.outAngle) * speed;
      s.y += Math.sin(s.outAngle) * speed;
      if (s.x < -60 || s.x > canvas.width + 60 || s.y < -60 || s.y > canvas.height + 60) {
        scythes.splice(i, 1);
        continue;
      }
    }
    // 拖尾粒子（dust1_2）
    if (Math.random() < 0.85) {
      particles.push({
        tex: 'dust1_2',
        x: s.x + (Math.random() - 0.5) * 8,
        y: s.y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        life: 22 + Math.random() * 14,
        maxLife: 36,
        scale: 0.5 + Math.random() * 0.4,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.1
      });
    }
  }
}

function drawScythes() {
  for (const s of scythes) {
    if (s.delay > 0) continue;   // 顺时针错峰：未发射的镰刀不显示
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.spin);
    ctx.globalCompositeOperation = 'screen';
    const sz = 56;
    ctx.drawImage(images.scythe, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
}

// ========== 地雷 + 爆炸（dust2） ==========
function spawnMineBurst() {
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 / N) * i + Math.random() * 0.2;
    mines.push({
      x: posX, y: posY,
      vx: Math.cos(a) * (2.6 + Math.random() * 0.6),
      vy: Math.sin(a) * (2.6 + Math.random() * 0.6),
      life: 90, maxLife: 90,
      scale: 0.5, maxScale: 1.9,
      flashPhase: Math.random() * Math.PI * 2
    });
  }
}

function updateMines() {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.x += m.vx; m.y += m.vy;
    m.life--;
    const prog = 1 - m.life / m.maxLife;
    m.scale = 0.5 + prog * (m.maxScale - 0.5);
    if (m.life <= 0) {
      explodeMine(m);
      mines.splice(i, 1);
    }
  }
}

function explodeMine(m) {
  for (let p = 0; p < 12; p++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.6 + Math.random() * 4;
    particles.push({
      tex: 'dust2',
      x: m.x, y: m.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 38 + Math.random() * 24,
      maxLife: 62,
      scale: 0.45 + Math.random() * 0.55,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.14
    });
  }
}

// 爆体而亡：gore 碎块 + 大范围 dust2 能量迸发
function explodeBoss() {
  for (let i = 0; i < GORE_KEYS.length; i++) {
    const angle = (Math.PI * 2 / GORE_KEYS.length) * i + Math.random() * 0.6;
    const speed = 3 + Math.random() * 4;
    gores.push({
      key: GORE_KEYS[i],
      x: posX, y: posY + floatOffset,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      rot: 0,
      vrot: (Math.random() - 0.5) * 0.25,
      life: 140
    });
  }
  for (let p = 0; p < 26; p++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 6;
    particles.push({
      tex: 'dust2',
      x: posX, y: posY + floatOffset,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 50 + Math.random() * 30,
      maxLife: 80,
      scale: 0.5 + Math.random() * 0.7,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.12
    });
  }
}

function drawMines() {
  for (const m of mines) {
    const lifeRatio = m.life / m.maxLife;
    const bodyAlpha = Math.min(1, lifeRatio * 8);
    const flash = Math.sin(Date.now() * 0.015 + m.flashPhase) * 0.4 + 0.6;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.scale, m.scale);
    ctx.shadowColor = '#c832ff';
    ctx.shadowBlur = 20 * flash;
    ctx.globalAlpha = bodyAlpha;
    ctx.drawImage(images.cosmicMine, -MINE_W / 2, -MINE_H / 2, MINE_W, MINE_H);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(200, 50, 255, ${flash})`;
    ctx.globalAlpha = 0.4 * flash * bodyAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, MINE_W * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

// ========== 粒子（贴图粒子系统，支持 dust1_1 / dust1_2 / dust2） ==========
function emitDust1_1_Converge() {
  // 显形凝聚粒子：从四周向中心飘
  const a = Math.random() * Math.PI * 2;
  const r = 320 + Math.random() * 220;
  const sx = posX + Math.cos(a) * r;
  const sy = posY + Math.sin(a) * r * 0.6 + floatOffset;
  const tx = posX + (Math.random() - 0.5) * 50;
  const ty = posY + floatOffset + (Math.random() - 0.5) * 50;
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy) || 1;
  const speed = 3.0 + Math.random() * 1.5;
  particles.push({
    tex: 'dust1_1',
    x: sx, y: sy,
    vx: (dx / d) * speed + (Math.random() - 0.5) * 0.4,
    vy: (dy / d) * speed * 0.9,
    life: 60 + Math.random() * 35,
    maxLife: 95,
    scale: 0.6 + Math.random() * 0.5,
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 0.06
  });
}

function emitTrail(tex) {
  particles.push({
    tex,
    x: posX + (Math.random() - 0.5) * 50,
    y: posY + floatOffset + (Math.random() - 0.5) * 70,
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    life: 26 + Math.random() * 18,
    maxLife: 44,
    scale: 0.45 + Math.random() * 0.45,
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 0.1
  });
}

function updateAndDrawParticles() {
  ctx.globalCompositeOperation = 'screen';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.03;
    p.rot += p.vrot;
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const img = images[p.tex];
    if (!img) continue;
    const a = Math.min(1, p.life / p.maxLife);
    const w = img.width * p.scale, h = img.height * p.scale;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ========== 阶段状态机 ==========
function setPhase(p) { animState = p; phaseT = 0; }

function startAnim() {
  if (animId) cancelAnimationFrame(animId);
  resetAnim();
  actionBtn.style.display = 'none';
  running = true;
  loop();
}

function resetAnim() {
  if (animId) cancelAnimationFrame(animId);
  animState = 'idle';
  frameTimer = 0;
  phaseT = 0;
  posX = canvas.width / 2;
  posY = canvas.height / 2;
  floatOffset = 0;
  floatPhase = 0;
  mines = [];
  particles = [];
  scythes = [];
  gores = [];
  bossFlashT = 0;
  shakeAmt = 0;
  berserkX = canvas.width / 2;
  berserkY = canvas.height / 2;
  flip = false;
  animTimer = 0;
  // 开场隐身（动画开始时西格纳斯不可见）
  bossAlpha = 0; bossTargetAlpha = 0;
  eyeAlpha = 0;  eyeTargetAlpha = 0;
  initLanterns(3);
  setPhase('intro');
  drawIdle();
}

function step() {
  animTimer++;
  phaseT++;
  floatPhase += FLOAT_SPEED;
  floatOffset = Math.sin(floatPhase) * FLOAT_AMP;

  // ========== 阶段逻辑 ==========
  if (animState === 'intro') {
    // 灯笼依次淡入：每盏间隔 45 步
    for (let i = 0; i < lanterns.length; i++) {
      if (phaseT >= i * 45) lanterns[i].targetAlpha = 1;
    }
    if (phaseT > 120) eyeTargetAlpha = 1;                // 眼睛亮纹渐显
    if (phaseT >= 150 && phaseT <= 280) {                // 显形期粉尘凝聚
      if (Math.random() < 0.6) emitDust1_1_Converge();
    }
    if (phaseT > 180) bossTargetAlpha = 1;                // 本体淡入
    if (phaseT > 320) setPhase('scythe');
  }
  else if (animState === 'scythe') {
    if (phaseT === 1) spawnScythes();
    if (phaseT > 170) setPhase('dash1');
  }
  else if (animState === 'dash1') {
    bossTargetAlpha = 1;
    eyeTargetAlpha = 0;                                 // 一阶段亮纹在冲刺时淡出（drawEyeGlow 已不渲染）
    const targetX = 100;
    if (phaseT === 1) flip = true;                       // 向左冲刺：镜像
    posX += (targetX - posX) * 0.08;
    if (Math.random() < 0.7) emitTrail('dust1_2');
    if (Math.abs(posX - targetX) < 5 && phaseT > 18) {
      posX = targetX;
      spawnMineBurst();
      setPhase('dash2');
    }
  }
  else if (animState === 'dash2') {
    bossTargetAlpha = 1;
    eyeTargetAlpha = 0;
    const targetX = canvas.width - 100;
    if (phaseT === 1) flip = false;                      // 向右冲刺
    posX += (targetX - posX) * 0.08;
    if (Math.random() < 0.7) emitTrail('dust1_2');
    if (Math.abs(posX - targetX) < 5 && phaseT > 18) {
      posX = targetX;
      spawnMineBurst();
      setPhase('lanternAdd');
    }
  }
  else if (animState === 'lanternAdd') {
    if (phaseT === 1) {
      // 变身二阶段（身体已由 drawBoss 切到 signusAlt）+ 追加 3 盏（共 6 盏）
      const base = lanterns.length;
      for (let i = 0; i < 3; i++) lanterns.push(spawnLantern(base + i, base + 3));
    }
    // —— 狂暴活动：全屏大幅横跳（±0.275 屏宽/±0.175 屏高），
    //    闪烁期(165+)幅度收窄回中心 → 踉跄→崩塌；爆体(255)后冻结 ——
    const shrinking = (phaseT >= 165 && phaseT < 255);
    const shrink = shrinking ? Math.max(0.06, 1 - (phaseT - 165) / 90) : 1;
    if (phaseT < 255 && (phaseT + 17) % 38 === 1) {
      berserkX = canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.55 * shrink;
      berserkY = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.35 * shrink;
    }
    if (phaseT < 255) {
      posX += (berserkX - posX) * 0.07;
      posY += (berserkY - posY) * 0.07;
      flip = berserkX < posX;                                       // 面向横跳方向
    }
    // 全部 6 盏依次淡入
    for (let i = 0; i < lanterns.length; i++) {
      if (phaseT >= 1 + i * 35) lanterns[i].targetAlpha = 1;
    }

    // —— 狂暴演出（整体 ×0.8 慢速）：三波地雷 + 顺时针镰刀 + 闪烁震动爆体 ——
    if (phaseT === 35) { spawnMineBurst(); spawnRingScythes(); }  // 第1波地雷 + 顺时针镰刀（同刻）
    if (phaseT === 85) spawnMineBurst();                          // 第2波地雷
    if (phaseT === 135) spawnMineBurst();                         // 第3波地雷
    if (phaseT >= 165 && phaseT < 255) bossFlashT = phaseT - 165; // 165-255 本体闪烁（长暴怒）
    if (phaseT >= 200) shakeAmt = Math.min(10, (phaseT - 200) * 0.3); // 200 起震动渐强至 10px
    if (phaseT === 255) {                                         // 爆体而亡
      explodeBoss();
      bossTargetAlpha = 0;
      bossAlpha = 0;                                              // 本体瞬间消失（不做渐隐）
      eyeTargetAlpha = 0;
      eyeAlpha = 0;
      bossFlashT = 0;                                             // 停止闪烁
      lanterns.forEach(L => L.targetAlpha = 0);                   // 灯笼随本体熄灭
      shakeAmt = 16;                                              // 爆体瞬间大震
    }
    if (phaseT > 380) {                                            // 终幕结束
      if (true) {
        window.__seq.signusEnd();
      } else {
        actionBtn.textContent = '↺ 重播';
        actionBtn.style.display = 'inline-block';
      }
      running = false;
      return;
    }
  }

  // ========== 全局更新 ==========
  updateMines();
  updateScythes();
  // 碎块更新
  for (let i = gores.length - 1; i >= 0; i--) {
    const g = gores[i];
    g.x += g.vx; g.y += g.vy; g.vy += 0.07; g.rot += g.vrot; g.life--;
    if (g.life <= 0) gores.splice(i, 1);
  }
  // 平滑 alpha（本体不再整体明灭——"像素点闪烁"由 drawBoss 内部完成）
  bossAlpha += (bossTargetAlpha - bossAlpha) * 0.05;
  eyeAlpha += (eyeTargetAlpha - eyeAlpha) * 0.05;
  // 震动衰减（爆体后逐渐平息）
  if (animState === 'lanternAdd' && phaseT >= 255) shakeAmt *= 0.93;

  // ========== 渲染 ==========
  // 震动偏移（本体/亮纹/黑暗随 shakeAmt 抖动）
  shX = shakeAmt > 0 ? (Math.random() - 0.5) * 2 * shakeAmt : 0;
  shY = shakeAmt > 0 ? (Math.random() - 0.5) * 2 * shakeAmt : 0;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawUnderworld();
  drawAtmosphere();
  updateAndDrawParticles();
  if (bossAlpha > 0.05) drawSignusDarkness(posX + shX, posY + floatOffset + shY);
  updateLanterns();
  drawLanterns();
  if (bossAlpha > 0.01) drawBoss();
  if (eyeAlpha > 0.01)  drawEyeGlow();
  drawScythes();
  drawMines();
  // 爆体碎块（gore）
  for (const g of gores) {
    if (g.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, g.life / 35);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.scale(GORE_SCALE, GORE_SCALE);
    const img = images[g.key];
    if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  frameTimer++;
}

function loop() {
  if (!running || cancelled) return;
  try {
  // 狂暴终幕整体放慢（×0.8），突出演出节奏；其余阶段保持原速
  const spd = (animState === 'lanternAdd') ? SPEED * 0.8 : SPEED;
  acc += spd;
  if (acc >= 1) {
    let steps = Math.floor(acc);
    acc -= steps;
    for (; steps > 0; steps--) {
      step();
      if (!running) break;
    }
  }
  } catch(e) { reportReelErr('SIGNUS state=' + animState, e); cancelled = true; running = false; return; }
  animId = requestAnimationFrame(loop);
}

resize();
loadImages();
}


// ========== 迁移自 boss-reel.html：Storm Weaver 动画 ==========
function initStorm() {
'use strict';

const canvas = document.getElementById('stormCanvas');
const ctx = canvas.getContext('2d');
const actionBtn = document.getElementById('stormActionBtn');
const loading = document.getElementById('stormLoading');

actionBtn.style.display = 'none';

// ========== 贴图路径（与 signus/index 同款：assets/stormweaver/<key>.png） ==========
const TEX = {
  head:          'reel/assets/stormweaver/head.png',
  headNaked:     'reel/assets/stormweaver/headNaked.png',
  body:          'reel/assets/stormweaver/body.png',
  bodyNaked:     'reel/assets/stormweaver/bodyNaked.png',
  tail:          'reel/assets/stormweaver/tail.png',
  tailNaked:     'reel/assets/stormweaver/tailNaked.png',
  tailGlow:      'reel/assets/stormweaver/tailGlow.png',
  frostWave:     'reel/assets/stormweaver/frostWave.png',
  lightningOrb:  'reel/assets/stormweaver/lightningOrb.png',
  lightningBeam: 'reel/assets/stormweaver/lightningBeam.png',
  rain:          'reel/assets/stormweaver/tornadoRain_v2.png',
  snow:          'reel/assets/stormweaver/tornadoSnow_v2.png',
  background:    'reel/assets/stormweaver/background.png',    // Storm Weaver 冰天雪地背景
  armorBodyGore1:  'reel/assets/stormweaver/armorBodyGore1.png',
  armorBodyGore2:  'reel/assets/stormweaver/armorBodyGore2.png',
  armorBodyGore3:  'reel/assets/stormweaver/armorBodyGore3.png',
  armorHeadGore1:  'reel/assets/stormweaver/armorHeadGore1.png',
  armorTailGore1:  'reel/assets/stormweaver/armorTailGore1.png',
  armorTailGore2:  'reel/assets/stormweaver/armorTailGore2.png',
  nudeBodyGore1:   'reel/assets/stormweaver/nudeBodyGore1.png',
  nudeBodyGore2:   'reel/assets/stormweaver/nudeBodyGore2.png',
  nudeBodyGore3:   'reel/assets/stormweaver/nudeBodyGore3.png',
  nudeHeadGore1:   'reel/assets/stormweaver/nudeHeadGore1.png',
  nudeHeadGore2:   'reel/assets/stormweaver/nudeHeadGore2.png',
  nudeTailGore1:   'reel/assets/stormweaver/nudeTailGore1.png',
  nudeTailGore2:   'reel/assets/stormweaver/nudeTailGore2.png'
};

const images = {};
let loaded = 0;
const totalImages = Object.keys(TEX).length;

function loadImages() {
  for (const key in TEX) {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === totalImages) {
        initChain();
        // 待机海报：所有体节按链位摆好，alpha=0（待显形）
        drawIdle();
        window.__stormStart = startAnim;   // 集成模式：等待主控调用
      }
    };
    img.onerror = () => console.error('加载失败:', TEX[key]);
    img.src = TEX[key];
    images[key] = img;
  }
}

// ========== 画布尺寸与段体常量 ==========
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const HEAD_W = 82, HEAD_H = 88;
const BODY_W = 62, BODY_H = 48;
const TAIL_W = 46, TAIL_H = 92;
const SEG_SPACING = 40;          // 段间距（硬约束目标距离）

// ========== 运行时状态 ==========
let animState = 'idle';
let frameTimer = 0;
let phaseT = 0;
let SPEED = 0.7;

// 链式虫体：segments[0]=头, segments[1..11]=体, segments[12]=尾
const segments = [];
let naked = false;               // 是否蜕甲（二阶段）
let headAlive = true;
let armorShed = false;            // 蜕甲是否已发生

// 技能对象数组
let lightningBolts = [];           // 闪电球劈击出的分叉闪电（静态折线，短时淡出）
let lightningOrbs = [];           // 尾部发射的闪电球
let frostWaves = [];               // 冰霜冲击波
let tornadoes = [];                // 程序化龙卷风
let gores = [];                    // 碎块
let particles = [];               // 通用粒子（粉尘/电花）
let telegraphs = [];               // 冲刺预告

// 固定演出航线：伯努利双纽线（∞ 形）参数曲线，一条连续圆润的线，一笔画、无分段、全程屏内
// 弧长参数化：预计算弧长查找表，按固定弧长前进 → 线速度严格匀速（不会时快时慢）
const MOVE_SPEED = 7;             // 沿航线飞行线速度（放慢）
let lemS = 0;                     // 当前弧长位置（px，沿 ∞ 曲线，循环）
let arcLUT = null;                // 弧长查找表 [s0..sN]（t=0..2π 对应累积弧长）
let arcTotal = 0;                 // 曲线总周长
let arcW = 0, arcH = 0;           // LUT 对应的 canvas 尺寸（尺寸变化时重建）
let boostTimer = 0;               // 冲刺加速剩余帧（telegraph 冲刺）
let telegraphCanvas = null;       // 头部青色染色临时画布（source-in 遮罩，防方块）
let nextBodySpawn = 0;             // intro 阶段体节逐节生成的计时
let nextFrost = 0;                  // phase3 冰霜波冷却
let nextTornado = 0;               // phase4 龙卷风冷却
let lightningFlash = 0;            // phase4 屏幕闪电闪烁剩余帧
let shakeAmt = 0;                  // 震动幅度
let shX = 0, shY = 0;              // 震动偏移
let deadSegments = [];             // 已死亡的段索引（按顺序）

// ========== 链式体节初始化 ==========
function initChain() {
  segments.length = 0;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  // 头：从画面顶部入场，初始 alpha 0
  segments.push(makeSegment('head', cx, cy - 220, 0));
  // 11 节体（从近到远排好，初始 alpha 0，在 intro 中逐节生成）
  for (let i = 0; i < 11; i++) {
    segments.push(makeSegment('body', cx, cy - 220 + SEG_SPACING * (i + 1), i + 1));
  }
  // 尾
  segments.push(makeSegment('tail', cx, cy - 220 + SEG_SPACING * 12, 12));
  // 头初始 vx/vy 0；后续由 updateHead 追逐目标
}

function makeSegment(type, x, y, idx) {
  return {
    type: type,
    index: idx,
    x: x, y: y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,           // 默认朝上（与下一节方向相反）
    alpha: 0,
    spawned: false,
    dead: false,
    pulse: Math.random() * Math.PI * 2  // 待机/呼吸效果
  };
}

// ========== 链式硬约束（MEMORY.md 铁律：体节每帧硬位置修正，不插值不弹簧） ==========
function updateChainConstraints() {
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const dx = prev.x - seg.x;
    const dy = prev.y - seg.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const segWidth = (seg.type === 'head') ? HEAD_W * 0.55
                    : (seg.type === 'tail') ? TAIL_W * 0.6
                    : BODY_W * 0.6;
    const forceMove = (dist - segWidth) / dist;
    seg.x += dx * forceMove;
    seg.y += dy * forceMove;
    seg.angle = Math.atan2(dy, dx);
  }
}

// ========== 头运动：椭圆航线（弧长参数化 → 线速度严格匀速） ==========
function lemPos(t) {
  const ax = canvas.width * 0.36;    // 水平半轴
  const ay = canvas.height * 0.30;   // 垂直半轴
  return {
    x: canvas.width / 2 + ax * Math.cos(t),
    y: canvas.height / 2 + ay * Math.sin(t)
  };
}

const ARC_STEPS = 512;
function buildArcLUT() {
  const s = [0];
  let prev = lemPos(0);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const p = lemPos(i / ARC_STEPS * Math.PI * 2);
    s.push(s[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  arcLUT = s;
  arcTotal = s[ARC_STEPS];
  arcW = canvas.width; arcH = canvas.height;
}

function ensureLUT() {
  if (!arcLUT || arcW !== canvas.width || arcH !== canvas.height) buildArcLUT();
}

// 弧长 → 位置（二分反查 + 线性插值），s 循环 0~周长
function lemPosByArc(s) {
  ensureLUT();
  s = ((s % arcTotal) + arcTotal) % arcTotal;
  let lo = 0, hi = ARC_STEPS;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (arcLUT[mid] <= s) lo = mid; else hi = mid;
  }
  const t0 = lo / ARC_STEPS * Math.PI * 2;
  const t1 = (lo + 1) / ARC_STEPS * Math.PI * 2;
  const s0 = arcLUT[lo], s1 = arcLUT[lo + 1];
  const frac = (s1 - s0) > 0.0001 ? (s - s0) / (s1 - s0) : 0;
  return lemPos(t0 + (t1 - t0) * frac);
}

function updateHeadMotion(head) {
  const speed = boostTimer > 0 ? MOVE_SPEED * 1.55 : MOVE_SPEED;
  if (boostTimer > 0) boostTimer--;
  ensureLUT();
  lemS += speed;                        // 恒定线速度（每帧前进 speed px 弧长）
  const pos = lemPosByArc(lemS);
  const pos2 = lemPosByArc(lemS + 6);   // 切线方向（前视 6px）
  head.x = pos.x;
  head.y = pos.y;
  head.angle = Math.atan2(pos2.y - pos.y, pos2.x - pos.x);
}

// ========== 阶段状态机 ==========
function startAnim() {
  if (animId) cancelAnimationFrame(animId);
  resetAnim();
  actionBtn.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function resetAnim() {
  if (animId) cancelAnimationFrame(animId);
  animState = 'intro';
  frameTimer = 0;
  phaseT = 0;
  naked = false;
  headAlive = true;
  armorShed = false;
  lightningBolts = []; lightningOrbs = []; frostWaves = []; tornadoes = []; gores = []; particles = []; telegraphs = [];
  lemS = 0; boostTimer = 0; telegraphCanvas = null;
  nextBodySpawn = 0; nextFrost = 0; nextTornado = 0; lightningFlash = 0;
  shakeAmt = 0; shX = 0; shY = 0;
  deadSegments = [];
  initChain();
  drawIdle();
}

let animId = null;
let acc = 0;

function loop() {
  if (!animState || animState === 'idle' || cancelled) return;
  try {
  acc += SPEED;
  if (acc >= 1) {
    const steps = Math.floor(acc);
    acc -= steps;
    for (let s = 0; s < steps; s++) {
      step();
      if (!animState || animState === 'idle') break;
    }
  }
  } catch(e) { reportReelErr('STORM state=' + animState + ' phaseT=' + phaseT + ' bolts=' + lightningBolts.length + ' orbs=' + lightningOrbs.length + ' segs=' + segments.length, e); cancelled = true; animState = 'idle'; return; }
  animId = requestAnimationFrame(loop);
}

function step() {
  frameTimer++;
  phaseT++;

  // 全局更新：链约束、粒子、震动衰减
  updateChainConstraints();
  updateGores();
  updateParticles();
  updateLightningOrbs();
  updateFrostWaves();
  updateTornadoes();
  // telegraph 生命周期（冲刺预告青色渐隐，避免残留）
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    telegraphs[i].life--;
    if (telegraphs[i].life <= 0) telegraphs.splice(i, 1);
  }
  if (shakeAmt > 0.5) shakeAmt *= 0.92; else shakeAmt = 0;
  if (lightningFlash > 0) lightningFlash--;

  // 阶段逻辑
  if (animState === 'intro')      stepIntro();
  else if (animState === 'phase1')  stepPhase1();
  else if (animState === 'phase2')  stepPhase2();
  else if (animState === 'phase3')  stepPhase3();
  else if (animState === 'phase4')  stepPhase4();
  else if (animState === 'death')   stepDeath();

  // 渲染
  render();
}

// ========== 阶段 A：显形入场 ==========
function stepIntro() {
  const head = segments[0];
  updateHeadMotion(head);
  // 头先 alpha 渐显（0→1，~80 步）
  head.alpha = Math.min(1, head.alpha + 0.018);
  head.spawned = true;
  // 逐节生成：从头之后每 ~12 步生成一节
  nextBodySpawn++;
  if (nextBodySpawn % 12 === 0) {
    for (let i = 1; i < segments.length; i++) {
      const s = segments[i];
      if (!s.spawned) {
        s.spawned = true;
        s.alpha = 0;
        break;
      }
    }
  }
  // 已生成节 alpha 渐显
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].spawned) segments[i].alpha = Math.min(1, segments[i].alpha + 0.04);
  }
  // ~180 步结束（约 3s）
  if (phaseT > 180 && segments[segments.length - 1].alpha >= 0.95) {
    setPhase('phase1');
  }
}

// ========== 阶段 B：装甲·激光齐射 ==========
function stepPhase1() {
  const head = segments[0];
  // 冲刺预告：40-60 蓄力青光渐强，60 启动冲刺加速（染色随 life 淡出，不残留）
  const tele = phaseT < 80 ? (phaseT < 60 ? (phaseT < 40 ? 0 : 0.6) : 0.85) : 0;
  if (tele > 0) telegraphs.push({ intensity: tele, life: 42, maxLife: 42 });
  if (phaseT === 60) { boostTimer = 52; shakeAmt = 10; }
  updateHeadMotion(head);
  // 尾部闪电球：每 80 步一颗（球飞行中自动劈击分叉闪电）
  if (phaseT % 80 === 0 && phaseT > 0 && phaseT < 200) {
    const tail = segments[segments.length - 1];
    if (tail && tail.spawned && !tail.dead) fireLightningOrb(tail);
  }
  if (phaseT > 240) setPhase('phase2');
}

// ========== 阶段 C：蜕甲 → 裸身高频冲刺 ==========
function stepPhase2() {
  const head = segments[0];
  updateHeadMotion(head);
  // 第 1 步：蜕甲（装甲 gore 迸裂 + 切裸贴图）
  if (!armorShed) {
    armorShed = true;
    naked = true;
    for (let s of segments) {
      if (s.type === 'head' || s.type === 'body' || s.type === 'tail') {
        spawnArmorShed(s);
      }
    }
    shakeAmt = 14;
  }
  // 两段冲刺加速（左右横冲由运动系统自然产生，这里叠加爆发加速）
  if (phaseT === 30) { boostTimer = 46; shakeAmt = 8; }
  if (phaseT === 100) { boostTimer = 46; shakeAmt = 8; }
  if (phaseT > 180) setPhase('phase3');
}

// ========== 阶段 D：冰霜冲击波 ==========
function stepPhase3() {
  const head = segments[0];
  updateHeadMotion(head);
  // 冰霜波冷却
  if (nextFrost <= 0) {
    spawnFrostWave();
    nextFrost = 55;
  } else {
    nextFrost--;
  }
  // 冲刺加速一次
  if (phaseT === 40) { boostTimer = 46; shakeAmt = 8; }
  if (phaseT > 220) setPhase('phase4');
}

// ========== 阶段 E：狂暴·龙卷风+闪电 ==========
function stepPhase4() {
  const head = segments[0];
  updateHeadMotion(head);
  // 龙卷风冷却
  if (nextTornado <= 0) {
    spawnTornado();
    nextTornado = 80;
  } else {
    nextTornado--;
  }
  // 闪电闪烁：每 ~50 步一次
  if (phaseT % 50 === 0 && phaseT > 10) {
    lightningFlash = 18;
    shakeAmt = 6;
  }
  // 冲刺加速两次
  if (phaseT === 35 || phaseT === 110) { boostTimer = 46; shakeAmt = 8; }
  // 尾部闪电球更密（球飞行中劈击分叉闪电）
  if (phaseT % 50 === 0 && phaseT > 0) {
    const tail = segments[segments.length - 1];
    if (tail && tail.spawned && !tail.dead) fireLightningOrb(tail);
  }
  if (phaseT > 220) setPhase('death');
}

// ========== 阶段 F：死亡 ==========
function stepDeath() {
  const head = segments[0];
  // 头停止追踪：沿样条当前方向转为惯性滑行，逐渐减速
  if (phaseT === 1) {
    head.vx = Math.cos(head.angle) * 8;
    head.vy = Math.sin(head.angle) * 8;
  }
  head.vx *= 0.94; head.vy *= 0.94;
  head.x += head.vx; head.y += head.vy;
  updateChainConstraints();
  // 按距离尾部从近到远逐节爆掉（每 ~14 步一节）
  if (phaseT % 14 === 0 && phaseT > 0) {
    const aliveSegs = segments.filter(s => s.spawned && !s.dead && s !== head);
    if (aliveSegs.length > 0) {
      // 离尾最近的先爆
      const tail = segments[segments.length - 1];
      if (tail.spawned && !tail.dead && tail !== head) {
        explodeSegment(tail);
      } else {
        // 从尾部往头找第一个活的
        for (let i = segments.length - 2; i >= 1; i--) {
          if (segments[i].spawned && !segments[i].dead) {
            explodeSegment(segments[i]); break;
          }
        }
      }
    }
  }
  // 最后阶段：头爆掉
  if (phaseT === 14 * (segments.length - 2) + 30) {
    if (headAlive && head.spawned && !head.dead) {
      explodeHead(head);
      headAlive = false;
      shakeAmt = 16;
    }
  }
  // 全部爆完且粒子散尽 → 结束
  if (phaseT > 150 && !headAlive) {
    if (window.__seq && window.__seq.stormEnd) window.__seq.stormEnd();
  }
}

function setPhase(p) {
  animState = p;
  phaseT = 0;
}

// ========== 技能：劈击闪电（从已有的闪电球心劈出，静态分叉射线） ==========
// 主干从球心沿球速方向一直延伸到屏幕外（射线感）；仅前 8 段内随机 2~3 次转折，之后直线冲出屏幕。
// 分支最多 2 条、从主干侧面伸出且不再分支。
function spawnForkBolt(ball) {
  const ang = Math.atan2(ball.vy, ball.vx);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const W = canvas.width, H = canvas.height;
  // —— 主干：每 20px 一段，一直延伸到屏幕外；仅前 8 段内 2~3 个随机节点转折 ——
  const main = [{ x: ball.x, y: ball.y }];
  const turnCount = 2 + (Math.random() * 2 | 0);     // 2~3 次转折
  const turnIdx = new Set();
  while (turnIdx.size < turnCount) turnIdx.add(2 + (Math.random() * 6 | 0));   // 节点 2~7 中选
  const SEG = 20;
  let px = ball.x, py = ball.y, side = 1;
  let i = 0, guard = 0;
  while (guard++ < 200) {
    px += ux * SEG; py += uy * SEG;
    let off;
    if (i < 8 && turnIdx.has(i + 1)) {              // 前 8 段内转折（2~3 次）
      off = side * (14 + Math.random() * 18);
      side = -side;
    } else {
      off = (Math.random() - 0.5) * 4;              // 其余节点几乎在直线上（±2px）
    }
    main.push({ x: px + nx * off, y: py + ny * off });
    i++;
    // 一直延伸到屏幕外（射线感）
    if (px < -60 || px > W + 60 || py < -60 || py > H + 60) break;
  }
  // —— 分支：最多 2 条，从主干中段节点向侧面伸出（直线支线，不再分叉） ——
  const forks = [];
  const forkCount = Math.random() < 0.7 ? (1 + (Math.random() * 2 | 0)) : 0;   // 0~2 条
  const candidates = [2, 4, 6].slice().sort(() => Math.random() - 0.5).slice(0, forkCount);
  for (const fi of candidates) {
    const startNode = main[fi];
    // ★ 根因修复（2026-08-19）：闪电球在屏幕边缘附近劈击时主干 2~3 段即出屏，
    //   main[4]/main[6] 不存在 → startNode undefined → startNode.x 崩溃（reading 'x'）。
    if (!startNode) continue;   // 主干过短：该分叉点不存在，跳过此分支
    const fs = Math.random() < 0.5 ? 1 : -1;
    const fAng = ang + fs * (Math.PI / 3 + Math.random() * 0.4);   // 侧面 ±60~85°
    const fux = Math.cos(fAng), fuy = Math.sin(fAng);
    const FSEGS = 2 + (Math.random() * 2 | 0);      // 2~3 段
    const fk = [{ x: startNode.x, y: startNode.y }];
    let fx = startNode.x, fy = startNode.y;
    for (let j = 0; j < FSEGS; j++) {
      fx += fux * 16; fy += fuy * 16;
      fk.push({ x: fx, y: fy });                    // 直线支线，无子分支
    }
    forks.push({ fromIdx: fi, nodes: fk });         // 记录分叉起点的主干节点索引（用于从头消失）
  }
  lightningBolts.push({ main: main, forks: forks, life: 22, maxLife: 22 });
}

function drawLightningBolts() {
  for (const B of lightningBolts) {
    // ★ 防御（2026-08-19）：异常输入（空 main / 未初始化）直接跳过，避免 undefined.x 崩溃
    if (!B || !B.main || B.main.length < 2) continue;
    const fade = B.life / B.maxLife;          // 1 → 0
    if (fade <= 0.01) continue;
    // 消失进度：从头（球心端）开始，向尾部蔓延 → 可见段数 = fade × 总段数
    const N = B.main.length - 1;
    const visibleN = fade * N;
    const whole = Math.floor(visibleN);
    const frac = visibleN - whole;
    const main = B.main;
    // —— 主干（外层粗线 + 内层白芯，同一截断路径画两遍）——
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = '#b070ff'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#d8c8ff';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(main[0].x, main[0].y);
    for (let i = 1; i <= whole; i++) ctx.lineTo(main[i].x, main[i].y);
    if (whole < N && frac > 0.02) {           // 末端过渡段按进度截断
      const a = main[whole], b = main[whole + 1];
      ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.2;
    ctx.shadowBlur = 0;
    ctx.stroke();
    // —— 分叉：起点主干节点已消失则不画（外层 alpha 恢复 0.95） ——
    ctx.globalAlpha = 0.95;
    for (const fk of B.forks) {
      if (fk.fromIdx > visibleN) continue;
      const fn = fk.nodes;
      ctx.beginPath();
      ctx.moveTo(fn[0].x, fn[0].y);
      for (let i = 1; i < fn.length; i++) ctx.lineTo(fn[i].x, fn[i].y);
      ctx.stroke();
    }
    // 分叉白芯
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.2;
    ctx.shadowBlur = 0;
    for (const fk of B.forks) {
      if (fk.fromIdx > visibleN) continue;
      const fn = fk.nodes;
      ctx.beginPath();
      ctx.moveTo(fn[0].x, fn[0].y);
      for (let i = 1; i < fn.length; i++) ctx.lineTo(fn[i].x, fn[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ========== 技能：尾部闪电球（CultistBossLightningOrb → lightningOrb） ==========
function fireLightningOrb(seg) {
  // 闪电球从尾部向中心偏下发射
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const tx = cx + (Math.random() - 0.5) * 120;
  const ty = cy + 60 + Math.random() * 80;
  const dx = tx - seg.x, dy = ty - seg.y;
  const d = Math.hypot(dx, dy) || 1;
  lightningOrbs.push({
    x: seg.x, y: seg.y,
    vx: (dx / d) * 2.2,
    vy: (dy / d) * 2.2,
    life: 180, maxLife: 180,
    pulse: 0,
    frame: 0, frameTimer: 0,      // 4 帧动画（贴图 100×400 = 4×100×100）
    nextBolt: 30 + (Math.random() * 20 | 0)   // 首次劈击延迟（30~50）
  });
}

function updateLightningOrbs() {
  for (let i = lightningOrbs.length - 1; i >= 0; i--) {
    const O = lightningOrbs[i];
    O.x += O.vx; O.y += O.vy;
    O.pulse += 0.3;
    O.frameTimer++;
    if (O.frameTimer >= 5) { O.frameTimer = 0; O.frame = (O.frame + 1) % 4; }
    // 从球心劈击：每 45~65 帧劈一道（频率较低）
    if (--O.nextBolt <= 0) {
      spawnForkBolt(O);
      O.nextBolt = 45 + (Math.random() * 20 | 0);
    }
    O.life--;
    if (O.life <= 0) lightningOrbs.splice(i, 1);
  }
  // 劈击闪电老化（静止成形，短时淡出）
  for (let j = lightningBolts.length - 1; j >= 0; j--) {
    lightningBolts[j].life--;
    if (lightningBolts[j].life <= 0) lightningBolts.splice(j, 1);
  }
}

function drawLightningOrbs() {
  const FW = 100, FH = 100;      // 单帧 100×100（贴图 100×400 = 4 帧**纵向**排列：帧 i 在 (0, i*100)）
  for (const O of lightningOrbs) {
    if (!O) continue;            // ★ 防御（2026-08-19）
    const a = Math.min(1, O.life / 50);
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.translate(O.x, O.y);
    // 球本身：源矩形 (0, frame*FH, FW, FH) 纵向截帧 → 方形 128×128（不压扁、更大）
    ctx.globalCompositeOperation = 'screen';
    const sw = 128, sh = 128;
    ctx.drawImage(images.lightningOrb, 0, O.frame * FH, FW, FH, -sw / 2, -sh / 2, sw, sh);
    // 外圈脉冲（同帧放大）
    const ringR = 44 + Math.sin(O.pulse) * 10;
    ctx.globalAlpha = a * 0.3;
    ctx.drawImage(images.lightningOrb, 0, O.frame * FH, FW, FH, -ringR, -ringR, ringR * 2, ringR * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// ========== 技能：冰霜冲击波（frostWave 从天空下落，带 telegraph） ==========
function spawnFrostWave() {
  const cx = canvas.width / 2;
  // 一排 N 道波
  const count = 5;
  const startX = cx - (count - 1) * 70;
  for (let i = 0; i < count; i++) {
    frostWaves.push({
      x: startX + i * 140,
      y: -60,
      vy: 3.6,             // 所有冰霜波速度统一（满 alpha 出屏消失）
      telegraph: 36,    // 预告期帧数（先亮再下落）
      life: 200,
      maxLife: 200
    });
  }
}

function updateFrostWaves() {
  for (let i = frostWaves.length - 1; i >= 0; i--) {
    const F = frostWaves[i];
    if (F.telegraph > 0) {
      F.telegraph--;
    } else {
      F.y += F.vy;
    }
    // 只按出屏判断移除（不设 life 上限，避免慢速波在屏幕中途消失）
    if (F.y > canvas.height + 80) frostWaves.splice(i, 1);
  }
}

function drawFrostWaves() {
  for (const F of frostWaves) {
    ctx.save();
    ctx.globalAlpha = 1;                    // 不渐隐：满 alpha 飞出屏外才消失
    ctx.translate(F.x, F.y);
    ctx.rotate(Math.PI);                     // 贴图方向修正（旋转 180°）
    if (F.telegraph > 0) {
      // 预告：半透明青色发光
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(images.frostWave, -40, -24, 80, 48);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // 正式：screen 叠加青色冰霜
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(images.frostWave, -40, -24, 80, 48);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}

// ========== 技能：程序化龙卷风（忠实 TornadoHostile.cs PreDraw） ==========
// C# 逻辑：垂直柱（贴地 baseY → 顶 baseY-H），从底到顶每 5.1px 一层；
// 每层螺旋角 inc*2π/-20（每 20px 转一圈，负=顺时针）+ 整体缓旋 -0.0628*ai；
// 颜色 ch<0.5?ch*2:2-ch*2（底部淡入顶部淡出）A×0.5×clamp；缩放 1+(ch-0.15) 随高度增大。
function spawnTornado() {
  const x = 120 + Math.random() * (canvas.width - 240);
  tornadoes.push({
    x: x, baseY: canvas.height * 0.78,        // 底部在屏幕 78% 高度（往下挪）
    vx: (Math.random() - 0.5) * 0.35,
    height: 480 + Math.random() * 60,          // 柱高更长（480~540）
    ai: 0,                       // aiTracker（帧计时）
    life: 420, maxLife: 420
  });
}

function updateTornadoes() {
  for (let i = tornadoes.length - 1; i >= 0; i--) {
    const T = tornadoes[i];
    T.x += T.vx;
    T.ai++;
    T.life--;
    if (T.life <= 0) tornadoes.splice(i, 1);
    // 边界反弹
    if (T.x < 60) { T.vx = Math.abs(T.vx); T.x = 60; }
    if (T.x > canvas.width - 60) { T.vx = -Math.abs(T.vx); T.x = canvas.width - 60; }
  }
}

function drawTornadoes() {
  for (const T of tornadoes) {
    const H = T.height;
    // 淡入（前30帧）/ 淡出（最后60帧）——C# trackerClamp
    let clamp = Math.min(1, T.ai / 30);
    if (T.life < 60) clamp = Math.min(clamp, T.life / 60);
    if (clamp <= 0.01) continue;
    const aiTrackMult = -0.06283186 * T.ai;   // 整体缓旋
    const step = 5.1;
    let inc = 0;
    let layerIdx = 0;
    const baseY = T.baseY, topY = T.baseY - H;
    // C# 循环：k 从底向顶逐层（k -= step）
    for (let k = baseY; k > topY; k -= step) {
      inc += step;
      const ch = inc / H;
      // 颜色：底部淡入、顶部淡出，A×0.5×clamp
      let alpha = (ch < 0.5 ? ch * 2 : 2 - ch * 2) * 0.5 * clamp;
      if (alpha <= 0.015) continue;
      const incMult = inc * 6.283185 / -20;   // 螺旋角（每 20px 转一圈）
      const rot = aiTrackMult + incMult;
      const scale = 1 + (ch - 0.15);          // 随高度增大
      const tex = (layerIdx % 2 === 0) ? images.snow : images.rain;
      layerIdx++;
      const sz = 68 * scale;      // 粒子放大 → 龙卷风柱体更宽
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(T.x + shX, k + shY);
      ctx.rotate(rot);
      ctx.drawImage(tex, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }
}

// ========== 蜕甲：装甲 gore 迸裂 ==========
function spawnArmorShed(seg) {
  const goreKey = (seg.type === 'head') ? 'armorHeadGore1'
                 : (seg.type === 'tail') ? 'armorTailGore' + (Math.random() < 0.5 ? '1' : '2')
                 : 'armorBodyGore' + (1 + Math.floor(Math.random() * 3));
  const tex = images[goreKey];
  if (!tex) return;
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 3;
    gores.push({
      tex: tex,
      x: seg.x, y: seg.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      scale: 1.0 + Math.random() * 0.3,
      life: 140, maxLife: 140
    });
  }
  // 紫色粉尘迸发
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 2;
    particles.push({
      x: seg.x, y: seg.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: 60 + Math.random() * 30,
      maxLife: 90,
      color: `hsl(${280 + Math.random() * 30}, 90%, 70%)`,
      size: 2 + Math.random() * 3
    });
  }
}

// ========== 死亡：段体爆裂（产生对应裸 gore + 紫尘） ==========
function explodeSegment(seg) {
  seg.dead = true;
  seg.alpha = 0;
  // 选对应裸贴图（体用 nudeBodyGore，尾用 nudeTailGore，头不在这用）
  const isTail = (seg.type === 'tail');
  const texKey = isTail
    ? 'nudeTailGore' + (1 + Math.floor(Math.random() * 2))
    : (seg.type === 'body') ? 'nudeBodyGore' + (1 + Math.floor(Math.random() * 3))
    : null;
  const tex = texKey ? images[texKey] : null;
  if (tex) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 4;
      gores.push({
        tex: tex,
        x: seg.x, y: seg.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        scale: 0.9 + Math.random() * 0.4,
        life: 160, maxLife: 160
      });
    }
  }
  // 紫尘大爆发
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    particles.push({
      x: seg.x, y: seg.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      life: 70 + Math.random() * 40,
      maxLife: 110,
      color: `hsl(${280 + Math.random() * 30}, 90%, 70%)`,
      size: 2 + Math.random() * 4
    });
  }
  shakeAmt = Math.max(shakeAmt, 6);
}

function explodeHead(head) {
  head.dead = true;      // 关键：标记头死亡，drawSegment 才会跳过绘制
  head.alpha = 0;
  // 头爆：用裸头 gore
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 4;
    const tex = images['nudeHeadGore' + (1 + Math.floor(Math.random() * 2))];
    if (!tex) continue;
    gores.push({
      tex: tex,
      x: head.x, y: head.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      scale: 1.0 + Math.random() * 0.5,
      life: 200, maxLife: 200
    });
  }
  // 紫尘+电花
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 4;
    particles.push({
      x: head.x, y: head.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      life: 80 + Math.random() * 50,
      maxLife: 130,
      color: `hsl(${280 + Math.random() * 30}, 90%, 75%)`,
      size: 2 + Math.random() * 4
    });
  }
  shakeAmt = 18;
}

// ========== Gore / Particles 更新与渲染 ==========
function updateGores() {
  for (let i = gores.length - 1; i >= 0; i--) {
    const g = gores[i];
    g.x += g.vx; g.y += g.vy;
    g.vy += 0.06;
    g.vx *= 0.97;
    g.rot += g.vrot;
    g.life--;
    if (g.life <= 0) gores.splice(i, 1);
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawGores() {
  for (const g of gores) {
    const a = Math.min(1, g.life / 35);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(g.x + shX, g.y + shY);
    ctx.rotate(g.rot);
    ctx.scale(g.scale, g.scale);
    ctx.drawImage(g.tex, -g.tex.width / 2, -g.tex.height / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.min(1, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + shX, p.y + shY, p.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ========== 渲染 ==========
function render() {
  shX = shakeAmt > 0 ? (Math.random() - 0.5) * 2 * shakeAmt : 0;
  shY = shakeAmt > 0 ? (Math.random() - 0.5) * 2 * shakeAmt : 0;
  // 背景：先铺天空渐变打底（覆盖背景图透明区域，避免 Boss 经过露出黑底/残留），再叠背景图
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, '#1c2f5e');    // 顶部深蓝
  skyGrad.addColorStop(0.5, '#12204a');  // 中部深蓝
  skyGrad.addColorStop(1, '#0a1030');    // 底部近黑蓝
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (images.background) {
    ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
  }
  // 太空滤镜：压暗背景亮度（只暗背景，Boss/技能仍亮）
  ctx.fillStyle = 'rgba(8, 12, 38, 0.68)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 屏幕闪电闪烁（phase4）
  if (lightningFlash > 0) {
    ctx.fillStyle = `rgba(220, 240, 255, ${lightningFlash / 36})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // 冲刺预告青色闪光（全局，随 life 淡出）
  if (telegraphs.length > 0) {
    // 取最近一个
    const t = telegraphs[telegraphs.length - 1];
    const fade = t.life / t.maxLife;
    ctx.fillStyle = `rgba(120, 230, 255, ${t.intensity * 0.16 * fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 绘制顺序：龙卷风 → 冰霜波 → 闪电球 → 激光 → 链式体 → 紫尘/碎块 → 电花
  drawTornadoes();
  drawFrostWaves();
  drawLightningOrbs();
  drawLightningBolts();

  // 链式体（从尾到头，头最后画）
  for (let i = segments.length - 1; i >= 0; i--) {
    drawSegment(segments[i]);
  }

  drawParticles();
  drawGores();
}

// 段体绘制：贴图朝上 → rotate(angle + PI/2)
function drawSegment(seg) {
  if (!seg || !seg.spawned || seg.dead || seg.alpha <= 0.02) return;   // ★ 防御（2026-08-19）：seg undefined 直接跳过
  let texKey;
  let W, H;
  if (seg.type === 'head') {
    texKey = naked ? 'headNaked' : 'head';
    W = HEAD_W; H = HEAD_H;
  } else if (seg.type === 'tail') {
    texKey = naked ? 'tailNaked' : 'tail';
    W = TAIL_W; H = TAIL_H;
  } else {
    texKey = naked ? 'bodyNaked' : 'body';
    W = BODY_W; H = BODY_H;
  }
  const tex = images[texKey];
  if (!tex) return;

  // 尾部装甲贴图是 2 帧纵向图集（46×92 = 2×46×46）：固定取第 1 帧（用户要求尾部保持单一姿态，不播动画）
  let srcY = 0, srcH = H, dstH = H;
  if (seg.type === 'tail' && !naked) {
    const TF = 46;
    srcY = 0;                 // 固定帧 0
    srcH = TF;
    dstH = TF;
  }

  ctx.save();
  ctx.globalAlpha = seg.alpha;
  ctx.translate(seg.x + shX, seg.y + shY);
  ctx.rotate(seg.angle + Math.PI / 2);
  ctx.drawImage(tex, 0, srcY, W, srcH, -W / 2, -dstH / 2, W, dstH);

  // 尾部额外画一层 glow（screen 叠加，同帧纵向取帧）
  if (seg.type === 'tail' && !naked) {
    ctx.globalCompositeOperation = 'screen';
    const glowTex = images.tailGlow;
    if (glowTex) ctx.drawImage(glowTex, 0, srcY, W, srcH, -W / 2, -dstH / 2, W, dstH);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 冲刺预告：青色本体染色——临时画布 source-in 本体遮罩（只染头部不透明像素，
  // 四周透明/半透明光晕不受影响 → 无"蓝色方块"）；复用画布每帧必须复位合成模式
  if (telegraphs.length > 0 && seg === segments[0]) {
    const t = telegraphs[telegraphs.length - 1];
    if (t.intensity > 0.05) {
      if (!telegraphCanvas) {
        telegraphCanvas = document.createElement('canvas');
        telegraphCanvas.width = W; telegraphCanvas.height = H;
      }
      const tc = telegraphCanvas.getContext('2d');
      tc.globalCompositeOperation = 'source-over';   // 关键：复位上帧遗留合成模式
      tc.clearRect(0, 0, W, H);
      tc.drawImage(tex, 0, 0, W, H);                  // 头部本体快照
      tc.globalCompositeOperation = 'source-in';
      tc.globalAlpha = t.intensity * (t.life / t.maxLife);
      tc.fillStyle = '#a0f0ff';
      tc.fillRect(0, 0, W, H);                        // 只染本体像素
      tc.globalCompositeOperation = 'source-over';
      ctx.drawImage(telegraphCanvas, -W / 2, -H / 2, W, H);
    }
  }
  ctx.restore();
}

// ========== 待机海报（首帧） ==========
function drawIdle() {
  // 摆好链体到画面中央（头朝下居中，链体沿垂直方向）
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const halfChain = (segments.length - 1) * SEG_SPACING / 2;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    s.x = cx;
    s.y = cy + halfChain - i * SEG_SPACING;
    s.vx = 0; s.vy = 0;
    s.angle = -Math.PI / 2;
    s.alpha = 0.95;
    s.spawned = true;
  }
  // 待机海报背景：天空渐变打底 + 背景图（与 render 一致）
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, '#1c2f5e');
  skyGrad.addColorStop(0.5, '#12204a');
  skyGrad.addColorStop(1, '#0a1030');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (images.background) ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
  // 太空滤镜（与 render 一致）
  ctx.fillStyle = 'rgba(8, 12, 38, 0.68)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = segments.length - 1; i >= 0; i--) drawSegment(segments[i]);
  frameTimer++;
}

loadImages();
}
