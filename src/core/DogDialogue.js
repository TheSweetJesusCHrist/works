// ===== core/DogDialogue.js — 神吞语言系统（EdgyBossText）=====
// 自包含实现：对话数据 + 标签解析 + 单锚点绘制（触发瞬间锁定虫头上方 ~70px，不跟随、不上飘）。
// 纯文字无文本框（用户要求）：不画背景/描边/尾巴。
// 入场动画：出现瞬间绕锚点下方圆心小幅旋转 ~10°（方向随机顺/逆时针），转完向对应方向+上方飘动（easeOut 减速，有速度感）。
// spawn = 两段依次替换显示（先 "You are no god..." 再 "but I shall feast..."）。
// 字体：项目 src/assets/fonts/ANDYB.TTF 的 family = 'Andy'（见 style.css @font-face）。
// 标签标记（写在数据里，可改）：
//   普通：    [Colors(n,speed,c1,c2):文本]           颜色在两 hex 间按时间正弦插值
//   狠话：    [Shaking:[Scale(x):[Colors(...):文本]]] 逐帧正弦抖动 + 缩放 + 颜色渐变

import { lerp, points, W, H } from './globals.js';

const FONT_FAMILY = "'Andy', system-ui, -apple-system, sans-serif";
// 入场动画：台词出现瞬间【同时】绕锚点下方圆心小幅旋转（方向随机）并朝对应方向+上方飘动（easeOut 减速，非匀速）
const ORBIT_R = 80;                        // 文本到圆心的距离（px）
const ORBIT_ANGLE = 10 * Math.PI / 180;    // 旋转最大角度（10°，小幅度）
const ORBIT_DUR = 0.45;                    // 转到位时长（s）
const DRIFT_X = 36;                        // 飘动横向距离（px，随旋转方向：顺→右 / 逆→左）
const DRIFT_Y = 28;                        // 飘动向上距离（px）
const DRIFT_DUR = 1.5;                     // 飘动时长（s，easeOut 减速 = 有速度感但不过快，非匀速）
const COLOR_SPEED_MULT = 2;   // 颜色渐变速度倍数（全局调快，改这一个数即可）

// ── 对话数据（英文）──
// spawn / finalPhase = 头部气泡（跟随虫头）；random = 头部气泡随机池（施放技能时随机抽 1 句）。
// 死亡模式「灵魂被吞噬」那条按需求跳过；项目无 HP/受击模型，不建相关触发。
export const EDGY_BOSS_TEXT = {
  // 出场（头部气泡，拆两段依次替换显示）
  spawn: [
    '[Colors(2,0.5,00FFFF,FF00FF):You are no god...]',
    '[Colors(2,0.5,00FFFF,FF00FF):but I shall feast upon your essence regardless!]',
  ],
  // 变形态（头部气泡，狠话：抖动+放大+渐变）
  finalPhase: '[Shaking:[Scale(1.3):[Colors(2,0.6,FF00FF,00FFFF):Not over yet, kid!]]]',
  // 随机池（头部气泡，普通渐变）
  random: [
    "[Colors(2,0.5,00FFFF,FF00FF):Don't get cocky, kid!]",
    '[Colors(2,0.5,00FFFF,FF00FF):A god does not fear death!]',
    "[Colors(2,0.5,00FFFF,FF00FF):You think... you can butcher... ME!?]",
    '[Colors(2,0.5,00FFFF,FF00FF):Fatal error!]',
    '[Colors(2,0.5,00FFFF,FF00FF):I do hope you recover!]',
    '[Colors(2,0.5,00FFFF,FF00FF):Delicious...]',
    '[Colors(2,0.5,00FFFF,FF00FF):Oh, does it hurt?]',
    '[Colors(2,0.5,00FFFF,FF00FF):Nothing personal, kid.]',
    '[Colors(2,0.5,00FFFF,FF00FF):Can you not even dodge?]',
    "[Colors(2,0.5,00FFFF,FF00FF):Of all the things to hit with a body this long...]",
  ],
};

