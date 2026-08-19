// ===== core/SkyShaders.js — DoGSky.cs 全部 5 个 HLSL shader 的 WebGL 逐行移植 =====
// 对照文件：C:/Users/28188/Desktop/xnb/ 下的 5 个 .fx + D:/edge_download/DoGSky.cs
//   ① DoGDistortionWindsShader.fx  — Layer① 扭曲风   (AlphaBlend)
//   ② DoGBackgroundFogShader.fx    — Layer② 滚动雾   (AlphaBlend)
//   ③ DoGRiftAuraShader.fx         — Layer③ 裂隙光环 (Additive，极坐标扭曲)
//   ④ DoGRealityCrackShader.fx     — Layer④ 碎玻璃   (Additive)
//   ⑤ MetaballEdgeShader.fx        — Layer⑤ 扭曲裂隙 (AlphaBlend)
// 渲染策略（与 XNA spriteBatch 层序语义一致）：
//   每层渲染到本 WebGL canvas（渲染前 clear 透明、无 blend），再 drawImage 到主 2D canvas——
//   AlphaBlend 层用 source-over、Additive 层用 'lighter'（2D 混合公式与 XNA 逐像素一致）。
// shader 输出非预乘 (rgb, alpha)；canvas premultipliedAlpha:true，浏览器读取时自动预乘。

const VS = `
attribute vec2 aPos;    // quad 局部坐标 -0.5..0.5
attribute vec2 aUV;     // 0..1
uniform vec2 uScreen;   // 屏幕像素尺寸
uniform vec2 uPos;      // quad 中心（屏幕像素）
uniform vec2 uSize;     // quad 全尺寸（像素）
uniform float uScale;   // 额外缩放
uniform float uRot;     // 旋转（弧度）
varying vec2 vUv;
void main() {
  vUv = aUV;
  float c = cos(uRot), s = sin(uRot);
  vec2 local = aPos * uSize * uScale;
  vec2 rotated = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 clip = ((uPos + rotated) / uScreen) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const ROUND = `float rnd(float x) { return floor(x + 0.5); }
vec2 rnd(vec2 x) { return floor(x + 0.5); }
vec4 rnd(vec4 x) { return floor(x + 0.5); }`;

// ① DoGDistortionWindsShader.fx 逐行翻译
const FS_WINDS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMain;        // s0 Neurons2
uniform sampler2D uHighlights;  // s1 SharpNoise
uniform sampler2D uDistortion;  // s2 MeltyNoise
uniform sampler2D uErosion;     // s3 Pebbles
uniform float uTime;
uniform float uOverallOpacity;
uniform float uDistortionStrength;
uniform float uMainScale;
uniform float uDistScale;
uniform float uErosionScale;
uniform float uErosionMin;
uniform float uGradientPrecision;
uniform vec2 uPixelation;
uniform vec2 uWorldOffset;
uniform vec3 uDarker;
uniform vec3 uBrighter;
uniform vec3 uHighlightsColor;
${ROUND}
void main() {
  vec2 coords = vUv;
  coords = rnd(coords * uPixelation) / uPixelation;
  coords *= vec2(0.25, 1.25);
  coords.y += sin(coords.x * 10.0 + uTime) * 0.25;
  coords += uWorldOffset;
  vec2 distortedCoords = coords + vec2(uTime * -0.18, 0.0) * uDistScale;
  float distortion = texture2D(uDistortion, distortedCoords).r * uDistortionStrength;
  vec2 adjustedCoords = (coords + distortion) * uMainScale;
  vec4 scrollingNoise1 = texture2D(uMain, adjustedCoords + vec2(uTime * -0.092, 0.0));
  vec4 scrollingNoise2 = texture2D(uMain, adjustedCoords + vec2(uTime * -0.031, 0.0));
  float combinedBrightness = scrollingNoise1.r * scrollingNoise2.r;
  vec3 colorFromBrightness = mix(uDarker, uBrighter, combinedBrightness);
  vec4 highlightNoise = texture2D(uHighlights, adjustedCoords + vec2(uTime * -0.115, 0.0));
  vec4 windHighlights = highlightNoise * vec4(uHighlightsColor, 1.0);
  float erosionColor = texture2D(uErosion, adjustedCoords + vec2(uTime * -0.087, 0.0) * uErosionScale).r;
  float erosion = smoothstep(uErosionMin, uErosionMin + 1.0, erosionColor);
  vec4 finalColor = (vec4(colorFromBrightness, 1.0) * (scrollingNoise1 + scrollingNoise2)) + (windHighlights * 2.25);
  finalColor *= erosion;
  finalColor = rnd(finalColor * uGradientPrecision) / uGradientPrecision;
  gl_FragColor = finalColor * uOverallOpacity;
}
`;

