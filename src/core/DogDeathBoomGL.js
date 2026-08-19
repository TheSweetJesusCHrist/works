// ===== core/DogDeathBoomGL.js =====
// DoG 死亡爆炸（DoGDeathBoom.cs → BaseMassiveExplosionProjectile.PreDraw）WebGL2 移植。
// ForceField 是 Terraria 内置编译 shader（.fxb，无源码）→ 按已知视觉特征做 GLSL 还原：
//   ① Perlin 三层采样 + 时间流动 → 护盾能量壳边缘扰动 / 内部彩色能量滚动
//   ② smoothstep 壳层算法：radius 处亮边、壳内半透明、壳外透明（Canvas 2D 做不到的逐像素护盾）
//   ③ 颜色 Lerp(Cyan, Fuchsia, clamp(pulse*1.75)) + Fadeout (1-√t)*0.7 + 半径 lerp→MaxRadius
// 独立叠加 canvas：仅死亡 Boom 激活时渲染，drawImage 到主 ctx 之上（AlphaBlend 与原版一致）。

const VERT = `#version 300 es
in vec2 aPos; in vec2 aUv;
out vec2 vUv;
void main(){ vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG_BOOM = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uPerlin;    // Perlin.png 512² 灰度噪声（原版 ForceField 输入贴图）
uniform vec2 uResolution;     // 屏幕像素尺寸
uniform vec2 uCenter;         // 爆炸中心（像素）
uniform float uRadius;        // 当前半径（像素，随时间 lerp→4200）
uniform float uTime;          // 动画时间（秒）
uniform vec3 uColorA;         // Cyan (0,221,250)
uniform vec3 uColorB;         // Fuchsia (255,0,255)
uniform float uMix;           // 颜色混合比 clamp(pulse*1.75,0,1)
uniform float uFade;          // Fadeout (1-√t)*0.7
void main(){
  vec2 px = vUv * uResolution;
  vec2 d = px - uCenter;
  d.x *= 1.5;                                   // 原版 drawData scale=(1.5,1) 非等比
  float dist = length(d);
  float r = dist / uRadius;                     // 0=中心 1=壳
  // Perlin 三层扰动（时间流动，多 octave）
  vec2 puv = vUv * 2.0 + vec2(uTime * 0.05, -uTime * 0.04);
  float n1 = texture(uPerlin, puv).r;
  float n2 = texture(uPerlin, puv * 2.0 + uTime * 0.03).r;
  float n3 = texture(uPerlin, puv * 4.0 - uTime * 0.02).r;
  float noise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  // 护盾壳：r≈1 处亮边（噪声扰动壳位置 → 边缘流动）
  float shellR = r + (noise - 0.5) * 0.12;
  float shell = smoothstep(0.90, 1.04, shellR) * (1.0 - smoothstep(1.04, 1.28, shellR));
  // 内部能量：r<1 半透明彩色流动（Perlin 驱动）
  float inner = smoothstep(1.0, 0.15, r) * (0.35 + noise * 0.65);
  vec3 col = mix(uColorA, uColorB, uMix);
  vec3 rgb = col * (inner * 0.85 + shell * 1.6);
  float alpha = (inner * 0.42 + shell * 0.95) * uFade;
  frag = vec4(rgb, alpha);
}`;

export class DogDeathBoomGL {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = null;
    this.ready = false;
    this.W = 0; this.H = 0;
    this._perlinTex = null;
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
        console.error('[DogDeathBoomGL] shader 编译失败:', gl.getShaderInfoLog(s));
        throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG_BOOM));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUv');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.quadBuf = gl.createBuffer();
    this.ready = true;
  }

  // 上传 Perlin.png 为纹理（REPEAT，shader 内多 octave 采样）
  setPerlin(img) {
    if (!this.gl || !img || !img.complete || !img.naturalWidth) return;
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this._perlinTex = t;
  }

  // 渲染全屏护盾爆炸到本 canvas；调用方随后 ctx.drawImage 叠加到主画布
  // params: { W, H, cx, cy, radius, time, mix, fade }
  render(params) {
    if (!this.gl || !this.ready || !this._perlinTex) return;
    const gl = this.gl;
    const { W, H, cx, cy, radius, time, mix, fade } = params;
    if (this.W !== W || this.H !== H) { this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    // 全屏 quad
    const d = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._perlinTex);
    const set = (n, v) => { const l = gl.getUniformLocation(this.prog, n); if (l) gl.uniform1f(l, v); };
    const setV2 = (n, x, y) => { const l = gl.getUniformLocation(this.prog, n); if (l) gl.uniform2f(l, x, y); };
    const setV3 = (n, a) => { const l = gl.getUniformLocation(this.prog, n); if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
    set('uPerlin', 0);
    setV2('uResolution', W, H);
    setV2('uCenter', cx, cy);
    set('uRadius', radius);
    set('uTime', time);
    setV3('uColorA', [0, 221 / 255, 250 / 255]);      // Cyan
    setV3('uColorB', [1, 0, 1]);                        // Fuchsia
    set('uMix', mix);
    set('uFade', fade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 清空（死亡结束/未激活时调用，避免残影）
  clear() {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, Math.max(1, this.W), Math.max(1, this.H));
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
