// ===== core/Background.js (migrated from scourge_selector.html) =====
import { draw, tintBlackBgImg } from './Renderer.js';
import { RiftShader } from './RiftShader.js';
import { SkyShaders } from './SkyShaders.js';
import { DogSkyV3 } from './DogSkyV3.js';
import { update } from '../entities/Scourge.js';
import { H, W, animTime, canvas, cloudsOn, ctx, currentTheme, lerp, lightningOn, particles, points } from './globals.js';

export function computeDarkLevel(tod) {
  if (tod === 'night') return 0.55;
  if (tod === 'dusk') return 0.30;
  return 0; // day
}


export const BG_SOURCES = {
  desert: 'sprites/sprite_037.png',
  blood: 'sprites/sprite_038.png',
  aquatic: 'sprites/sprite_039.png',


  aquatic_fill: 'sprites/sprite_040.png',
  void: 'sprites/sprite_041.png',
  void2: 'backgrounds/Splash_4_0.png',
  thanatos: 'backgrounds/Background_183.png',
};

export let bgCache = {};

// ===== 背景编号表：background 参数(1~N) 引用此表，theme 决定天空/雷电行为 =====

export const BACKGROUND_LIST = [
  { id: 1, name: '荒漠',      theme: 'desert',   src: BG_SOURCES.desert },
  { id: 2, name: '赤渊',      theme: 'blood',    src: BG_SOURCES.blood },
  { id: 3, name: '渊海',      theme: 'aquatic',  src: BG_SOURCES.aquatic, fill: BG_SOURCES.aquatic_fill },
  { id: 4, name: '虚空浮岛',  theme: 'void',     src: BG_SOURCES.void },
  { id: 5, name: '星虚空',    theme: 'void2',    src: BG_SOURCES.void2 },
  { id: 6, name: '塔纳托斯',  theme: 'thanatos', src: BG_SOURCES.thanatos }
];

export function getBackground(id) {
  return BACKGROUND_LIST.find(b => b.id === id) || BACKGROUND_LIST[0];
}


export const CLOUD_SPRITES = {
  c0: 'sprites/sprite_042.png',
  c1: 'sprites/sprite_043.png',
  c2: 'sprites/sprite_044.png',
  c3: 'sprites/sprite_045.png',
  c4: 'sprites/sprite_046.png',
  c5: 'sprites/sprite_047.png',
  c6: 'sprites/sprite_048.png',
  c7: 'sprites/sprite_049.png',
  c8: 'sprites/sprite_050.png',
  c9: 'sprites/sprite_051.png',
  c10: 'sprites/sprite_052.png',
  c11: 'sprites/sprite_053.png',
  c12: 'sprites/sprite_054.png',
  c13: 'sprites/sprite_055.png',
  c14: 'sprites/sprite_056.png',
  c15: 'sprites/sprite_057.png',
  c16: 'sprites/sprite_058.png',
  c17: 'sprites/sprite_059.png',
  c18: 'sprites/sprite_060.png',
  c19: 'sprites/sprite_061.png',
  c20: 'sprites/sprite_062.png',
  c21: 'sprites/sprite_063.png',
  c22: 'sprites/sprite_064.png',
  c23: 'sprites/sprite_065.png',
  c24: 'sprites/sprite_066.png',
  c25: 'sprites/sprite_067.png',
  c26: 'sprites/sprite_068.png',
  c27: 'sprites/sprite_069.png',
  c28: 'sprites/sprite_070.png',
  c29: 'sprites/sprite_071.png',
  c30: 'sprites/sprite_072.png',
  c31: 'sprites/sprite_073.png',
  c32: 'sprites/sprite_074.png',
  c33: 'sprites/sprite_075.png',
  c34: 'sprites/sprite_076.png',
  c35: 'sprites/sprite_077.png',
  c36: 'sprites/sprite_078.png',
  c37: 'sprites/sprite_079.png',
  c38: 'sprites/sprite_080.png',
  c39: 'sprites/sprite_081.png',
  c40: 'sprites/sprite_082.png'
}

export const LIGHTNING_SPRITES = {
  flash: 'sprites/sprite_083.png',
  bolt: 'sprites/sprite_084.png'
};
;

// ====== RAIN SYSTEM (键盘 T 切换是否下雨) ======

export const RAIN_SPRITE = 'sprites/sprite_085.png';


export let rainImg = null;             // Rain.png 精灵表（3 帧：短→中→长）

export let rainDrops = [];             // 活跃雨滴

export let rainOn = false;             // 下雨开关（键盘 T 切换）

export const RAIN_COUNT = 220;         // 同时存在的雨滴数（填满屏幕）

export const RAIN_SPEED = 520;         // 下落速度（像素/秒）

export const RAIN_ANGLE = 16 * Math.PI / 180;   // 偏右斜角（度→弧度）

export const RAIN_FRAME_RATE = 9;      // 帧/秒：动画从 1→3（短→中→长）循环

export let rainFrameW = 8, rainFrameH = 42;     // 单帧尺寸（图片加载后更新）


export function initRain() {
  rainImg = new Image();
  rainImg.onload = () => {
    if (rainImg.naturalWidth > 0) {
      rainFrameW = rainImg.naturalWidth / 3;
      rainFrameH = rainImg.naturalHeight;
    }
  };
  rainImg.src = RAIN_SPRITE;
  rainDrops = [];
}

// initial=true 时在整屏随机铺开（开局即满屏），否则从屏幕上方重新生成

export function spawnRainDrop(initial) {
  const extra = W * 0.35;   // 斜向飘落所需的多余水平宽度
  const x = -extra + Math.random() * (W + extra * 2);
  const y = initial ? (Math.random() * (H + 80) - 40) : (-Math.random() * H * 0.4 - 20);
  rainDrops.push({
    x, y,
    v: RAIN_SPEED * (0.75 + Math.random() * 0.5),   // 速度有差异
    scale: 1.2 + Math.random() * 1.4,               // 大小有差异
    off: Math.random() * 3,                          // 帧动画相位偏移
  });
}


export function updateRain(dt) {
  if (!rainOn) return;
  while (rainDrops.length < RAIN_COUNT) spawnRainDrop(false);
  const vx = Math.sin(RAIN_ANGLE), vy = Math.cos(RAIN_ANGLE);
  for (let i = rainDrops.length - 1; i >= 0; i--) {
    const d = rainDrops[i];
    d.x += vx * d.v * dt;
    d.y += vy * d.v * dt;
    if (d.y > H + 80 || d.x > W + 100) rainDrops.splice(i, 1);  // 落出屏幕则回收
  }
}


export function drawRain() {
  if (!rainOn || !rainImg || rainImg.naturalWidth === 0) return;
  const fw = rainFrameW, fh = rainFrameH;
  for (const d of rainDrops) {
    const f = Math.floor(animTime * RAIN_FRAME_RATE + d.off) % 3;  // 0→1→2 循环（短→中→长）
    const dw = fw * d.scale, dh = fh * d.scale;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(-RAIN_ANGLE);   // 负角：让雨丝朝下落方向（右下）倾斜，与运动向量一致
    ctx.drawImage(rainImg, f * fw, 0, fw, fh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}


export function loadBackgrounds() {
  for (const k in BG_SOURCES) {
    const img = new Image();
    img.src = BG_SOURCES[k];
    bgCache[k] = img;
  }
}

// ===== 云朵飘动系统 =====

export let clouds = [];              // 活跃云朵: [{sprite, x, y, w, h, speed, scale}]

export let cloudImages = {};         // 预加载的云朵 Image 对象

export let cloudKeys = [];           // 可用云朵 key 列表（打乱顺序）

export let cloudCooldowns = {};      // 每种云的冷却计时器（秒）

export let nextCloudTime = 0;        // 下次生成时间

export const CLOUD_SPAWN_INTERVAL = [1.5, 5];   // 生成间隔范围（秒）

export const CLOUD_COOLDOWN = 12;    // 同一朵云冷却时间（秒）

export const CLOUD_SPEED_RANGE = [15, 45];       // 像素/秒

export const CLOUD_SCALE_RANGE = [0.3, 0.7];     // 缩放范围（适配顶部窄天空带）     // 缩放范围

export const CLOUD_Y_MAX_RATIO = 0.18;           // 默认：云朵出现在画布顶部（渊海等顶部透明天空）

export const SKY_THEMES = { aquatic: true, void: true };  // 含透明天空区的背景主题，显示云朵
export const LIGHTNING_THEMES = { void: true, thanatos: true };  // 浮岛类背景（下方透明天空）支持雷电
// 各主题云朵 Y 范围覆盖（对齐该背景的实际透明区域）

export const CLOUD_Y_RANGE = {
  aquatic: { min: 0, max: 0.18 },     // 渊海：顶部 0~18% 天空带
  void:    { min: 0.45, max: 0.95 }   // 浮岛：岛屿下方 45%~95% 大片天空
};           // 云朵只出现在画布上部 55% 区域


export function initClouds() {
  cloudKeys = Object.keys(CLOUD_SPRITES);
  // Fisher-Yates shuffle
  for (let i = cloudKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloudKeys[i], cloudKeys[j]] = [cloudKeys[j], cloudKeys[i]];
  }
  // Pre-load all cloud images
  for (const k of cloudKeys) {
    const img = new Image();
    img.src = CLOUD_SPRITES[k];
    cloudImages[k] = img;
  }
  clouds = [];
  cloudCooldowns = {};
  nextCloudTime = 2 + Math.random() * 2;  // 首朵云在 2-4 秒后出现
}


export function spawnCloud() {
  if (cloudKeys.length === 0) return;
  // 找一个不在冷却中的云朵（优先从打乱列表头部取）
  let key = null;
  const now = animTime;
  for (let i = 0; i < cloudKeys.length; i++) {
    const k = cloudKeys[i];
    if (!cloudCooldowns[k] || now >= cloudCooldowns[k]) {
      key = k;
      break;
    }
  }
  if (!key) return;  // 全部冷却中，跳过本帧

  const img = cloudImages[key];
  if (!img || !img.complete || img.naturalWidth === 0) return;

  // 随机缩放
  const scale = CLOUD_SCALE_RANGE[0] + Math.random() * (CLOUD_SCALE_RANGE[1] - CLOUD_SCALE_RANGE[0]);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;

  // 随机 Y（按主题透明区域范围），X 从屏幕右侧外开始飘入
  const yRange = CLOUD_Y_RANGE[currentTheme] || { min: 0, max: CLOUD_Y_MAX_RATIO };
  const yMin = H * yRange.min + 10;
  const yMax = H * yRange.max - h - 10;
  const y = yMin + Math.random() * Math.max(yMax - yMin, h);

  // 随机速度
  const speed = CLOUD_SPEED_RANGE[0] + Math.random() * (CLOUD_SPEED_RANGE[1] - CLOUD_SPEED_RANGE[0]);

  clouds.push({ key, x: W + Math.random() * 100, y, w, h, speed, scale });

  // 设置冷却
  cloudCooldowns[key] = animTime + CLOUD_COOLDOWN;

  // 把用过的 key 移到列表末尾（轮换使用）
  const idx = cloudKeys.indexOf(key);
  if (idx > 0) {
    cloudKeys.splice(idx, 1);
    cloudKeys.push(key);
  }

  // 设置下次生成时间
  nextCloudTime = animTime + CLOUD_SPAWN_INTERVAL[0] + Math.random() * (CLOUD_SPAWN_INTERVAL[1] - CLOUD_SPAWN_INTERVAL[0]);
}


export function updateClouds(dt) {
  // 仅含透明天空带的背景才生成云（荒漠/穿孔者背景不透明，无透明区域）
  if (!cloudsOn || !SKY_THEMES[currentTheme]) return;
  // 生成新云朵
  if (animTime >= nextCloudTime && clouds.length < 8) {  // 最多同时 8 朵
    spawnCloud();
  }

  // 移动并清理
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.x -= c.speed * dt;
    if (c.x + c.w < -20) {  // 完全飘出左边界
      clouds.splice(i, 1);
    }
  }
}


export function drawClouds() {
  for (const c of clouds) {
    const img = cloudImages[c.key];
    if (!img || !img.complete) continue;
    ctx.drawImage(img, c.x, c.y, c.w, c.h);
  }
}

// ====== LIGHTNING SYSTEM (ExoMechs-style, void theme only) ======

export let lightningBolts = [];         // [{lifetime, depth, x, y}]

export let lightningIntensity = 0;       // 0~1 screen flash intensity

export let lightningFlashImg = null;     // Flash.png

export let lightningBoltImg = null;      // Bolt.png

export const LIGHTNING_LIFETIME = 1.0;   // 秒：每道闪电从出现到完全淡出约 0.6~1.2 秒

export const LIGHTNING_MIN_DEPTH = 2.5;

export const LIGHTNING_MAX_DEPTH = 10;


export function initLightning() {
  lightningFlashImg = new Image();
  lightningFlashImg.src = LIGHTNING_SPRITES.flash;
  lightningBoltImg = new Image();
  lightningBoltImg.src = LIGHTNING_SPRITES.bolt;
  lightningBolts = [];
  lightningIntensity = 0;
}


export function spawnLightningBolt(count = 1, forceFlash = false) {
  if (!lightningOn || !LIGHTNING_THEMES[currentTheme]) return;
  for (let i = 0; i < count; i++) {
    if (lightningBolts.length >= 2) break;   // 同时最多 2 道闪电
    lightningBolts.push({
      lifetime: LIGHTNING_LIFETIME * (0.6 + Math.random() * 0.6),
      depth: LIGHTNING_MIN_DEPTH + Math.random() * (LIGHTNING_MAX_DEPTH - LIGHTNING_MIN_DEPTH),
      // Position: spread across screen width, Y in the visible sky area (below floating island)
      x: Math.random() * W,
      y: H * 0.45 + Math.random() * H * 0.5   // sky area below island
    });
  }
  // 普通单 bolt 也带动一次环境提亮（让闪电出现时夜空被照亮一下）；大闪 forceFlash 时拉满
  if (forceFlash) {
    lightningIntensity = 1;
  } else {
    lightningIntensity = Math.max(lightningIntensity, 0.55);
  }
}


