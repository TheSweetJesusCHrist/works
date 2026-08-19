// ===== core/DogSkyV3.js =====
// 直接移植 dog_battle_background_v3.html 的完整 DoG 天空渲染器（CalamityModPublic 1.4.4 WebGL2 逐字移植）。
// 自管 WebGL2 canvas + 3 个 FBO，输出整屏 DoG 天空：L1 风 / L2 雾 / L3 光环 / L4 碎玻璃 / L5 裂隙 + 屏幕染色，
// 另含原版前景扭曲层（DoGVisualsManager.DrawDistortionForeground：品红+青色风纹云）。
// 用法：
//   const v3 = new DogSkyV3();
//   v3.setTextures({ Neurons2: img, ..., CrackedGlass: img });  // 用游戏已加载的贴图（HTMLImageElement）
//   v3.resize(W, H);
//   v3.render({ goal:[r,g,b](0-1), intensity:0-1 });
//   ctx.drawImage(v3.getCanvas(), 0, 0, W, H);

const C = {
  Fuchsia:    [1.0, 0.0, 1.0],
  LightBlue:  [0.0, 221/255, 250/255],
  Twilight:   [147/255, 24/255, 204/255],
  DarkGray:   [105/255, 105/255, 105/255],
  Black:      [0.0, 0.0, 0.0],
  White:      [1.0, 1.0, 1.0],
};
// 背景底色：接近黑的深蓝（≈RGB(5,11,26)），压低环境亮度让 Additive 彩色层更跳、更亮
const SCENE_BASE = [3/255, 7/255, 18/255];  // 接近纯黑的深蓝（比 RGB(5,11,26) 更暗），靠对比度提亮感
// 全局曝光（提亮用，不破坏图层参数"照搬参考"）：在屏幕染色末端乘到最终色。偏暗就调大，过曝就调小。
const BRIGHTNESS_EXPOSURE = 1.0;   // 必须保持 1.0（与参考一致）；>1 会把 aura 软衰减尾(pow 负幂拖尾)放大成可见的"四角三角"
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function lerp3c(a, b, t) { return lerp3(a, b, t); }
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERT = `#version 300 es
in vec2 aPos; in vec2 aUv; out vec2 vUv;
void main(){ vUv = aUv; gl_Position = vec4(aPos,0.0,1.0); }`;