// ── 标签解析：将 "[Tag(args):body]" 递归解析为段数组 ──
// 段：{type:'text', text} 或 {type:'tag', name, args:[...], body:[...]}
function findClose(str, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < str.length; j++) {
    if (str[j] === '[') depth++;
    else if (str[j] === ']') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

function parseSegments(str) {
  const segs = [];
  let i = 0, buf = '';
  while (i < str.length) {
    const ch = str[i];
    if (ch === '[') {
      const close = findClose(str, i);
      if (close === -1) { buf += str.slice(i); break; }
      const inner = str.slice(i + 1, close);
      const ci = inner.indexOf(':');
      if (ci === -1) { buf += str.slice(i, close + 1); i = close + 1; continue; }
      const head = inner.slice(0, ci);
      const bodyStr = inner.slice(ci + 1);
      const pm = head.match(/^([A-Za-z]+)(?:\((.*)\))?$/);
      if (pm) {
        const name = pm[1];
        const args = pm[2] != null ? pm[2].split(',').map(s => s.trim()) : [];
        if (buf) { segs.push({ type: 'text', text: buf }); buf = ''; }
        segs.push({ type: 'tag', name, args, body: parseSegments(bodyStr) });
      } else {
        buf += str.slice(i, close + 1);
      }
      i = close + 1;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf) segs.push({ type: 'text', text: buf });
  return segs;
}

// ── 颜色工具 ──
function hexToRgb(h) {
  h = (h || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpHex(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
// 两 hex 按时间正弦插值（n=周期数, speed=速度；×COLOR_SPEED_MULT 全局提速）
function gradientColor(c1, c2, time, speed, n) {
  const tt = 0.5 + 0.5 * Math.sin(time * (speed || 0.5) * (n || 1) * COLOR_SPEED_MULT);
  return lerpHex(c1, c2, tt);
}

function collectLeafText(segs) {
  let s = '';
  for (const seg of segs) {
    if (seg.type === 'text') s += seg.text;
    else s += collectLeafText(seg.body);
  }
  return s;
}
function collectScale(segs) {
  let f = 1;
  for (const seg of segs) {
    if (seg.type === 'tag') {
      if (seg.name === 'Scale') f *= parseFloat(seg.args[0]) || 1;
      f *= collectScale(seg.body);
    }
  }
  return f;
}

// 递归渲染：把段画到 ctx，按 pen（{x,y} 基线中点左侧起点）推进。Scale/Shaking 用 save/restore 包裹。
function renderSegments(ctx, segs, time, pen) {
  for (const seg of segs) {
    if (seg.type === 'text') {
      ctx.fillText(seg.text, pen.x, pen.y);
      pen.x += ctx.measureText(seg.text).width;
    } else {
      const tag = seg.name;
      if (tag === 'Colors') {
        const n = parseInt(seg.args[0]) || 1;
        const speed = parseFloat(seg.args[1]) || 0.5;
        const c1 = seg.args[2] || '00FFFF';
        const c2 = seg.args[3] || 'FF00FF';
        ctx.save();
        ctx.fillStyle = gradientColor(c1, c2, time, speed, n);
        renderSegments(ctx, seg.body, time, pen);
        ctx.restore();
      } else if (tag === 'Scale') {
        const s = parseFloat(seg.args[0]) || 1;
        ctx.save();
        ctx.translate(pen.x, pen.y);
        ctx.scale(s, s);
        ctx.translate(-pen.x, -pen.y);
        renderSegments(ctx, seg.body, time, pen);
        ctx.restore();
      } else if (tag === 'Shaking') {
        const ox = Math.sin(time * 30) * 3;
        const oy = Math.cos(time * 27) * 3;
        ctx.save();
        ctx.translate(ox, oy);
        renderSegments(ctx, seg.body, time, pen);
        ctx.restore();
      } else {
        renderSegments(ctx, seg.body, time, pen);
      }
    }
  }
}

// ── DogDialogue 类 ──
export class DogDialogue {
  constructor() {
    this.overlay = null;     // 兄弟 2D canvas（pointer-events:none）
    this.octx = null;
    this.active = null;      // 当前显示行：{segs, t, life}
    this.queue = [];         // 多段队列（say 依次替换播放）
    this.anchorX = W / 2;    // 台词生成时锁定的显示位置（触发瞬间虫头上方 ~70px，之后不跟随）
    this.anchorY = H / 2;
    this.t = 0;             // 动画时间累加（秒）
    this.lastRandomAt = -999; // 上次随机句时间（节流，最小间隔 ~2.5s）
    this.randomThisCast = false; // 每次施放最多 1 句
  }

  initOverlay() {
    if (this.overlay) return;
    const game = document.getElementById('game');
    if (!game) return;
    const cv = document.createElement('canvas');
    cv.id = 'dog-dialogue';
    Object.assign(cv.style, {
      position: 'absolute', left: '0', top: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '5',
    });
    game.appendChild(cv);
    this.overlay = cv;
    this.octx = cv.getContext('2d');
    this.resize();
  }

  resize() {
    if (!this.overlay) return;
    this.overlay.width = W;
    this.overlay.height = H;
  }

  // 一次性触发（支持单句字符串或数组多段，依次替换显示）
  say(key) {
    const raw = EDGY_BOSS_TEXT[key];
    if (!raw) return;
    const arr = Array.isArray(raw) ? raw : [raw];
    this.queue = arr.map(r => parseSegments(r));
    this.active = null;
    this._advance();
  }

  // 锁定锚点：触发瞬间取虫头位置上方 ~70px，之后不跟随头部。
  // ★ clamp 进屏幕内（边距 60px）：P2 过场冲刺时虫头会冲出屏幕（case 4 触发点在冲刺减速完，
  //   位移 1000px+），若锚点跟着出屏则文本不可见——这是 finalPhase 台词"看不到"的根因（2026-08-19）。
  _lockAnchor() {
    const head = points[0];
    const m = 60;
    this.anchorX = Math.max(m, Math.min(W - m, head ? head.x : W / 2));
    this.anchorY = Math.max(m, Math.min(H - m, (head ? head.y : H / 2) - 70));
  }

  // 从队列取下一段显示（队列空则清空）
  _advance() {
    if (!this.queue.length) { this.active = null; return; }
    this._lockAnchor();   // 每段生成时都在头部重新锁定
    this.active = { segs: this.queue.shift(), t: 0, life: 1.8, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  // 随机池（头部气泡），带节流
  sayRandom() {
    if (this.randomThisCast) return;            // 本次施放已发过
    if (this.t - this.lastRandomAt < 2.5) return; // 最小间隔 ~2.5s
    const arr = EDGY_BOSS_TEXT.random;
    const raw = arr[Math.floor(Math.random() * arr.length)];
    this.startLine(raw, 2.0);
    this.lastRandomAt = this.t;
    this.randomThisCast = true;
  }

  // 每次施放开始：允许本cast再发 1 句
  onCastStart() { this.randomThisCast = false; }

  clear() {
    this.active = null;
    if (this.octx) this.octx.clearRect(0, 0, W, H);
  }

  startLine(raw, life) {
    this.queue = [];   // 单句：清空未播完的多段队列
    this._lockAnchor();   // 触发瞬间锁定（不跟随头部）
    this.active = { segs: parseSegments(raw), t: 0, life, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  update(dt) {
    this.t += dt;
    if (this.active) {
      this.active.t += dt;
      if (this.active.t >= this.active.life) this._advance(); // 播完切下一段（无则清空）
    }
  }

  draw() {
    if (!this.octx) return;
    const c = this.octx;
    c.clearRect(0, 0, W, H);
    if (!this.active) return;
    const line = this.active;
    const baseFont = 26;
    const scaleFactor = collectScale(line.segs);
    const plain = collectLeafText(line.segs);

    c.font = `${baseFont}px ${FONT_FAMILY}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';

    const baseW = c.measureText(plain).width;
    const w = baseW * scaleFactor;

    // ① 入场公转：绕锚点下方圆心 O 随机方向（dir=±1：顺/逆时针）转 θ_max（~10°），easeOutCubic 单向
    const t = line.t;
    const dir = line.dir;
    const p1 = Math.min(1, t / ORBIT_DUR);
    const theta = dir * ORBIT_ANGLE * (1 - Math.pow(1 - p1, 3));
    const ox = this.anchorX;
    const oy = this.anchorY + ORBIT_R;      // 圆心在锚点正下方 R
    const orbitX = ox + Math.sin(theta) * ORBIT_R;
    const orbitY = oy - Math.cos(theta) * ORBIT_R;

    // ② 从出现瞬间起【同时】向「对应方向 + 上方」飘动：easeOut 减速（非匀速，无分段延迟）
    const p2 = Math.min(1, t / DRIFT_DUR);
    const e = 1 - Math.pow(1 - p2, 3);
    const driftX = dir * DRIFT_X * e;   // 顺时针→右，逆时针→左
    const driftY = -DRIFT_Y * e;        // 向上

    const cx = orbitX + driftX;
    const cy = orbitY + driftY;

    const remain = line.life - line.t;
    const alpha = remain < 0.6 ? Math.max(0, remain / 0.6) : 1;

    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.rotate(theta);                        // 自身跟随倾斜（绕文本中心，含方向）
    c.translate(-cx, -cy);
    const pen = { x: cx - w / 2, y: cy };
    renderSegments(c, line.segs, this.t, pen);
    c.restore();
  }
}

export const dogDialogue = new DogDialogue();