export function updateLightning(dt) {
  if (!lightningOn || !LIGHTNING_THEMES[currentTheme]) {
    lightningBolts = [];
    lightningIntensity = 0;
    return;
  }

  // Fade intensity (slower, gentler)
  lightningIntensity = Math.max(0, lightningIntensity * 0.97 - 0.01 * dt * 60);

  // Update bolt lifetimes
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    lightningBolts[i].lifetime -= dt;
    if (lightningBolts[i].lifetime <= 0) {
      lightningBolts.splice(i, 1);
    }
  }

  // Random single bolt spawn (infrequent)
  if (Math.random() < 0.004) {   // ~0.4% per frame at 60fps ≈ every ~4s average
    spawnLightningBolt(1);
  }

  // Occasional big flash + 1-2 bolts (rare)
  if (Math.random() < 0.0006) {   // ~0.06% per frame ≈ every ~28 seconds
    lightningIntensity = 1;
    spawnLightningBolt(1 + Math.floor(Math.random() * 2), true);  // 1-2 bolts
  }
}


export function drawLightning() {
  if (!lightningOn || !LIGHTNING_THEMES[currentTheme] || lightningBolts.length === 0) return;

  const flashReady = lightningFlashImg && lightningFlashImg.complete && lightningFlashImg.naturalWidth > 0;
  const boltReady = lightningBoltImg && lightningBoltImg.complete && lightningBoltImg.naturalWidth > 0;

  if (!boltReady) return;

  // Draw individual bolts
  for (const bolt of lightningBolts) {
    const lifeRatio = bolt.lifetime / LIGHTNING_LIFETIME;  // 1=new, 0=dying
    const scale = 1 / bolt.depth;  // closer = bigger
    const w = lightningBoltImg.naturalWidth * scale * 2.5;
    const h = lightningBoltImg.naturalHeight * scale * 2.5;

    // Choose texture: Flash.png for fresh bright bolts, Bolt.png otherwise
    let tex = lightningBoltImg;
    if (flashReady && bolt.lifetime > LIGHTNING_LIFETIME * 0.75 && Math.random() > 0.5) {
      tex = lightningFlashImg;
      // Flash is circular, use smaller scale
      const fw = lightningFlashImg.naturalWidth * scale * 2;
      const fh = lightningFlashImg.naturalHeight * scale * 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, lifeRatio * 2) * 0.9;
      ctx.drawImage(tex, bolt.x - fw / 2, bolt.y - fh / 2, fw, fh);
      ctx.restore();
      continue;
    }

    // Opacity: bright at strike, smoothly fades to 0 by end of lifetime
    const alpha = Math.pow(lifeRatio, 0.7) * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Slight blue tint via composite
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tex, bolt.x - w / 2, bolt.y - h / 2, w, h);
    ctx.restore();
  }
}





