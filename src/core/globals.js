// ===== core/globals.js (migrated from scourge_selector.html) =====
import { DoGSky, clouds } from './Background.js';

export let currentCharKey = null;

export let currentChar = null;

export let imgs = {};

export let segments = [], points = [];

export let worms = [];            // 双虫（星神）模式：每条虫独立 segments/points/lastHead/glowSuffix

export let isDual = false;        // 当前是否为双虫模式（星神界面）

export let lastHead = { x: 0, y: 0 };

export let particles = [];

export let canvas, ctx, W, H;

export let rafId = null;

export let animTime = 0;          // 塔纳托斯动画累计时间（秒）

export let lastTs = 0;            // 上一帧时间戳

export const mouse = { x: 0, y: 0 };

// P1→P2 过场钻门：「穿针」模型——蠕虫持续朝传送门飞行（头部穿过门后继续沿原方向前进），
// 每个体节各自走到【门正中心】那一点时才消失。判定是【空间距离】，不是链条顺序：
//  - px / py：传送门正中心坐标
//  - core   ：触碰判定半径（px）。体节中心进入该半径 → 打上 seg.ptGone 永久消失标记
//             （用永久标记而非纯距离，否则体节穿过门后距离重新变大会「复活」）
//  - band   ：消散带宽度（px）。体节距门中心在 (core, core+band] 区间内时平滑缩小 + 淡出，
//             越靠近中心越小越透明，避免「唰一下整节消失」的突兀感。
export const dogClip = { active: false, px: 0, py: 0, core: 0, band: 0 };

export let currentTheme = 'aquatic';   // 当前背景行为主题（由 background 参数推导）

export let cloudsOn = false;            // 云朵开关（由 clouds 参数推导）

export let lightningOn = false;         // 雷电开关（由 lightning 参数推导）

export let darkLevel = 0;               // 昼夜暗化强度 0=白天 ~0.55=深夜（由 timeOfDay 推导，可被键盘 L 覆盖）

export let timeOfDayOverride = null;    // 键盘 L 实时切换的覆盖值（null=用角色默认 timeOfDay）

// 塔纳托斯「蓝 ↔ 红」状态机

export let thanatosPhase = 'blue';      // blue / toRed / red / toBlue

export let thanatosTimer = 0;           // 当前阶段已持续时间（秒）

export const THANATOS_HOLD = 5;         // 蓝/红各持续秒数

export const THANATOS_TRANS = 1.5;      // 过渡动画时长（秒）
// 光晕颜色：蓝 <-> 红 线性插值端点

export const THANATOS_BLUE = [90, 150, 255];

export const THANATOS_RED = [255, 105, 95];

export function lerp(a, b, t) { return a + (b - a) * t; }

export function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

export function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// ── 动画更新主函数（每帧调用）──

export const _whiteTintCache = new Map();

export function getWhiteTint(img) {
  if (!img) return null;
  let c = _whiteTintCache.get(img);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, c.width, c.height);
  _whiteTintCache.set(img, c);
  return c;
}

// 通用全屏离屏画布（特效合成用）：先把发光画到离屏，再按需扣掉遮挡剪影，最后一次性 lighter 合成到主画布。

export let _fxCanvas = null;

export function ensureFxCanvas() {
  if (!_fxCanvas) _fxCanvas = document.createElement('canvas');
  if (_fxCanvas.width !== W || _fxCanvas.height !== H) { _fxCanvas.width = W; _fxCanvas.height = H; }
  return _fxCanvas;
}


// ============ DoG 战天背景（v0813s：Background_113 作底图 + 5层忠实还原叠加上面）============
// 贴图来源：Calamity Mod 源码 DoGSky.cs / DoGVisualsManager.cs / 5个.fx
// 层顺序：①扭曲风(AlphaBlend) → ②滚动雾(AlphaBlend) → ③裂隙光环(Additive) → ④碎玻璃(Additive) → ⑤扭曲裂隙(AlphaBlend+Metaball近似)
// ?solo=1..5 单测各层，?grid=1 同屏5格

export let _glowTmp = null, _glowOcc = null;


// ---- auto-generated setters for cross-module shared state ----
export function set_currentCharKey(v){ currentCharKey = v; }
export function set_currentChar(v){ currentChar = v; }
export function set_imgs(v){ imgs = v; }
export function set_segments(v){ segments = v; }
export function set_points(v){ points = v; }
export function set_worms(v){ worms = v; }
export function set_isDual(v){ isDual = v; }
export function set_lastHead(v){ lastHead = v; }
export function set_particles(v){ particles = v; }
export function set_canvas(v){ canvas = v; }
export function set_ctx(v){ ctx = v; }
export function set_W(v){ W = v; }
export function set_H(v){ H = v; }
export function set_rafId(v){ rafId = v; }
export function set_animTime(v){ animTime = v; }
export function set_lastTs(v){ lastTs = v; }
export function set_currentTheme(v){ currentTheme = v; }
export function set_cloudsOn(v){ cloudsOn = v; }
export function set_lightningOn(v){ lightningOn = v; }
export function set_darkLevel(v){ darkLevel = v; }
export function set_timeOfDayOverride(v){ timeOfDayOverride = v; }
export function set_thanatosPhase(v){ thanatosPhase = v; }
export function set_thanatosTimer(v){ thanatosTimer = v; }
export function set__fxCanvas(v){ _fxCanvas = v; }
export function set__glowTmp(v){ _glowTmp = v; }
export function set__glowOcc(v){ _glowOcc = v; }
