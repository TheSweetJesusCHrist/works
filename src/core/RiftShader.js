// ===== core/RiftShader.js — WebGL 移植 MetaballEdgeShader.fx（Layer ⑤ DistortionRift）=====
// 原版：XNA + HLSL ps_2_0 逐像素着色器，对白色臂网(metaballContents)做边缘检测：
//   臂网【内部】像素 → 显示 overlay 内容(另一个世界) × DoGSkyColor
//   臂网【边缘】像素 → 显示 edgeColor = lerp(lerp(DoGSkyColor, 白, 0.6), 黑, 0.15)
//   臂网【外部】像素 → 透明（透出下层）
// Canvas 2D 没有像素着色器能力，本文件用 WebGL GLSL ES 1.00 逐行翻译 fx 逻辑。
// 用法：new RiftShader() → init(W,H) → setMetaball(白色臂网canvas) → setOverlay(另一个世界canvas)
//      → render(edgeColorRGB, layerColorRGB) → drawImage(instance.canvas, 0, 0) 到主 2D canvas。

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// fx PixelShaderFunction 逐行翻译（注释对应原版行号）
const FRAG_SRC = `
precision mediump float;
varying vec2 vUv;

uniform sampler2D uMetaball;   // s0：白色臂网 render target（PointClamp）
uniform sampler2D uOverlay;    // s1：另一个世界内容（LinearWrap）
uniform vec2 uScreenSize;      // screenSize
uniform vec3 uEdgeColor;       // edgeColor = lerp(lerp(oc,白,0.6),黑,0.15)
uniform vec3 uLayerColor;      // layerColor = DoGSkyColor（oc）

void main() {
  vec2 coords = vUv;
  // baseColor = tex2D(metaballContents, coords)
  vec4 baseColor = texture2D(uMetaball, coords);

  // alphaOffset = (1 - any(baseColor.a))：自身透明 → 1，强制所有边缘检查"失败"（外部像素全透明）
  float alphaOffset = 1.0 - step(0.001, baseColor.a);

  // 4 邻居 ±2px 采样（convertFromScreenCoords(convertToScreenCoords(coords) + (±2,0|0,±2))）
  vec2 px = 2.0 / uScreenSize;
  float left   = texture2D(uMetaball, coords + vec2(-px.x,  0.0)).a + alphaOffset;
  float right  = texture2D(uMetaball, coords + vec2( px.x,  0.0)).a + alphaOffset;
  float top    = texture2D(uMetaball, coords + vec2( 0.0, -px.y)).a + alphaOffset;
  float bottom = texture2D(uMetaball, coords + vec2( 0.0,  px.y)).a + alphaOffset;

  // step(left,0) → 邻居无 alpha 记 1
  float leftHasNoAlpha   = step(left,   0.0);
  float rightHasNoAlpha  = step(right,  0.0);
  float topHasNoAlpha    = step(top,    0.0);
  float bottomHasNoAlpha = step(bottom, 0.0);

  // conditionOpacityFactor = 1 - saturate(有透明邻居数)：1=内部（无透明邻居），0=边缘/外部
  float conditionOpacityFactor = 1.0 - clamp(leftHasNoAlpha + rightHasNoAlpha + topHasNoAlpha + bottomHasNoAlpha, 0.0, 1.0);

  // 内部色 = overlay(另一个世界) × 臂网 × sampleColor(白,忽略) × layerColor(oc)
  vec4 defaultColor = texture2D(uOverlay, coords) * baseColor * vec4(uLayerColor, 1.0);
  vec4 edge = vec4(uEdgeColor, 1.0);

  // return (defaultColor * conditionOpacityFactor) + (edgeColor * (1 - conditionOpacityFactor))
  vec4 outC = defaultColor * conditionOpacityFactor + edge * (1.0 - conditionOpacityFactor);

  // 预乘 alpha 输出：drawImage 到 2D canvas 按 premultiplied 合成，RGB 必须先乘 alpha
  gl_FragColor = vec4(outC.rgb * outC.a, outC.a);
}
`;

export class RiftShader {
  constructor() {
    this.gl = null;
    this.canvas = null;
    this._prog = null;
    this._u = null;
    this._texMetaball = null;
    this._texOverlay = null;
    this._metaKey = '';   // 臂网纹理缓存键（尺寸+时间戳防重复上传）
    this._overKey = '';
  }

  /** 初始化 WebGL。返回是否可用（不可用时调用方回退 Canvas 近似）。 */
  init(w, h) {
    if (this.gl) { this._resize(w, h); return true; }
    let cv, gl = null;
    try {
      cv = document.createElement('canvas');
      const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true };
      gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    } catch (e) { /* 下面统一处理 */ }
    if (!gl) {
      console.warn('[RiftShader] WebGL 不可用，Layer⑤ 回退 Canvas 近似');
      return false;
    }
    this.gl = gl;
    this.canvas = cv;
    cv.width = w; cv.height = h;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[RiftShader] shader compile error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[RiftShader] link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    this._prog = prog;

    // 全屏 quad（triangle strip）
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this._u = {
      metaball: gl.getUniformLocation(prog, 'uMetaball'),
      overlay: gl.getUniformLocation(prog, 'uOverlay'),
      screenSize: gl.getUniformLocation(prog, 'uScreenSize'),
      edgeColor: gl.getUniformLocation(prog, 'uEdgeColor'),
      layerColor: gl.getUniformLocation(prog, 'uLayerColor'),
    };

    this._texMetaball = gl.createTexture();
    this._texOverlay = gl.createTexture();

    gl.disable(gl.BLEND);            // 全屏 quad 直接写最终值
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, w, h);
    return true;
  }

  _resize(w, h) {
    if (this.canvas && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  /** 上传白色臂网纹理（NEAREST + CLAMP，对应 SamplerState.PointClamp）。内容变化时才重新上传。 */
  setMetaball(src) {
    if (!this.gl || !src) return;
    const key = src.width + 'x' + src.height + '|' + src._riftShapeStamp;
    if (key === this._metaKey) return;
    this._metaKey = key;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._texMetaball);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** 上传另一个世界内容纹理（LINEAR + WRAP，对应 SamplerState.LinearWrap）。内容变化时才重新上传。 */
  setOverlay(src) {
    if (!this.gl || !src) return;
    const key = src.width + 'x' + src.height + '|' + src._riftOverlayStamp;
    if (key === this._overKey) return;
    this._overKey = key;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._texOverlay);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  /** 渲染到内部 canvas（带 alpha）。edgeColor/layerColor 为 [r,g,b] 0-255。 */
  render(edgeColor, layerColor, w, h) {
    if (!this.gl) return false;
    this._resize(w, h);
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this._prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texMetaball);
    gl.uniform1i(this._u.metaball, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._texOverlay);
    gl.uniform1i(this._u.overlay, 1);
    gl.uniform2f(this._u.screenSize, w, h);
    gl.uniform3f(this._u.edgeColor, edgeColor[0] / 255, edgeColor[1] / 255, edgeColor[2] / 255);
    gl.uniform3f(this._u.layerColor, layerColor[0] / 255, layerColor[1] / 255, layerColor[2] / 255);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  dispose() {
    if (this.gl && this._prog) { this.gl.deleteProgram(this._prog); }
    this.gl = null;
  }
}