// ② DoGBackgroundFogShader.fx 逐行翻译
const FS_FOG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMain;        // s0 RealisticClouds
uniform sampler2D uDistortion;  // s1 MeltyNoise
uniform sampler2D uErosion;     // s2 HarshNoise
uniform float uTime;
uniform float uOverallOpacity;
uniform float uDistortionStrength;
uniform float uMainScale;
uniform float uDistScale;
uniform float uErosionScale;
uniform float uErosionMin;
uniform float uGradientPrecision;
uniform vec2 uPixelation;
uniform vec2 uWorldOffset;
uniform vec3 uDarker;
uniform vec3 uBrighter;
${ROUND}
void main() {
  vec2 coords = vUv;
  coords = rnd(coords * uPixelation) / uPixelation;
  coords *= vec2(0.95, 1.05);
  coords += uWorldOffset;
  vec2 distortedCoords = coords + vec2(uTime * -0.03, uTime * -0.01) * uDistScale;
  float distortion = texture2D(uDistortion, distortedCoords).r * uDistortionStrength;
  vec2 adjustedCoords = (coords + distortion) * uMainScale;
  vec4 scrollingNoise1 = texture2D(uMain, adjustedCoords + vec2(uTime * -0.065, 0.0));
  vec4 scrollingNoise2 = texture2D(uMain, adjustedCoords + vec2(uTime * -0.015, 0.0));
  float combinedBrightness = scrollingNoise1.r * scrollingNoise2.r;
  vec3 colorFromBrightness = mix(uDarker, uBrighter, combinedBrightness);
  float erosionColor = texture2D(uErosion, adjustedCoords + vec2(uTime * -0.07, uTime * -0.02) * uErosionScale).r;
  float erosion = smoothstep(uErosionMin, uErosionMin + 1.0, erosionColor);
  vec4 finalColor = vec4(colorFromBrightness, 1.0) * (scrollingNoise1 + scrollingNoise2);
  finalColor *= erosion;
  finalColor = rnd(finalColor * uGradientPrecision) / uGradientPrecision;
  gl_FragColor = finalColor * uOverallOpacity;
}
`;

// ③ DoGRiftAuraShader.fx 逐行翻译（极坐标扭曲）
const FS_RIFT_AURA = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;        // s0 Smudges
uniform sampler2D uDistortion;  // s1 Swirls
uniform float uTime;
uniform float uOverallOpacity;
uniform float uDistortionStrength;
uniform float uCutoff;
uniform float uFadeout;
uniform float uMinBrightness;
uniform float uGradientPrecision;
uniform vec2 uPixelSize;
uniform vec3 uBrighter;
${ROUND}
float invLerp(float a, float b, float v) { return (v - a) / (b - a); }
void main() {
  vec2 coords = vUv;
  coords = rnd(coords * uPixelSize) / uPixelSize;
  vec2 centeredCoords = coords - 0.5;
  float polarAngle = atan(centeredCoords.y, centeredCoords.x) / 6.28318;
  float distanceToCenter = length(centeredCoords);
  vec2 polarCoords = vec2(polarAngle, distanceToCenter);
  float distortion = texture2D(uDistortion, polarCoords + vec2(uTime * 0.017, uTime * -0.026)).r * uDistortionStrength;
  vec2 baseCoords = coords * distortion;
  baseCoords *= 0.4;
  vec4 color = texture2D(uBase, baseCoords);
  float brightness = (color.r + color.g + color.b) / 3.0;
  float brightnessRatio = invLerp(uMinBrightness, 1.0, brightness);
  vec3 colorFromBrightness = mix(vec3(0.0, 0.0, 0.0), uBrighter, brightnessRatio);
  vec4 coloredSample = color * vec4(colorFromBrightness, 1.0);
  if (-polarCoords.y < uCutoff)
    coloredSample.rgba *= pow(-polarCoords.y / (polarCoords.y - uCutoff), -uFadeout);
  if (uGradientPrecision > 0.0)
    coloredSample = rnd(coloredSample * uGradientPrecision) / uGradientPrecision;
  gl_FragColor = coloredSample * uOverallOpacity;
}
`;