export function drawBackground() {
  // 优先绘制背景贴图（cover 铺满画布），未加载完成时回退到主题渐变
  // ★ 2026-08-17 用户要求去掉浮岛底图（Background_183 / sprite_041 等浮岛地图）：DoG 战天天空盒自含暗底，
  //   不再叠加浮岛地图。浮岛类主题（void/void2/thanatos）直接回落到暗紫渐变底，地图图片不再绘制。
  let bg = bgCache[currentTheme];
  if (currentTheme === 'void' || currentTheme === 'void2' || currentTheme === 'thanatos') bg = null;
  let particleColor = 'rgba(255,255,255,0.10)';
  if (bg && bg.complete && bg.naturalWidth > 0) {
    // 若背景图带透明区域（如渊海/浮岛），先铺底图（_fill）填满画布，避免上一帧残影透出
    const fill = bgCache[currentTheme + '_fill'];
    if (fill && fill.complete && fill.naturalWidth > 0) {
      const fw = fill.naturalWidth, fh = fill.naturalHeight;
      const fs = Math.max(W / fw, H / fh);
      ctx.drawImage(fill, (W - fw * fs) / 2, (H - fh * fs) / 2, fw * fs, fh * fs);
    } else if (SKY_THEMES[currentTheme] || LIGHTNING_THEMES[currentTheme]) {
      // 透明天空主题但无 _fill 底图时，用纯色填充防止透明区残影
      ctx.fillStyle = (currentTheme === 'void' || currentTheme === 'void2' || currentTheme === 'thanatos') ? '#0a0a12' : '#020617';
      ctx.fillRect(0, 0, W, H);
    }
    // 云朵层：仅在有透明天空带的背景（如渊海顶部）下、背景贴图之下绘制，使云只从透明区域透出
    if (cloudsOn && SKY_THEMES[currentTheme]) drawClouds();
    // 闪电层（bolt）已移至暗化层之后绘制（Renderer.draw 内调用 drawLightning），
    // 避免被黑夜暗化层压暗、保证高亮可见
    const iw = bg.naturalWidth, ih = bg.naturalHeight;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    let g;
    if (currentTheme === 'desert') {
      g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#3d2b1f'); g.addColorStop(0.6, '#24180f'); g.addColorStop(1, '#120c08');
      particleColor = 'rgba(230, 190, 130, 0.12)';
    } else if (currentTheme === 'blood') {
      g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#2a0a0a'); g.addColorStop(0.6, '#140505'); g.addColorStop(1, '#0a0202');
      particleColor = 'rgba(180, 40, 40, 0.06)';
    } else if (currentTheme === 'void' || currentTheme === 'void2' || currentTheme === 'thanatos') {
      g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#0f0f1a'); g.addColorStop(0.6, '#080810'); g.addColorStop(1, '#030305');
      particleColor = 'rgba(120, 80, 200, 0.06)';
    } else {
      g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, '#0b2440'); g.addColorStop(0.6, '#061428'); g.addColorStop(1, '#020617');
      particleColor = 'rgba(165, 243, 252, 0.08)';
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = particleColor;

  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════
// Devourer of Gods — 全量动画系统
// ═══════════════════════════════════════════════════════════

// ── 动画状态机 ──

export const _skyQ = (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search) : null;

// ★ 2026-08-18 屏幕染色开关保留（整屏乘法染色始终开启；?dogtint=0 调试开关已删除）
export const DOGSKY_TINT = true;

// 三层（③光球 / ④碎玻璃 / ⑤裂隙）位置偏移：**固定值**（不读 URL / localStorage）
//   ★ 2026-08-18 用户确认最终值：③(-1,-2) ④(0,0) ⑤(0,0)
export function loadRiftOffsets() {
  return { l3: { x: -1, y: -2 }, l4: { x: 0, y: 0 }, l5: { x: 0, y: 0 } };
}
// 四层显示尺寸倍率：**固定值**（不读 URL / localStorage）
//   ★ 2026-08-18 用户确认最终值（用户澄清：L4=1 背景碎玻璃层；"玻璃 0.5" = P键撞击产生的玻璃碎片 = pt）
export function loadRiftSizes() {
  return { l3: 1, l4: 1, l5: 1.65, pt: 0.5 };
}

// 贴图路径（从 localhost:8099/textures/dog/ 加载）

export const DOG_TEX_BASE = 'textures/dog/';

export const DOG_TEX_NAMES = ['Neurons2','SharpNoise','MeltyNoise','Pebbles','RealisticClouds','HarshNoise','Smudges','Swirls','CrackedGlass_Glowing','RiftTexture'];

// 完整路径字面量映射：供构建期 base64 内联插件整字替换为 data URI
//（直接用 DOG_TEX_BASE + name 拼接的路径是运行时字符串，无法被静态内联）。
export const DOG_TEX_URIS = {
  Neurons2: 'textures/dog/Neurons2.png',
  SharpNoise: 'textures/dog/SharpNoise.png',
  MeltyNoise: 'textures/dog/MeltyNoise.png',
  Pebbles: 'textures/dog/Pebbles.png',
  RealisticClouds: 'textures/dog/RealisticClouds.png',
  HarshNoise: 'textures/dog/HarshNoise.png',
  Smudges: 'textures/dog/Smudges.png',
  Swirls: 'textures/dog/Swirls.png',
  CrackedGlass_Glowing: 'textures/dog/CrackedGlass_Glowing.png',
  // ★ 用户自定义裂隙贴图（透明背景 PNG：黑色裂隙本体 + 青色(#00FFFF)发光边缘；边缘色由 DoGSkyColor 驱动变色）
  RiftTexture: 'textures/dog/RiftTexture.png'
};

// 三态配色（来自 GetCorrectDoGColor）

export const DOG_CLR = {
  aggressive: [255, 0, 255],    // Fuchsia — 攻击态
  passive:    [0, 221, 250],    // LightBlue — 被动态
  twilight:   [147, 24, 204],   // 暮紫 — 激光墙/传送态
};


export const DoGSky = {
  intensity: 0,
  targetIntensity: 0,
  color: [...DOG_CLR.passive],
  targetColor: [...DOG_CLR.passive],
  state: 'passive',             // 'aggressive' | 'passive' | 'twilight'

  _img: null,        // Background_113 基底图（用户指定，"地图"）
  tex: {},          // { name: HTMLImageElement }
  texReady: false,
  texLoadedCount: 0,

  offscreen: {},    // 离屏 canvas 缓存
  _tileCache: {},   // _fillTiled 缩放后纹理缓存（createPattern 无缝平铺用）
  _lumCache: {},    // _luminanceToAlpha 缓存（黑底灰度图 → 亮度 alpha，RiftAura 用）
  frameCounter: 0,

  // ---- 裂隙臂数据（程序化生成，对应 DrawRiftToRenderTarget）----
  riftArms: [],
  riftInitDone: false,
  riftSpawn: { x: 0, y: 0 },

  // ★ 2026-08-17 三层位置偏移（用户自调）：runtime 从 URL/localStorage 加载（见 loadRiftOffsets）
  riftOffset: { l3: { x: 0, y: 0 }, l4: { x: 0, y: 0 }, l5: { x: 0, y: 0 } },
  // ★ 2026-08-17 三层显示尺寸倍率：固定值（见 loadRiftSizes）
  //   pt = P 键过场裂纹（CrackedGlass）尺寸倍率；用户澄清："玻璃 0.5" = pt，L4 背景碎玻璃 = 1
  riftSize: { l3: 1, l4: 1, l5: 1.65, pt: 0.5 },

  // ---- Layer⑤ WebGL 渲染（MetaballEdgeShader.fx 移植）----
  riftShader: null,        // RiftShader 实例（WebGL 不可用时为 null → 回退 Canvas 近似）
  riftShapeDone: false,    // 白色臂网离屏已缓存（静态，只生成一次）
  riftOverlay: null,       // "另一个世界"内容离屏（深色底 + 星点 + 云 + 闪电）
  riftOverlayDone: false,  // overlay 静态部分（星点）已生成
  riftOverlayStars: [],    // 静态星点（一次性生成，避免每帧 Math.random 闪烁）
  riftOverlayTick: 0,      // overlay 重绘节流计数（每 3 帧一次）

  // ---- ★ 2026-08-15：WebGL 天空引擎（5 个 fx 完整移植：Winds/Fog/RiftAura/RealityCrack/Metaball）----
  sky: null,               // SkyShaders 实例（WebGL 不可用为 null → 全部层回退 Canvas 近似）
  skyInitDone: false,      // 是否已尝试创建（懒加载，首次 draw 时创建）
  skyReady: null,          // ★ 2026-08-17 WebGL 是否真正生效（null=未初始化 / true=WebGL✓ / false=Canvas 回退）

  // ---- 裂隙内部闪电（来自 DoGVisualsManager.PostUpdateEverything）----
  lightningFill: 0,
  lightningTimer: 0,
  lightningMax: 0,

  // ---- 现实裂纹（Layer④ 用）----
  realityCracks: [],

  initTextures() {
    const self = this;
    // ★ 2026-08-17 加载用户自调位置偏移 + 尺寸（?rift5s= 等 URL 参数 / localStorage 持久化）
    self.riftOffset = loadRiftOffsets();
    self.riftSize = loadRiftSizes();
    DOG_TEX_NAMES.forEach(name => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        self.tex[name] = img;
        self.texLoadedCount++;
        if (self.texLoadedCount === DOG_TEX_NAMES.length) {
          self.texReady = true;
          self._initOffscreens();
          self._generateRiftArms();
          self._generateRealityCracks();
          // ★ 预热 RiftAura 纹理（一次性形状化 + 极坐标圆盘，避免首次绘制卡顿）
          self._lumAlphaComposite(self.tex['Smudges']);
          self._lumAlphaComposite(self.tex['Swirls']);
          self._swirlPolar();
          // ★ 2026-08-17b 直接接入 v3.html 完整 WebGL2 渲染器（忠实还原，替代下方逐层拼装）
          if (!self._dogV3) self._dogV3 = new DogSkyV3();
          self._dogV3.setTextures({
            Neurons2: self.tex['Neurons2'], SharpNoise: self.tex['SharpNoise'],
            MeltyNoise: self.tex['MeltyNoise'], Pebbles: self.tex['Pebbles'],
            RealisticClouds: self.tex['RealisticClouds'], HarshNoise: self.tex['HarshNoise'],
            Smudges: self.tex['Smudges'], Swirls: self.tex['Swirls'],
            CrackedGlass: self.tex['CrackedGlass_Glowing'],
            RiftTexture: self.tex['RiftTexture'],
          });
        }
      };
      img.onerror = () => {
        console.warn('[DoGSky] texture load failed:', name);
        self.texLoadedCount++;
        if (self.texLoadedCount === DOG_TEX_NAMES.length) {
          self.texReady = Object.keys(self.tex).length > 0;
          self._initOffscreens();
          self._generateRiftArms();
          self._generateRealityCracks();
        }
      };
      img.src = DOG_TEX_URIS[name];
    });
    // ★ 2026-08-17 用户要求移除浮岛底图（Background_113.png），忠实原版 DoG 背景不含此图。
    //   原 load 代码已移除；this._img 始终 null，draw() 步骤 2 的 drawImage 自动跳过。
  },

  _initOffscreens() {
    const m = (w, h) => { const c = document.createElement('canvas'); c.width = w || W; c.height = h || H; return c; };
    this.offscreen = {
      winds:     m(),
      fog:       m(),
      riftAura:  m(512, 512),   // ★ 512×512 局部离屏（对齐 fx spriteBatch.Draw(Smudges, scale=1) 输出范围）
      // 全屏离屏方案失败（把全屏图案旋转到裂隙位置 = 全屏跟着转，错）
      cracks:    m(),
      riftInner: m(),   // 裂隙内部内容（闪电+云）
      riftMask:  m(),   // 裂隙发光边
      riftShape: m(),   // 裂隙纯形状 mask（白，用于裁切内部内容）
      foreground: m(),   // ★ 2026-08-17 前景扭曲层累积离屏（DoGVisualsManager.DrawDistortionForeground）
    };
  },

  // ==================== 裂隙臂生成（移植自 DoGSky.cs GenerateRift）====================
  _generateRiftArms() {
    if (this.riftInitDone) return;
    // ★ 2026-08-14 修正：原版 `player.Center - Y*2000 + randomCircular(2000)` 是【世界绝对坐标】，
    //   臂点也在世界坐标（步长 300-420 world），绘制时才视差 `(p - screenCenter)*PAR + screenCenter`。
    //   → 裂隙屏幕位置 = 屏幕中心上方 ~60-66px ± 随机（DoG 头部附近），不是屏幕顶部或正中央。
    const PAR = 1 / 30;   // Depth=30 视差因子
    const spawnX = W / 2 + (Math.random() - 0.5) * 2 * 2000;        // 世界 X ≈ 400 ± 2000
    const spawnY = H / 2 - 2000 + (Math.random() - 0.5) * 2 * 2000; // 世界 Y ≈ 300-2000±2000（玩家上方）
    this.riftSpawn.x = spawnX;
    this.riftSpawn.y = spawnY;
    // 臂起点 = 世界坐标 riftSpawn（绘制时统一视差 → 屏幕中心偏上 ~66px）
    const sx = this.riftSpawn.x, sy = this.riftSpawn.y;

    // 14 条主裂隙（★ 2026-08-15 完全照搬 DoGSky.cs GenerateRift：
    //   MaxWidth=100~120、TotalPoints=8、间距 100-140×30×0.1=300-420、角方差 ±6、方向精确 i*2π/14。
    //   之前我加的 ±0.6rad 随机偏转 / 角方差 ±8 是 Canvas 近似期修补，shader 移植后必须还原）
    const mains = [];
    for (let i = 0; i < 14; i++) {
      const baseAngle = (i / 14) * Math.PI * 2;
      mains.push(this._makeArm(sx, sy, 8,
        300, 420,    // minDist*30*0.1=300, maxDist*30*0.1=420
        -6, 6,       // 角方差 ±6（原版）
        100 + Math.random() * 20,   // MaxWidth 100~120（原版）
        baseAngle));
    }

    // ★ 2026-08-15 外裂纹完全照搬原版：数量 12~15、TotalPoints 6~9、间距 400-500×30×0.1=1200-1500、
    //   角方差 -10~-6 / 5~9。之前我改 8-10 条/步长 700-1000 是 Canvas 近似期防"延伸线突兀"的修补，已还原。
    const outerN = 12 + ((Math.random() * 4) | 0);
    const outers = [];
    for (let i = 0; i < outerN; i++) {
      const baseAngle = (i / outerN) * Math.PI * 2;
      outers.push(this._makeArm(sx, sy,
        6 + ((Math.random() * 4) | 0),  // TotalPoints 6~9（原版）
        1200, 1500,                     // 400*30*0.1=1200, 500*30*0.1=1500（原版）
        -10 + ((Math.random() * 5) | 0), 5 + ((Math.random() * 5) | 0),
        6 + Math.random() * 3,           // MaxWidth 6~9
        baseAngle));
    }

    this.riftArms = [...mains, ...outers];
    this.riftInitDone = true;
  },

  _makeArm(sx, sy, totalPts, minDist, maxDist, minAngVar, maxAngVar, maxWidth, baseAngle) {
    const pts = [{ x: sx, y: sy }];
    // 第1点：沿 baseAngle 方向
    const d0 = minDist + Math.random() * (maxDist - minDist);
    pts.push({ x: sx + Math.cos(baseAngle) * d0, y: sy + Math.sin(baseAngle) * d0 });
    // 后续点：跟随前一方向 + 角度偏转（C# 原版算法：
    //   previousPoint = points[j-2]; newPoint = points[j-1] + (previousPoint.DirectionTo(points[j-1]) * dist).RotatedBy(...)
    //   → 方向 = 从 points[j-2] 指向 points[j-1]）
    for (let j = 2; j < totalPts; j++) {
      const prev2 = pts[j - 2], prev1 = pts[j - 1];
      const dist = (j === totalPts - 1)
        ? (minDist + Math.random() * (maxDist - minDist)) * 0.5
        : minDist + Math.random() * (maxDist - minDist);
      const dirAngle = Math.atan2(prev1.y - prev2.y, prev1.x - prev2.x);
      const angVarDeg = (minAngVar + Math.random() * (maxAngVar - minAngVar)) * j * 0.5;
      const newAngle = dirAngle + angVarDeg * Math.PI / 180;
      pts.push({ x: prev1.x + Math.cos(newAngle) * dist, y: prev1.y + Math.sin(newAngle) * dist });
    }
    return { points: pts, maxWidth, depth: 30, totalPts };
  },

  // ==================== 现实裂纹（Layer④ 用，3 个旋转副本）====================
  // ★ 2026-08-17 参考 dog_battle_background_v3_diag.html：scale 用固定 [1.55×0.95, 1.55×1.05, 1.55×1.0] 复刻原版 NextFloat(0.9,1.1) 确定性
  //   位置改为 (W/2, H/2) 屏幕中心（原参考在屏幕正中——光球 L3 与碎玻璃 L4 都在中心，裂口 L5 偏上 66px 形成嵌套）
  _generateRealityCracks() {
    this.realityCracks = [];
    const scales = [1.55 * 0.95, 1.55 * 1.05, 1.55 * 1.0];  // 复刻原版 NextFloat(0.9,1.1)
    for (let i = 0; i < 3; i++) {
      this.realityCracks.push({
        x: W / 2,
        y: H / 2,
        rotation: (i / 3) * Math.PI * 2,
        scale: scales[i],
        depth: 30,
      });
    }
  },

  // ==================== 状态色更新（对应 GetCorrectDoGColor + Update）====================
  setState(s) {
    // s: 'aggressive' | 'passive' | 'twilight'
    if (DOG_CLR[s]) this.targetColor = [...DOG_CLR[s]];
    this.state = s || 'passive';
  },

  update(dt, key, char) {
    // 根据角色 key 设置目标状态色（对应 GetCorrectDoGColor）
    if (key === 'devourer_of_gods') {
      // ★ 三态联动滤镜色（原版 GetCorrectDoGColor）：
      //   P1（phase=1）→ passive 青色；P2（phase=2）→ aggressive 品红；
      //   armorOff（隐铠甲纯能量/激光墙形态）→ twilight 暮紫 (147,24,204)（DoGSky.cs:50 DoGTwlight）。
      //   color 每帧 lerp(0.12) 逼近 targetColor → 切换时滤镜平滑渐变，不生硬跳变。
      if (char && char.armorOff) this.setState('twilight');
      else this.setState((char && char.phase >= 2) ? 'aggressive' : 'passive');
    }

    // intensity 平滑（原版 ±0.05/帧 ≈ ±0.05*60=±3/s，这里用较温和的速率）
    const rate = 2.5 * dt;
    if (this.targetIntensity > this.intensity)
      this.intensity = Math.min(this.intensity + rate, this.targetIntensity);
    else if (this.targetIntensity < this.intensity)
      this.intensity = Math.max(this.intensity - rate, this.targetIntensity);

    // 颜色平滑 lerp（原版 0.1/帧 → 这里约 0.16/帧等效）
    for (let i = 0; i < 3; i++)
      this.color[i] = lerp(this.color[i], this.targetColor[i], 0.12);

    // 闪电更新（原版 PostUpdateEverything）
    if (this.intensity > 0.1) {
      if (this.lightningTimer <= 0 && Math.random() < 0.005) {  // ~1/200 概率/帧
        this.lightningTimer = (Math.random() < 0.1) ? 30 + ((Math.random() * 15) | 0) : 5 + ((Math.random() * 15) | 0);
        this.lightningMax = 0.7 + Math.random() * 0.2;
      }
      if (this.lightningTimer > 0) {
        const minF = this.lightningMax * 0.5;
        this.lightningFill = minF + Math.random() * (this.lightningMax - minF);
        this.lightningTimer--;
      } else {
        this.lightningFill = lerp(this.lightningFill, 0, 0.05);
        if (this.lightningFill < 0.001) this.lightningFill = 0;
      }
    }

    this.frameCounter++;
  },

  // ==================== 主绘制入口 ====================
  draw(ctx) {
    const I = this.intensity;
    if (I <= 0.002) return;
    ctx.save();
    const coverAlpha = (this.targetIntensity >= 1) ? 1 : I;

    // ── DoG 天空：直接采用 v3.html 完整 WebGL2 渲染器（忠实移植，替代下方逐层拼装）──
    //   v3 不可用（无 WebGL2）时 this._dogV3.ready=false，自动回退下方旧分层逻辑。
    if (this._dogV3 && this._dogV3.ready) {
      this._drawDogV3(ctx, I);
      ctx.restore();
      return;
    }

    // ── 1) 场景底色 ──
    //    参考 HTML：清屏为暗紫 rgba(0.08,0.02,0.12)（原版 DoG 战斗暗紫深渊氛围，
    //    原版靠 Terraria 天空托底，独立网页以此保证可见）。
    {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgb(20,5,31)');     // 暗紫 (0.08,0.02,0.12)
      grad.addColorStop(1, 'rgb(12,3,20)');
      ctx.globalAlpha = coverAlpha;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // ── 2) Background_113 铺满（用户指定"地图"，盖在暗紫之上；其透明区回落到暗紫 void）──
      const bg = this._img;
      if (bg && bg.complete && bg.naturalWidth > 0) {
        const iw = bg.naturalWidth, ih = bg.naturalHeight;
        const scale = Math.max(W / iw, H / ih);
        const dw = iw * scale, dh = ih * scale;
        ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      ctx.globalAlpha = 1;
    }

    // ── 3) 5 层忠实还原叠加在 113 之上 ──
    this._drawLayer1_Winds(ctx, I);
    this._drawLayer2_Fog(ctx, I);
    // ★ 2026-08-14 重做版 Layer ③：Smudges 破碎能量云团（原版 RiftAura 的 Canvas 还原，非丑蓝球）。
    this._drawLayer3_RiftAura(ctx, I);
    // ★ 2026-08-14 恢复 Layer ④ 碎玻璃（用户反馈"背景只剩云层"）——之前怀疑它造成边缘感而关闭，
    //   实测真因是 Layer ⑤ 外裂纹，Layer ④ alpha 仅 0.1015 很低，安全恢复。
    this._drawLayer4_Cracks(ctx, I);
    // ★ 2026-08-14 恢复 Layer ⑤ DistortionRift（用户要的"黑色裂缝+延伸裂纹"）：
    //   主刺保留正常强度（alpha 0.08/0.3/0.25），外裂纹大幅降低（0.02/0.06/0.05）+ 数量 12-17→8-10
    //   + 步长缩短避免延伸到屏幕边缘造成"突兀明显"边缘感。
    this._drawLayer5_Rift(ctx, I);
    // ★ 2026-08-17 新增 Layer⑥ 前景扭曲（DoGVisualsManager.DrawDistortionForeground）：品红+青色风纹云，
    //   叠在 5 层天空之上（原版在玩家层之前），让画面边缘持续"被空间撕扯"。
    this._drawLayer6_Foreground(ctx, I);

    // ── 4) 全屏 DoGSkyColor 染色（原版 DoGScreenShaderData.UseColor + 参考 HTML 最终叠加）──
    //    参考 HTML：mix(c.rgb, c.rgb * tint, strength)，strength = SkyIntensity * 0.45，整屏均匀。
    //    Canvas 等价：globalCompositeOperation='multiply' + fillStyle=rgba(DoGSkyColor, strength)
    //      → dst' = dst * (src*a + (1-a)) = dst * (tint*s + 1-s) = mix(c, c*tint, s) 完全一致。
    //    color 由 update 平滑 lerp → 相位切换时整屏色调自然渐变。
    if (DOGSKY_TINT) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      // ★ 2026-08-17 按参考 HTML：strength = I * 0.45（整屏均匀染色，非径向渐变光晕）
      ctx.fillStyle = this._rgb(this.color, I * 0.45);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    ctx.restore();
  },

  // ==================== v3.html 完整渲染器入口 ====================
  _drawDogV3(ctx, I) {
    const v3 = this._dogV3;
    v3.resize(W, H);
    const goal = [this.targetColor[0] / 255, this.targetColor[1] / 255, this.targetColor[2] / 255];
    const opts = { goal, intensity: I, offsets: this.riftOffset, sizes: this.riftSize };
    v3.render(opts);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(v3.getCanvas(), 0, 0, W, H);
    ctx.restore();
  },

  // ===== 辅助：取纹理（安全）=====
  _tex(name) { return this.tex[name] || null; },
  _texReady(name) { const t = this.tex[name]; return t && t.complete && t.naturalWidth > 0; },
  // 离屏 canvas 尺寸守卫：仅尺寸变化时重分配（避免每帧重分配），返回 2d context
  _fit(c) {
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return c.getContext('2d');
  },

  // ★ WebGL 天空引擎懒加载（纹理加载完才创建；不可用返回 null → 各层回退 Canvas 近似）
  _getSky() {
    if (this.skyInitDone) return this.sky;
    this.skyInitDone = true;
    if (!this.texReady) { this.skyReady = false; return null; }
    const s = new SkyShaders();
    this.skyReady = s.init(W, H);   // ★ 2026-08-17 标记 WebGL 是否真正生效（用于 ?dogdebug=1 HUD 诊断）
    if (this.skyReady) this.sky = s;
    return this.sky;
  },

  // ===== 辅助：颜色工具 =====
  _rgb(arr, a) { return a !== undefined ? `rgba(${arr[0]|0},${arr[1]|0},${arr[2]|0},${a})` : `rgb(${arr[0]|0},${arr[1]|0},${arr[2]|0})`; },
  _lerpColor(c1, c2, t) { return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)]; },
  // 原版 Color.Lerp 封装
  _clrLerp(from, to, t) { return [(from[0]+(to[0]-from[0])*t)|0, (from[1]+(to[1]-from[1])*t)|0, (from[2]+(to[2]-from[2])*t)|0]; },

  // ★ 黑底灰度图 → 亮度 alpha（一次性缓存）：alpha=亮度，additive 下暗部透明、亮部按灰度发光。
  //   用于 RiftAura 的 Smudges/Swirls（原版 shader 用灰度做形状/扭曲源，Canvas 需转 alpha 才能 additive 显示形状）。
  _luminanceToAlpha(img) {
    if (!img) return null;
    const key = img.src;
    if (this._lumCache[key]) return this._lumCache[key];
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cc = c.getContext('2d');
    cc.drawImage(img, 0, 0);
    const id = cc.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      d[i + 3] = lum;   // alpha = 亮度（黑底 → 透明）
    }
    cc.putImageData(id, 0, 0);
    this._lumCache[key] = c;
    return c;
  },

  // ★ 带真 alpha 的灰度纹理 → 「综合 alpha」形状化（一次性缓存）：
  //   RGB=白 + alpha = 原alpha × 亮度/255 —— 透明区永不显示、黑区不显示、亮形状显示。
  //   Smudges/Swirls 是"alpha 0..255 + 灰度明暗"纹理（四角亮度 170 但 alpha=0），
  //   用 _luminanceToAlpha(alpha=亮度) 会把透明区变不透明（矩形），此函数同时乘原 alpha 解决。
  _lumAlphaComposite(img) {
    if (!img) return null;
    const key = img.src + '|lumA';
    if (this._lumCache[key]) return this._lumCache[key];
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cc = c.getContext('2d');
    cc.drawImage(img, 0, 0);
    const id = cc.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = (d[i + 3] * lum / 255) | 0;   // 综合 alpha = 原alpha × 亮度/255
    }
    cc.putImageData(id, 0, 0);
    this._lumCache[key] = c;
    return c;
  },

  // ★ Swirls → 极坐标圆盘（一次性缓存，对应 fx 的 polarCoords 采样）
  //   fx: distortion = tex2D(Swirls, polarCoords + time滚动).r × 0.78
  //   把 Swirls 从直角坐标映射到极坐标（x=角度, y=半径）→ 得到"Swirls 的圆形旋涡版"，
  //   每帧旋转/滚动它 ≈ 原版极坐标扭曲。输出 256×256 圆盘（黑底灰度）。
  _swirlPolar() {
    if (this._swPolar) return this._swPolar;
    const sw = this._tex('Swirls');
    if (!sw) return null;
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const cc = c.getContext('2d');
    cc.drawImage(sw, 0, 0);
    const src = cc.getImageData(0, 0, sw.naturalWidth, sw.naturalHeight).data;
    const swW = sw.naturalWidth, swH = sw.naturalHeight;
    const out = cc.createImageData(S, S);
    const od = out.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S;      // 角度 0..1
        const v = (y + 0.5) / S;      // 半径 0..1（0=中心）
        const ang = u * Math.PI * 2;
        const r = v;
        const sx = 0.5 + r * Math.cos(ang) * 0.5;
        const sy = 0.5 + r * Math.sin(ang) * 0.5;
        const ix = Math.min(swW - 1, Math.max(0, Math.floor(sx * swW)));
        const iy = Math.min(swH - 1, Math.max(0, Math.floor(sy * swH)));
        const si = (iy * swW + ix) * 4;
        const lum = (src[si] + src[si + 1] + src[si + 2]) / 3;
        const oi = (y * S + x) * 4;
        od[oi] = 255; od[oi + 1] = 255; od[oi + 2] = 255;
        od[oi + 3] = (src[si + 3] * lum / 255) | 0;   // ★ 综合 alpha（原alpha×亮度/255），透明区不显示
      }
    }
    cc.putImageData(out, 0, 0);
    this._swPolar = c;
    return c;
  },

  // ===== 辅助：平铺绘制纹理（模拟 HLSL 的 Wrap 采样）=====
  // ★ 2026-08-14 二次修复：改用 ctx.createPattern(scaled, 'repeat') —— GPU 硬件无缝平铺，
  //   彻底消除最近邻采样下 drawImage 平铺的 1px 接缝（+0.5px 重叠会被栅格化 snap 吃掉，无效）。
  //   缩放后的纹理缓存为离屏 canvas（避免重复缩放）；pattern 每次调用创建（开销小）。
  //   滚动：调用方用 ctx.save()+ctx.translate(offsetX, offsetY) 包裹，pattern 跟随 transform。
  _fillTiled(ctx, img, offsetX, offsetY, scaleX, scaleY) {
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const sw = Math.round(iw * (scaleX || 1));
    const sh = Math.round(ih * (scaleY || 1));
    if (!sw || !sh) return;
    const cacheKey = img.src + '|' + sw + 'x' + sh;
    let scaled = this._tileCache[cacheKey];
    if (!scaled) {
      scaled = document.createElement('canvas');
      scaled.width = sw; scaled.height = sh;
      const sctx = scaled.getContext('2d');
      sctx.drawImage(img, 0, 0, sw, sh);
      this._tileCache[cacheKey] = scaled;
    }
    const pat = ctx.createPattern(scaled, 'repeat');
    if (!pat) return;   // 兜底（极端环境）
    ctx.save();
    const ox = Math.round(offsetX) % sw, oy = Math.round(offsetY) % sh;
    ctx.translate(ox - sw, oy - sh);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + sw * 2, H + sh * 2);
    ctx.restore();
  },

  // ================================================================
  // Layer ① 扭曲风（AlphaBlend）—— 对应 DoGDistortionWindsShader
  // 原参数：distortionStrength=0.3, mainScale=0.8, distortScale=0.6,
  //         erosionScale=2, erosionMin=0.38*I, darker=lerp(DarkGray,Black,0.82),
  //         brighter=lerp(Black,DoGSkyColor,0.32), highlights=DoGSkyColor
  // ================================================================
  _drawLayer1_Winds(ctx, I) {
    // ★ 2026-08-15 WebGL 完全照搬 DoGDistortionWindsShader.fx（参数逐一对应 DoGSky.cs DrawDistortionWinds）
    const sky = this._getSky();
    const n2 = this._tex('Neurons2'), sn = this._tex('SharpNoise'), mn = this._tex('MeltyNoise'), pb = this._tex('Pebbles');
    if (sky && n2 && sn && mn && pb) {
      const oc = this.color;
      sky.drawWinds({
        w: W, h: H,
        imgMain: n2, imgHighlights: sn, imgDistortion: mn, imgErosion: pb,
        time: animTime,                       // Main.GlobalTimeWrappedHourly
        overallOpacity: I,                    // SkyIntensity
        distortionStrength: 0.3,
        mainNoiseTextureScale: 0.8,
        distortionTextureScale: 0.6,
        erosionTextureScale: 2,
        erosionMin: 0.38 * I,
        gradientPrecision: 20,
        pixelationFactor: [W * 0.5, H * 0.5],
        worldOffset: [0, 0],                  // screenPosition=0（无卷轴）
        darkerPixelColor: this._clrLerp([64, 64, 64], [0, 0, 0], 0.82),   // lerp(DarkGray, Black, 0.82)
        brighterPixelColor: this._clrLerp([0, 0, 0], oc, 0.32),           // lerp(Black, oc, 0.32)
        highlightsColor: [...oc],
      });
      ctx.drawImage(sky.canvas, 0, 0);
      return;
    }
    // —— 回退：Canvas 近似（WebGL 不可用）——
    if (!n2) return;

    const t = animTime;
    const oc = this.color;  // DoGSkyColor
    const darker = this._clrLerp([64, 64, 64], [0, 0, 0], 0.82);   // DarkGray→Black 0.82

    const wc = this._fit(this.offscreen.winds);
    wc.clearRect(0, 0, W, H);

    // 底色（darker 渐变，顶部偏暗、底部略染状态色）
    const base = wc.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, this._rgb(darker, 1));
    base.addColorStop(1, this._rgb(this._clrLerp(darker, oc, 0.12), 1));
    wc.globalCompositeOperation = 'source-over';
    wc.globalAlpha = 0.18 * I;   // 轻量压暗，露出 113 底图（不再整张覆盖）
    wc.fillStyle = base;
    wc.fillRect(0, 0, W, H);

    // Neurons2 单层滚动（screen 提亮噪声结构，避免 per-pixel 循环）
    // ★ 2026-08-14 晚间：去掉"双速滚动第二层"——两个不同 scale 的 Neurons2 双层叠加产生
    //   Moiré 干涉条纹（用户反馈"左下角贴图重叠边缘感突兀明显"）。改为单层。
    // ★ 2026-08-14 修复"背景周期闪"：滚动值作为 offsetX/Y 传给 _fillTiled（内部用缩放后块宽取模）。
    wc.globalCompositeOperation = 'screen';
    wc.globalAlpha = 0.45 * I;
    const s1 = 1.5;
    this._fillTiled(wc, n2, t * 55, t * 14, s1, s1);

    // SharpNoise 高光（亮斑）
    if (sn) {
      wc.globalAlpha = 0.16 * I;
      this._fillTiled(wc, sn, t * 32, t * 12, 1.2, 1.2);
    }

    // Pebbles 侵蚀（destination-out 抠洞增加层次）
    if (pb) {
      wc.globalCompositeOperation = 'destination-out';
      wc.globalAlpha = 0.16 * I;
      this._fillTiled(wc, pb, t * 11, t * 4, 1.0, 1.0);
    }

    // 染向 DoGSkyColor（★ 2026-08-14 修复：source-atop 染色 alpha 0.18 太淡，灰白云染不上色。
    //   multiply：灰白贴图 × oc = 染成 青/品红 的云（黑底×oc=黑 不受影响）；
    //   ★ 深夜再降：0.35 → 0.22（用户"滤镜搞弱一点"）
    wc.globalCompositeOperation = 'multiply';
    wc.globalAlpha = 0.22 * I;
    wc.fillStyle = this._rgb(oc, 1);
    wc.fillRect(0, 0, W, H);

    wc.globalCompositeOperation = 'source-over';
    wc.globalAlpha = 1;

    ctx.drawImage(this.offscreen.winds, 0, 0);
  },

  // ================================================================
  // Layer ② 滚动雾（AlphaBlend, opacity≈0.25）—— DoGBackgroundFogShader
  // 原参数：time*3, opacity=I*0.25, distort=0.12, scale=0.6,
  //         darker=lerp(Black,DarkGray,0.75), brighter=lerp(DarkGray,DoGSkyColor,0.8)
  // ================================================================
  _drawLayer2_Fog(ctx, I) {
    // ★ 2026-08-15 WebGL 完全照搬 DoGBackgroundFogShader.fx（参数对应 DoGSky.cs DrawRollingBackgroundFog）
    const sky = this._getSky();
    const clouds = this._tex('RealisticClouds');
    const mn = this._tex('MeltyNoise'), hnW = this._tex('HarshNoise');
    if (sky && clouds && mn && hnW) {
      const oc = this.color;
      sky.drawFog({
        w: W, h: H,
        imgMain: clouds, imgDistortion: clouds, imgErosion: hnW,   // ★ 2026-08-17 修正：原版 DoGSky.cs:343 雾的 distortion 采样器=clouds 自身（非 MeltyNoise）
        time: animTime * 3,                   // GlobalTimeWrappedHourly * 3
        overallOpacity: I * 0.25,             // SkyIntensity * 0.25
        distortionStrength: 0.12,
        mainNoiseTextureScale: 0.6,
        distortionTextureScale: 0.8,
        erosionTextureScale: 0.26,
        erosionMin: 0.06 * I,
        gradientPrecision: 20,
        pixelationFactor: [W * 0.5, H * 0.5],
        worldOffset: [0, 0],
        darkerPixelColor: this._clrLerp([0, 0, 0], [64, 64, 64], 0.75),   // lerp(Black, DarkGray, 0.75)
        brighterPixelColor: this._clrLerp([64, 64, 64], oc, 0.8),         // lerp(DarkGray, oc, 0.8)
      });
      ctx.drawImage(sky.canvas, 0, 0);
      return;
    }
    // —— 回退：Canvas 近似（WebGL 不可用）——
    if (!clouds) return;

    const t = animTime;
    const oc = this.color;
    const darker = this._clrLerp([0, 0, 0], [64, 64, 64], 0.75);
    const brighter = this._clrLerp([64, 64, 64], oc, 0.8);

    const fc = this._fit(this.offscreen.fog);

    // 用平铺+双速滚动+混合模式近似雾效果
    // ★ 2026-08-14 加快滚动：t*40→t*80 / t*10→t*22（用户要求"云层动得快一些"）
    const scroll1 = t * 80, scroll2 = t * 22; // 两档速度
    const scale = 0.6;

    // 第一层云（深色基底）
    fc.globalAlpha = 0.12 * I;   // 轻量压暗，露出 113 底图
    fc.fillStyle = '#0a0a12';
    fc.fillRect(0, 0, W, H);

    // 平铺 RealisticClouds 双速叠加（模拟 shader 的双采样 multiply）
    fc.globalCompositeOperation = 'lighter';
    fc.globalAlpha = 0.18 * I;

    // 滚动层 1（★ 2026-08-14 修复"6.4s 周期闪"：滚动值作为 offsetX 传给 _fillTiled——
    //   内部用缩放后块宽取模；之前 `scroll % naturalWidth` ≠ 块宽导致取模跳变=画面平移一闪）
    // ★ 2026-08-14 晚间：去掉"滚动层 2"——两个不同 scale 的 RealisticClouds 双层叠加产生
    //   Moiré 干涉条纹（用户反馈"左下角贴图重叠边缘感突兀明显"）。改为单层 + 加大 HarshNoise 块减少抠洞边界。
    this._fillTiled(fc, clouds, scroll1, 0, scale * 2, scale * 2);

    // 整体染向 DoGSkyColor（★ 2026-08-14 修复：原 source-atop 渐变 alpha 0.25 太淡。
    //   multiply：灰白云 × oc = 青/品红 云，暗底不受影响；★ 深夜再降：0.3 → 0.18）
    fc.globalCompositeOperation = 'multiply';
    fc.globalAlpha = 0.18 * I;
    fc.fillStyle = this._rgb(oc, 1);
    fc.fillRect(0, 0, W, H);

    fc.globalAlpha = 1;
    fc.globalCompositeOperation = 'source-over';

    // HarshNoise 侵蚀效果（★ 2026-08-14 恢复：用户反馈"背景只剩云层"缺层次。destination-out 抠洞增加雾的
    //   明暗层次，scale 0.5（sw=256 大块）避免小块硬边；原 0.26 太碎已改）
    const hn = this._tex('HarshNoise');
    if (hn) {
      fc.globalCompositeOperation = 'destination-out';
      fc.globalAlpha = 0.08 * I;
      this._fillTiled(fc, hn, t * 15, t * 5, 0.5, 0.5);
      fc.globalCompositeOperation = 'source-over';
      fc.globalAlpha = 1;
    }

    ctx.drawImage(this.offscreen.fog, 0, 0);
  },

  // ★ Smudges 一次性染色缓存（按 oc 键）：每像素 RGB = oc × lum，alpha = 原 alpha
  //   对应 fx colorFromBrightness = lerp(黑, DoGSkyColor, lum/255)；缓存一次避免每帧 26 万像素 ImageData。
  //   缓存键 = 纹理 src + 四舍五入的 oc（★ 2026-08-14 修复：原用浮点 oc → oc 每帧 lerp(0.12) 渐近收敛，
  //   浮点永不相等 → 每帧重建 512×512 ImageData（26 万像素遍历 + putImageData）→ 漩涡每帧重画 =
  //   用户反馈的"背景闪一下刷新一遍"。取整后收敛即稳定，仅颜色真变化时重建。）
  _smOcTinted() {
    const sm = this._tex('Smudges');
    if (!sm) return null;
    const oc = this.color;
    const key = sm.src + '|' + Math.round(oc[0]) + ',' + Math.round(oc[1]) + ',' + Math.round(oc[2]);
    if (this._ocTintedCache && this._ocTintedCache.key === key) return this._ocTintedCache.canvas;
    const w = sm.naturalWidth, h = sm.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cc = c.getContext('2d');
    cc.drawImage(sm, 0, 0);
    const id = cc.getImageData(0, 0, w, h);
    const d = id.data;
    const oR = oc[0] / 255, oG = oc[1] / 255, oB = oc[2] / 255;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / (3 * 255);
      // 黑×oc=黑、白×oc=oc、灰=暗版 oc —— 保留 Smudges 灰度明暗图案
      d[i]     = (oc[0] * lum) | 0;
      d[i + 1] = (oc[1] * lum) | 0;
      d[i + 2] = (oc[2] * lum) | 0;
      // alpha 保持原值（避免矩形边界）
    }
    cc.putImageData(id, 0, 0);
    this._ocTintedCache = { key, canvas: c };
    return c;
  },

  // ================================================================
  // Layer ③ 裂隙光环（Additive）—— DoGRiftAuraShader.fx 第 8 次实现（2026-08-14）
  // 之前 7 版都失败根因总结：①离屏画成"圆"或"全屏"导致范围错；②multiply/source-atop 染色都把图案抹平成光球；
  //   ③Swirls 圆盘的硬半径边界变成亮圈（截图可见）。
  // 现在策略（彻底换思路）：
  //   1) 512×512 局部离屏（对齐 fx spriteBatch.Draw(Smudges, scale=1) 输出范围）
  //   2) _smOcTinted 缓存：每像素 RGB = oc × lum（fx colorFromBrightness 公式）→ 保留明暗图案
  //   3) Swirls 一次性 lumAlpha 缓存（带真 alpha 灰度图），双层旋转/滚动叠加（lighter）→ 扭曲纹路
  //   4) 圆淡出 destination-in（中心 1 → cutoff 0.675×I 处 0.25 → 边缘 0）
  //   5) 主画布 additive + 裂隙位置 + 旋转 2π/270 + alpha 0.55（融入背景）
  //   **关键**：避免在离屏画任何"圆盘"或"圆"形状——圆全部由最后的 destination-in 软切
  // ================================================================
  _drawLayer3_RiftAura(ctx, I) {
    const sm = this._tex('Smudges');
    if (!sm) return;
    // ★ 2026-08-15 WebGL 完全照搬 DoGRiftAuraShader.fx（逐像素极坐标扭曲 + Swirls 采样，
    //   之前 7 版 Canvas 近似（旋转/滚动叠加）全都不是原版逻辑。参数对应 DoGSky.cs DrawRiftAura）
    const sky = this._getSky();
    const sw = this._tex('Swirls');
    if (sky && sw && this.realityCracks.length) {
      const oc = this.color;
      // ★ 2026-08-17 参考 dog_battle_background_v3_diag.html：Layer③ 用 (W/2, H/2) 屏幕中心
      //   → 与 Layer④ 碎玻璃同心（都在屏幕中心），Layer⑤ 裂口在 spawn 视差（中心偏上 ~66px）形成嵌套
      //   ★ 2026-08-17 用户自调：基准 + riftOffset.l3
      const o3 = this.riftOffset.l3;
      const cx3 = W / 2 + o3.x, cy3 = H / 2 + o3.y;
      sky.drawRiftAura({
        w: W, h: H,
        imgBase: sm, imgDistortion: sw,
        pos: [cx3, cy3],
        texSize: [sm.naturalWidth, sm.naturalHeight],
        scale: this.riftSize.l3,   // ★ 2026-08-17 用户自调尺寸
        rot: animTime * Math.PI * 2 / 270,
        time: animTime,
        overallOpacity: 0.6,
        distortionStrength: 0.78,
        opacityCutoffValue: 0.675 * I,
        fadeoutPower: 1.25,
        minBrightnessValue: 0,
        gradientPrecision: 8,
        pixelSize: [W * 0.5, H * 0.5],
        brighterPixelColor: [...oc],
      });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';   // XNA Additive
      ctx.drawImage(sky.canvas, 0, 0);
      ctx.restore();
      return;
    }
    // —— 回退：Canvas 近似（WebGL 不可用）——
    const pc = this.offscreen.riftAura;
    const pctx = pc.getContext('2d');
    const pW = pc.width, pH = pc.height;
    const t = animTime;
    const oc = this.color;

    pctx.clearRect(0, 0, pW, pH);

    // 1) 染色 Smudges（RGB = oc × lum，保留图案）
    const smT = this._smOcTinted();
    if (smT) {
      pctx.drawImage(smT, 0, 0, pW, pH);
    } else {
      pctx.fillStyle = this._rgb(oc, 1);
      pctx.fillRect(0, 0, pW, pH);
    }

    // 2) Swirls 旋转/滚动叠加（lighter，扭曲纹路 → 极坐标扭曲近似）
    if (sw) {
      pctx.globalCompositeOperation = 'lighter';
      const cx2 = pW / 2, cy2 = pH / 2;
      // 层 1：旋转 2π/270（原版慢转速度）
      pctx.save(); pctx.translate(cx2, cy2); pctx.rotate(t * Math.PI * 2 / 270);
      pctx.globalAlpha = 0.45 * I;
      pctx.drawImage(this._luminanceToAlpha(sw), -pW / 2, -pH / 2, pW, pH);
      pctx.restore();
      // 层 2：水平滚动（fx polarCoords.x 时间变化 = 角度偏移 = 旋涡转动）
      const scX = (t * 8) % pW;
      pctx.save(); pctx.translate(cx2, cy2); pctx.globalAlpha = 0.35 * I;
      pctx.drawImage(this._luminanceToAlpha(sw), -pW / 2 + scX, -pH / 2, pW, pH);
      pctx.drawImage(this._luminanceToAlpha(sw), -pW / 2 + scX - pW, -pH / 2, pW, pH);
      pctx.restore();
      pctx.globalCompositeOperation = 'source-over';
    }

    // 3) 圆淡出（fx: -polarCoords.y < cutoff → pow(-dist/(dist-cutoff), -fadeoutPower)；
    //    cutoff=0.675×I → cutoff 比例处熄灭，fadeoutPower=1.25）
    pctx.globalCompositeOperation = 'destination-in';
    const cutVal = Math.min(0.94, 0.675 * I);
    const R = Math.min(pW, pH) * 0.5;
    const g = pctx.createRadialGradient(pW / 2, pH / 2, 0, pW / 2, pH / 2, R);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(cutVal, 'rgba(255,255,255,1)');
    g.addColorStop(Math.min(1, cutVal + 0.04), 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, pW, pH);
    pctx.globalCompositeOperation = 'source-over';
    pctx.globalAlpha = 1;

    // 4) 主画布：additive + alpha 0.55（融入背景）+ 裂隙位置 + 旋转 2π/270
    //    输出范围 512 世界单位，裂隙位置（realityCracks[0].Position）
    //    ★ 2026-08-14 修复：Layer ③ 必须与 Layer ⑤ 用【同一视差位置】——源码两者都用
    //      (pos - screenCenter) * depthFactor + screenCenter（Depth=30 → 裂隙在屏幕中央上方 ~66px）。
    //      之前 Layer ③ 直接用 riftSpawn（屏幕顶部 y≈90）→ 与 Layer ⑤ 臂形（视差后 y≈294）错位，
    //      抠洞的裂口与漩涡不在同一处（像素采样验证：spawn 青色 vs 顶部黑，错开）。
    //    ★ 2026-08-14 晚间：缩小漩涡（512→320）+ 降 alpha（0.55→0.28）——用户反馈"裂隙还是像个圆形"，
    //      Layer ③ 大圆漩涡抢镜；缩小后只作为"能量雾"背景，让 Layer ⑤ 不规则裂口成为视觉主体。
    const o3 = this.riftOffset.l3;
    const cx3 = W / 2 + o3.x, cy3 = H / 2 + o3.y;   // 与 WebGL 路径同基准 + 偏移
    const vSize = 320;   // ★ 漩涡显示尺寸 512 → 320（缩小 37%）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * I;   // ★ 2026-08-15 晚 平衡：Layer③ 漩涡 + Layer④ 裂纹同 Additive 层，alpha 太高盖住 Layer④ 裂纹细节（截图验证），回 0.28 让 Layer④ 多方向裂纹突出
    ctx.translate(cx3, cy3);
    ctx.rotate(t * Math.PI * 2 / 270);
    ctx.drawImage(pc, -vSize / 2, -vSize / 2, vSize, vSize);
    ctx.restore();
  },

  // ================================================================
  // Layer ④ 碎玻璃（Additive, opacity=0.1015）—— DoGRealityCrackShader
  // CrackedGlass_Glowing ×3 旋转, cutoff=0.8*I, fadeoutPower=1, minBright=0.6
  // ================================================================
  // Layer ④ RealityCracks（★ 2026-08-15 深 按 DoGRealityCrackShader.fx 逐行实现）
  //   原版（DoGSky.cs DrawRealityCracks 387-414 行）：
  //     - Begin BlendState.Additive（与 Layer③ 同层！用户"裂隙贴图和光晕应是一个图层"）
  //     - opacityCutoffValue=0.8×I, fadeoutPower=1, overallOpacity=0.1015
  //     - minBrightnessValue=0.6, darker=oc, brighter=White
  //     - 3 张 CrackedGlass 旋转 0°/120°/240°, scale=1.55×rand(0.9,1.1), 视差 depth=30
  //   shader 逻辑（用户提供逐行）：
  //     brightness=(r+g+b)/3; ratio=InverseLerp(0.6,1,b)=(b-0.6)/0.4（不 clamp!）
  //     colorFromBrightness=lerp(oc,白,ratio) → 黑底(b=0) ratio=-1.5 → 染成青色 = "青色光晕"来源！
  //     coloredSample=color×染色; if(-d<cutoff) ×=pow(-d/(d-cutoff),-1)=(cutoff-d)/d → 中心爆亮、cutoff 外黑
  //     return × overallOpacity(0.1015)
  //   Canvas 实现：逐像素处理 CrackedGlass_Glowing 一次（缓存，oc 取整键），3 张旋转 Additive 画。
  // ================================================================
  _realityCrackTint(oc) {
    const tex = this._tex('CrackedGlass_Glowing');
    if (!tex || !tex.complete || tex.naturalWidth === 0) return null;
    const key = oc[0] + ',' + oc[1] + ',' + oc[2];
    if (this._rcTintKey === key && this._rcTinted) return this._rcTinted;
    const w = tex.naturalWidth, h = tex.naturalHeight;
    if (!this._rcCanvas) this._rcCanvas = document.createElement('canvas');
    const cv = this._rcCanvas;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.clearRect(0, 0, w, h);
    c.drawImage(tex, 0, 0);
    const id = c.getImageData(0, 0, w, h);
    const d = id.data;
    const cutoff = 0.8;               // × I=1（I 在合成时用 globalAlpha 淡入，避免缓存重建）
    const fr = oc[0], fg = oc[1], fb = oc[2];   // darker = oc
    const tr = 255, tg = 255, tb = 255;          // brighter = 白
    const invMin = 1 / (1 - 0.6);                // InverseLerp(0.6,1,b) = (b-0.6)×invMin
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % w, py = (i / 4 / w) | 0;
      const u = px / w - 0.5, v = py / h - 0.5;
      const dist = Math.sqrt(u * u + v * v);
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const brightness = (r + g + b) / 3 / 255;
      const ratio = (brightness - 0.6) * invMin;
      const cr = fr + (tr - fr) * ratio;   // lerp(oc, 白, ratio)（不 clamp，canvas 写回时自动 clamp）
      const cg = fg + (tg - fg) * ratio;
      const cb = fb + (tb - fb) * ratio;
      let orr = r * cr / 255, og = g * cg / 255, ob = b * cb / 255;
      let oa = d[i + 3] * 0.1015;           // color.a × overallOpacity
      if (dist < cutoff) {
        const fade = (cutoff - dist) / dist;  // pow(-d/(d-cutoff), -1)：中心爆亮、cutoff 处消失
        orr *= fade; og *= fade; ob *= fade; oa *= fade;
      } else { orr = og = ob = oa = 0; }
      d[i] = orr; d[i + 1] = og; d[i + 2] = ob; d[i + 3] = oa;
    }
    c.putImageData(id, 0, 0);
    this._rcTintKey = key;
    this._rcTinted = cv;
    return cv;
  },

  _drawLayer4_Cracks(ctx, I) {
    if (!this.realityCracks.length) return;
    const tinted = this._realityCrackTint(this.color);
    if (!tinted) return;
    // Additive（原版 Layer③④ 同一 Begin → 与漩涡视觉融合）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = I;   // SkyIntensity 淡入淡出（overallOpacity 0.1015 已在逐像素处理内）
    // ★ 2026-08-17 对齐参考 v3.html：L3 光环与 L4 碎玻璃都精确画在屏幕中心 (W/2,H/2)，
    //   L5 才微偏上。原视差(riftSpawn)会把 L4 推到中心上方~66px → 与 L3 错位（"不在一个图层"）。
    const o4 = this.riftOffset.l4;   // ★ 2026-08-17 用户自调偏移（叠加在中心之上）
    const cx = W / 2 + o4.x, cy = H / 2 + o4.y;
    for (let i = 0; i < this.realityCracks.length; i++) {
      const rc = this.realityCracks[i];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rc.rotation);
      const s = tinted.width * rc.scale * this.riftSize.l4;   // ★ 2026-08-17 用户自调尺寸（scale=1.55×rand(0.9,1.1) 为基础）
      ctx.drawImage(tinted, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.restore();
  },


  // ================================================================
  // Layer ⑤ 扭曲裂隙（AlphaBlend + MetaballEdge 近似）
  // 核心：程序化发光折线（白边+染色主体）+ 内部闪电闪烁 + 滚动云
  // ================================================================
  _drawLayer5_Rift(ctx, I) {
    if (!this.riftInitDone || !this.riftArms.length) return;

    // ★ 2026-08-17 用户要求：手绘裂隙(hand_rift.png)为默认；仅 ?handrift=0 强制走程序化 MetaballEdge。
    const forceProg = typeof window !== 'undefined' && typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('handrift') === '0';
    const hr = forceProg ? null : this._tex('HandRift');
    if (hr && hr.complete && hr.naturalWidth > 0) {
      this._drawLayer5_HandRift(ctx, I, hr);
      return;
    }

    // ---- ① 白色臂网（对应 DrawRiftToRenderTarget → PrimitiveRenderer.RenderTrail）----
    //    ★ 2026-08-14 WebGL 版：静态缓存只生成一次（臂点/视差不随时间变化，每帧重画是浪费）。
    //    不乘 I 缓存，合成时用 ctx.globalAlpha=I 控制淡入淡出。
    //    ★ 2026-08-15 RenderTrail 完整移植（用户选 B）：
    //      - AssignPointsRectangleTrail（smoothen=false）：pointsToCreate = TotalPoints + 16，
    //        按索引比例均匀插值 → 折线变平滑曲线（原版 277 行 RenderTrail(parallaxedPoints, settings, TotalPoints+16)）
    //      - WidthFunction = Lerp(0, MaxWidth, 1-completion) × SkyIntensity（I 合成时乘）
    //      - 横截面圆角柔边：原版顶点 V = 0.5 ± effectiveHalfWidth×0.5 采样圆点纹理 →
    //        Canvas 用 3 层描边（宽低alpha → 窄高alpha）模拟"中心实心、边缘柔化"的 alpha 渐变，
    //        让 MetaballEdgeShader 的边缘检测得到更宽的发光带（不再 1px 抗锯齿硬边）
    const rsh = this._fit(this.offscreen.riftShape);
    if (!this.riftShapeDone) {
      rsh.clearRect(0, 0, W, H);
      rsh.lineCap = 'round'; rsh.lineJoin = 'round';
      for (let i = 0; i < this.riftArms.length; i++) {
        const arm = this.riftArms[i];
        const pts = arm.points;
        if (pts.length < 2) continue;
        const dfX = 1 / arm.depth, dfY = 0.9 / arm.depth;
        const cx = W / 2, cy = H / 2;
        const parallaxPts = pts.map(p => ({ x: (p.x - cx) * dfX + cx, y: (p.y - cy) * dfY + cy }));
        // ① 插值：TotalPoints+16 个点（索引比例 lerp，对应 smoothen=false 分支）
        const N = arm.totalPts + 16;
        const lastIdx = parallaxPts.length - 1;
        const inv = 1 / (N - 1);
        const trail = [];
        for (let k = 0; k < N; k++) {
          const comp = k * inv;
          const scaled = comp * lastIdx;
          const ci = Math.min(Math.floor(scaled), lastIdx);
          const ni = Math.min(ci + 1, lastIdx);
          const t = scaled - ci;
          trail.push({
            x: parallaxPts[ci].x + (parallaxPts[ni].x - parallaxPts[ci].x) * t,
            y: parallaxPts[ci].y + (parallaxPts[ni].y - parallaxPts[ci].y) * t,
            comp,
          });
        }
        // ② 逐段描边：★ 2026-08-15 晚 对照 fx 修正——原版臂网是【纯白 alpha=1 实心】！
        //   ColorFunction = Color.White * 1f，且 StandardPrimitiveShader"simply renders the vertex color
        //   data without modification"（CalamityShaders.cs 注释）→ 横截面无柔边渐变。
        //   之前我加的 3 层描边（0.30/0.65/1.0）制造半透明渐变带：MetaballEdgeShader 的邻居检测把
        //   半透明像素当"有 alpha"→ 边缘判定失效（发光带消失）+ 内部 overlay 被 alpha 乘暗。
        //   ⚠ 圆角问题交给 shader 的 edgeColor 边缘检测，臂网本身必须硬实心。
        for (let k = 1; k < trail.length; k++) {
          const p0 = trail[k - 1], p1 = trail[k];
          const width = lerp(arm.maxWidth, 0, p0.comp);
          if (width < 0.5) continue;
          rsh.strokeStyle = 'rgba(255,255,255,1)';
          rsh.lineWidth = width;
          rsh.beginPath(); rsh.moveTo(p0.x, p0.y); rsh.lineTo(p1.x, p1.y); rsh.stroke();
        }
      }
      this.riftShapeDone = true;
      this.offscreen.riftShape._riftShapeStamp = (this.offscreen.riftShape._riftShapeStamp || 0) + 1;
    }

    // ---- ② WebGL 路径（优先）：MetaballEdgeShader.fx 逐行移植 ----
    //    臂网【内部】→ overlay(另一个世界) × oc；【边缘】→ edgeColor；【外部】→ 透明。
    //    ★ 2026-08-15 改用 SkyShaders.drawRift（与 Layer ①-④ 统一走同一 WebGL 引擎）
    const sky = this._getSky();
    if (sky) {
      this._updateRiftOverlay();
      const ec = this._clrLerp(this._clrLerp(this.color, [255, 255, 255], 0.6), [0, 0, 0], 0.15);
      sky.drawRift({
        w: W, h: H,
        metaball: this.offscreen.riftShape,
        metaballStamp: this.offscreen.riftShape._riftShapeStamp || 0,
        overlay: this.offscreen.riftOverlay,
        overlayStamp: this.offscreen.riftOverlay ? (this.offscreen.riftOverlay._riftOverlayStamp || 0) : 0,
        edgeColor: ec,
        layerColor: [...this.color],
      });
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';   // XNA AlphaBlend
      ctx.globalAlpha = I;
      const o5 = this.riftOffset.l5;                   // ★ 2026-08-17 用户自调偏移
      ctx.translate(o5.x, o5.y);
      ctx.drawImage(sky.canvas, 0, 0);
      ctx.restore();
      return;
    }
    // ②b 回退：单实例 RiftShader（SkyShaders 编译失败但简单 shader 可能可用）
    if (!this.riftShader) {
      this.riftShader = new RiftShader();
      if (!this.riftShader.init(W, H)) { this.riftShader = null; }
    }
    if (this.riftShader) {
      this.riftShader.setMetaball(this.offscreen.riftShape);
      this._updateRiftOverlay();
      this.riftShader.setOverlay(this.offscreen.riftOverlay);
      // edgeColor = lerp(lerp(DoGSkyColor, 白, 0.6), 黑, 0.15)（fx 原公式）→ 跟随 P1 青 / P2 品红
      const ec = this._clrLerp(this._clrLerp(this.color, [255, 255, 255], 0.6), [0, 0, 0], 0.15);
      this.riftShader.render(ec, this.color, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = I;
      const o5 = this.riftOffset.l5;                   // ★ 2026-08-17 用户自调偏移
      ctx.translate(o5.x, o5.y);
      ctx.drawImage(this.riftShader.canvas, 0, 0);
      ctx.restore();
      return;
    }

    // ---- ③ 回退路径（WebGL 不可用）：Canvas 近似（原逻辑；rsh 用已缓存版本）----
    const rm = this._fit(this.offscreen.riftMask);
    const ri = this._fit(this.offscreen.riftInner);
    rm.clearRect(0, 0, W, H);
    ri.clearRect(0, 0, W, H);

    // A. 裂隙内部内容：全屏深紫黑 → destination-in 用臂网 mask 裁切 → 只保留臂网覆盖区域
    const lc = this.color;
    ri.globalCompositeOperation = 'source-over';
    ri.globalAlpha = 1;
    const holeCx = W / 2, holeCy = H / 2;
    const holeGrad = ri.createRadialGradient(holeCx, holeCy, 0, holeCx, holeCy, Math.max(W, H) * 0.7);
    holeGrad.addColorStop(0, this._rgb([lc[0] * 0.16, lc[1] * 0.16, lc[2] * 0.16], 1));
    holeGrad.addColorStop(0.5, this._rgb([lc[0] * 0.1, lc[1] * 0.1, lc[2] * 0.1], 1));
    holeGrad.addColorStop(1, this._rgb([lc[0] * 0.05, lc[1] * 0.05, lc[2] * 0.05], 1));
    ri.fillStyle = holeGrad;
    ri.fillRect(0, 0, W, H);
    ri.globalCompositeOperation = 'destination-in';
    ri.globalAlpha = 1;
    ri.drawImage(this.offscreen.riftShape, 0, 0);
    ri.globalCompositeOperation = 'source-over';
    ri.globalAlpha = 1;

    // C. 发光边（近似 shader 边缘检测；★ 2026-08-15 与 riftShape 同样用 TotalPoints+16 插值平滑曲线）
    for (let i = 0; i < this.riftArms.length; i++) {
      const arm = this.riftArms[i];
      const pts = arm.points;
      if (pts.length < 2) continue;
      const dfX = 1 / arm.depth, dfY = 0.9 / arm.depth;
      const cx = W / 2, cy = H / 2;
      const parallaxPts = pts.map(p => ({ x: (p.x - cx) * dfX + cx, y: (p.y - cy) * dfY + cy }));
      // 插值（与 riftShape 相同的 RenderTrail 插值 → 发光边与白色臂网完全同形状）
      const N = arm.totalPts + 16;
      const lastIdx = parallaxPts.length - 1;
      const inv = 1 / (N - 1);
      const trail = [];
      for (let k = 0; k < N; k++) {
        const comp = k * inv;
        const scaled = comp * lastIdx;
        const ci = Math.min(Math.floor(scaled), lastIdx);
        const ni = Math.min(ci + 1, lastIdx);
        const t = scaled - ci;
        trail.push({
          x: parallaxPts[ci].x + (parallaxPts[ni].x - parallaxPts[ci].x) * t,
          y: parallaxPts[ci].y + (parallaxPts[ni].y - parallaxPts[ci].y) * t,
          comp,
        });
      }
      // ★ 2026-08-15 ★ 取消"主刺/外裂纹分级 alpha"：原版 MetaballEdgeShader 边缘检测天然让所有臂形边缘亮、内部暗，
      //   之前我自作主张把外裂纹 alpha 砍到 0.02/0.06/0.05 让"防突兀"，但实机外裂纹是清晰光线条——
      //   实机 vs 我的差异就是外裂纹太弱。恢复统一 alpha（用主刺等级）。
      for (let k = 1; k < trail.length; k++) {
        const p0 = trail[k - 1], p1 = trail[k];
        const width = lerp(arm.maxWidth, 0, p0.comp) * I;
        if (width < 0.5) continue;
        rm.strokeStyle = this._rgb(lc, 0.1);
        rm.lineWidth = width * 2.4;
        rm.beginPath(); rm.moveTo(p0.x, p0.y); rm.lineTo(p1.x, p1.y); rm.stroke();
        rm.strokeStyle = this._rgb(lc, 0.35);
        rm.lineWidth = width * 1.1;
        rm.beginPath(); rm.moveTo(p0.x, p0.y); rm.lineTo(p1.x, p1.y); rm.stroke();
        const ec = this._clrLerp(this._clrLerp(lc, [255, 255, 255], 0.6), [0, 0, 0], 0.15);
        rm.strokeStyle = this._rgb(ec, 0.3);
        rm.lineWidth = Math.max(1, width * 0.35);
        rm.beginPath(); rm.moveTo(p0.x, p0.y); rm.lineTo(p1.x, p1.y); rm.stroke();
      }
    }

    // D. 合成到主 canvas（Layer⑤ 为 AlphaBlend）
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const o5b = this.riftOffset.l5;                    // ★ 2026-08-17 用户自调偏移
    ctx.translate(o5b.x, o5b.y);
    ctx.drawImage(this.offscreen.riftInner, 0, 0);
    ctx.drawImage(this.offscreen.riftMask, 0, 0);
    ctx.restore();
  },

  // ================================================================
  // Layer ⑤ 用户手绘裂隙贴图（hand_rift.png）
  // 透明背景 PNG 直接贴到 spawn 视差位置（与 Layer③ 光球同基准 → 天然重合）。
  // 边缘发光：shadowBlur（青色/品红跟随 oc）——手绘形状边缘自动发光。
  // 图片缺失/加载失败 → _drawLayer5_Rift 自动回退程序化 MetaballEdgeShader。
  // ================================================================
  _drawLayer5_HandRift(ctx, I, hr) {
    const oc = this.color;
    // spawn 视差位置（与 Layer③ drawRiftAura 完全相同的公式 → 重合）
    const rc0 = this.realityCracks[0];
    const cx5 = W / 2, cy5 = H / 2;
    const dfX = 1 / (rc0 ? rc0.depth : 30), dfY = 0.9 / (rc0 ? rc0.depth : 30);
    const dx = ((rc0 ? rc0.x : this.riftSpawn.x) - cx5) * dfX + cx5;
    const dy = ((rc0 ? rc0.y : this.riftSpawn.y) - cy5) * dfY + cy5;
    const iw = hr.naturalWidth, ih = hr.naturalHeight;
    // edgeColor = lerp(lerp(oc, 白, 0.6), 黑, 0.15)（fx 原公式）
    const ec = this._clrLerp(this._clrLerp(oc, [255, 255, 255], 0.6), [0, 0, 0], 0.15);
    const RS = this.riftSize.l5;   // ★ 2026-08-17 用户自调尺寸倍率

    // ★ 2026-08-15 ★ 自动检测手绘图裂隙块中心：第一次加载时扫描黑色 alpha 像素质心，
    //   缓存到 this._handRiftOffset，贴图时自动 translate 让裂隙块视觉中心 = spawn。
    //   用户手绘图裂隙块不必在图正中央——自动对齐到 spawn（光球位置）。
    if (!this._handRiftOffset) {
      const offCv = document.createElement('canvas');
      offCv.width = iw; offCv.height = ih;
      const offCtx = offCv.getContext('2d');
      offCtx.drawImage(hr, 0, 0);
      const offData = offCtx.getImageData(0, 0, iw, ih).data;
      let ox = 0, oy = 0, oc = 0;
      // ★ alpha^2 加权：裂口块中心（高 alpha）权重 >> 裂纹线边缘（低 alpha），让质心聚焦到裂口块而非裂纹
      for (let y = 0; y < ih; y += 2) for (let x = 0; x < iw; x += 2) {
        const i = (y * iw + x) * 4;
        const a = offData[i + 3];
        if (a > 200) {  // 只算几乎全不透明的像素（裂口块中心，排除半透明裂纹边缘/抗锯齿）
          ox += x * a; oy += y * a; oc += a;
        }
      }
      if (oc > 0) {
        // 让裂隙块视觉中心 = 图正中央：offset = 质心 - 图中心
        this._handRiftOffset = { dx: ox / oc - iw / 2, dy: oy / oc - ih / 2 };
      } else {
        this._handRiftOffset = { dx: 0, dy: 0 };
      }
    }
    const offX = this._handRiftOffset.dx, offY = this._handRiftOffset.dy;

    // ★ 2026-08-15 用户手绘图大小自动调整：缩放到屏幕合理的"裂口"视觉大小（约 280×240 屏幕像素）
    const SCALE = 0.65;

    // ① 天空延伸裂纹（用户要求补上）—— 静态生成 14 条从裂口向四周辐射的细线，
    //    additive 青色 stroke + shadowBlur 发光，首次生成缓存（不闪烁）
    if (!this._skyCracks) {
      this._skyCracks = [];
      const N = 14;
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        const totalLen = 130 + Math.random() * 90;
        const segs = 4 + ((Math.random() * 2) | 0);
        const pts = [{ x: 0, y: 0 }];
        let dir = ang, x = 0, y = 0;
        for (let s = 0; s < segs; s++) {
          dir += (Math.random() - 0.5) * 0.45;
          x += Math.cos(dir) * (totalLen / segs);
          y += Math.sin(dir) * (totalLen / segs);
          pts.push({ x, y });
        }
        this._skyCracks.push(pts);
      }
    }

    // ② 天空裂纹绘制（additive 青色，独立 transform；以 spawn 为中心，随尺寸倍率缩放）
    ctx.save();
    ctx.translate(dx + this.riftOffset.l5.x, dy + this.riftOffset.l5.y);   // ★ 2026-08-17 用户自调偏移
    ctx.scale(RS, RS);   // ★ 2026-08-17 尺寸倍率
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = this._rgb(ec, 0.7 * I);
    ctx.lineWidth = 2.2;
    ctx.shadowColor = this._rgb(ec, 1);
    ctx.shadowBlur = 6;
    for (const pts of this._skyCracks) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    // 主裂纹细描边（更亮更细，强化"主光线"）
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = this._rgb([255, 255, 255], 0.35 * I);
    for (const pts of this._skyCracks) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();

    // ③ 手绘裂隙贴图（缩放 + 自动偏移让裂隙块对齐 spawn + 边缘发光 + 主体）
    ctx.save();
    ctx.translate(dx + this.riftOffset.l5.x, dy + this.riftOffset.l5.y);   // ★ 2026-08-17 用户自调偏移
    ctx.scale(SCALE * RS, SCALE * RS);   // ★ 2026-08-17 尺寸倍率
    ctx.translate(offX, offY);   // ★ 裂隙块自动对齐到 spawn

    // 边缘发光（additive + shadowBlur：基于贴图 alpha 自动描边，青色/品红跟随 oc）
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * I;
    ctx.shadowColor = this._rgb(ec, 1);
    ctx.shadowBlur = 16;
    ctx.drawImage(hr, -iw / 2, -ih / 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 主体（黑色裂隙贴图）
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = I;
    ctx.drawImage(hr, -iw / 2, -ih / 2);
    ctx.restore();
  },

  // ================================================================
  // Layer ⑥ 前景扭曲（最前层）—— DoGVisualsManager.DrawDistortionForeground 逐字移植
  // 原版顺序：① 整屏黑底 backdrop → ② 品红/青色 滚动云(DoGBackgroundFogShader) →
  //           ③ 风纹 pass1(品红高光, DoGDistortionWindsShader) → ④ 风纹 pass2(青色高光)
  // ★ 独立版省略①黑底：原版黑底只为给 metaball 蒙版 RT 不透明底，本版全屏叠加若加黑底会盖住 5 层背景。
  //   只叠加 ② 云 + ③④ 风（颜色为原版固定 Fuchsia(147,24,204)/Cyan(0,221,250)，不跟随 DoGSkyColor）。
  //   整层由 I 淡入（fog opacity=I、winds 0.8*I/0.7*I）；WebGL 不可用回退 Canvas 近似。
  // ================================================================
  _drawLayer6_Foreground(ctx, I) {
    const sky = this._getSky();
    const clouds = this._tex('RealisticClouds');
    const hn = this._tex('HarshNoise');
    const n2 = this._tex('Neurons2');
    const sn = this._tex('SharpNoise');
    const mn = this._tex('MeltyNoise');
    const pb = this._tex('Pebbles');
    const CYAN = [0, 221, 250], FUCHSIA = [147, 24, 204];   // 原版 Highlight 固定色（非 DoGSkyColor）

    if (sky && clouds && hn && n2 && sn && mn && pb) {
      const fgc = this._fit(this.offscreen.foreground);
      fgc.clearRect(0, 0, W, H);

      // ② 品红/青色 滚动云（DoGBackgroundFogShader，AlphaBlend）
      //   原版 distortion sampler 也绑 RealisticClouds（源码 Textures[1]=cloudsTexture），此处照搬。
      sky.drawFog({
        w: W, h: H,
        imgMain: clouds, imgDistortion: clouds, imgErosion: hn,
        time: animTime * 2,                 // GlobalTimeWrappedHourly * 2
        overallOpacity: I,                   // opacity 1 × I 淡入
        distortionStrength: 0.12,
        mainNoiseTextureScale: 1,
        distortionTextureScale: 0.8,
        erosionTextureScale: 0.26,
        erosionMin: 0.06 * I,
        gradientPrecision: 20,
        pixelationFactor: [W * 0.5, H * 0.5],
        worldOffset: [0, 0],
        darkerPixelColor: this._clrLerp([0, 0, 0], CYAN, 0.25),     // lerp(Black, Cyan, 0.25)
        brighterPixelColor: this._clrLerp([0, 0, 0], FUCHSIA, 0.25), // lerp(Black, Fuchsia, 0.25)
      });
      fgc.globalCompositeOperation = 'source-over';
      fgc.globalAlpha = 1;
      fgc.drawImage(sky.canvas, 0, 0);

      // ③ 风纹 pass1（品红高光，Additive）
      sky.drawWinds({
        w: W, h: H,
        imgMain: n2, imgHighlights: sn, imgDistortion: mn, imgErosion: pb,
        time: animTime * 1.075,
        overallOpacity: 0.8 * I,
        distortionStrength: 0.3,
        mainNoiseTextureScale: 1.6,
        distortionTextureScale: 1.76,
        erosionTextureScale: 2,
        erosionMin: 0.5 * I,
        gradientPrecision: 20,
        pixelationFactor: [W * 0.5, H * 0.5],
        worldOffset: [0, 0],
        darkerPixelColor: this._clrLerp([64, 64, 64], [0, 0, 0], 0.64),   // lerp(DarkGray, Black, 0.64)
        brighterPixelColor: this._clrLerp([64, 64, 64], [0, 0, 0], 0.32), // lerp(DarkGray, Black, 0.32)
        highlightsColor: FUCHSIA,
      });
      fgc.globalCompositeOperation = 'lighter';
      fgc.globalAlpha = 1;
      fgc.drawImage(sky.canvas, 0, 0);

      // ④ 风纹 pass2（青色高光，Additive）
      sky.drawWinds({
        w: W, h: H,
        imgMain: n2, imgHighlights: sn, imgDistortion: mn, imgErosion: pb,
        time: animTime * 0.8,
        overallOpacity: 0.7 * I,
        distortionStrength: 0.6,
        mainNoiseTextureScale: 1.24,
        distortionTextureScale: 0.46,
        erosionTextureScale: 3,
        erosionMin: 0.75 * I,
        gradientPrecision: 20,
        pixelationFactor: [W * 0.5, H * 0.5],
        worldOffset: [0, 0],
        darkerPixelColor: this._clrLerp([64, 64, 64], [0, 0, 0], 0.64),
        brighterPixelColor: this._clrLerp([64, 64, 64], [0, 0, 0], 0.32),
        highlightsColor: CYAN,
      });
      fgc.globalCompositeOperation = 'lighter';
      fgc.globalAlpha = 1;
      fgc.drawImage(sky.canvas, 0, 0);

      fgc.globalCompositeOperation = 'source-over';
      fgc.globalAlpha = 1;
      ctx.drawImage(this.offscreen.foreground, 0, 0);
      return;
    }

    // —— 回退：Canvas 近似（WebGL 不可用）——
    if (!clouds || !n2) return;
    const fc = this._fit(this.offscreen.foreground);
    fc.clearRect(0, 0, W, H);
    // 品红/青色 滚动云（lighter 提亮）
    fc.globalCompositeOperation = 'lighter';
    fc.globalAlpha = 0.16 * I;
    this._fillTiled(fc, clouds, animTime * 80, animTime * 26, 1, 1);
    // 风纹高光（SharpNoise）
    if (sn) {
      fc.globalAlpha = 0.10 * I;
      this._fillTiled(fc, sn, animTime * 55, animTime * 18, 1.2, 1.2);
    }
    // 染色：品红+青 斜向渐变（multiply 把灰云染成双色）
    fc.globalCompositeOperation = 'multiply';
    fc.globalAlpha = 0.5 * I;
    const grd = fc.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, 'rgb(147,24,204)');    // Fuchsia
    grd.addColorStop(1, 'rgb(0,221,250)');     // Cyan
    fc.fillStyle = grd;
    fc.fillRect(0, 0, W, H);
    fc.globalCompositeOperation = 'source-over';
    fc.globalAlpha = 1;
    ctx.drawImage(this.offscreen.foreground, 0, 0);
  },

  // ===== Layer ⑤ "另一个世界" overlay（DoGVisualsManager.cs DrawDistortionRiftBackground 100% 照搬）=====
  // 原版流程（先 backdrop 闪电色 + 再 fog 滚动云）：
  //   1) DrawDistortionLightningBackdrop_Background: 黑底 + 闪电闪烁色 = lerp(lerp(Black, White, lightningFill), DoGSkyColor, 0.25)
  //   2) DrawDistortionClouds_Background: 用 DoGBackgroundFogShader 画全屏滚动云（参数与 Layer② 不同）
  //        - distortionStrength=0.24 (Layer② 是 0.12)
  //        - mainNoiseTextureScale=2 (Layer② 是 0.6)
  //        - overallOpacity=1 (Layer② 是 I*0.25)
  //        - distortionTexture=Neurons2 (Layer② 是 MeltyNoise)
  //        - darkColor = lerp(lerp(Black, DarkGray, 0.3), Black, lightningFill*0.8)
  //        - brightColor = lerp(lerp(Black, oc, 0.6), Black, lightningFill*0.8)
  //   3) 输出到 DistortionRiftBackgroundContentsTarget RT → 给 MetaballEdgeShader 当 uOverlay
  _updateRiftOverlay() {
    // 节流：每 3 帧重画一次（闪电 20fps 动画足够；保留首帧必画）
    this.riftOverlayTick = (this.riftOverlayTick || 0) + 1;
    if (this.riftOverlayTick % 3 !== 0 && this.riftOverlayDone) return;
    const sky = this._getSky();
    const clouds = this._tex('RealisticClouds');
    const n2 = this._tex('Neurons2');
    const hn = this._tex('HarshNoise');
    if (!sky || !clouds || !n2 || !hn) return;
    if (!this.offscreen.riftOverlay) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      this.offscreen.riftOverlay = c;
    }
    const ov = this.offscreen.riftOverlay;
    if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
    const ctx2d = ov.getContext('2d');
    const lc = this.color;
    const lf = this.lightningFill;

    // 1) 黑底 + 闪电闪烁色（DoGVisualsManager.cs DrawDistortionLightningBackdrop_Background）
    const backdrop = this._clrLerp(this._clrLerp([0, 0, 0], [255, 255, 255], lf), lc, 0.25);
    ctx2d.globalCompositeOperation = 'source-over';
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle = this._rgb(backdrop, 1);
    ctx2d.fillRect(0, 0, W, H);

    // 2) Fog shader 画滚动云 → sky.canvas
    //    darkColor = lerp(lerp(Black, DarkGray, 0.3), Black, lightningFill*0.8)
    const baseDark = this._clrLerp([0, 0, 0], [64, 64, 64], 0.3);
    const darkColor = this._clrLerp(baseDark, [0, 0, 0], lf * 0.8);
    //    brightColor = lerp(lerp(Black, oc, 0.6), Black, lightningFill*0.8)
    const baseBright = this._clrLerp([0, 0, 0], lc, 0.6);
    const brightColor = this._clrLerp(baseBright, [0, 0, 0], lf * 0.8);

    sky.drawFog({
      w: W, h: H,
      imgMain: clouds, imgDistortion: n2, imgErosion: hn,   // ★ overlay distortion=Neurons2（不是 MeltyNoise）
      time: animTime,
      overallOpacity: 1,                // ★ overlay opacity=1（原版，不是 Layer② 的 I*0.25）
      distortionStrength: 0.24,         // ★ overlay 0.24（Layer② 是 0.12）
      mainNoiseTextureScale: 2,         // ★ overlay 2（Layer② 是 0.6）
      distortionTextureScale: 0.8,
      erosionTextureScale: 0.26,
      erosionMin: 0.06,
      gradientPrecision: 20,
      pixelationFactor: [W * 0.5, H * 0.5],
      worldOffset: [0, 0],              // ★ overlay worldOffset 系数 0.001；screenPosition=0 时都是 0
      darkerPixelColor: darkColor,
      brighterPixelColor: brightColor,
    });

    // 3) 把 sky.canvas 的 fog overlay 缓存到 Canvas2D（preserveDrawingBuffer 保证 drawFog 后可读）
    ctx2d.drawImage(sky.canvas, 0, 0);

    // 4) bump stamp 让 SkyShaders.drawRift 重新上传 uOverlay 纹理
    ov._riftOverlayStamp = (ov._riftOverlayStamp || 0) + 1;
    this.riftOverlayDone = true;
  },

  // ==================== 程序化噪声近似（替代真实纹理像素采样）====================
  // 这些函数近似 Neurons2 / SharpNoise / Pebbles 的视觉特征
  // 在无法逐像素采样 HLSL 纹理时提供合理的视觉效果

  _hash(x, y) {
    // 简单哈希
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  },

  _noise2D(x, y) {
    // 双线性插值噪声
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = this._hash(ix, iy), b = this._hash(ix + 1, iy);
    const c = this._hash(ix, iy + 1), d = this._hash(ix + 1, iy + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  },

  _fbm(x, y, octaves) {
    let val = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {
      val += amp * this._noise2D(x * freq, y * freq);
      freq *= 2; amp *= 0.5;
    }
    return val;
  },

  _pseudoNeurons2(x, y) {
    // 近似 Neurons2：中频神经元状噪声（类似 FBM 但更"团状"）
    return Math.pow(this._fbm(x * 0.8, y * 1.2, 4), 0.65);
  },

  _pseudoSharpNoise(x, y) {
    // 近似 SharpNoise：高频锐利亮点
    const n = this._fbm(x * 3, y * 3, 3);
    return Math.pow(n, 3) * 2.5;  // 高对比度，突出亮点
  },

  _pseudoPebbles(x, y) {
    // 近似 Pebbles：低频鹅卵石状侵蚀
    return this._fbm(x * 0.4, y * 0.4, 2);
  },

  _smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  },
};
DoGSky.initTextures();



