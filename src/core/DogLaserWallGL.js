// ===== core/DogLaserWallGL.js =====
// DoG 激光墙（DoGLaserWalls.cs / DoGLaserWallsBigBeam.cs PreDraw）WebGL2 移植。
// 原版 = EntitySpriteDraw(贴图, pos, rot, color×alpha, scale(厚, 长/975))：
//   每根激光 5 层：t=0 主光 BloomLineThick（彩色发光）→ t=1-4 黑核 LineThick（黑，alpha 0.2+0.15t）。
//   宽度 × Remap(sine,-1,1,0.8,1.1) 呼吸脉动；opacity = (doneAttack?0.65:0.3) × min(laserFX,1)²。
// 本渲染器：CPU 生成每层 quad（中心点+方向×半长+法线×半宽），一次 drawArrays 全画；
//   shader 双贴图 + 逐顶点颜色/alpha/纹理选择，AlphaBlend 与原版一致。
// 独立叠加 canvas：仅激光墙激活时渲染，drawImage 到主 ctx 之上。

const VERT = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec3 aColor; in float aAlpha; in float aTex;
out vec2 vUv; out vec3 vColor; out float vAlpha; out float vTex;
void main(){ vUv = aUv; vColor = aColor; vAlpha = aAlpha; vTex = aTex; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vColor; in float vAlpha; in float vTex;
out vec4 frag;
uniform sampler2D uBeam;   // BloomLineThick（主光）
uniform sampler2D uLine;   // LineThick（黑核）
void main(){
  vec4 t = (vTex < 0.5) ? texture(uBeam, vUv) : texture(uLine, vUv);
  // ★ 2026-08-18 非预乘输出（canvas premultipliedAlpha=true 时浏览器自动 RGB*alpha）：
  //   之前 vec4(rgb*alpha, alpha) 是预乘格式，但 canvas 声明非预乘 → drawImage 双重 alpha 处理变极暗或透明。
  vec3 rgb = vColor * t.rgb;
  frag = vec4(rgb, t.a) * vAlpha;
}`;

// 把"底边中点锚点 + 向上延伸"的贴图 quad 变换到世界（原版 origin=(w/2,h)，scale=(厚, 长/975)）
function pushQuad(verts, cx, cy, rot, halfW, h) {
  // 局部 4 角：底边中点 (0,0)，宽 ±halfW，高 0→h（贴图向上）
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const corners = [[-halfW, 0], [halfW, 0], [-halfW, h], [halfW, h]];
  const uvs = [[0, 1], [1, 1], [0, 0], [1, 0]];
  for (let k = 0; k < 4; k++) {
    const [lx, ly] = corners[k];
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    verts.push(wx, wy, uvs[k][0], uvs[k][1]);
  }
}

export class DogLaserWallGL {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = null;
    this.ready = false;
    this.W = 0; this.H = 0;
    this._beamTex = null; this._lineTex = null;
    this._beamW = 64; this._beamH = 64; this._lineW = 64; this._lineH = 64;
    this._verts = [];       // 累积顶点 [x,y,u,v,r,g,b,a,tex]
    this._triIndices = [];  // 累积三角形索引
    try {
      // ★ 2026-08-18 改默认 premultipliedAlpha=true：frag 输出非预乘，浏览器自动做 RGB*alpha 转换 → 正确显示。
      this.gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
    } catch (e) { this.gl = null; }
    if (this.gl) { try { this._initGL(); } catch (e) { console.error('[DogLaserWallGL] init 失败:', e); this.gl = null; this.ready = false; } }
  }

  _initGL() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[DogLaserWallGL] shader 编译失败:', gl.getShaderInfoLog(s));
        throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aUv');
    gl.bindAttribLocation(p, 2, 'aColor');
    gl.bindAttribLocation(p, 3, 'aAlpha');
    gl.bindAttribLocation(p, 4, 'aTex');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.buf = gl.createBuffer();
    this.ready = true;
  }

  // ★ 2026-08-18 必须在 addLaser 之前设置尺寸：否则 _pushLayer 里 p.x/this.W（=0）→ Infinity → GPU 裁剪全灭。
  setSize(W, H) {
    if (this.W !== W || this.H !== H) {
      this.W = W; this.H = H;
      this.canvas.width = W; this.canvas.height = H;
    }
  }

  setTextures(beam, line) {
    if (!this.gl) return;
    const mk = (img) => {
      if (!img || !img.complete || !img.naturalWidth) return null;
      const t = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, t);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      return t;
    };
    this._beamTex = mk(beam);
    this._lineTex = mk(line);
    if (beam && beam.naturalWidth) { this._beamW = beam.naturalWidth; this._beamH = beam.naturalHeight; }
    if (line && line.naturalWidth) { this._lineW = line.naturalWidth; this._lineH = line.naturalHeight; }
  }

  // 追加一根激光（5 层）：原版 PreDraw 的 for t 循环
  //   p: { x, y, rot, length, fx, opacity, r, g, b, sine }
  addLaser(p) {
    if (!this._beamTex || !this._lineTex) return;
    const pulse = 0.8 + 0.3 * (p.sine + 1) / 2;            // Remap(sine,-1,1,0.8,1.1)
    const fxMin = Math.min(p.fx, 1);
    const fxPow = fxMin * fxMin;                           // min(laserFX,1)²（★ 不能 const 后 *=，会 TypeError）
    const fxTerm = p.fx <= 1 ? fxPow : p.fx;               // laserFX<=1 ? fx² : fx
    // 主光（t=0）：BloomLineThick，厚 0.03×1×fx×pulse
    this._pushLayer(p, 0, 0.03 * 1 * fxTerm * pulse, 1);
    // 黑核（t=1..4）：LineThick，厚 0.03×(0.8-0.15t)×fx×pulse，alpha (0.2+0.15t)
    for (let t = 1; t <= 4; t++) {
      this._pushLayer(p, t, 0.03 * (0.8 - 0.15 * t) * fxTerm * pulse, 0.2 + 0.15 * t);
    }
  }

  _pushLayer(p, t, thickness, colorMul) {
    const texW = t === 0 ? this._beamW : this._lineW;
    const texH = t === 0 ? this._beamH : this._lineH;
    const halfW = thickness * texW / 2;
    const h = texH * (p.length / 975);
    const v0 = this._verts.length / 9;
    // 归一化坐标（clip space）：主画布坐标 → [-1,1]
    const cx = p.x / this.W * 2 - 1;
    const cy = -(p.y / this.H * 2 - 1);
    // 世界半宽/高换算成 clip 单位
    const clipHalfW = halfW / this.W * 2;
    const clipH = h / this.H * 2;
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    const corners = [[-clipHalfW, 0], [clipHalfW, 0], [-clipHalfW, clipH], [clipHalfW, clipH]];
    const uvs = [[0, 1], [1, 1], [0, 0], [1, 0]];
    for (let k = 0; k < 4; k++) {
      const [lx, ly] = corners[k];
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      this._verts.push(wx, wy, uvs[k][0], uvs[k][1]);
      // 颜色：黑核 t>0 → 黑；主光 → drawColor × (1 - t*0.3)（原版 beamColor*(1-t*0.3)）
      const cr = t === 0 ? p.r : 0;
      const cg = t === 0 ? p.g : 0;
      const cb = t === 0 ? p.b : 0;
      // alpha：主光 opacity；黑核 opacity×(0.2+0.15t)
      this._verts.push(cr, cg, cb, t === 0 ? p.opacity : p.opacity * colorMul, t === 0 ? 0 : 1);
    }
    // 三角形索引：两个三角形
    this._triIndices.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
  }

  render(params) {
    if (!this.gl || !this.ready || !this._beamTex) return;
    const gl = this.gl;
    const { W, H } = params;
    if (this.W !== W || this.H !== H) { this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this._verts.length) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);   // 原版 AlphaBlend
    gl.useProgram(this.prog);
    // 顶点：9 float/顶点（x,y,u,v,r,g,b,a,tex）
    const data = new Float32Array(this._verts);
    const idx = new Uint16Array(this._triIndices);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this._beamTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._lineTex);
    const l0 = gl.getUniformLocation(this.prog, 'uBeam'); if (l0) gl.uniform1i(l0, 0);
    const l1 = gl.getUniformLocation(this.prog, 'uLine'); if (l1) gl.uniform1i(l1, 1);
    // 索引缓冲
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.deleteBuffer(ib);
    this._verts.length = 0;
    this._triIndices.length = 0;
  }

  clear() {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, Math.max(1, this.W), Math.max(1, this.H));
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this._verts.length = 0;
    this._triIndices.length = 0;
  }
}