// ④ DoGRealityCrackShader.fx 逐行翻译
const FS_REALITY_CRACK = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;        // s0 CrackedGlass_Glowing
uniform float uOverallOpacity;
uniform float uCutoff;
uniform float uFadeout;
uniform float uMinBrightness;
uniform vec3 uBrighter;
uniform vec3 uDarker;
float invLerp(float a, float b, float v) { return (v - a) / (b - a); }
void main() {
  vec2 coords = vUv;
  vec2 centeredCoords = coords - 0.5;
  float polarAngle = atan(centeredCoords.y, centeredCoords.x) / 6.28318;
  float distanceToCenter = length(centeredCoords);
  vec2 polarCoords = vec2(polarAngle, distanceToCenter);
  vec4 color = texture2D(uBase, coords);
  float brightness = (color.r + color.g + color.b) / 3.0;
  float brightnessRatio = invLerp(uMinBrightness, 1.0, brightness);
  vec3 colorFromBrightness = mix(uDarker, uBrighter, brightnessRatio);
  vec4 coloredSample = color * vec4(colorFromBrightness, 1.0);
  // ★ 2026-08-15 ★ HLSL/GLSL pow(0, 负) 行为差异：
  //   fx 原文 pow(-polarCoords.y / (polarCoords.y - uCutoff), -uFadeout)——中心(d=0)时 base=0：
  //     HLSL pow(0, 负) = +inf → 原版中心像素爆亮（光球中心亮，包裹裂口）
  //     GLSL pow(0, 负) = undefined（Chrome 返回 0）→ 中心被 ×0 熄灭 = "光球空心"，看起来光球不在裂口处
  //   显式模拟 HLSL：base<=0 且 ==0（中心）→ inf；base<0（cutoff 外）→ 0；base>0 → 正常 pow
  if (-polarCoords.y < uCutoff) {
    float fadeBase = -polarCoords.y / (polarCoords.y - uCutoff);
    float fade;
    if (fadeBase <= 0.0) {
      fade = (fadeBase == 0.0) ? 10000.0 : 0.0;
    } else {
      fade = pow(fadeBase, -uFadeout);
    }
    coloredSample.rgba *= min(fade, 10000.0);
  }
  gl_FragColor = coloredSample * uOverallOpacity;
}
`;

// ⑤ MetaballEdgeShader.fx 逐行翻译
const FS_METABALL = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMetaball;   // s0 白色臂网（PointClamp）
uniform sampler2D uOverlay;    // s1 另一个世界内容（LinearWrap）
uniform vec2 uScreenSize;
uniform vec2 uLayerSize;       // ★ fx: overlay 采样坐标 = (coords + layerOffset + singleFrameScreenOffset) * screenSize / layerSize
uniform vec3 uEdgeColor;
uniform vec3 uLayerColor;
void main() {
  vec2 coords = vUv;
  vec4 baseColor = texture2D(uMetaball, coords);
  // ★ 2026-08-15 晚 对照 fx 修正：HLSL any(baseColor.a) = (a != 0) 布尔，任何非零 alpha 都算"有内容"。
  //   之前用 step(0.001, a) 会把 0<a<0.001 的残影当透明 → alphaOffset 误加 → 边缘判定错乱。
  float alphaOffset = (baseColor.a > 0.0) ? 0.0 : 1.0;
  vec2 px = 2.0 / uScreenSize;
  float left   = texture2D(uMetaball, coords + vec2(-px.x, 0.0)).a + alphaOffset;
  float right  = texture2D(uMetaball, coords + vec2(px.x, 0.0)).a + alphaOffset;
  float top    = texture2D(uMetaball, coords + vec2(0.0, -px.y)).a + alphaOffset;
  float bottom = texture2D(uMetaball, coords + vec2(0.0, px.y)).a + alphaOffset;
  float leftHasNoAlpha   = step(left, 0.0);
  float rightHasNoAlpha  = step(right, 0.0);
  float topHasNoAlpha    = step(top, 0.0);
  float bottomHasNoAlpha = step(bottom, 0.0);
  float conditionOpacityFactor = 1.0 - clamp(leftHasNoAlpha + rightHasNoAlpha + topHasNoAlpha + bottomHasNoAlpha, 0.0, 1.0);
  // ★ fx: layerCalcedColor = tex2D(overlayTexture, (coords + layerOffset + singleFrameScreenOffset) * screenSize / layerSize)
  vec4 layerCalcedColor = texture2D(uOverlay, coords * (uScreenSize / uLayerSize));
  vec4 defaultColor = layerCalcedColor * baseColor * vec4(uLayerColor, 1.0);
  vec4 edge = vec4(uEdgeColor, 1.0);
  vec4 outC = defaultColor * conditionOpacityFactor + edge * (1.0 - conditionOpacityFactor);
  gl_FragColor = vec4(outC.rgb * outC.a, outC.a);
}
`;