export const SUN_IMG = "celestial/Sun.png";

export const SUN_IMG_B64 = 'sprites/sprite_086.png';;

export const MOON_SPRITES = ["celestial/Moon_Pumpkin.png","celestial/Moon_0.png","celestial/Moon_1.png"];

export const MOON_SPRITES_B64 = ['sprites/sprite_087.png','sprites/sprite_088.png','sprites/sprite_089.png'];   // 3 张月亮精灵表（各 50×400，8 帧）
// 日月交替动画（开始界面）：CSS DOM 元素 + data URI 内嵌贴图，预览面板/浏览器均可见

export const SUN_DURATION  = 12;     // 太阳划过秒数

export const MOON_DURATION = 14;     // 月亮划过秒数

export const FADE_FRAC     = 0.25;   // 末尾 25% 路程内做变暗/变亮过渡（无独立间隙）

export const SUN_SIZE      = 0.12;   // 太阳显示尺寸 = min(W,H) 的 12%

export const MOON_SIZE     = 0.09;   // 月亮显示尺寸 = min(W,H) 的 9%

export const DARK          = 0.5;    // 夜晚暗度：半暗，不要全黑


export let sunEl, moonEl, nightOverlay;

export let celestialPhase = 'sun';

export let celestialT = 0;

export let celestialMoonIdx = -1;