const FRAG_HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D s0; uniform sampler2D s1; uniform sampler2D s2; uniform sampler2D s3;
float InverseLerp(float from,float to,float value){ return (value-from)/(to-from); }`;

const FRAG_WIND = FRAG_HEAD + `
uniform float time, overallOpacity, distortionStrength, mainNoiseTextureScale, distortionTextureScale, erosionTextureScale, erosionMin, gradientPrecision;
uniform vec2 pixelationFactor, worldOffset;
uniform vec3 darkerPixelColor, brighterPixelColor, highlightsColor;
void main(){
  vec2 coords = vUv;
  coords = round(coords * pixelationFactor) / pixelationFactor;
  coords *= vec2(0.25, 1.25);
  coords.y += sin(coords.x * 10.0 + time) * 0.25;
  coords += worldOffset;
  vec2 distortedCoords = coords + vec2(time * -0.18, 0.0) * distortionTextureScale;
  float distortion = texture(s2, distortedCoords).r * distortionStrength;
  vec2 adjustedCoords = (coords + distortion) * mainNoiseTextureScale;
  vec4 scrollingNoise1 = texture(s0, adjustedCoords + vec2(time * -0.092, 0.0));
  vec4 scrollingNoise2 = texture(s0, adjustedCoords + vec2(time * -0.031, 0.0));
  float combinedBrightness = scrollingNoise1.r * scrollingNoise2.r;
  vec3 colorFromBrightness = mix(darkerPixelColor, brighterPixelColor, combinedBrightness);
  vec4 highlightNoise = texture(s1, adjustedCoords + vec2(time * -0.115, 0.0));
  vec4 windHighlights = highlightNoise * vec4(highlightsColor, 1.0);
  float erosionColor = texture(s3, adjustedCoords + vec2(time * -0.087, 0.0) * erosionTextureScale).r;
  float erosionMax = erosionMin + 1.0;
  float erosion = smoothstep(erosionMin, erosionMax, erosionColor);
  vec4 finalColor = (vec4(colorFromBrightness,1.0) * (scrollingNoise1 + scrollingNoise2)) + (windHighlights * 2.25);
  finalColor *= erosion;
  finalColor = round(finalColor * gradientPrecision) / gradientPrecision;
  frag = finalColor * overallOpacity;
}`;

const FRAG_FOG = FRAG_HEAD + `
uniform float time, overallOpacity, distortionStrength, mainNoiseTextureScale, distortionTextureScale, erosionTextureScale, erosionMin, gradientPrecision;
uniform vec2 pixelationFactor, worldOffset;
uniform vec3 darkerPixelColor, brighterPixelColor;
void main(){
  vec2 coords = vUv;
  coords = round(coords * pixelationFactor) / pixelationFactor;
  coords *= vec2(0.95, 1.05);
  coords += worldOffset;
  vec2 distortedCoords = coords + vec2(time * -0.03, time * -0.01) * distortionTextureScale;
  float distortion = texture(s1, distortedCoords).r * distortionStrength;
  vec2 adjustedCoords = (coords + distortion) * mainNoiseTextureScale;
  vec4 scrollingNoise1 = texture(s0, adjustedCoords + vec2(time * -0.065, 0.0));
  vec4 scrollingNoise2 = texture(s0, adjustedCoords + vec2(time * -0.015, 0.0));
  float combinedBrightness = scrollingNoise1.r * scrollingNoise2.r;
  vec3 colorFromBrightness = mix(darkerPixelColor, brighterPixelColor, combinedBrightness);
  float erosionColor = texture(s2, adjustedCoords + vec2(time * -0.07, time * -0.02) * erosionTextureScale).r;
  float erosionMax = erosionMin + 1.0;
  float erosion = smoothstep(erosionMin, erosionMax, erosionColor);
  vec4 finalColor = (vec4(colorFromBrightness,1.0) * (scrollingNoise1 + scrollingNoise2));
  finalColor *= erosion;
  finalColor = round(finalColor * gradientPrecision) / gradientPrecision;
  frag = finalColor * overallOpacity;
}`;

const FRAG_AURA = FRAG_HEAD + `
uniform float time, overallOpacity, distortionStrength, opacityCutoffValue, fadeoutPower, minBrightnessValue, gradientPrecision;
uniform vec2 pixelSize;
uniform vec3 brighterPixelColor;
void main(){
  vec2 coords = vUv;
  coords = round(coords * pixelSize) / pixelSize;
  vec2 centeredCoords = coords - 0.5;
  float polarAngle = atan(centeredCoords.y, centeredCoords.x) / 6.2831853;
  float distanceToCenter = length(centeredCoords);
  vec2 polarCoords = vec2(polarAngle, distanceToCenter);
  float distortion = texture(s1, polarCoords + vec2(time * 0.017, time * -0.026)).r * distortionStrength;
  vec2 baseCoords = coords * distortion;
  baseCoords *= 0.4;
  vec4 color = texture(s0, baseCoords);
  float brightness = (color.r + color.g + color.b) / 3.0;
  float brightnessRatio = InverseLerp(minBrightnessValue, 1.0, brightness);
  vec3 colorFromBrightness = mix(vec3(0.0), brighterPixelColor, brightnessRatio);
  vec4 coloredSample = color * vec4(colorFromBrightness, 1.0);
  if (-polarCoords.y < opacityCutoffValue) {
      float pf = (-polarCoords.y) / (polarCoords.y - opacityCutoffValue);
      if (pf > 0.0) coloredSample *= pow(pf, -fadeoutPower);
  }
  // ★ 超出 cutoff 半径（原版 pf<0 分支整段漏衰减）：本应逐出却保留全亮 → 四角三角/外沿亮边
  //   polarCoords.y 是「到中心的正距离」(0~0.707, quad 四角最大)。distance>cutoff 时 pow 衰减因
  //   pf<0 被跳过，故在此硬归零（pow 在 cutoff 处已趋 0，硬切无可见跳变；光球本体 distance<cutoff 完全不受影响）。
  if (polarCoords.y > opacityCutoffValue)
      coloredSample = vec4(0.0);
  if (gradientPrecision > 0.0)
      coloredSample = round(coloredSample * gradientPrecision) / gradientPrecision;
  frag = coloredSample * vec4(1.0) * overallOpacity;
}`;

const FRAG_CRACK = FRAG_HEAD + `
uniform float overallOpacity, opacityCutoffValue, fadeoutPower, minBrightnessValue, gradientPrecision;
uniform vec3 brighterPixelColor, darkerPixelColor;
void main(){
  vec2 coords = vUv;
  vec2 centeredCoords = coords - 0.5;
  float polarAngle = atan(centeredCoords.y, centeredCoords.x) / 6.2831853;
  float distanceToCenter = length(centeredCoords);
  vec2 polarCoords = vec2(polarAngle, distanceToCenter);
  vec4 color = texture(s0, coords);
  float brightness = (color.r + color.g + color.b) / 3.0;
  float brightnessRatio = InverseLerp(minBrightnessValue, 1.0, brightness);
  vec3 colorFromBrightness = mix(darkerPixelColor, brighterPixelColor, brightnessRatio);
  vec4 coloredSample = color * vec4(colorFromBrightness, 1.0);
  // ★ 回退到最初移植版本（2026-08-17 用户要求"改成原来的样子"）：恢复原版 pow(pf,-fadeoutPower) 衰减
  if (-polarCoords.y < opacityCutoffValue) {
      float pf = (-polarCoords.y) / (polarCoords.y - opacityCutoffValue);
      if (pf > 0.0) coloredSample *= pow(pf, -fadeoutPower);
  }
  // ★ 中心限幅（用户要求去掉中间曝光但不消失）：pow 在 d→0 时 →∞ 把中心乘到 ~31（爆白）
  //   用距离做软上限：中心(0)上限=2.5（明显亮块、不刺眼），外圈(cutoff*0.5)上限=5.0（基本不限）
  float centerCap = mix(2.5, 5.0, clamp(distanceToCenter / max(opacityCutoffValue * 0.5, 1e-3), 0.0, 1.0));
  coloredSample = min(coloredSample, vec4(centerCap));
  frag = coloredSample * vec4(1.0) * overallOpacity;
}`;

const FRAG_METABALL = FRAG_HEAD + `
uniform vec2 screenSize, layerSize, layerOffset, singleFrameScreenOffset;
uniform vec4 edgeColor, layerColor;
vec2 convertToScreenCoords(vec2 c){ return c * screenSize; }
vec2 convertFromScreenCoords(vec2 c){ return c / screenSize; }
void main(){
  vec4 baseColor = texture(s0, vUv);
  float alphaOffset = (baseColor.a > 0.0) ? 0.0 : 1.0;
  float left   = texture(s0, convertFromScreenCoords(convertToScreenCoords(vUv) + vec2(-2.0,0.0))).a + alphaOffset;
  float right  = texture(s0, convertFromScreenCoords(convertToScreenCoords(vUv) + vec2( 2.0,0.0))).a + alphaOffset;
  float top    = texture(s0, convertFromScreenCoords(convertToScreenCoords(vUv) + vec2(0.0,-2.0))).a + alphaOffset;
  float bottom = texture(s0, convertFromScreenCoords(convertToScreenCoords(vUv) + vec2(0.0, 2.0))).a + alphaOffset;
  float leftHasNoAlpha   = step(left,   0.0);
  float rightHasNoAlpha  = step(right,  0.0);
  float topHasNoAlpha    = step(top,    0.0);
  float bottomHasNoAlpha = step(bottom, 0.0);
  float conditionOpacityFactor = 1.0 - clamp(leftHasNoAlpha + rightHasNoAlpha + topHasNoAlpha + bottomHasNoAlpha, 0.0, 1.0);
  vec4 layerCalcedColor = texture(s1, (vUv + layerOffset + singleFrameScreenOffset) * screenSize / layerSize);
  vec4 defaultColor = layerCalcedColor * texture(s0, vUv) * vec4(1.0) * layerColor;
  frag = (defaultColor * conditionOpacityFactor) + (edgeColor * vec4(1.0) * (1.0 - conditionOpacityFactor));
}`;

// ★ L5 裂隙纹理着色器（用户自定义贴图：黑色裂隙本体 + 青色发光边缘 + 渐变透明光晕）
// 边缘色由 DoGSkyColor 驱动：攻击态→品红、被动态→青蓝、激光墙→暮紫
// v7（2026-08-17）：空洞内部闪电/云完全忠实复刻原版——
//   致命修正：删掉 v6 里"凭感觉写的 GLSL hash11 脉冲"，改直接接收 JS 状态机 _updateFlicker() 每帧产出的
//   bgLightningFill（原版 BackgroundLightningTimer 行为：1/200 概率触发、整段 [minFill,max] 抖动、0.05 衰减）。
//   云部分与 _renderContents() 的 DoGBackgroundFogShader 移植逐参数一致（distortion 0.24 / scale 2.0 /
//   erosion 0.26 / erosionMin 0.06 / gradientPrecision 20 / pixelation = screenSize*0.5）。
// ★ L5 裂隙纹理着色器（复刻原版 FRAG_METABALL 的"窗口透出"思路）
// 原版做法（DoGSky FRAG_METABALL）：在全屏 quad 上运行，s1=fboCont（全屏动画层：闪电背景+滚动云）
// 直接用全屏 UV 采样透出，只有形状边缘用 edgeColor 描边。本 shader 照搬该思路——
// 用 RiftTexture 当"窗口遮罩"，内部直接透出 fboCont（同一份、全屏尺度、随屏幕飘），
// 彻底消灭此前"在贴图本地 UV 里另算一份云"导致的尺度/飘动方向错误。
// v8（2026-08-17）：移除全部本地云/闪电复算，改为复用 _renderContents 每帧渲染的 fboCont。
const FRAG_RIFT_TEXTURE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D s0;        // RiftTexture（黑+青/变色边+渐变透明底）— 窗口遮罩
uniform sampler2D s1;        // fboCont — 全屏动画层（闪电背景+滚动云），_renderContents 每帧渲染
uniform vec3 edgeTint;       // DoGSkyColor — 发光边缘变色目标
uniform vec2 resolution;     // 屏幕像素尺寸 (W,H)
uniform vec2 centerPx;       // 圆盘中心（GL 坐标：y 向上，= W/2+ox, H/2-oy）
uniform vec2 sizePx;         // 圆盘显示尺寸 (sz*s)
void main(){
  // 全屏 UV → RiftTexture 本地 UV（复刻原 _spriteQuad 的居中映射，y 翻转已含在 centerPx.y）
  vec2 screenPx = vUv * resolution;
  vec2 localUv = (screenPx - centerPx) / (sizePx * 0.5) + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) discard;

  vec4 c = texture(s0, localUv);
  float a = c.a;
  if (a < 0.003) discard;

  float lum = max(max(c.r, c.g), c.b);
  // 边缘强度：0=纯黑空洞（透出动画）, 1=最亮发光边（edgeTint 描边）
  float edge = smoothstep(0.02, 0.18, lum);

  // 空洞内部：直接透出全屏动画层（已含闪电 backdrop + 滚动云，参数与 _renderContents 一致）
  vec3 cont = texture(s1, vUv).rgb;

  // 发光边缘：原始亮度驱动 glow，颜色替换为 edgeTint（★ 提亮至 2.6 让边缘在暗底上跳脱）
  vec3 glow = edgeTint * lum * 2.6;
  vec3 rgb = mix(cont, glow, edge);

  frag = vec4(rgb, a);
}`;