const NEAREST = 0x2600, LINEAR = 0x2601, REPEAT = 0x2901, CLAMP = 0x812F;

export class SkyShaders {
  constructor() {
    this.gl = null;
    this.canvas = null;
    this._progs = {};
    this._texCache = {};
    this._texCvCache = new WeakMap();
    this._uCache = {};
    this.ready = false;
  }

  init(w, h) {
    if (this.gl) { this._resize(w, h); return true; }
    let cv = null, gl = null;
    try {
      cv = document.createElement('canvas');
      const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true };
      // ★ 2026-08-17 初始化强化：优先 webgl2（更稳的驱动），回退 webgl1 → experimental-webgl。
      //   GLSL 用 1.00 语法，webgl2 上下文仍兼容（默认 #version 100），无需改 shader 源码。
      gl = cv.getContext('webgl2', opts) || cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    } catch (e) { /* 下统一处理 */ }
    if (!gl) { console.warn('[SkyShaders] WebGL 不可用，背景回退 Canvas 近似'); return false; }
    this.gl = gl;
    this.canvas = cv;
    cv.width = w; cv.height = h;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    const shaders = { winds: FS_WINDS, fog: FS_FOG, aura: FS_RIFT_AURA, crack: FS_REALITY_CRACK, rift: FS_METABALL };
    for (const k in shaders) {
      if (!this._build(k, shaders[k])) return false;
    }