export let celestialRaf = null;


export function initCelestial() {
  sunEl = document.getElementById('sun-el');
  moonEl = document.getElementById('moon-el');
  nightOverlay = document.getElementById('night-overlay');
  if (!sunEl || !moonEl) return;
  sunEl.style.backgroundImage = 'url("' + SUN_IMG_B64 + '")';
  pickMoonOnce();
  if (!celestialRaf) celestialRaf = requestAnimationFrame(celestialLoop);
}


export let moonFrame = 0;
// 只随机选一次：一张月亮贴图 + 一个静态月相帧，全程保持不变（不在周期里换、也不播月相动画）

export function pickMoonOnce() {
  celestialMoonIdx = Math.floor(Math.random() * MOON_SPRITES_B64.length);
  moonFrame = Math.floor(Math.random() * 8);
  if (moonEl) moonEl.style.backgroundImage = 'url("' + MOON_SPRITES_B64[celestialMoonIdx] + '")';
}

// 天体轨迹：从屏幕左外（较高处）沿平缓弧线划到右外，弧顶在屏幕上方（圆心在下方）

export function arcPos(t, w, h, margin) {
  const x = -margin + (w + 2 * margin) * t;   // 左外 → 右外，真正进/出屏幕
  const yEnd  = h * 0.18;                     // 起始/末尾高度（较高，已上移）
  const yPeak = h * 0.10;                     // 中段最高点（更高，形成平缓弧）
  const y = yEnd + (yPeak - yEnd) * (1 - Math.pow(2 * t - 1, 2));
  return { x, y };
}