const FRAG_WHITE = `#version 300 es
precision highp float; in vec2 vUv; out vec4 frag;
void main(){ frag = vec4(1.0,1.0,1.0,1.0); }`;

const FRAG_TINT = `#version 300 es
precision highp float; in vec2 vUv; out vec4 frag;
uniform sampler2D s0; uniform vec3 tint; uniform float strength; uniform float exposure;
void main(){
  vec4 c = texture(s0, vUv);
  vec3 t = mix(c.rgb, c.rgb * tint, strength);
  frag = vec4(clamp(t * exposure, 0.0, 1.0), c.a);
}`;

// ★ 纯拷贝（fboPrim → 屏幕）：仅输出 RGB，alpha 归 1，避免把中间 alpha 带进画布
const FRAG_COPY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 frag;
uniform sampler2D s0;
void main(){ vec4 c = texture(s0, vUv); frag = vec4(c.rgb, 1.0); }`;

export class DogSkyV3 {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = null;
    this.ready = false;
    this.W = 0; this.H = 0;
    this.tex = {}; this.texSizes = {};
    this.DoGSkyColor = C.Fuchsia.slice();
    this.goalColor = C.Fuchsia.slice();
    this.SkyIntensity = 0;
    this.useTint = true;
    this.brightness = BRIGHTNESS_EXPOSURE;
    // 用户自调：裂隙 L3/L4/L5 偏移(像素) 与 尺寸倍率（来自 Background 的 riftOffset/riftSize）
    this._off = { l3: { x: 0, y: 0 }, l4: { x: 0, y: 0 }, l5: { x: 0, y: 0 } };
    this._sz = { l3: 1, l4: 1, l5: 1 };
    this.arms = [];
    this._rng = mulberry32(0xC0FFEE);
    this._flickerRNG = mulberry32(0xABCDEF);
    this.bgLightningFill = 0; this.bgLightningMax = 0; this.bgLightningTimer = 0;
    this.t0 = performance.now();
    this.Rand = {
      f:   () => this._rng(),
      fr:  (a, b) => a + this._rng() * (b - a),
      i:   (a, b) => a + Math.floor(this._rng() * (b - a)),
      b:   (p) => this._rng() < (p === undefined ? 0.5 : p),
      unit: () => { const a = this._rng() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; },
      circ: (x, y) => [this.Rand.fr(-x, x), this.Rand.fr(-y, y)],
    };
    try {
      this.gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    } catch (e) { this.gl = null; }
    if (this.gl) this._initGL();
  }

  _initGL() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[DogSkyV3] shader 编译失败:', gl.getShaderInfoLog(s));
        throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      }
      return s;
    };
    const prog = (fragSrc) => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fragSrc));
      gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUv');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    this.P = {
      wind: prog(FRAG_WIND), fog: prog(FRAG_FOG), aura: prog(FRAG_AURA),
      crack: prog(FRAG_CRACK), metaball: prog(FRAG_METABALL),
      riftTexture: prog(FRAG_RIFT_TEXTURE),
      white: prog(FRAG_WHITE), tint: prog(FRAG_TINT), copy: prog(FRAG_COPY),
    };
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    this.fboPrim = this._makeFBO(2, 2);
    this.fboCont = this._makeFBO(2, 2);
    this.fboScene = this._makeFBO(2, 2);
    this.NEAREST = gl.NEAREST; this.LINEAR = gl.LINEAR; this.REPEAT = gl.REPEAT; this.CLAMP = gl.CLAMP_TO_EDGE;
  }

  _makeFBO(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  _resizeFBO(o, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, o.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  setTextures(map) {
    if (!this.gl) return;
    const gl = this.gl;
    const names = ['Neurons2', 'SharpNoise', 'MeltyNoise', 'Pebbles', 'RealisticClouds', 'HarshNoise', 'Smudges', 'Swirls', 'CrackedGlass', 'RiftTexture'];
    let ok = true;
    for (const n of names) {
      const img = map[n];
      if (!img || !img.complete || !img.naturalWidth) { ok = false; continue; }
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.tex[n] = t; this.texSizes[n] = [img.width, img.height];
    }
    this.ready = ok;
    if (ok && this.W > 0) this.generateRift();
  }

  resize(w, h) {
    if (!this.gl) return;
    if (this.W === w && this.H === h) return;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    this._resizeFBO(this.fboPrim, w, h);
    this._resizeFBO(this.fboCont, w, h);
    this._resizeFBO(this.fboScene, w, h);
    this.generateRift();
  }

  /* ---------- uniform / 绘制辅助 ---------- */
  _setF(p, name, v) { const l = this.gl.getUniformLocation(p, name); if (l) this.gl.uniform1f(l, v); }
  _setV2(p, name, x, y) { const l = this.gl.getUniformLocation(p, name); if (l) this.gl.uniform2f(l, x, y); }
  _setV3(p, name, a) { const l = this.gl.getUniformLocation(p, name); if (l) this.gl.uniform3f(l, a[0], a[1], a[2]); }
  _setV4(p, name, a) { const l = this.gl.getUniformLocation(p, name); if (l) this.gl.uniform4f(l, a[0], a[1], a[2], a[3]); }
  _bindTex(unit, tex, filter, wrap) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    const l = gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), 's' + unit);
    if (l) gl.uniform1i(l, unit);
  }
  _setQuad(pos, uv) {
    const gl = this.gl;
    const d = new Float32Array([
      pos[0], pos[1], uv[0], uv[1], pos[2], pos[3], uv[2], uv[3],
      pos[4], pos[5], uv[4], uv[5], pos[6], pos[7], uv[6], uv[7],
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
  }
  _bindQuad() {
    const gl = this.gl;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  }
  _fsQuad() { this._setQuad([-1, -1, 1, -1, -1, 1, 1, 1], [0, 0, 1, 0, 0, 1, 1, 1]); }
  _spriteQuad(cx, cy, w, h, ang) {
    const gl = this.gl, W = this.W, H = this.H;
    const c = Math.cos(ang), s = Math.sin(ang);
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
    const ndc = corners.map(([lx, ly]) => {
      const rx = lx * c - ly * s, ry = lx * s + ly * c;
      const px = cx + rx, py = cy + ry;
      return [(px / (W * 0.5)) - 1.0, 1.0 - (py / (H * 0.5))];
    });
    this._setQuad([ndc[0][0], ndc[0][1], ndc[1][0], ndc[1][1], ndc[2][0], ndc[2][1], ndc[3][0], ndc[3][1]], [0, 0, 1, 0, 0, 1, 1, 1]);
  }
  _drawPass(p, quadFn, setup) {
    const gl = this.gl;
    gl.useProgram(p);
    quadFn();
    this._bindQuad();
    setup(p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 裂隙臂几何（照抄 GenerateRift + GenerateDistortionRiftArmPoints） ---------- */
  _genArmPoints(starting, totalPoints, minDist, maxDist, minAng, maxAng, placementAngle) {
    const R = this.Rand, points = [];
    for (let j = 0; j < totalPoints; j++) {
      if (j === 0) { points.push([starting[0], starting[1]]); }
      else if (j === 1) {
        const dist = R.fr(minDist, maxDist);
        let nx, ny;
        if (placementAngle !== null && placementAngle !== undefined) { nx = Math.cos(placementAngle); ny = Math.sin(placementAngle); }
        else { const u = R.unit(); nx = u[0]; ny = u[1]; }
        points.push([starting[0] + nx * dist, starting[1] + ny * dist]);
      } else {
        const prev = points[j - 2];
        let dist = R.fr(minDist, maxDist);
        if (j === totalPoints - 1) dist = R.fr(minDist, maxDist) * 0.5;
        const angVar = R.fr(minAng, maxAng) * j * 0.5;
        const dirx = points[j - 1][0] - prev[0], diry = points[j - 1][1] - prev[1];
        const len = Math.hypot(dirx, diry) || 1; const ux = dirx / len, uy = diry / len;
        const ca = Math.cos(angVar), sa = Math.sin(angVar);
        const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
        points.push([points[j - 1][0] + rx * dist, points[j - 1][1] + ry * dist]);
      }
    }
    return points;
  }
  generateRift() {
    const W = this.W, H = this.H;
    const R = this.Rand;
    const off = R.circ(2000, 2000);
    const riftSpawn = [W / 2 + off[0], H / 2 - 2000 + off[1]];
    const screenCenter = [W / 2, H / 2];
    const depthFactor = [1 / 30, 0.9 / 30];
    const parallax = (p) => [
      (p[0] - screenCenter[0]) * depthFactor[0] + screenCenter[0],
      (p[1] - screenCenter[1]) * depthFactor[1] + screenCenter[1],
    ];
    this.arms = [];
    for (let i = 0; i < 14; i++) {
      const maxWidth = R.fr(42, 56);
      const totalPoints = 8;
      const minDist = 100 * 30 * 0.1, maxDist = 140 * 30 * 0.1;
      const minAng = -6, maxAng = 6;
      const placementAngle = i * (Math.PI * 2) / 14;
      const wp = this._genArmPoints(riftSpawn, totalPoints, minDist, maxDist, minAng, maxAng, placementAngle);
      this.arms.push({ points: wp.map(parallax), maxWidth });
    }
    const outerN = R.i(12, 17);
    for (let i = 0; i < outerN; i++) {
      const maxWidth = R.fr(6, 9);
      const totalPoints = R.i(6, 10);
      const minDist = 400 * 30 * 0.1, maxDist = 500 * 30 * 0.1;
      const minAng = R.i(-10, -5), maxAng = R.i(5, 10);
      const placementAngle = i * (Math.PI * 2) / outerN;
      const wp = this._genArmPoints(riftSpawn, totalPoints, minDist, maxDist, minAng, maxAng, placementAngle);
      this.arms.push({ points: wp.map(parallax), maxWidth });
    }
  }
  _buildRiftGeometry() {
    const W = this.W, H = this.H, arms = this.arms;
    const TWO_PI = Math.PI * 2;
    const verts = [];
    const ox = this._off.l5.x, oy = this._off.l5.y, sc = this._sz.l5; // 用户自调：裂隙偏移 + 尺寸
    const toNDC = (p) => {
      const x = (p[0] - W / 2) * sc + W / 2 + ox;
      const y = (p[1] - H / 2) * sc + H / 2 + oy;
      return [(x / (W * 0.5)) - 1.0, 1.0 - (y / (H * 0.5))];
    };
    const pushTri = (a, b, c) => { const A = toNDC(a), B = toNDC(b), Cc = toNDC(c); verts.push(A[0], A[1], B[0], B[1], Cc[0], Cc[1]); };
    for (const arm of arms) {
      const pts = arm.points, n = pts.length;
      const half = (idx) => 0.5 * (arm.maxWidth * Math.pow(1 - idx / (n - 1), 1.6)) * this.SkyIntensity;
      for (let i = 0; i < n - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const ha = half(i), hb = half(i + 1);
        let dx = B[0] - A[0], dy = B[1] - A[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const nx = -dy, ny = dx;
        const A1 = [A[0] + nx * ha, A[1] + ny * ha], A2 = [A[0] - nx * ha, A[1] - ny * ha];
        const B1 = [B[0] + nx * hb, B[1] + ny * hb], B2 = [B[0] - nx * hb, B[1] - ny * hb];
        pushTri(A1, A2, B2); pushTri(A1, B2, B1);
        const disc = (c, r) => { const seg = 10; let prev = null; for (let k = 0; k <= seg; k++) { const a = k / seg * TWO_PI; const p = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; if (prev) pushTri(c, prev, p); prev = p; } };
        disc(A, ha); disc(B, hb);
      }
    }
    return new Float32Array(verts);
  }

  _updateFlicker() {
    const R = this._flickerRNG;
    if (R() < (1 / 200) && this.SkyIntensity > 0 && this.bgLightningTimer <= 0) {
      this.bgLightningTimer = (R() < 0.1) ? R() * (45 - 30) + 30 : R() * (20 - 5) + 5;
      this.bgLightningMax = R() * (0.9 - 0.7) + 0.7;
    }
    if (this.bgLightningTimer > 0) {
      const minFill = this.bgLightningMax * 0.5;
      this.bgLightningFill = R() * (this.bgLightningMax - minFill) + minFill;
      this.bgLightningTimer--;
    } else {
      if (this.bgLightningTimer < 0) this.bgLightningTimer = 0;
      this.bgLightningFill = this.bgLightningFill + (0 - this.bgLightningFill) * 0.05;
    }
  }

  /* ---------- 各层（绘制到当前绑定的 fboScene，调用方负责 blend 状态） ---------- */
  _layerWind() {
    const gl = this.gl, p = this.P.wind, t = this._t, I = this.SkyIntensity, pix = [this.W * 0.5, this.H * 0.5];
    this._drawPass(p, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.Neurons2, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.SharpNoise, this.NEAREST, this.REPEAT);
      this._bindTex(2, this.tex.MeltyNoise, this.LINEAR, this.REPEAT);
      this._bindTex(3, this.tex.Pebbles, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t);
      this._setF(pp, 'overallOpacity', I);
      this._setF(pp, 'distortionStrength', 0.3);
      this._setF(pp, 'mainNoiseTextureScale', 0.8);
      this._setF(pp, 'distortionTextureScale', 0.6);
      this._setF(pp, 'erosionTextureScale', 2.0);
      this._setF(pp, 'erosionMin', 0.38 * I);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', pix[0], pix[1]);
      this._setV2(pp, 'worldOffset', 0, 0);
      this._setV3(pp, 'darkerPixelColor', lerp3(C.DarkGray, C.Black, 0.82));
      this._setV3(pp, 'brighterPixelColor', lerp3(C.Black, this.DoGSkyColor, 0.32));
      this._setV3(pp, 'highlightsColor', this.DoGSkyColor);
    });
  }
  _layerFog() {
    const gl = this.gl, p = this.P.fog, t = this._t, I = this.SkyIntensity, pix = [this.W * 0.5, this.H * 0.5];
    this._drawPass(p, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.RealisticClouds, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.RealisticClouds, this.LINEAR, this.REPEAT);
      this._bindTex(2, this.tex.HarshNoise, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t * 3.0);
      this._setF(pp, 'overallOpacity', I * 0.25);
      this._setF(pp, 'distortionStrength', 0.12);
      this._setF(pp, 'mainNoiseTextureScale', 0.6);
      this._setF(pp, 'distortionTextureScale', 0.8);
      this._setF(pp, 'erosionTextureScale', 0.26);
      this._setF(pp, 'erosionMin', 0.06 * I);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', pix[0], pix[1]);
      this._setV2(pp, 'worldOffset', 0, 0);
      this._setV3(pp, 'darkerPixelColor', lerp3(C.Black, C.DarkGray, 0.75));
      this._setV3(pp, 'brighterPixelColor', lerp3(C.DarkGray, this.DoGSkyColor, 0.8));
    });
  }
  _layerAura() {
    const gl = this.gl, p = this.P.aura, t = this._t, sz = this.texSizes.Smudges || [512, 512];
    const o = this._off.l3, s = this._sz.l3;
    this._drawPass(p, () => this._spriteQuad(this.W / 2 + o.x, this.H / 2 + o.y, sz[0] * s, sz[1] * s, t * (Math.PI * 2) / 270), (pp) => {
      this._bindTex(0, this.tex.Smudges, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.Swirls, this.NEAREST, this.REPEAT);
      this._setF(pp, 'time', t);
      this._setV2(pp, 'pixelSize', this.W * 0.5, this.H * 0.5);
      this._setF(pp, 'distortionStrength', 0.78);
      this._setF(pp, 'opacityCutoffValue', 0.675 * this.SkyIntensity);
      this._setF(pp, 'fadeoutPower', 1.25);
      // ★ 发光层亮度（用户要求"发光贴图不要受黑暗影响"，故在染色背景之上提升 emit）
      //   注：additive 混合下有效增益 ∝ overallOpacity²，0.6→1.0 约 2.8× 更亮
      this._setF(pp, 'overallOpacity', 1.0);
      this._setF(pp, 'minBrightnessValue', 0.0);
      this._setV3(pp, 'brighterPixelColor', this.DoGSkyColor);
      this._setF(pp, 'gradientPrecision', 8.0);
    });
  }
  _layerCrack() {
    const gl = this.gl, p = this.P.crack, sz = this.texSizes.CrackedGlass || [960, 640];
    const scales = [1.55 * 0.95, 1.55 * 1.05, 1.55 * 1.0];
    const o = this._off.l4, s = this._sz.l4;
    for (let i = 0; i < 3; i++) {
      this._drawPass(p, () => this._spriteQuad(this.W / 2 + o.x, this.H / 2 + o.y, sz[0] * scales[i] * s, sz[1] * scales[i] * s, i * (Math.PI * 2) / 3), (pp) => {
        this._bindTex(0, this.tex.CrackedGlass, this.NEAREST, this.REPEAT);
        this._setF(pp, 'opacityCutoffValue', 0.8 * this.SkyIntensity);
        this._setF(pp, 'fadeoutPower', 1.0);
        // ★ 发光层亮度：原版 0.1015 在暗底上几乎不可见，用户要求"发光不受黑暗影响" → 提到 0.22
        //   （仍远低于此前"铺满全屏"的 0.5，不会重新糊满屏；3 层 additive 叠加）
        this._setF(pp, 'overallOpacity', 0.22);   // 提亮碎玻璃裂纹
        this._setF(pp, 'minBrightnessValue', 0.6);
        this._setV3(pp, 'darkerPixelColor', this.DoGSkyColor);
        this._setV3(pp, 'brighterPixelColor', C.White);
      });
    }
  }
  // ★ L5 裂隙（用户自定义纹理：黑色本体 + DoGSkyColor 变色边缘）
  // 替代原版程序化 MetaballEdge 裂隙（generateRift + _buildRiftGeometry + FRAG_METABALL）
  // ★ L5 裂隙（用户自定义纹理：黑色本体 + DoGSkyColor 变色边缘）
  // 替代原版程序化 MetaballEdge 裂隙（generateRift + _buildRiftGeometry + FRAG_METABALL）
  // 复刻原版 FRAG_METABALL 思路：全屏 quad，RiftTexture 当窗口遮罩，内部直接透出全屏 fboCont 动画层。
  _layerRiftTexture() {
    const gl = this.gl, p = this.P.riftTexture;
    const sz = this.texSizes.RiftTexture || [512, 512];
    const o = this._off.l5, s = this._sz.l5;
    // ★ 2026-08-18 spiky_ball_v9e 贴图 2200×2200（之前 ring 版约 800×800），
    //   原 1.0× 默认 size 会让裂隙溢出屏幕。按 0.4× 内部缩放保持裂隙在屏幕宽度内，
    //   用户的 ?rift5s= 自定义倍率不受影响（叠加在 s 上）。
    const RIFT_SIZE_SCALE = 0.4;
    const sizePx = [sz[0] * s * RIFT_SIZE_SCALE, sz[1] * s * RIFT_SIZE_SCALE];
    const centerPx = [this.W / 2 + o.x, this.H / 2 - o.y];   // y 翻转：GL 坐标 y 向上
    // 全屏 quad：vUv=全屏 UV，与 fboCont 采样坐标一致；圆盘映射在 shader 内用 localUv 反算
    this._drawPass(p, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.RiftTexture, this.LINEAR, this.CLAMP);
      this._bindTex(1, this.fboCont.tex, this.LINEAR, this.CLAMP);
      this._setV3(pp, 'edgeTint', this.DoGSkyColor);
      this._setV2(pp, 'resolution', this.W, this.H);
      this._setV2(pp, 'centerPx', centerPx[0], centerPx[1]);
      this._setV2(pp, 'sizePx', sizePx[0], sizePx[1]);
    });
  }
  // 前景扭曲层（DoGVisualsManager.DrawDistortionForeground）：原版黑底 = 无扭曲(透明)，故省略黑底，直接叠加彩色风纹云
  _layerForeground() {
    const gl = this.gl, t = this._t, pix = [this.W * 0.5, this.H * 0.5];
    // ① 滚动云（AlphaBlend）：darker=lerp(Black,Cyan,0.25) brighter=lerp(Black,Fuchsia,0.25)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._drawPass(this.P.fog, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.RealisticClouds, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.RealisticClouds, this.LINEAR, this.REPEAT);
      this._bindTex(2, this.tex.HarshNoise, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t * 2.0);
      this._setF(pp, 'overallOpacity', 1.0);
      this._setF(pp, 'distortionStrength', 0.12);
      this._setF(pp, 'mainNoiseTextureScale', 1.0);
      this._setF(pp, 'distortionTextureScale', 0.8);
      this._setF(pp, 'erosionTextureScale', 0.26);
      this._setF(pp, 'erosionMin', 0.06);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', pix[0], pix[1]);
      this._setV2(pp, 'worldOffset', 0, 0);
      this._setV3(pp, 'darkerPixelColor', lerp3(C.Black, C.LightBlue, 0.25));
      this._setV3(pp, 'brighterPixelColor', lerp3(C.Black, C.Fuchsia, 0.25));
    });
    // ② 风纹（Additive）：Fuchsia 高光 + Cyan 高光 两段
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this._drawPass(this.P.wind, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.Neurons2, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.SharpNoise, this.NEAREST, this.REPEAT);
      this._bindTex(2, this.tex.MeltyNoise, this.LINEAR, this.REPEAT);
      this._bindTex(3, this.tex.Pebbles, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t * 1.075);
      this._setF(pp, 'overallOpacity', 0.8);
      this._setF(pp, 'distortionStrength', 0.3);
      this._setF(pp, 'mainNoiseTextureScale', 1.6);
      this._setF(pp, 'distortionTextureScale', 1.76);
      this._setF(pp, 'erosionTextureScale', 2.0);
      this._setF(pp, 'erosionMin', 0.5);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', pix[0], pix[1]);
      this._setV2(pp, 'worldOffset', 0, 0);
      this._setV3(pp, 'darkerPixelColor', lerp3(C.DarkGray, C.Black, 0.64));
      this._setV3(pp, 'brighterPixelColor', lerp3(C.DarkGray, C.Black, 0.32));
      this._setV3(pp, 'highlightsColor', C.Fuchsia);
    });
    this._drawPass(this.P.wind, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.Neurons2, this.NEAREST, this.REPEAT);
      this._bindTex(1, this.tex.SharpNoise, this.NEAREST, this.REPEAT);
      this._bindTex(2, this.tex.MeltyNoise, this.LINEAR, this.REPEAT);
      this._bindTex(3, this.tex.Pebbles, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t * 0.8);
      this._setF(pp, 'overallOpacity', 0.7);
      this._setF(pp, 'distortionStrength', 0.6);
      this._setF(pp, 'mainNoiseTextureScale', 1.24);
      this._setF(pp, 'distortionTextureScale', 0.46);
      this._setF(pp, 'erosionTextureScale', 3.0);
      this._setF(pp, 'erosionMin', 0.75);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', pix[0], pix[1]);
      this._setV2(pp, 'worldOffset', 0, 0);
      this._setV3(pp, 'darkerPixelColor', lerp3(C.DarkGray, C.Black, 0.64));
      this._setV3(pp, 'brighterPixelColor', lerp3(C.DarkGray, C.Black, 0.32));
      this._setV3(pp, 'highlightsColor', C.LightBlue);
    });
  }

  _renderPrimitive() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrim.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const geo = this._buildRiftGeometry();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW);
    gl.useProgram(this.P.white);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, geo.length / 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  _renderContents() {
    const gl = this.gl, t = this._t, I = this.SkyIntensity;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboCont.fb);
    gl.viewport(0, 0, this.W, this.H);
    const backdrop = lerp3(lerp3(C.Black, C.White, this.bgLightningFill), this.DoGSkyColor, 0.25);
    gl.clearColor(backdrop[0], backdrop[1], backdrop[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // 滚动云（DrawDistortionClouds_Background）
    this._drawPass(this.P.fog, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.tex.RealisticClouds, this.LINEAR, this.REPEAT);
      this._bindTex(1, this.tex.Neurons2, this.LINEAR, this.REPEAT);
      this._bindTex(2, this.tex.HarshNoise, this.LINEAR, this.REPEAT);
      this._setF(pp, 'time', t);
      this._setF(pp, 'overallOpacity', 1.0);
      this._setF(pp, 'distortionStrength', 0.24);
      this._setF(pp, 'mainNoiseTextureScale', 2.0);
      this._setF(pp, 'distortionTextureScale', 0.8);
      this._setF(pp, 'erosionTextureScale', 0.26);
      this._setF(pp, 'erosionMin', 0.06);
      this._setF(pp, 'gradientPrecision', 20.0);
      this._setV2(pp, 'pixelationFactor', this.W * 0.5, this.H * 0.5);
      this._setV2(pp, 'worldOffset', 0, 0);
      const dark = lerp3(lerp3(C.Black, C.DarkGray, 0.3), C.Black, this.bgLightningFill * 0.8);
      const br = lerp3(lerp3(C.Black, this.DoGSkyColor, 0.6), C.Black, this.bgLightningFill * 0.8);
      this._setV3(pp, 'darkerPixelColor', dark);
      this._setV3(pp, 'brighterPixelColor', br);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  _renderScene() {
    const gl = this.gl, W = this.W, H = this.H;
    // ① 背景层（L1 风 + L2 雾）画到 fboScene
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(SCENE_BASE[0], SCENE_BASE[1], SCENE_BASE[2], 1.0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._layerWind();
    this._layerFog();
    // ② 整屏染色：★ 仅作用于背景层（读 fboScene → 写 fboPrim），护住后续发光层不被吃暗
    //    （原版 DoGScreenShaderData 是末端整屏乘色，会把 L3/L4/L5 发光贴图一起压暗；此处改为先染色背景，
    //     发光层在染色之后再叠加，保持 emit 亮度）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrim.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    this._drawPass(this.P.tint, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.fboScene.tex, this.LINEAR, this.CLAMP);
      this._setV3(pp, 'tint', this.DoGSkyColor);
      this._setF(pp, 'strength', this.useTint ? Math.min(1.0, this.SkyIntensity) * 0.9 : 0.0);
      this._setF(pp, 'exposure', this.brightness);
    });
    // ③ 发光层叠加到 fboPrim（已染色背景），不再被染色吃掉
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPrim.fb);
    gl.viewport(0, 0, W, H);
    // L3 光环（Additive）
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this._layerAura();
    // L4 碎玻璃（Additive）
    this._layerCrack();
    // L5 裂隙纹理（AlphaBlend）— 用户自定义贴图 + DoGSkyColor 变色边缘
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._layerRiftTexture();
    // 注意：原版 DoGVisualsManager.DrawDistortionForeground（前景扭曲层）在原版是画在【玩家层之前】的
    // 独立前景叠层（先铺不透明黑底 + 暗紫云，再叠 additive 风纹），本身是“压暗”效果，且仅攻击瞬间触发。
    // 参考 v3.html 的背景 renderScene 只画 L1–L5，并不含该前景层。若把它塞进背景场景，会用
    // overallOpacity=1 的 AlphaBlend 暗紫云把整屏亮背景直接替换成暗雾 → 整屏发暗。
    // 因此严格照搬参考：前景层不进背景场景（仅在 ?dogdebug=1&grid=1 的第六格单独查看）。
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  _renderToCanvas() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.disable(gl.BLEND);
    // ★ 最终只是把“已染色背景 + 发光层”的 fboPrim 拷贝到画布（染色已在 _renderScene 内完成，
    //   此处不再二次乘色，避免发光层被重复吃暗）
    this._drawPass(this.P.copy, () => this._fsQuad(), (pp) => {
      this._bindTex(0, this.fboPrim.tex, this.LINEAR, this.CLAMP);
    });
  }

  // 主渲染：goal=[r,g,b](0-1)，intensity=0-1（由游戏驱动淡入淡出）
  render(opts) {
    if (!this.gl || !this.ready || this.W === 0) return;
    opts = opts || {};
    this._t = (performance.now() - this.t0) / 1000;
    if (opts.intensity != null) this.SkyIntensity = opts.intensity;
    if (opts.goal) this.DoGSkyColor = lerp3(this.DoGSkyColor, opts.goal, 0.1);
    if (opts.offsets) this._off = opts.offsets;
    if (opts.sizes) this._sz = opts.sizes;
    this._updateFlicker();
    this._renderPrimitive();
    this._renderContents();
    this._renderScene();
    this._renderToCanvas();
  }

  getCanvas() { return this.canvas; }
}