    // quad buffer：aPos(-0.5..0.5) + aUV(0..1)，triangle strip
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5, 0, 0,   0.5, -0.5, 1, 0,
      -0.5, 0.5, 0, 1,    0.5, 0.5, 1, 1,
    ]), gl.STATIC_DRAW);
    this._quadBuf = buf;
    this.ready = true;
    return true;
  }

  _resize(w, h) {
    if (this.canvas && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  _build(name, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[SkyShaders] ' + name + ' compile:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[SkyShaders] ' + name + ' link:', gl.getProgramInfoLog(prog));
      return false;
    }
    this._progs[name] = prog;
    return true;
  }

  _u(name, key) {
    const p = this._progs[name];
    let m = this._uCache[name];
    if (!m) { m = {}; this._uCache[name] = m; }
    if (m[key] === undefined) m[key] = this.gl.getUniformLocation(p, key);
    return m[key];
  }

  /** 颜色 uniform（输入 0-255 → 转 0-1，对应 fx 的 Color.ToVector3/ToVector4） */
  _u3(name, key, c) {
    this.gl.uniform3f(this._u(name, key), c[0] / 255, c[1] / 255, c[2] / 255);
  }

  /** 上传 HTMLImageElement 纹理（缓存） */
  _tex(img, wrap, filter) {
    const key = img.src + '|' + wrap + '|' + filter;
    const c = this._texCache[key];
    if (c) return c;
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    this._texCache[key] = t;
    return t;
  }

  /** 上传 canvas 源（按 _stamp 判断内容变化才重新上传；canvas 无 src 不能走 _tex 缓存键）。
   *  ★ 2026-08-15 修复：必须用 WeakMap（canvas 对象为 key）——对象作普通对象 key 会 toString 成
   *    '[object HTMLCanvasElement]'，riftShape/riftOverlay 冲突导致两个 sampler 绑到同一纹理（全屏黑）。 */
  _texCanvas(cv, wrap, filter, stamp) {
    const gl = this.gl;
    let entry = this._texCvCache.get(cv);
    if (entry && entry.stamp === stamp && entry.wrap === wrap) return entry.tex;
    const t = entry ? entry.tex : gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    this._texCvCache.set(cv, { tex: t, stamp, wrap });
    return t;
  }

  /** 开始一帧：clear + 绑定 quad */
  _begin(w, h) {
    const gl = this.gl;
    this._resize(w, h);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
  }

  _drawPass(name, uPos, uSize, uScale, uRot) {
    const gl = this.gl;
    const prog = this._progs[name];
    gl.useProgram(prog);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aUV = gl.getAttribLocation(prog, 'aUV');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(this._u(name, 'uScreen'), this.canvas.width, this.canvas.height);
    gl.uniform2f(this._u(name, 'uPos'), uPos[0], uPos[1]);
    gl.uniform2f(this._u(name, 'uSize'), uSize[0], uSize[1]);
    gl.uniform1f(this._u(name, 'uScale'), uScale);
    gl.uniform1f(this._u(name, 'uRot'), uRot);
  }

  _bindImg(name, uname, img, unit, wrap, filter) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this._tex(img, wrap, filter));
    gl.uniform1i(this._u(name, uname), unit);
  }

  _bindCv(name, uname, cv, unit, wrap, filter, stamp) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this._texCanvas(cv, wrap, filter, stamp));
    gl.uniform1i(this._u(name, uname), unit);
  }

  // ==================== ① Layer① 扭曲风（DoGDistortionWindsShader.fx）====================
  // opts: { imgMain, imgHighlights, imgDistortion, imgErosion, time, I, ... } 全屏
  drawWinds(o) {
    if (!this.ready) return false;
    const gl = this.gl;
    this._begin(o.w, o.h);
    this._drawPass('winds', [o.w * 0.5, o.h * 0.5], [o.w, o.h], 1, 0);
    const name = 'winds';
    this._bindImg(name, 'uMain', o.imgMain, 0, REPEAT, NEAREST);
    this._bindImg(name, 'uHighlights', o.imgHighlights, 1, REPEAT, NEAREST);
    this._bindImg(name, 'uDistortion', o.imgDistortion, 2, REPEAT, LINEAR);
    this._bindImg(name, 'uErosion', o.imgErosion, 3, REPEAT, LINEAR);
    gl.uniform1f(this._u(name, 'uTime'), o.time);
    gl.uniform1f(this._u(name, 'uOverallOpacity'), o.overallOpacity);
    gl.uniform1f(this._u(name, 'uDistortionStrength'), o.distortionStrength);
    gl.uniform1f(this._u(name, 'uMainScale'), o.mainNoiseTextureScale);
    gl.uniform1f(this._u(name, 'uDistScale'), o.distortionTextureScale);
    gl.uniform1f(this._u(name, 'uErosionScale'), o.erosionTextureScale);
    gl.uniform1f(this._u(name, 'uErosionMin'), o.erosionMin);
    gl.uniform1f(this._u(name, 'uGradientPrecision'), o.gradientPrecision);
    gl.uniform2f(this._u(name, 'uPixelation'), o.pixelationFactor[0], o.pixelationFactor[1]);
    gl.uniform2f(this._u(name, 'uWorldOffset'), o.worldOffset[0], o.worldOffset[1]);
    this._u3(name, 'uDarker', o.darkerPixelColor);
    this._u3(name, 'uBrighter', o.brighterPixelColor);
    this._u3(name, 'uHighlightsColor', o.highlightsColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  // ==================== ② Layer② 滚动雾（DoGBackgroundFogShader.fx）====================
  drawFog(o) {
    if (!this.ready) return false;
    const gl = this.gl;
    this._begin(o.w, o.h);
    this._drawPass('fog', [o.w * 0.5, o.h * 0.5], [o.w, o.h], 1, 0);
    const name = 'fog';
    this._bindImg(name, 'uMain', o.imgMain, 0, REPEAT, NEAREST);
    this._bindImg(name, 'uDistortion', o.imgDistortion, 1, REPEAT, LINEAR);
    this._bindImg(name, 'uErosion', o.imgErosion, 2, REPEAT, LINEAR);
    gl.uniform1f(this._u(name, 'uTime'), o.time);
    gl.uniform1f(this._u(name, 'uOverallOpacity'), o.overallOpacity);
    gl.uniform1f(this._u(name, 'uDistortionStrength'), o.distortionStrength);
    gl.uniform1f(this._u(name, 'uMainScale'), o.mainNoiseTextureScale);
    gl.uniform1f(this._u(name, 'uDistScale'), o.distortionTextureScale);
    gl.uniform1f(this._u(name, 'uErosionScale'), o.erosionTextureScale);
    gl.uniform1f(this._u(name, 'uErosionMin'), o.erosionMin);
    gl.uniform1f(this._u(name, 'uGradientPrecision'), o.gradientPrecision);
    gl.uniform2f(this._u(name, 'uPixelation'), o.pixelationFactor[0], o.pixelationFactor[1]);
    gl.uniform2f(this._u(name, 'uWorldOffset'), o.worldOffset[0], o.worldOffset[1]);
    this._u3(name, 'uDarker', o.darkerPixelColor);
    this._u3(name, 'uBrighter', o.brighterPixelColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  // ==================== ③ Layer③ 裂隙光环（DoGRiftAuraShader.fx，极坐标扭曲）====================
  // 单张 Smudges quad：中心 pos（屏幕像素）、旋转 rot、scale
  drawRiftAura(o) {
    if (!this.ready) return false;
    const gl = this.gl;
    this._begin(o.w, o.h);
    this._drawPass('aura', o.pos, o.texSize, o.scale, o.rot);
    const name = 'aura';
    this._bindImg(name, 'uBase', o.imgBase, 0, REPEAT, NEAREST);
    this._bindImg(name, 'uDistortion', o.imgDistortion, 1, REPEAT, NEAREST);
    gl.uniform1f(this._u(name, 'uTime'), o.time);
    gl.uniform1f(this._u(name, 'uOverallOpacity'), o.overallOpacity);
    gl.uniform1f(this._u(name, 'uDistortionStrength'), o.distortionStrength);
    gl.uniform1f(this._u(name, 'uCutoff'), o.opacityCutoffValue);
    gl.uniform1f(this._u(name, 'uFadeout'), o.fadeoutPower);
    gl.uniform1f(this._u(name, 'uMinBrightness'), o.minBrightnessValue);
    gl.uniform1f(this._u(name, 'uGradientPrecision'), o.gradientPrecision);
    gl.uniform2f(this._u(name, 'uPixelSize'), o.pixelSize[0], o.pixelSize[1]);
    this._u3(name, 'uBrighter', o.brighterPixelColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  // ==================== ④ Layer④ 碎玻璃（DoGRealityCrackShader.fx）====================
  // 每张 CrackedGlass quad：pos/rot/scale
  drawRealityCrack(o) {
    if (!this.ready) return false;
    const gl = this.gl;
    this._begin(o.w, o.h);
    this._drawPass('crack', o.pos, o.texSize, o.scale, o.rot);
    const name = 'crack';
    this._bindImg(name, 'uBase', o.imgBase, 0, REPEAT, NEAREST);
    gl.uniform1f(this._u(name, 'uOverallOpacity'), o.overallOpacity);
    gl.uniform1f(this._u(name, 'uCutoff'), o.opacityCutoffValue);
    gl.uniform1f(this._u(name, 'uFadeout'), o.fadeoutPower);
    gl.uniform1f(this._u(name, 'uMinBrightness'), o.minBrightnessValue);
    this._u3(name, 'uBrighter', o.brighterPixelColor);
    this._u3(name, 'uDarker', o.darkerPixelColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  // ==================== ⑤ Layer⑤ 扭曲裂隙（MetaballEdgeShader.fx）====================
  // metaball = 白色臂网 canvas（静态），overlay = 另一个世界 canvas（动态，stamp 驱动）
  drawRift(o) {
    if (!this.ready) return false;
    const gl = this.gl;
    this._begin(o.w, o.h);
    this._drawPass('rift', [o.w * 0.5, o.h * 0.5], [o.w, o.h], 1, 0);
    const name = 'rift';
    this._bindCv(name, 'uMetaball', o.metaball, 0, CLAMP, NEAREST, o.metaballStamp);
    this._bindCv(name, 'uOverlay', o.overlay, 1, REPEAT, LINEAR, o.overlayStamp);
    gl.uniform2f(this._u(name, 'uScreenSize'), o.w, o.h);
    // ★ fx: layerSize = DistortionRiftBackgroundContentsTarget.Size()（overlay RT 尺寸）
    gl.uniform2f(this._u(name, 'uLayerSize'), o.overlay ? o.overlay.width : o.w, o.overlay ? o.overlay.height : o.h);
    this._u3(name, 'uEdgeColor', o.edgeColor);
    this._u3(name, 'uLayerColor', o.layerColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