// 放置天体：中心 (x,y)，设透明度；月亮用固定的单帧月相（不随进度变化，避免闪动）

export function placeBody(el, x, y, size, alpha, isMoon) {
  if (!el) return;
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.transform = 'translate(' + (x - size/2) + 'px,' + (y - size/2) + 'px)';
  el.style.opacity = alpha;
  if (isMoon) {
    el.style.backgroundSize = size + 'px ' + (size * 8) + 'px';
    el.style.backgroundPosition = '0 ' + (-(moonFrame * size)) + 'px';
  }
}


export function celestialLoop() {
  celestialT += 1 / 60;
  const W = window.innerWidth, H = window.innerHeight;
  const sunSize  = Math.min(W, H) * SUN_SIZE;
  const moonSize = Math.min(W, H) * MOON_SIZE;
  const margin   = Math.min(W, H) * 0.15;      // 进出屏幕的余量，保证天体完全滑出

  let nightA = 0;
  if (celestialPhase === 'sun') {
    const dur = SUN_DURATION;
    if (celestialT >= dur) { celestialT -= dur; celestialPhase = 'moon'; nightA = DARK; }   // 太阳出屏幕 → 直接进月亮（带出末态 0.5，避免切换帧 nightA 回落 0 闪一亮）
    else {
      const p = celestialT / dur;
      const pos = arcPos(p, W, H, margin);
      // 太阳始终满亮，随弧线直接滑出屏幕（不渐变退场）；末尾 FADE_FRAC 段只让天空渐暗
      const fp = Math.max(0, (p - (1 - FADE_FRAC)) / FADE_FRAC);   // 0→1
      placeBody(sunEl, pos.x, pos.y, sunSize, 1, false);
      if (moonEl) moonEl.style.opacity = 0;
      nightA = DARK * fp;                                          // 太阳将尽 → 夜色渐浓
    }
  } else {  // moon
    const dur = MOON_DURATION;
    if (celestialT >= dur) { celestialT -= dur; celestialPhase = 'sun'; nightA = 0; }   // 月亮出屏幕 → 直接进太阳（带出末态 0，避免切换帧 nightA 回落闪）
    else {
      const p = celestialT / dur;
      const pos = arcPos(p, W, H, margin);
      // 月亮始终满亮，随弧线直接滑出屏幕（不渐变退场）；末尾 FADE_FRAC 段只让天空渐亮
      const fp = Math.max(0, (p - (1 - FADE_FRAC)) / FADE_FRAC);   // 0→1
      placeBody(moonEl, pos.x, pos.y, moonSize, 1, true);
      if (sunEl) sunEl.style.opacity = 0;
      nightA = DARK * (1 - fp);                                    // 月亮将尽 → 天色渐亮
    }
  }
  if (nightOverlay) nightOverlay.style.opacity = nightA;
  celestialRaf = requestAnimationFrame(celestialLoop);
}



