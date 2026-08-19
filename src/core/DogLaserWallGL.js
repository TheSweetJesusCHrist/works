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
  // ★ 预乘输出（canvas premultipliedAlpha=true → 浏览器期望预乘 RGBA）：
  //   rgb 已乘以 alpha，drawImage source-over 合成时不会双重缩放。
  float a = t.a * vAlpha;
  frag = vec4(vColor * t.rgb * a, a);
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
    this._verts = [];       // 辉光层(t=0)顶点 [x,y,u,v,r,g,b,a,tex]
    this._triIndices = [];  // 辉光层三角形索引
    this._coreVerts = [];   // 黑核层(t≥1)顶点（两遍绘制：先 core 合并，再 glow 覆盖）
    this._coreTriIndices = []; // 黑核层三角形索引
    try {
      // ★ 2026-08-18 改默认 premultipliedAlpha=true：frag 输出非预乘，浏览器自动做 RGB*alpha 转换 → 正确显示。
      this.gl = this.canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true });
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

  // 追加一根激光（layers 层）：原版 PreDraw 的 for t 循环
  //   p: { x, y, rot, length, fx, opacity, r, g, b, sine }
  // layers: 预警=1（仅辉光无黑核）/ 攻击网格=5（辉光+4黑核）/ BigBeam=8（辉光+7黑核）；thicknessMul: 网=1 / BigBeam=5（coreFalloffDiv=2 对应原版 scale）
  addLaser(p) {
    if (!this._beamTex || !this._lineTex) return;
    const layers = p.layers || 5;
    const tmul = p.thicknessMul || 1;
    const falloffDiv = p.coreFalloffDiv || 1;               // 原版 BigBeam = scale(2)：黑核 0.8-0.15·t/scale，8 层仍为正
    const pulse = 0.8 + 0.3 * (p.sine + 1) / 2;            // Remap(sine,-1,1,0.8,1.1)
    const fxMin = Math.min(p.fx, 1);
    const fxPow = fxMin * fxMin;                           // min(laserFX,1)²
    const fxTerm = p.fx <= 1 ? fxPow : p.fx;               // laserFX<=1 ? fx² : fx
    // ★ 厚度基准（世界像素半宽，贴近原版 beamThickness=0.03×窄贴图 ≈ 6~18px 实宽）：
    //   预警(layers=1)：细线 ~1px 半宽（全宽~2px，原版细青线观感）
    //   攻击(layers=5)：主光 ~3px 半宽（全宽~16px @fx3）+ 黑核收窄（原版粗紫黑网）
    const isWarning = (layers <= 1);
    const baseGlowHW = isWarning ? 1 : 3;                  // 预警细 / 攻击适中
    const glowHW = baseGlowHW * tmul * fxTerm * pulse;
    // ★ 两遍绘制：辉光(t=0)先收集到 _verts 缓冲，黑核(t≥1)收集到 _core 缓冲。
    //   render() 先画所有 glow（彩色辉光相容叠加），再画所有 core 盖在最上层（黑色可见 + 交叉融合，无品红缝）。
    //   —— 顺序必须 glow→core：原版 PreDraw 的 for t 即 t=0 辉光先画、t≥1 黑核后画盖在辉光上。
    this._pushLayer(p, 0, glowHW, 1, false);              // t=0 辉光 → glow 缓冲
    for (let t = 1; t < layers; t++) {
      this._pushLayer(p, t, 2 * tmul * (0.8 - 0.15 * t / falloffDiv) * fxTerm * pulse, 0.2 + 0.15 * t, true);  // t≥1 黑核 → core 缓冲
    }
  }

  _pushLayer(p, t, thickness, colorMul, isCore) {
    // ★ 2026-08-19 修复：p.x/p.y = 激光线中心点，quad 以中心对称双向延伸；halfW = thickness（像素半宽）。
    // ★ 2026-08-19 修正各向异性旋转：旋转必须在【像素空间】做，clip 空间 W≠H 会拉伸角度（45° 斜网变成非垂直）。
    //   长轴向像素方向 L = (-sin rot, cos rot)；法向 N = (cos rot, sin rot)（y-down 像素系）。
    // ★ isCore=true → 推入 _core 缓冲（黑核，先画）；isCore=false → 推入 _verts 缓冲（辉光，后画）。
    const verts = isCore ? this._coreVerts : this._verts;
    const indices = isCore ? this._coreTriIndices : this._triIndices;
    const halfW = thickness;
    const h = p.length;
    const v0 = verts.length / 9;
    const Lx = -Math.sin(p.rot), Ly = Math.cos(p.rot);   // 长轴向（像素，y-down）
    const Nx = Math.cos(p.rot), Ny = Math.sin(p.rot);    // 法向（像素，y-down）
    const hl = h / 2, hw = halfW;                        // 半长 / 半宽（像素）
    const cx = p.x, cy = p.y;                            // 线中心点（像素）
    // 4 角（像素空间）：± hl 沿长轴向，± hw 沿法向 —— 先算像素再统一转 clip，角度不被宽高比扭曲
    const cornersPx = [
      [cx - hl * Lx - hw * Nx, cy - hl * Ly - hw * Ny],  // 0: 长轴-端 / 法向-侧
      [cx + hl * Lx - hw * Nx, cy + hl * Ly - hw * Ny],  // 1: 长轴+端 / 法向-侧
      [cx - hl * Lx + hw * Nx, cy - hl * Ly + hw * Ny],  // 2: 长轴-端 / 法向+侧
      [cx + hl * Lx + hw * Nx, cy + hl * Ly + hw * Ny],  // 3: 长轴+端 / 法向+侧
    ];
    const uvs = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let k = 0; k < 4; k++) {
      const px = cornersPx[k][0], py = cornersPx[k][1];
      const wx = px / this.W * 2 - 1;                    // 像素 → clip（x 均匀）
      const wy = -(py / this.H * 2 - 1);                 // 像素 → clip（y 均匀，y-down 反转）
      verts.push(wx, wy, uvs[k][0], uvs[k][1]);
      // 颜色：黑核 t>0 → 黑；主光 → drawColor
      const cr = t === 0 ? p.r : 0;
      const cg = t === 0 ? p.g : 0;
      const cb = t === 0 ? p.b : 0;
      // alpha：主光 opacity；黑核 opacity×(0.2+0.15t)
      verts.push(cr, cg, cb, t === 0 ? p.opacity : p.opacity * colorMul, t === 0 ? 0 : 1);
    }
    indices.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
  }

  render(params) {
    if (!this.gl || !this.ready || !this._beamTex) return;
    const gl = this.gl;
    const { W, H } = params;
    if (this.W !== W || this.H !== H) { this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // ★ 两遍绘制（顺序 = 原版 PreDraw 的 for t 循环：辉光先、黑核后盖）：
    //   Pass 1：所有辉光层(t=0) → 彩色辉光相容叠加（交叉处辉光相加变亮）
    //   Pass 2：所有黑核层(t≥1) → 盖在最上层，黑色可见且交叉处黑核自然融合（无品红缝）
    const hasCore = this._coreVerts.length > 0;
    const hasGlow = this._verts.length > 0;
    if (!hasCore && !hasGlow) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // 预乘 over
    gl.useProgram(this.prog);
    const stride = 9 * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this._beamTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._lineTex);
    const l0 = gl.getUniformLocation(this.prog, 'uBeam'); if (l0) gl.uniform1i(l0, 0);
    const l1 = gl.getUniformLocation(this.prog, 'uLine'); if (l1) gl.uniform1i(l1, 1);
    // 辅助：执行一次 drawElements 调用
    const doDraw = (vertArr, idxArr) => {
      if (!vertArr.length) return;
      const data = new Float32Array(vertArr);
      const idx = new Uint16Array(idxArr);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.deleteBuffer(ib);
    };
    // Pass 1：辉光（先画，彩色相容叠加）
    if (hasGlow) doDraw(this._verts, this._triIndices);
    // Pass 2：黑核（后画，盖在辉光之上 → 黑色可见 + 交叉融合）
    if (hasCore) doDraw(this._coreVerts, this._coreTriIndices);
    // 清空所有缓冲
    this._verts.length = 0;
    this._triIndices.length = 0;
    this._coreVerts.length = 0;
    this._coreTriIndices.length = 0;
  }

  clear() {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, Math.max(1, this.W), Math.max(1, this.H));
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this._verts.length = 0;
    this._triIndices.length = 0;
    this._coreVerts.length = 0;
    this._coreTriIndices.length = 0;
  }
}