// ---- auto-generated setters for cross-module shared state ----
export function set_bgCache(v){ bgCache = v; }
export function set_rainImg(v){ rainImg = v; }
export function set_rainDrops(v){ rainDrops = v; }
export function set_rainOn(v){ rainOn = v; }
export function set_rainFrameW(v){ rainFrameW = v; }
export function set_rainFrameH(v){ rainFrameH = v; }
export function set_clouds(v){ clouds = v; }
export function set_cloudImages(v){ cloudImages = v; }
export function set_cloudKeys(v){ cloudKeys = v; }
export function set_cloudCooldowns(v){ cloudCooldowns = v; }
export function set_nextCloudTime(v){ nextCloudTime = v; }
export function set_lightningBolts(v){ lightningBolts = v; }
export function set_lightningIntensity(v){ lightningIntensity = v; }
export function set_lightningFlashImg(v){ lightningFlashImg = v; }
export function set_lightningBoltImg(v){ lightningBoltImg = v; }
export function set_sunEl(v){ sunEl = v; }
export function set_moonEl(v){ moonEl = v; }
export function set_nightOverlay(v){ nightOverlay = v; }
export function set_celestialPhase(v){ celestialPhase = v; }
export function set_celestialT(v){ celestialT = v; }
export function set_celestialMoonIdx(v){ celestialMoonIdx = v; }
export function set_celestialRaf(v){ celestialRaf = v; }
export function set_moonFrame(v){ moonFrame = v; }
