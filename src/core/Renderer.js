// ===== core/Renderer.js (migrated from scourge_selector.html) =====
import { DoGSky, drawBackground, drawLightning, drawRain, lightningIntensity, rainOn } from './Background.js';
import { DogDeathBoomGL } from './DogDeathBoomGL.js';
import { DogLaserWallGL } from './DogLaserWallGL.js';
import { loop, resize } from './Game.js';
import { buildSegments, drawSegmentsBase, drawSegmentsGlow } from '../entities/Scourge.js';
import { H, THANATOS_BLUE, THANATOS_RED, THANATOS_TRANS, W, animTime, clamp01, ctx, currentChar, currentCharKey, currentTheme, darkLevel, easeOutCubic, ensureFxCanvas, getWhiteTint, imgs, lerp, lightningOn, mouse, particles, points, segments, thanatosPhase, thanatosTimer, set_particles, dogClip } from './globals.js';
import { screenShake } from '../utils/ScreenShake.js';
import { effects } from '../utils/effects.js';

export function updateHUD() {
  // 游玩界面不显示任何文字提示，仅保留空 hud 容器
  const hud = document.getElementById('hud');
  if (hud) hud.innerHTML = '';
}


export function initParticles() {
  set_particles(Array.from({ length: currentChar.particleCount }, () => {
    if (currentTheme === 'desert') {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        vx: Math.random() * 1.2 + 0.2,
        vy: Math.random() * 0.4 - 0.1,
        alpha: Math.random() * 0.35 + 0.1
      };
    }
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      vy: Math.random() * 0.8 + 0.2,
      alpha: Math.random() * 0.25 + 0.05
    };
  }));
}


export function updateParticles() {
  if (currentTheme === 'desert') {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x > W + 10) { p.x = -10; p.y = Math.random() * H; }
      if (p.y > H + 10) p.y = -10;
      if (p.y < -10) p.y = H + 10;
    }
  } else if (currentTheme === 'void' || currentTheme === 'void2') {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
    }
  } else {
    for (const p of particles) {
      p.y -= p.vy;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
    }
  }
}


export const DoGAnim = {
  // 颌部咬合
  jawRotation: 0,           // 当前旋转角度（弧度）
  jawTarget: 0,             // 目标角度
  jawState: 'idle',         // idle | charging | chomping | open | reset
  jawChompProgress: 0,      // 0→1 咬合进度
  jawChompTimer: 0,         // 咬合保持计时
  shouldSpawnChompVFX: false,

  // 长按蓄力咬合（v0812ax）：按住蓄力、松开咬合
  jawCharging: false,       // 咬合键按住中（蓄力）
  jawCharge: 0,             // 蓄力时间（秒），上限 5
  jawChargeRatio: 0,        // 蓄力进度 0..1（驱动颚渐进张开）
  jawChargeAtRelease: 0,    // 松开瞬间的蓄力值（驱动震动强度/颚尺寸）
  jawChargeScale: 1,        // 颚尺寸倍率（蓄力时增大，最大 ×1.35）
  jawShakeY: 0,             // 蓄力时颚/头垂直震动偏移
  jawCooldown: 0,           // 咬合后冷却（秒），期间不能再咬合
  maxChargeWarn: false,     // 满蓄力警告闪烁
  
  // P2 变身过场
  phase2Active: false,
  phase2Timer: 0,           // 当前阶段倒计时（帧）
  phase2Stage: 0,           // 0=inactive, 1=fadeout, 2=portal, 3=resize+switch, 4=done
  phase2Target: 1,          // 本次变身要切换到的形态（与当前相反）
  phase2Opacity: 1,         // 变身过程中的透明度
  
  // 传送裂隙
  teleportActive: false,
  teleportTimer: 0,
  teleportStage: 0,         // 0=charge, 1=boom, 2=dissipate
  teleportX: 0, teleportY: 0,
  crackScale: 1,
  crackExposure: 0,
  maxCrackExposure: 0,
  riftOpacity: 0,
  riftScale: 0,
  ringScale: 8,
  
  // 死亡动画
  deathActive: false,
  deathTimer: 0,
  deathStage: 0,            // 0=slowdown, 1=destroySeg, 2=explode, 3=vanish
  deathOpacity: 1,
  
  // 激光墙恢复（旧：透明度渐回）
  laserWallRecovering: false,
  laserWallOpacity: 0,

  // 激光墙发射（按键触发可见特效）—— ★ 2026-08-18 对齐原版 DoGLaserWalls.cs 状态机
  laserActive: false,
  laserTimer: 0,             // 总时长（帧，300 = 5s）
  laserAngle: 0,             // （保留兼容，不再用于辐条旋转）
  // 原版状态机字段（DoGLaserWalls.cs / DoGLaserWallsBigBeam.cs）：
  laserTime: 0,              // time：0→300 帧
  laserFX: 0,                // 激光亮度因子（0→1 淡入 → 攻击 3 → 衰减）
  laserDoneAttack: false,    // 是否已攻击（time≥30）
  laserStoredTime: 0,        // 攻击时刻
  laserColor: [0, 221, 250], // drawColor（Cyan (0,221,250) → Magenta (255,0,255)）
  laserSine: 0,              // sin(time×4/π) 宽度脉动
  laserType: 0,              // 网格风格（0=横竖正交，对齐原版 ai[2]=0）
  laserDist: 240,            // 激光间距（原版默认 250）
  laserBigBeamActive: false, // 大光束（DoGLaserWallsBigBeam.cs）攻击瞬间触发
  laserBigBeamTime: 0,       // 大光束计时（attack 后 +10 帧结束）
  laserBigBeamFX: 0,
  laserBigBeamRot: 0,        // 大光束方向随机角
  laserBigBeamColor: [255, 0, 255],  // BigBeam 颜色（Magenta→Cyan 与网格相反）

  // ★ 6 键 armorOff 渐变切换（隐铠甲只留亮纹，不瞬换贴图）
  armorFadeActive: false,   // 渐变进行中（期间忽略重复按键）
  armorFadeStage: 0,        // 0=铠甲淡出 1=原位切换 2=铠甲淡入
  armorFadeTimer: 0,        // 当前阶段计时（秒）
  armorFadeAlpha: 1,        // 当前 base 层 alpha（1→0→1）
  armorFadeTarget: null,    // 目标 armorOff 值（null=未定）

  // 冲刺颌部淡入
  dashJawFadeProgress: 0,
  dashJawFadeTimer: 0,

  // P1→P2 过场（钻门 → 裂缝 → 钻出冲刺 → 惯性过冲）
  ptActive: false,
  ptStage: 0,                // 0=diveIn, 1=rift, 2=emerge+charge, 3=inertia, 4=done
  ptTimer: 0,
  ptOpacity: 1,              // dive-in 淡出
  ptPortalScale: 0,          // 门缩放 0→1→0
  ptPortalX: 0, ptPortalY: 0,// 门位置（触发时头部位置）
  ptEmergenceX: 0, ptEmergenceY: 0, // 钻出位置
  ptChargeActive: false,     // 冲刺惯性激活
  ptDiveActive: false,        // Stage 0: 头部正在冲向传送门（自行钻入）
  ptChargeVx: 0, ptChargeVy: 0, // 惯性速度
  ptMouseAtEmergeX: 0, ptMouseAtEmergeY: 0, // 钻出时刻鼠标位置
  ptShake1Done: false,        // Stage 1: 第一次震屏 + 裂缝已触发
  ptTime: 0,                 // 漩涡门 shader 动画时间
  ptTotalLen: 0,             // 触发时整条虫体节链总长（用于估算 Stage0 穿门总行程）
  ptDiveDur: 0,              // 本次 Stage0 兜底上限时长（按行程/速度算出，门展开进度按它归一）
  ptDiveUx: 0, ptDiveUy: 0,  // Stage0 锁定的飞行方向单位向量（头部沿此直线穿过门中心）
  _portalCanvas: null,       // 离屏画布（漩涡门逐像素渲染）
  ptCrackScale: 0,           // ★ 裂纹累计缩放（原版 CrackScale）：第1次撞击→小(0.9)，蓄力每段+=0.525×interp×0.75，
                             //   最终爆炸 +=3 跳最大。形状完全相同只是逐步放大（玻璃逐渐开裂）
  ptBurst: 0,                // ★ 撞击闪光（收缩光环+十字星），每次撞击置 1 后衰减（dt*2.5）
  ptCracks: null,            // ★ 程序化放射裂纹（DoGRiftCrack 移植）：25 条随机分叉多段线，撞击瞬间生成
  ptCracksT: 0,              // 放射裂纹淡出计时（0.5s，scale 1→0）
  ptChargeStep: 0,           // Stage2 蓄力期分段充电：已触发的分段数（每段火花+软光+微震+曝光递增）
  ptCrackExpose: 0,          // Stage2 蓄力期裂纹曝光度 0→0.95（原版 MaxExposure），驱动裂纹逐级变亮

  // 死亡白闪 / 顶层爆炸
  deathFlash: 0,
  deathExploded: false,
  deathExplodeT: 0,
  deathExplodeX: 0,
  deathExplodeY: 0,
  // ★ 2026-08-18 DoGDeathBoom 移植（原版 DoGDeathBoom.cs + BaseMassiveExplosionProjectile）：
  //   全屏 ForceField 护盾爆炸：Lifetime 180 帧，MaxRadius 4200，Cyan→Fuchsia 渐变，脉冲屏震
  deathBoomActive: false,
  deathBoomT: 0,            // 爆炸计时（帧，0→180）
  deathBoomX: 0, deathBoomY: 0,
  deathBoomRadius: 0,       // 当前半径（每帧 lerp→MaxRadius）
  deathBoomScreenShakeT: 0, // 屏震脉冲辅助计时
  // ★ 2026-08-18 爆炸后白屏时间线（渐白→全白1s→渐恢复），独立计时不依赖 deathActive
  deathWhiteActive: false,
  deathWhiteT: 0,           // 白屏计时（帧）：0-35 渐白，35-95 全白，95-155 渐恢复
  // ★ 2026-08-18 死亡减速飞行（原版 DoDeathAnimation：idealSpeed = Lerp(8.4, 4, GetLerpValue(15,210))）
  deathDirX: 0, deathDirY: 0,   // 死亡瞬间锁定的飞行方向（单位向量）
  deathDirLocked: false,        // 是否已锁定方向（首帧用 lastHead→head）
  deathSpeed: null,             // 当前飞行速度（向 idealSpeed 收敛，null=未初始化）
    // 通用透明度（传送后渐变）
  opacity: 1,
  postTeleportTimer: 0,
  
  isActive() {
    return this.phase2Active || this.teleportActive || this.deathActive ||
           this.jawState !== 'idle' || this.laserWallRecovering ||
           this.postTeleportTimer > 0 || this.ptActive;
  },
  reset() {
    this.jawRotation = 0; this.jawTarget = 0; this.jawState = 'idle';
    this.jawChompProgress = 0; this.jawChompTimer = 0;
    this.shouldSpawnChompVFX = false;
    this.jawCharging = false; this.jawCharge = 0; this.jawChargeAtRelease = 0;
    this.jawChargeScale = 1; this.jawShakeY = 0; this.jawCooldown = 0; this.maxChargeWarn = false;
    this.phase2Active = false; this.phase2Timer = 0; this.phase2Stage = 0;
    this.phase2Target = 1; this.phase2Opacity = 1;
    this.teleportActive = false; this.teleportTimer = 0; this.teleportStage = 0;
    this.crackScale = 1; this.crackExposure = 0; this.maxCrackExposure = 0;
    this.riftOpacity = 0; this.riftScale = 0; this.ringScale = 8;
    this.deathActive = false; this.deathTimer = 0; this.deathStage = 0;
    this.deathOpacity = 1;
    this.laserWallRecovering = false; this.laserWallOpacity = 0;
    this.laserActive = false; this.laserTimer = 0; this.laserAngle = 0;
    this.laserTime = 0; this.laserFX = 0; this.laserDoneAttack = false; this.laserStoredTime = 0;
    this.laserColor = [0, 221, 250]; this.laserSine = 0;
    this.laserBigBeamActive = false; this.laserBigBeamTime = 0; this.laserBigBeamFX = 0;
    this.laserBigBeamRot = 0; this.laserBigBeamColor = [255, 0, 255];
    this.armorFadeActive = false; this.armorFadeStage = 0;
    this.armorFadeTimer = 0; this.armorFadeAlpha = 1; this.armorFadeTarget = null;
    this._armorSwapped = false;
    this.dashJawFadeProgress = 0; this.dashJawFadeTimer = 0;
    dogParticles.length = 0;   // 清掉残留粒子，避免旧特效穿帮到新形态/新角色
    this.deathFlash = 0; this.deathExploded = false; this.deathExplodeT = 0;
    this.deathExplodeX = 0; this.deathExplodeY = 0;
    this.deathBoomActive = false; this.deathBoomT = 0;
    this.deathBoomX = 0; this.deathBoomY = 0; this.deathBoomRadius = 0; this.deathBoomScreenShakeT = 0;
    this.deathWhiteActive = false; this.deathWhiteT = 0;
    this.deathDirX = 0; this.deathDirY = 0; this.deathDirLocked = false; this.deathSpeed = null;
    this.opacity = 1; this.postTeleportTimer = 0;
    this.ptActive = false; this.ptStage = 0; this.ptTimer = 0;
    this.ptOpacity = 1; this.ptPortalScale = 0;
    this.ptPortalX = 0; this.ptPortalY = 0;
    this.ptEmergenceX = 0; this.ptEmergenceY = 0;
    this.ptChargeActive = false; this.ptDiveActive = false;
    this.ptChargeVx = 0; this.ptChargeVy = 0;
    this.ptMouseAtEmergeX = 0; this.ptMouseAtEmergeY = 0;
    this.ptShake1Done = false;
    this.ptTime = 0;
    this.ptTotalLen = 0;
    this.ptDiveDur = 0;
    this.ptDiveUx = 0; this.ptDiveUy = 0;
    this.ptCrackScale = 0;
    this.ptBurst = 0;
    this.ptCracks = null; this.ptCracksT = 0;
    this.ptChargeStep = 0; this.ptCrackExpose = 0;
    dogParticles.length = 0;  // clear particles
  }
};

// ── 粒子系统 ──

export const dogParticles = [];

export const DOG_PARTICLE_TYPES = {
  SPARKLE: 'sparkle',
  SQUISHY: 'squishy',
  PULSE: 'pulse',
  BLOOM: 'bloom',
  RING: 'ring',
  EXPLOSION: 'explosion',   // ★ PlasmaExplosion.cs：半正弦透明度 + PolyOut(4) 缩放（等离子爆炸）
  METABALL: 'metaball',     // ★ DoGDistortionMetaball.cs：紫边圆/方块扭曲泡，v×0.96 / size×0.91
  GORE: 'gore',             // ★ 2026-08-18 原版 DoGS-DoGS6 gore 碎肉：随机方向速度 + 重力 + 旋转 + 不衰减缩放
  DUST: 'dust',             // ★ 2026-08-18 原版 DustID.BoneTorch 尘暴（DustTorch.png 贴图）
};


export function spawnDogParticle(type, x, y, params) {
  const p = {
    type, x, y, alive: true,
    life: params.life || 60,
    maxLife: params.life || 60,
    vx: params.vx || 0, vy: params.vy || 0,
    scale: params.scale || 1,
    originalScale: params.scale || 1,
    finalScale: params.finalScale || 3,
    rotation: params.rotation || 0,
    spin: params.spin || 0,
    opacity: 1,
    color: params.color || null,   // null = use texture as-is
    hueShift: params.hueShift || 0,
    tex: params.tex || null,       // image element key in imgs
    squish: params.squish || 1,    // velocity-directional stretch for squishy
    square: params.square || false, // metaball 方形（原版 Square 贴图替代：程序绘制）
    blackBg: params.blackBg || false, // ★ 黑底贴图（jpg 无 alpha）→ draw 时用 tintBlackBgImg(multiply) 染色；
                                      //   透明底贴图（sparkle 等）→ tintedImg(source-in)。source-in 染黑底会变纯色矩形（已踩坑）
    frame: params.frame || 0,         // ★ sprite sheet 帧号（DUST 用：DustTorch 竖排 3 帧，12×10/帧）
  };
  dogParticles.push(p);
  return p;
}


export function updateDogParticles(dt) {
  const dtFrames = dt * 60;  // normalize to ~60fps
  for (let i = dogParticles.length - 1; i >= 0; i--) {
    const p = dogParticles[i];
    p.life -= dtFrames;
    if (p.life <= 0) { dogParticles.splice(i, 1); continue; }
    
    const t = 1 - p.life / p.maxLife;  // 0→1 progress
    
    switch (p.type) {
      case DOG_PARTICLE_TYPES.SPARKLE:
        p.opacity = Math.sin(t * Math.PI);
        p.vx *= 0.95; p.vy *= 0.95;
        p.rotation += p.spin * (p.vx > 0 ? 1 : -1);
        break;
        
      case DOG_PARTICLE_TYPES.SQUISHY:
        if (t >= 0.34) { p.vx *= 0.93; p.vy *= 0.93; }
        else { p.vx *= 1.02; p.vy *= 1.02; }
        p.opacity = t > 0.5 ? Math.sin(t * Math.PI) * 0.2 + 0.8 : Math.sin(t * Math.PI);
        p.scale *= 0.95;
        p.hueShift += 0.01;
        // squish = stretch in velocity direction
        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 0.1) p.squish = Math.min(2.5, 1 + spd * 0.05);
        else p.squish = Math.max(1, p.squish * 0.95);
        break;
        
      case DOG_PARTICLE_TYPES.PULSE:
        const pulseT = Math.min(1, t * 2);
        p.scale = lerp(p.originalScale, p.finalScale, easeOutCubic(pulseT));
        p.opacity = Math.sin(t * Math.PI);
        break;
        
      case DOG_PARTICLE_TYPES.BLOOM:
        p.opacity = Math.sin(t * Math.PI);
        p.vx *= 0.95; p.vy *= 0.95;
        break;
        
      case DOG_PARTICLE_TYPES.RING:
        const ringT = Math.min(1, t * 1.5);
        p.scale = lerp(p.originalScale, p.finalScale, easeOutCubic(ringT));
        p.opacity = Math.sin(Math.PI / 2 + t * Math.PI / 2);
        break;

      case DOG_PARTICLE_TYPES.EXPLOSION:
        // ★ PlasmaExplosion.cs：opacity = sin(π/2 + t·π/2) 半正弦（起点 1 → 终点 0）
        //   scale = lerp(orig, final, PolyOut(t,4))，速度 ×0.95/帧
        p.opacity = Math.sin(Math.PI / 2 + t * Math.PI / 2);
        p.scale = lerp(p.originalScale, p.finalScale, 1 - Math.pow(1 - Math.min(1, t), 4));
        p.vx *= 0.95; p.vy *= 0.95;
        break;

      case DOG_PARTICLE_TYPES.METABALL:
        // ★ DoGDistortionMetaball.cs：Center += Velocity; Velocity *= 0.96; Size *= 0.91; Size<=2 移除
        p.vx *= 0.96; p.vy *= 0.96;
        p.scale *= 0.91;
        if (p.scale <= 2) p.life = 0;
        break;

      case DOG_PARTICLE_TYPES.GORE:
        // ★ 2026-08-18 原版 Calamity DoGS-DoGS6 gore 碎肉行为：随机方向初速度 + 重力下落 + 旋转 + 不衰减缩放
        p.vy += 0.4 * dtFrames;                  // 重力
        p.vx *= Math.pow(0.98, dtFrames);         // 空气阻力
        p.vy *= Math.pow(0.98, dtFrames);
        p.rotation += (p.spin || 0) * dtFrames;
        p.opacity = clamp01(p.life / p.maxLife * 1.2);   // 线性淡出（生命到 0 时 alpha=0）
        break;

      case DOG_PARTICLE_TYPES.DUST:
        // ★ 2026-08-18 原版 DustID.BoneTorch 尘暴（DustTorch.png 贴图 + 青色光）
        //   速度衰减 + opacity 衰减（dust 原版行为）
        p.vx *= Math.pow(0.94, dtFrames);
        p.vy *= Math.pow(0.94, dtFrames);
        const tDust = 1 - p.life / p.maxLife;
        p.opacity = Math.sin(tDust * Math.PI);     // 钟形淡出
        p.scale = p.originalScale;                 // 不衰减缩放
        // ★ 2026-08-18 DustTorch.png 是竖排 3 帧动画（12×10/帧）：
        //   原版 dust 每 8 帧切一帧（vanilla Dust.Frame），这里按寿命等分切 3 帧循环
        p.frame = Math.floor(tDust * 8) % 3;
        break;
    }

    p.x += p.vx * dtFrames;
    p.y += p.vy * dtFrames;
  }
}


export function drawDogParticles() {
  if (!dogParticles.length) return;
  // Black-bottom VFX textures need Additive blending ('lighter') so black bg disappears.
  // Transparent-bottom textures (Sparkle/Sparkle2/StarProj/Light) keep normal source-over.
  const TRANS_TEX = new Set([imgs.sparkle, imgs.sparkle2, imgs.star_proj, imgs.light]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of dogParticles) {
    if (!p.alive) continue;

    // ★ METABALL：无贴图，程序绘制紫边圆/方块（EdgeColor RGB(136,26,186)，DoGDistortionMetaball.cs）
    if (p.type === DOG_PARTICLE_TYPES.METABALL) {
      ctx.save();
      ctx.globalAlpha = clamp01(p.opacity);
      ctx.translate(p.x, p.y);
      if (p.rotation) ctx.rotate(p.rotation);
      const r = Math.max(1, p.scale / 2);
      ctx.beginPath();
      if (p.square) ctx.rect(-r, -r, r * 2, r * 2);
      else ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(136,26,186,0.12)';   // 内部极淡紫（原版是 metaball shader 边缘，Canvas 无 shader 近似）
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.strokeStyle = 'rgba(136,26,186,0.75)';  // 紫边
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (!p.tex) continue;

    // ★ 2026-08-18 GORE / DUST：透明底贴图（DoGS 紫粉碎肉 / DustTorch 3 帧十字），
    //   source-over 普通混合 + 原图直出（不染色、不 additive）——原版 gore/dust 都是 AlphaBlend 原色。
    //   之前错用 blackBg:true + multiply 染色 → 透明底在 'lighter' 下边缘半透明像素发亮成「发光正方形」（用户反馈）。
    if (p.type === DOG_PARTICLE_TYPES.GORE || p.type === DOG_PARTICLE_TYPES.DUST) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp01(p.opacity);
      ctx.translate(p.x, p.y);
      if (p.rotation) ctx.rotate(p.rotation);
      ctx.scale(p.scale, p.scale);
      if (p.type === DOG_PARTICLE_TYPES.DUST) {
        // DustTorch.png：12×30 竖排 3 帧（每帧 12×10，帧间 2px 透明行），按 p.frame 裁剪
        const frameW = p.tex.width;                     // 竖排：帧宽 = 整宽 = 12
        const frameH = Math.round(p.tex.height / 3);    // 帧高 = 高/3 = 10
        const fr = Math.max(0, Math.min(2, Math.floor(p.frame) % 3));
        ctx.drawImage(p.tex, 0, fr * frameH, frameW, frameH, -frameW / 2, -frameH / 2, frameW, frameH);
      } else {
        ctx.drawImage(p.tex, -p.tex.width / 2, -p.tex.height / 2);
      }
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.globalAlpha = clamp01(p.opacity);
    // ★ color tint：黑底贴图用 multiply（黑×色=黑→additive 不可见），透明底用 source-in（保 alpha 替 RGB）
    //   黑底贴图即使没传 color 也要过一遍「白色 multiply」（黑×白=黑→不可见），否则 jpg 黑底噪点 additive 会成发光矩形（已踩坑）
    const drawTex = p.blackBg
      ? tintBlackBgImg(p.tex, p.color || '#FFFFFF')
      : (p.color ? tintedImg(p.tex, p.color) : p.tex);
    // Transparent-bottom textures: temporarily revert to source-over
    if (TRANS_TEX.has(p.tex)) ctx.globalCompositeOperation = 'source-over';
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    const sx = p.scale * (p.type === DOG_PARTICLE_TYPES.SQUISHY ? p.squish : 1);
    const sy = p.scale / (p.type === DOG_PARTICLE_TYPES.SQUISHY ? Math.max(1, p.squish) : 1);
    ctx.scale(sx, sy);
    // center the texture
    if (drawTex.width && drawTex.height) {
      ctx.drawImage(drawTex, -drawTex.width / 2, -drawTex.height / 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

// ★ 贴图染色缓存：离屏 canvas + source-in 填充，保留原 alpha、替换 RGB（用于火花/软光的原版彩色）
const _tintCache = new Map();
export function tintedImg(tex, color) {
  if (!tex) return tex;
  const key = tex.src + '|' + color;
  let c = _tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const tctx = c.getContext('2d');
    tctx.drawImage(tex, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, c.width, c.height);
    _tintCache.set(key, c);
  }
  return c;
}

// ★ 黑底贴图染色缓存（multiply 混合）：黑底×色=黑（additive 下黑底仍不可见），白底×色=纯色（additive 下发光）
//   用于 GodSlayerDashJaw 等【黑底 + additive + 任意颜色】贴图——source-in 会把黑底也染成纯色导致「整张矩形变正方形」，勿用于黑底图
const _blackTintCache = new Map();
export function tintBlackBgImg(tex, color) {
  if (!tex) return tex;
  const key = tex.src + '|' + color;
  let c = _blackTintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const tctx = c.getContext('2d');
    tctx.drawImage(tex, 0, 0);
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, c.width, c.height);
    _blackTintCache.set(key, c);
  }
  return c;
}

// ★ 原版 sparkColor = Color.Lerp(随机(品红/浅蓝/黄昏紫), 白, 0.65) —— 65% 白混合的淡彩
//   预计算：Fuchsia→#FFA6FF  LightBlue→#D4ECFF  DoGTwlight→#E7CAFF
function sparkColor() {
  return ['#FFA6FF', '#D4ECFF', '#E7CAFF'][Math.floor(Math.random() * 3)];
}

// ★ 预热 DoG 过场特效（2026-08-14）：第一次按 P 卡顿的三处一次性开销——
//   ①漩涡门帧预渲染首帧 ②tint 染色缓存 ③噪声图读取。
//   在游戏空闲（requestIdleCallback，退化为 setTimeout）时全部提前做好，
//   按 P 时 getPortalFrames() 直接返回已渲染帧、tint 缓存命中 → 零一次性阻塞。
//   调用点：enterGame()（每次进 DoG 战斗，图片已加载完）。
export function prewarmDoGEffects() {
  if (!imgs.voronoi_shapes) return;
  // ★ 分片调度：每个空闲片只执行 1 个任务（1 张 tint 或触发分帧渲染），
  //   避免 requestIdleCallback 一口气做完所有预热造成一次长帧（headless 软渲染实测 233ms，已踩坑）
  const tasks = [];
  tasks.push(() => getPortalFrames());   // 首帧同步渲染 + 其余隔帧后台补齐（getPortalFrames 内部已分帧）
  const sparkCols = ['#FFA6FF', '#D4ECFF', '#E7CAFF'];
  if (imgs.sparkle) sparkCols.forEach(c => tasks.push(() => tintedImg(imgs.sparkle, c)));
  if (imgs.sparkle2) sparkCols.forEach(c => tasks.push(() => tintedImg(imgs.sparkle2, c)));
  if (imgs.bloom_circle) sparkCols.forEach(c => tasks.push(() => tintBlackBgImg(imgs.bloom_circle, c)));   // ★ 黑底 → multiply
  if (imgs.shine1) tasks.push(() => tintBlackBgImg(imgs.shine1, 'rgba(187,103,255,1)'));
  if (imgs.shine2) tasks.push(() => tintBlackBgImg(imgs.shine2, 'rgba(255,255,255,0.6)'));
  if (imgs.plasma_explosion) tasks.push(() => tintBlackBgImg(imgs.plasma_explosion, 'rgba(187,103,255,0.8)'));
  if (imgs.bloom_ring) tasks.push(() => tintBlackBgImg(imgs.bloom_ring, '#FFFFFF'));
  const idle = (typeof requestIdleCallback === 'function')
    ? (cb) => requestIdleCallback(cb, { timeout: 1000 })
    : (cb) => setTimeout(cb, 50);
  const run = () => {
    if (!tasks.length) return;
    tasks.shift()();
    idle(run);
  };
  idle(run);
}

// ── 缓动函数 ──

export function updateDoGAnimations(dt) {
  if (currentCharKey !== 'devourer_of_gods') return;
  const A = DoGAnim;
  const dtf = dt * 60;  // frame-normalized

  updateDogJaw(dt);   // 传真实秒级 dt（函数内部按秒累加 jawCharge/cooldown，并自算 fstep=dt*60）
  updateDogTeleport(dtf);
  updateDogDeath(dtf);
  updateDogLaserWall(dtf);
  updateDogPostTeleport(dtf);
  updateDogPhaseTransition(dt);   // P1→P2 过场（钻门→裂缝→冲刺）
  updateDogArmorFade(dt);        // ★ 6 键 armorOff 渐变切换（隐铠甲只留亮纹）
  updateDogParticles(dt);   // 粒子按寿命渐隐/销毁（原始秒级 dt，函数内部 ×60）
  // 传送裂隙视觉兜底：未激活时强制清零，避免“很亮的光球”残留
  if (!A.teleportActive) {
    A.riftOpacity = 0; A.crackExposure = 0; A.riftScale = 0; A.ringScale = 0;
  }
}

// ① 颌部咬合（v0812ax：长按蓄力 / 松开咬合）

export const JAW_MAX_CHARGE = 3;   // 蓄力上限（秒）：5s→3s，蓄力速率不变→更快；咬合程度(×1.35)不变

export const JAW_COOLDOWN = 1;     // 咬合后冷却（秒）

export function updateDogJaw(dt) {
  const A = DoGAnim;
  // 非 DoG 或非活动场景：清掉蓄力残留，避免切角色后卡在蓄力态
  if (currentCharKey !== 'devourer_of_gods') {
    A.jawCharging = false; A.jawCharge = 0; A.jawChargeScale = 1; A.jawShakeY = 0; A.maxChargeWarn = false;
    return;
  }
  const fstep = dt * 60;    // 帧步长（60fps≈1），用于“每帧”增量，保证 2~3 帧完成咬合

  // 咬合后冷却递减
  if (A.jawCooldown > 0) A.jawCooldown = Math.max(0, A.jawCooldown - dt);

  // 蓄力中：颚/头垂直轻震（幅度随蓄力增大）+ 颚尺寸增大 + 发光（绘制层读取以下字段）
  if (A.jawCharging) {
    A.jawCharge = Math.min(A.jawCharge + dt, JAW_MAX_CHARGE);
    const ratio = A.jawCharge / JAW_MAX_CHARGE;          // 0..1
    A.jawChargeRatio = ratio;                            // 供 'charging' 分支做渐进张开
    A.jawChargeScale = 1 + ratio * 0.35;                 // 最大 ×1.35（≈咬合动画叠加的 1.6× 观感）
    const amp = 1.5 + ratio * 4;                         // 垂直震动幅度：1.5→5.5px（已调小）
    A.jawShakeY = (Math.sin(animTime * 38) * 0.7 + (Math.random() - 0.5) * 0.6) * amp;
    A.maxChargeWarn = A.jawCharge >= JAW_MAX_CHARGE - 0.05;
  } else {
    A.jawChargeRatio = 0;
    A.jawChargeScale = 1;
    A.jawShakeY = 0;
    A.maxChargeWarn = false;
  }

  switch (A.jawState) {
    case 'charging':
      // 蓄力时两颚随蓄力进度逐渐张开（正值为张开，与底部枢轴几何一致）
      A.jawRotation = lerp(A.jawRotation, 0.5 * A.jawChargeRatio, Math.min(1, 0.15 * fstep));
      A.jawChompProgress = 0;
      break;
    case 'chomping': {
      // 松开后快速咬合：每帧 +0.6~0.8，2~3 帧内完成
      A.jawChompProgress = clamp01(A.jawChompProgress + 0.7 * fstep);
      // 咬合（闭合）：本引擎枢轴在颚底，jawRotation 取负值才让两颚尖端相向收拢（正值为张开，正是“乱甩”根因）
      A.jawRotation = lerp(A.jawRotation, -0.5, Math.min(1, 0.6 * fstep));   // 闭合
      // 火花：松开后两颚相交的一瞬间，出现在相交处（非鼠标位置）
      if (A.jawChompProgress >= 0.94 && A.shouldSpawnChompVFX) {
        const headSeg = segments[0], hp = points[0];
        if (headSeg && headSeg.img) {
          const phase2 = currentChar.phase >= 2;
          const hH = headSeg.img.height;
          const sinR = Math.sin(A.jawRotation);
          // 颚相交中心 = 左右两颚「尖端」相交处（非铰链、非鼠标位置）
          // 复用 drawDogJawInstance 几何：铰链在 jyCenter，颚向枢轴上方伸出，
          // 尖端(颚顶) = jyCenter - (jh*JAW_S)/2；咬合瞬间两颚尖在中心 (x≈0) 相交。
          const jawImg = phase2 ? imgs.jaw_final : imgs.jaw;
          const jh = jawImg ? jawImg.height : 96;
          const JAW_S = 1.2 * A.jawChargeScale;
          const JAW_Y_OFFSET = phase2 ? -4 : 18;
          const jyCenter = -hH / 2 - ((phase2 ? 44 : 8) + sinR * (phase2 ? 30 : -6)) + JAW_Y_OFFSET;
          const tipLocalY = jyCenter - (jh * JAW_S) / 2;   // 颚尖（交叉处）→ 颚底(铰链) 在 + 侧
          const ang = headSeg.angle + Math.PI / 2;
          const wx = hp.x - tipLocalY * Math.sin(ang);
          const wy = hp.y + tipLocalY * Math.cos(ang);
          // ① 咬合星火：数量↑、更亮更大更久（SPARKLE）
          for (let i = 0; i < 36; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 4.5;
            spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, wx, wy, {
              life: 30 + Math.random() * 30,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              scale: 0.5 + Math.random() * 0.7,
              spin: 0.1 + Math.random() * 0.2,
              tex: imgs.sparkle || imgs.sparkle2,
            });
          }
          // ② 咬合瞬间亮闪核（EXPLOSION）：交叉处叠加，进一步突出明显度
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 2;
            spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, wx, wy, {
              life: 18 + Math.random() * 14,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              scale: 0.4 + Math.random() * 0.5,
              finalScale: 1.5 + Math.random() * 1.5,
              tex: imgs.sparkle || imgs.sparkle2,
            });
          }
        }
        A.shouldSpawnChompVFX = false;
      }
      // 咬合完成瞬间（JawChompDownProgress >= 1.0）：触发屏幕震动，强度随蓄力时间增加
      if (A.jawChompProgress >= 1.0) {
        const chargeRatio = A.jawChargeAtRelease / JAW_MAX_CHARGE;   // 0..1 归一化蓄力比
        screenShake.set(8 + chargeRatio * 20);     // 满蓄力 ratio=1 → 峰值 28（与原 5s 峰值一致，不随上限改动而变）
        A.jawCooldown = JAW_COOLDOWN;                     // 咬合后 1 秒冷却
        A.jawState = 'reset';
        A.jawChompTimer = 0;
      }
      break;
    }
    case 'reset':
      A.jawRotation = lerp(A.jawRotation, 0, Math.min(1, 0.08 * fstep));
      if (Math.abs(A.jawRotation) < 0.02) { A.jawRotation = 0; A.jawState = 'idle'; }
      break;
    case 'open':
      A.jawRotation = lerp(A.jawRotation, 0.5, Math.min(1, 0.28 * dt));  // 张开（正值为张，与底部枢轴几何一致）
      break;
    case 'idle':
    default:
      A.jawRotation = lerp(A.jawRotation, 0, Math.min(1, 0.06 * dt));
      break;
  }
  // 冲刺颌部淡出：计时内保持满亮，计时结束后持续衰减到 0（修复高亮层永久残留）
  if (A.dashJawFadeTimer > 0) {
    A.dashJawFadeTimer -= dt;   // dt 已为真实秒：保持满亮 ~0.5s
    A.dashJawFadeProgress = 1;
  } else if (A.dashJawFadeProgress > 0.001) {
    A.dashJawFadeProgress = Math.max(0, A.dashJawFadeProgress - 3 * dt);  // ~0.33s 淡出（dt 为秒）
  }
}

// ② P2 变身过场（形态切换：每次按 6 在 P1↔P2 间切换；粒子一次性爆发后靠寿命自然渐隐）
// ③ 传送裂隙

export function updateDogTeleport(dt) {
  const A = DoGAnim;
  if (!A.teleportActive) return;
  A.teleportTimer -= dt;
  
  if (A.teleportStage === 0) {
    // charge: 裂纹生长
    const progress = clamp01(1 - A.teleportTimer / 90);
    A.crackScale = lerp(1, 4, progress);
    A.maxCrackExposure = lerp(0, 0.95, progress);
    A.crackExposure = lerp(A.crackExposure, A.maxCrackExposure, 0.075 * dt);
    A.riftOpacity = clamp01(A.riftOpacity + 0.05 * dt);
    A.riftScale = clamp01(A.riftScale + 0.02 * dt);
    A.ringScale = lerp(8, 0, progress);
    // 蓄力粒子
    if (Math.random() < 0.35) {
      spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, A.teleportX + (Math.random()-0.5)*60, A.teleportY + (Math.random()-0.5)*60, {
        life: 25 + Math.random()*15, vx:(Math.random()-0.5)*1.5, vy:(Math.random()-0.5)*1.5,
        scale: 0.2+Math.random()*0.3, spin:0.1, tex:imgs.sparkle,
      });
    }
    if (A.teleportTimer <= 60) {
      A.teleportStage = 1;  // boom!
      // 爆炸粒子爆发
      for (let i = 0; i < 15; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 5;
        const types = [DOG_PARTICLE_TYPES.SPARKLE, DOG_PARTICLE_TYPES.SQUISHY, DOG_PARTICLE_TYPES.BLOOM, DOG_PARTICLE_TYPES.PULSE];
        spawnDogParticle(types[i%4], A.teleportX, A.teleportY, {
          life: 30+Math.random()*30, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
          scale: 0.5+Math.random(), finalScale: 2+Math.random()*2, spin:0.08,
          blackBg: i%4 >= 2,   // ★ bloom_circle 黑底（200×200 四角 a255）必须 blackBg，否则矩形
          tex: [imgs.sparkle, imgs.sparkle2, imgs.bloom_circle, imgs.bloom_circle][i%4],
        });
      }
      // 脉冲环
      spawnDogParticle(DOG_PARTICLE_TYPES.RING, A.teleportX, A.teleportY, {
        life: 45, scale: 0.5, finalScale: 8, blackBg: true,   // ★ hollow_circle 黑底 a255
        tex: imgs.hollow_circle,
      });
      A.crackScale += 3;
      screenShake.set(10);
    }
  } else if (A.teleportStage === 1) {
    // dissipate：用与 stage1 实际时长一致的归一化，确保光球/裂隙平滑淡出到 0
    const dissT = clamp01(1 - A.teleportTimer / 60);
    A.riftOpacity = lerp(1, 0, dissT);
    A.crackExposure = lerp(A.maxCrackExposure, 0, dissT);
    if (A.teleportTimer <= 0) {
      A.teleportActive = false;
      // 硬重置所有裂隙视觉状态，避免“很亮的光球”残留
      A.riftOpacity = 0; A.crackExposure = 0; A.riftScale = 0; A.ringScale = 0;
      A.teleportStage = 0;
    }
  }
}

// ④ 死亡动画

export function updateDogDeath(dt) {
  const A = DoGAnim;
  // ★ 2026-08-18 爆炸后白屏时间线：渐白(0-35帧) → 全白持续 1s(35-95) → 渐恢复(95-155)
  //   独立计时不依赖 deathActive（死亡结束后的恢复阶段继续播放）；激活期间禁止外层衰减
  if (A.deathWhiteActive) {
    A.deathWhiteT += dt;
    const wt = A.deathWhiteT;
    if (wt < 35) A.deathFlash = Math.max(A.deathFlash, wt / 35);          // 渐白 0→1
    else if (wt < 95) A.deathFlash = 1;                                    // 全白持续 60 帧（1s）
    else if (wt < 155) A.deathFlash = Math.max(0, 1 - (wt - 95) / 60);     // 渐恢复
    else { A.deathWhiteActive = false; A.deathFlash = 0; }
  } else {
    // 白闪衰减：非白屏时间线时，即使死亡动画结束也继续，直到归零（避免特效冻结）
    if (A.deathFlash > 0) A.deathFlash = Math.max(0, A.deathFlash - 0.025 * dt);
  }
  if (A.deathExploded && A.deathExplodeT < 1.5) A.deathExplodeT += dt / 60;
  // ★ 2026-08-18 DoGDeathBoom：180 帧生命周期（原版 Lifetime），半径指数逼近 MaxRadius
  if (A.deathBoomActive) {
    A.deathBoomT += dt;
    A.deathBoomRadius = lerp(A.deathBoomRadius, DEATH_BOOM_MAX_RADIUS, 0.25);   // 原版 CurrentRadius = Lerp(cur, Max, 0.25)
    // 屏震：Convert01To010(pulse) × 28（原版），pulse = 剩余比例 1→0
    const boomPulse = clamp01(1 - A.deathBoomT / DEATH_BOOM_LIFETIME);
    const pulse010 = boomPulse < 0.5 ? boomPulse * 2 : (1 - boomPulse) * 2;     // 0→1→0 三角波
    screenShake.set(pulse010 * DEATH_BOOM_SHAKE);
    if (A.deathBoomT >= DEATH_BOOM_LIFETIME) A.deathBoomActive = false;
  }
  if (!A.deathActive) return;
  A.deathTimer += dt;
  if (A.deathStage === 0) {
    // slowdown（原版 DoDeathAnimation：死亡时继续飞行但逐渐减速，见 Scourge.update 死亡分支）
    if (A.deathTimer >= 30) A.deathStage = 1;
  } else if (A.deathStage === 1) {
    // destroy segments one by one（原版 120-370 每 3 帧一节、60 节均匀崩完 = GetLerpValue(120,370)*60）
    //   ★ 我们的 bodyCount 只有 10（≈11 节），若按原版每 3 帧 1 节会在 33 帧内崩完（太快）。
    //   改为把整条虫均匀映射到 120-370 窗口：每节约 22 帧，观感与原版"逐节慢崩"一致。
    //   ★ 崩解顺序【从尾部开始】（用户明确要求）：step 0 崩 tail(最后一段) → 往头部方向逐节 →
    //     head(0) 最后崩。全部硬消失（deathGone 标记 + 绘制跳过，无渐隐）。
    if (A.deathTimer >= 120 && A.deathTimer < 370 && Math.floor(A.deathTimer) % 3 === 0) {
      const progress = (A.deathTimer - 120) / (370 - 120);                       // 0→1
      const total = Math.max(2, segments.length);                                // head + body + tail
      const step = Math.min(total - 1, Math.floor(progress * total));            // 0..total-1
      const idx = (total - 1) - step;                                            // 尾→头：最后崩 head(0)
      if (points[idx] && segments[idx] && !segments[idx].deathGone) {
        // ★ 2026-08-18 体节消失（原版 n.active=false）：标记后 base/glow 均跳过绘制（硬消失）
        segments[idx].deathGone = true;
        destroySegmentFx(idx, 2);
      }
    }
    if (A.deathTimer >= 370) A.deathStage = 2;
  } else if (A.deathStage === 2) {
    // ★ 2026-08-18 原版 410-470 每 2 帧崩 10 节 tail（反向从尾部崩）
    if (A.deathTimer >= 410 && A.deathTimer < 470 && Math.floor(A.deathTimer) % 2 === 0) {
      const tailDone = Math.floor((A.deathTimer - 410) / 2);       // 0..29
      const idx = segments.length - 1 - tailDone;                  // 尾部往前
      if (idx > 0 && segments[idx] && !segments[idx].deathGone) {
        segments[idx].deathGone = true;
        destroySegmentFx(idx, 2);
      }
    }
    // explode（原版 452 帧：DoGDeathBoom 生成 + 全屏白闪）
    if (!A.deathExploded && A.deathTimer >= 452) {
      A.deathExploded = true;
      A.deathExplodeT = 0;
      A.deathExplodeX = points[Math.floor(segments.length/2)].x;
      A.deathExplodeY = points[Math.floor(segments.length/2)].y;
      // ★ 2026-08-18 DoGDeathBoom 启动（原版 Projectile.NewProjectile DoGDeathBoom，Lifetime 180）
      A.deathBoomActive = true;
      A.deathBoomT = 0;
      A.deathBoomRadius = 40;
      A.deathBoomX = A.deathExplodeX;
      A.deathBoomY = A.deathExplodeY;
      // ★ 2026-08-18 白屏时间线启动：爆炸后渐白 → 全白 1s → 渐恢复
      A.deathWhiteActive = true;
      A.deathWhiteT = 0;
      A.deathFlash = 0;
      screenShake.set(15);
      // 原版 SpawnExplosionVisuals 风格的爆炸粒子（保留部分，作为 Boom 的补充细节）
      const cx = A.deathExplodeX, cy = A.deathExplodeY;
      for (let i = 0; i < 40; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 7;
        spawnDogParticle(DOG_PARTICLE_TYPES.PULSE, cx, cy, {
          life: 50+Math.random()*30, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
          scale: 1+Math.random(), finalScale: 4+Math.random()*4,
          blackBg: true, color: 'rgba(187,103,255,0.8)',
          tex: imgs.plasma_explosion || imgs.shine1,
        });
      }
      for (let i = 0; i < 16; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 4;
        spawnDogParticle(DOG_PARTICLE_TYPES.BLOOM, cx, cy, {
          life: 40+Math.random()*20, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
          scale: 1+Math.random()*2, blackBg: true, tex: imgs.bloom_circle,
        });
      }
    }
    // ★ 2026-08-18 白屏时间线已在上方独立驱动（deathWhiteActive），不再在此逐帧渐亮
    if (A.deathTimer >= 485) A.deathStage = 3;
  } else if (A.deathStage === 3) {
    // vanish: dissolve
    A.deathOpacity = lerp(A.deathOpacity, 0, 0.03 * dt);
    if (A.deathOpacity <= 0.02) {
      A.deathActive = false;
      A.deathOpacity = 0;
      A.deathBoomActive = false;   // 死亡结束强制关 Boom（兜底）
      // ★ 白屏时间线不在此强制关：deathWhiteActive 独立计时，渐恢复阶段继续播放完
      // ★ 清理 deathGone 标记（下次死亡/R 重置时体节恢复可见；buildSegments 也会重建数组清掉）
      for (let i = 0; i < segments.length; i++) segments[i].deathGone = false;
    }
  }
}

// ★ 2026-08-18 体节崩解特效：1~2 个 DoGS gore（透明底原图直出）+ 20 个 DustTorch 3 帧尘暴
function destroySegmentFx(idx, goreCount) {
  if (!points[idx]) return;
  // gore 碎肉（原版 n.HitEffect() 生成 DoGS-DoGS6）：随机方向初速度 + 重力 + 旋转；
  //   透明底原图直出（blackBg:false + color:null）——DoGS 本身是紫粉能量碎肉，不再 multiply 染色
  if (imgs.gore_dog && imgs.gore_dog.length) {
    for (let g = 0; g < goreCount; g++) {
      const goreIdx = Math.min(imgs.gore_dog.length - 1, (idx + g) % imgs.gore_dog.length);
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 4;
      spawnDogParticle(DOG_PARTICLE_TYPES.GORE, points[idx].x, points[idx].y, {
        life: 120 + Math.random() * 40,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,   // 向上偏一点 + 重力下落
        scale: 0.8 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
        tex: imgs.gore_dog[goreIdx],
        blackBg: false,        // ★ 透明底，原图直出
        color: null,
      });
    }
  }
  // 20 个青色火光尘（原版 DustID.BoneTorch），DustTorch.png 3 帧动画，透明底原图直出
  if (imgs.dust_torch) {
    for (let j = 0; j < 20; j++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 9;
      spawnDogParticle(DOG_PARTICLE_TYPES.DUST, points[idx].x, points[idx].y, {
        life: 30 + Math.random() * 20,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        scale: 0.8 + Math.random() * 0.5,      // ★ 2026-08-18 用户要求改小：1.3~2.1 → 0.8~1.3
        tex: imgs.dust_torch,
        blackBg: false,        // ★ 透明底原图直出（不再 multiply 染色成方块）
        color: null,
      });
    }
  }
}

// ⑤ 激光墙：按键触发可见特效（旋转激光墙 + 中心粗激光，约 5 秒）

export function updateDogLaserWall(dt) {
  const A = DoGAnim;
  if (!A.laserActive) { A.laserFX = 0; A.laserTime = 0; if (_laserGL) _laserGL.clear(); return; }
  A.laserTime += dt;                          // 帧（原版 time += attackSpeed）
  A.laserSine = Math.sin(A.laserTime * 4 / Math.PI);   // 原版 sine = sin(time*4/π) 宽度脉动
  if (!A.laserDoneAttack) {
    // 淡入：0→30 帧 laserFX 0→1（原版 time==0 设 1，opacity 0.3×fx² 预警）
    A.laserFX = Math.min(1, A.laserTime / 30);
    if (A.laserTime >= 30) {
      // ★ 攻击（原版 attackTime=30）：laserFX=3、屏震 7、BigBeam 触发（storedTime+10 帧结束）
      A.laserDoneAttack = true;
      A.laserStoredTime = A.laserTime;
      A.laserFX = 3;
      screenShake.set(7);
      A.laserBigBeamActive = true;
      A.laserBigBeamTime = 0;
      A.laserBigBeamFX = 2.5;
    }
  } else {
    // 攻击后 10 帧内 drawColor = Lerp(Cyan, Magenta, pow(GetLerpValue(endTime, storedTime, time),2))
    const g = clamp01((A.laserTime - A.laserStoredTime) / 10);
    const g2 = g * g;
    A.laserColor = [lerp(0, 255, g2), lerp(221, 0, g2), lerp(250, 255, g2)];
    // 最后 30 帧衰减（demo 保持 8s：450 帧后 laserFX 3→0 淡出；总帧数 480 = 8s × 60fps）
    if (A.laserTime > 450) A.laserFX = Math.max(0, 3 - ((A.laserTime - 450) / 30) * 3);
  }
  // BigBeam（DoGLaserWallsBigBeam.cs）：attack 后 10 帧，FX 2.5→0，颜色 Magenta→Cyan（与网格反向）
  if (A.laserBigBeamActive) {
    A.laserBigBeamTime += dt;
    A.laserBigBeamFX = Math.max(0, 2.5 - (A.laserBigBeamTime / 10) * 2.5);
    const gb = clamp01(A.laserBigBeamTime / 10);
    const gb2 = gb * gb;
    A.laserBigBeamColor = [lerp(255, 0, gb2), lerp(0, 221, gb2), lerp(255, 250, gb2)];
    if (A.laserBigBeamTime >= 10) A.laserBigBeamActive = false;
  }
  A.laserTimer -= dt;
  if (A.laserTimer <= 0) { A.laserActive = false; A.laserFX = 0; if (_laserGL) _laserGL.clear(); }
}

// ★ 6 键 armorOff 渐变切换（隐铠甲只留亮纹，不瞬换贴图）
//   阶段 0=铠甲淡出(0.6s) → 1=原位切换(0.1s，翻转 armorOff + buildSegments) → 2=铠甲淡入(0.6s)
const ARMOR_FADE_OUT = 0.6;   // 铠甲淡出时长（秒）
const ARMOR_FADE_SWAP = 0.1;  // 原位切换窗口（秒）
const ARMOR_FADE_IN = 0.6;    // 铠甲淡入时长（秒）

export function startArmorFadeTransition() {
  const A = DoGAnim;
  if (A.armorFadeActive || currentChar.phase < 2 || A.ptActive || A.deathActive) return;  // 仅 P2；渐变中/过场中/死亡中忽略
  A.armorFadeActive = true;
  A.armorFadeStage = 0;
  A.armorFadeTimer = 0;
  A.armorFadeAlpha = 1;
  A.armorFadeTarget = !currentChar.armorOff;   // 目标 = 与当前相反
}

export function updateDogArmorFade(dt) {
  const A = DoGAnim;
  if (!A.armorFadeActive) return;
  A.armorFadeTimer += dt;
  if (A.armorFadeStage === 0) {                 // ① 铠甲淡出：base alpha 1→0，glow 满亮
    A.armorFadeAlpha = Math.max(0, 1 - A.armorFadeTimer / ARMOR_FADE_OUT);
    if (A.armorFadeTimer >= ARMOR_FADE_OUT) {
      A.armorFadeStage = 1;
      A.armorFadeTimer = 0;
      A._armorSwapped = false;
    }
  } else if (A.armorFadeStage === 1) {          // ② 原位切换：只换贴图引用，不动 points
    if (!A._armorSwapped) {                     // 进入本阶段立即执行（不依赖 timer，防大帧间隔漏执行）
      A._armorSwapped = true;
      // ★ 原位换皮：先存位置+角度，buildSegments() 重建贴图引用后会重置 points/角度，
      //   立即恢复 → 虫体完全不瞬移、不拉直，仅 base 贴图引用变化（此时 alpha=0 不可见）
      const oldPos = points.map(p => ({ x: p.x, y: p.y }));
      const oldAngles = segments.map(s => s.angle);
      currentChar.armorOff = !!A.armorFadeTarget;
      buildSegments();
      for (let i = 0; i < points.length && i < oldPos.length; i++) {
        points[i].x = oldPos[i].x; points[i].y = oldPos[i].y;
      }
      for (let i = 0; i < segments.length && i < oldAngles.length; i++) {
        segments[i].angle = oldAngles[i];
      }
      const cx = points[0].x, cy = points[0].y;
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 3;
        spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, {
          life: 30 + Math.random() * 25,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          scale: 0.25 + Math.random() * 0.4,
          spin: 0.08 + Math.random() * 0.1,
          tex: Math.random() < 0.5 ? imgs.sparkle : imgs.sparkle2,
        });
      }
      screenShake.set(4);
    }
    if (A.armorFadeTimer >= ARMOR_FADE_SWAP) {
      A.armorFadeStage = 2;
      A.armorFadeTimer = 0;
    }
  } else if (A.armorFadeStage === 2) {          // ③ 铠甲淡入：base alpha 0→1
    A.armorFadeAlpha = Math.min(1, A.armorFadeTimer / ARMOR_FADE_IN);
    if (A.armorFadeTimer >= ARMOR_FADE_IN) {
      A.armorFadeActive = false;
      A.armorFadeAlpha = 1;
      A._armorSwapped = false;
    }
  }
}

// ⑥ 传送后透明度恢复

export function updateDogPostTeleport(dt) {
  const A = DoGAnim;
  if (A.postTeleportTimer > 0) {
    A.postTeleportTimer -= dt;
    A.opacity = 1 - (A.postTeleportTimer / 255);
    if (A.postTeleportTimer <= 0) {
      A.opacity = 1;
      A.postTeleportTimer = 0;
    }
  }
}

// ── P1→P2 过场：钻入传送门 → 裂缝震屏 → 二阶段冲刺钻出 ──

// 过场各段时长（秒），集中在此便于调手感
const PT_DIVE_IN_DUR    = 1.85;   // Stage 0: P1 慢慢钻入传送门（再慢一点，门全程常开）
const PT_IMPLODE_DUR    = 0.45;   // Stage 1: 传送门内爆消失 + 第一次震屏 + 裂缝出现
const PT_POST_DIVE_PAUSE= 0.6;    // ★ Stage 1 前置停顿：虫全部没入传送门后【门保持全开】停一会儿，
                                  //   再内爆+第一次撞击（用户反馈「进传送门和第一下撞击间隔太近」）。
                                  //   Stage1 总时长 = PT_IMPLODE_DUR + PT_POST_DIVE_PAUSE，加长只改这一个数。
const PT_RIFT_DELAY     = 1.3;    // Stage 2: 裂缝停留（两次撞击间隔），结束时触发第二次震屏
// ★ 裂纹逐次放大机制（DoGTeleportRift.cs 原版）：
//   第1次撞击 → 裂纹从无到 PT_CRACK_STEP1（小，玻璃刚裂）
//   蓄力期每段（第2/3次小撞击）→ ptCrackScale += PT_CRACK_STEP_INC × interp × 0.75（interp=1→2 递增）
//   最终爆炸 → ptCrackScale += PT_CRACK_FINAL_BOOST（+=3，直接跳最大）+ 25 条放射裂纹
const PT_CRACK_STEP1    = 0.9;    // 第 1 次撞击后的裂纹缩放（很小，不是一开始就巨大）
const PT_CRACK_STEP_INC = 0.525;  // 每次小撞击的裂纹缩放增量基数（原版 0.525）
const PT_CRACK_FINAL_BOOST = 3;   // 最终爆炸裂纹缩放猛增（原版 CrackScale += 3）

// ★ 2026-08-18 DoGDeathBoom 常量（原版 DoGDeathBoom.cs + BaseMassiveExplosionProjectile）
const DEATH_BOOM_LIFETIME = 180;      // 原版 Lifetime = 180（帧）
const DEATH_BOOM_MAX_RADIUS = 4200;   // 原版 MaxRadius = 4200（全屏覆盖）
const DEATH_BOOM_SHAKE = 28;          // 原版 Convert01To010(pulse) × 28（屏震峰值）
const PT_CHARGE_SPEED   = 3000;   // Stage 3: 冲刺初速（px/s，确保过冲；2026-08-14 由 2000 提到 3000，用户反馈「冲出来不够快」）
const PT_FRICTION       = 0.94;   // Stage 3-4: 速度摩擦/帧
const PT_CHARGE_THRESH  = 2;      // Stage 4→5: 恢复跟随的速度阈值（px/帧）
const PT_PORTAL_SCALE   = 2.0;    // 漩涡门绘制缩放（原版 Projectile.scale * 3.5；此处按画面缩小到 2.0）
export const PT_DIVE_SPEED = 480;   // Stage 0: 头部沿锁定方向穿过传送门的速度，单位 px/【秒】
                                    //   ★ 必须是 px/秒 并在 Scourge.update 里按 dt 积分，不能用 px/帧：
                                    //     px/帧在低帧率机器上实际速度会成比例变慢，而 Stage0 兜底时长是按秒算的
                                    //     → 虫走不完全程就被强制结束，尾巴几节突然凭空消失（已踩坑，27fps 下实测复现）。
                                    //   ★ 穿针行程 = PT_DIVE_DIST + 整条链长 + core（约 750px）→ 480px/s 约 1.6s，
                                    //     头部推进明显快于门内吸入收拢，整条虫呈「冲进门」而非「被门口吸没」
                                    //     （2026-08-14 由 320 提到 480，用户反馈「消失比进快」）。
                                    //   ★ 调整这一段快慢只改这个值。
export const PT_DIVE_DIST      = 300;    // 传送门放在头部前方的距离（px）—— 同时也是爆炸点 / P2 钻出点（三处合一）
export const PT_VANISH_CORE    = 22;     // Stage 0: 体节中心进入门中心该半径内 → 判定「已没入」，永久消失
export const PT_VANISH_BAND    = 108;    // Stage 0: 消散带宽度（px）。距门中心 (core, core+band] 内平滑缩小+淡出
                                    //   ★ band=108 → 消散带外缘在 core+band=130px，刚好落在传送门可见口(~128px)内，
                                    //     体节从「刚进门口」就开始缩小、到正中心彻底消失，全程都在门里，不会在门外突兀缩没。
export const PT_SUCTION        = 430;    // Stage 0: 靠近传送门的体节被「吸入」的额外拉力(px/s)，越近越强。
                                    //   ★ 解决「虫像被直线射穿、前端凭空变没、后端还远远吊着」的观感：
                                    //     让体节在门前被收拢、压缩着涌进门中心，呈现「整条虫被吸进去」而非「前端被删、后端不动」。
                                    //   ★ 只拉体节(pull toward 门中心)、不拉头部(头部由锁定方向领航)，且消失判定仍是 core 半径，
                                    //     所以体节依旧是「触到正中心才消失」，不会被吸力提前在门外抹掉。
const PT_EMERGE_MARGIN  = 90;     // 门坐标夹在屏幕内的边距（保证门/爆炸都在可视区）
const PT_WATCHDOG       = 8.0;    // 异常卡死兜底总时长（穿针模型 Stage0 变长 → 相应放宽）

export function startPhaseTransition() {
  const A = DoGAnim;
  if (A.ptActive || currentChar.phase >= 2) return;
  A.ptActive = true;
  A.ptStage = 0;
  A.ptTimer = PT_DIVE_IN_DUR;
  A.ptOpacity = 1;
  A.ptPortalScale = 0;
  const head = points[0];
  // ★ 门放在头部【前方】（沿当前朝向），虫才会自己飞进去
  const headAng = (segments[0] && segments[0].angle) ? segments[0].angle : 0;
  let px = head.x + Math.cos(headAng) * PT_DIVE_DIST;
  let py = head.y + Math.sin(headAng) * PT_DIVE_DIST;
  const m = PT_EMERGE_MARGIN;   // 与钻出点共用同一边距，保证门/爆炸都在可视区
  px = Math.max(m, Math.min(W - m, px));
  py = Math.max(m, Math.min(H - m, py));
  A.ptPortalX = px;
  A.ptPortalY = py;
  // ★ Stage0 飞行方向【一次锁定】：从当前头部位置指向（已夹屏的）门中心。
  //   全程沿这条直线匀速前进，头部穿过门中心后继续飞出去。
  //   绝不能每帧重算「朝向门中心」——那样头部逼近门中心时单帧步长会超过剩余距离，
  //   越过后方向反转、再走回来，形成原地震荡，整条虫永远穿不过门（已踩坑）。
  const dirDx = px - head.x, dirDy = py - head.y;
  const dirLen = Math.hypot(dirDx, dirDy) || 1;
  A.ptDiveUx = dirDx / dirLen;
  A.ptDiveUy = dirDy / dirLen;
  A.ptChargeActive = false;
  A.ptShake1Done = false;
  A.ptBurst = 0; A.ptCrackScale = 0;   // 撞击闪光 / 裂纹累计缩放，每次过场重置
  A.ptCracks = null; A.ptCracksT = 0;
  A.ptChargeStep = 0; A.ptCrackExpose = 0;
  A.ptDiveActive = true;   // 头部开始冲向门
  A.ptChargeVx = 0; A.ptChargeVy = 0;
  A.ptTime = 0;
  // 整条虫体节链总长（segments[i].dist 为第 i 节到前一节的距离，i>=1）——仅作文档/兜底参考
  let totalLen = 0;
  for (let i = 1; i < segments.length; i++) totalLen += segments[i].dist || 0;
  A.ptTotalLen = totalLen;
  // ★「穿针」吸入：门中心 + 触碰半径 + 消散带（纯空间判定，见 globals.js dogClip 注释）
  dogClip.px = px; dogClip.py = py;
  dogClip.core = PT_VANISH_CORE;
  dogClip.band = PT_VANISH_BAND;
  dogClip.active = false;   // 钻入阶段每帧再开启
  // 清除上一次过场留下的「已没入」标记（segments 可能被复用）
  for (let i = 0; i < segments.length; i++) segments[i].ptGone = false;
  // ★ Stage0 兜底时长：必须按【实际最远体节（通常是尾节）到门中心的初始距离】算，
  //   不能按 segments[i].dist 之和（那只是「相邻节间距之和」，而贴图彼此大幅重叠，虫的几何体长远大于它，
  //   旧版据此算出的 travel 过短 → 尾节差一点没走到门中心就被兜底时长截断、被强制收拢 → 末尾突兀凭空消失）。
  //   正常由「所有体节均已没入(allGone)」提前结束；此 timer 只是兜底上限，留足余量让尾节真正走到中心。
  let maxDist = 0;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - px, points[i].y - py);
    if (d > maxDist) maxDist = d;
  }
  //   但虫在触发瞬间可能蜷曲，straight-line 的 maxDist 会低估真实行进路程(实测低估约 2×)，
  //   故乘 2.4 余量 + 180px 容差；正常都由 allGone(尾节真到中心)提前结束，这里只是兜底上限。
  const travel = maxDist + PT_VANISH_CORE + 180;   // 尾节到门距离 + 容差(链跟随滞后/蜷曲低估)
  A.ptTimer = Math.max(PT_DIVE_IN_DUR, (travel / PT_DIVE_SPEED) * 2.4);
  A.ptDiveDur = A.ptTimer;   // 记录本次 Stage0 上限（门展开进度按它归一）
  // ★ 钻出/裂缝位置：传送门所在处 + 【随机偏移】——每次 P 裂缝出现在不同位置
  //   （用户反馈「裂缝每次都在传送门消失的位置，改在其他位置」；偏移半径 180-280px 随机方向，
  //     保证不叠在门中心、也不至于飞出屏幕。P2 钻出点/冲刺方向都随该点走，逻辑不变）
  const offAng = Math.random() * Math.PI * 2;
  const offDist = 180 + Math.random() * 100;
  A.ptEmergenceX = px + Math.cos(offAng) * offDist;
  A.ptEmergenceY = py + Math.sin(offAng) * offDist;
  // 记录此刻鼠标位置（冲刺目标：朝鼠标高速过冲）
  A.ptMouseAtEmergeX = mouse.x;
  A.ptMouseAtEmergeY = mouse.y;
}

export function updateDogPhaseTransition(dt) {
  const A = DoGAnim;
  if (!A.ptActive) return;
  A.ptTime += dt;   // shader 动画时间
  A.opacity = A.ptOpacity;  // 每帧同步到通用透明度（drawSegmentsBase / drawSegmentsGlow 读取）
  A.ptBurst = Math.max(0, A.ptBurst - dt * 2.5);   // 撞击闪光衰减（每次撞击置 1 后 ~0.4s 消散）

  // 防御：异常卡死兜底——过场任何情况下不超过 PT_WATCHDOG，强制恢复鼠标跟随（杜绝"虫飞走不回来"）
  if (A.ptTime > PT_WATCHDOG) {
    A.ptActive = false; A.ptStage = 5; A.ptOpacity = 1;
    A.ptChargeActive = false; A.ptDiveActive = false;
    dogClip.active = false;   // 异常兜底也要关裁剪，避免残留吞节状态
    dogClip.band = 0;
    // 清掉「已没入」标记，否则恢复跟随后被标记的体节永久不可见
    for (let i = 0; i < segments.length; i++) segments[i].ptGone = false;
    if (currentChar.phase < 2) { currentChar.phase = 2; buildSegments(); }
    return;
  }

  switch (A.ptStage) {
    case 0: { // DIVE_IN：蠕虫持续飞向传送门并【穿过】它，每个体节各自走到门正中心时消失
      A.ptTimer -= dt;
      const dur = A.ptDiveDur || PT_DIVE_IN_DUR;
      const progress = clamp01(1 - A.ptTimer / dur);
      // 不整条淡出：由 drawSegmentsBase/Glow 按「体节到门中心的距离」逐节缩小+淡出+消失
      A.ptOpacity = 1;
      // 门：前 18% 展开，之后保持满开（钻入全程门都开着 → 延迟消失）
      if (progress < 0.18) A.ptPortalScale = lerp(0, 1, progress / 0.18);
      else A.ptPortalScale = 1;

      // ★ 空间判定：任何体节中心一旦进入门中心的 core 半径 → 永久标记「已没入」。
      //   用永久标记而非纯距离，是因为体节会【穿过】门继续前行，纯距离判定会让它在门后「复活」。
      dogClip.active = true;
      let allGone = true;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].ptGone) continue;
        const p = points[i];
        if (!p) continue;
        if (Math.hypot(p.x - dogClip.px, p.y - dogClip.py) <= dogClip.core) segments[i].ptGone = true;
        else allGone = false;
      }

      // 整条虫（含尾节）都已没入 → 先停顿（门保持开），再内爆；ptTimer 仅作异常兜底上限
      if (allGone || A.ptTimer <= 0) {
        A.ptStage = 1;
        A.ptTimer = PT_IMPLODE_DUR + PT_POST_DIVE_PAUSE;   // ★ 停顿 + 内爆总时长
        A.ptDiveActive = false;   // 头部停止穿门推进
        dogClip.active = false;   // 钻入结束，后续阶段改用 opacity 隐形
        // 体节收拢到门位置（P2 从同一点钻出，避免残留坐标导致方向错乱）
        for (let i = 0; i < points.length; i++) {
          points[i].x = A.ptPortalX;
          points[i].y = A.ptPortalY;
        }
        A.ptOpacity = 0;   // 完全隐形
      }
      break;
    }
    case 1: { // POST_DIVE → IMPLODE：虫全部没入后先停顿（门保持全开），再内爆 + 第一次震屏 + 裂缝
      A.ptTimer -= dt;
      const total1 = PT_IMPLODE_DUR + PT_POST_DIVE_PAUSE;
      const elapsed1 = total1 - A.ptTimer;   // 0 → total1
      const p = clamp01((elapsed1 - PT_POST_DIVE_PAUSE) / PT_IMPLODE_DUR);  // 停顿期恒 0，内爆期 0→1
      if (elapsed1 < PT_POST_DIVE_PAUSE) {
        // ★ 停顿期：门保持全开（虫已全部没入，能量蓄积），撞击/裂缝/震屏都未触发
        A.ptPortalScale = 1;
      } else {
        A.ptPortalScale = lerp(1, 0, p);   // 门内爆，缓缓消失
        // ★ 第一次撞击（原版 DoGTeleportRift AIState0 Timer=0 分支）——**必须很轻**：
        //   12 火花 + 8 软光 + 微震 ~4.8 + ShineExplosion2 小闪光，无大爆炸/无放射裂纹/无环星爆发。
        //   （旧版震屏 16 + 20 随机粒子 + RING 大环 + 环星爆发 → 比后面爆炸还强，用户已指出时机错误）
        if (!A.ptShake1Done) {
          A.ptShake1Done = true;
          screenShake.set(5);    // 微震 6×interp(1)×0.8 ≈ 4.8（原版）
          A.ptCrackScale = PT_CRACK_STEP1;   // ★ 第1次撞击：裂纹裂到「小」（玻璃刚开始裂，原版 CrackScale）
          const ex = A.ptEmergenceX, ey = A.ptEmergenceY;
          // 12 火花（SparkParticle：速度 8-12×interp(1)×0.7，色=lerp(粉/蓝/紫,白,0.65)，scale ×0.6 再缩小）
          for (let i = 0; i < 12; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = (8 + Math.random() * 4) * 0.7;
            spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, ex, ey, {
              life: 30 + Math.random() * 15,
              vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
              scale: 0.5 + Math.random() * 0.17,
              color: sparkColor(), tex: Math.random() < 0.5 ? imgs.sparkle : imgs.sparkle2,
            });
          }
          // 8 软光（SquishyLightParticle：速度 12-14×interp(1)×0.5，scale ×0.6）
          for (let i = 0; i < 8; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = (12 + Math.random() * 2) * 0.5;
            spawnDogParticle(DOG_PARTICLE_TYPES.SQUISHY, ex, ey, {
              life: 30 + Math.random() * 15,
              vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
              scale: 0.5 + Math.random() * 0.17,
              color: sparkColor(), blackBg: true, tex: imgs.bloom_circle,   // ★ bloom_circle 黑底 → multiply 染色
            });
          }
          // 小闪光（CustomPulse ShineExplosion2，scale 0.5×interp(1)；黑底 jpg 必须 blackBg，否则发光矩形）
          spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, ex, ey, {
            life: 45, scale: 0.35, finalScale: 0.35, blackBg: true, tex: imgs.shine2,
          });
        }
      }
      if (A.ptTimer <= 0) {
        A.ptStage = 2;
        A.ptTimer = PT_RIFT_DELAY;
        A.ptPortalScale = 0;   // 门彻底消失
      }
      break;
    }
    case 2: { // RIFT_DELAY：裂缝停留（蓄力期），期间分 3 段充电（火花+软光+微震+曝光递增），结束时第二次撞击
      A.ptTimer -= dt;
      // ★ 蓄力分段（原版 AIState 0：Timer % (Lifetime/3) 时触发增强）：
      //   1.3s 内分 3 段，每段 12 火花 + 8 软光 + 微震 + 小闪光 + 裂纹曝光递增
      const segDur = PT_RIFT_DELAY / 3;
      const elapsed2 = PT_RIFT_DELAY - A.ptTimer;
      const targetStep = Math.min(3, Math.floor(elapsed2 / segDur) + 1);
      while (A.ptChargeStep < targetStep && A.ptChargeStep < 2) {
        A.ptChargeStep++;
        const interp = lerp(1, 2, A.ptChargeStep / 3);   // 强度逐段递增（effectsLifetimeInterpolant）
        const ex = A.ptEmergenceX, ey = A.ptEmergenceY;
        // 12 火花（SparkParticle：速度 8-12×interp×0.7，色 = lerp(粉/蓝/紫, 白, 0.65)，scale ×0.6 再缩小）
        for (let i = 0; i < 12; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = (8 + Math.random() * 4) * interp * 0.7;
          spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, ex, ey, {
            life: 30 + Math.random() * 15,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            scale: (0.5 + Math.random() * 0.17) * interp * 0.62,
            color: sparkColor(), tex: Math.random() < 0.5 ? imgs.sparkle : imgs.sparkle2,
          });
        }
        // 8 软光（SquishyLightParticle，scale ×0.6）
        for (let i = 0; i < 8; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = (12 + Math.random() * 2) * interp * 0.5;
          spawnDogParticle(DOG_PARTICLE_TYPES.SQUISHY, ex, ey, {
            life: 30 + Math.random() * 15,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            scale: (0.5 + Math.random() * 0.17) * interp * 0.62,
            color: sparkColor(), blackBg: true, tex: imgs.bloom_circle,   // ★ 黑底 → multiply
          });
        }
        screenShake.set(6 * interp * 0.8);   // AddScreenshakeAt(6×interp×0.8)
        // 小闪光（CustomPulse ShineExplosion2；黑底 jpg 必须 blackBg，否则发光矩形；
        //   scale 固定=final，避免 EXPLOSION 类型 orig→final 的 2 倍渐大违和）
        spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, ex, ey, {
          life: 45, scale: 0.35 * interp, finalScale: 0.35 * interp, blackBg: true, tex: imgs.shine2,
        });
        // 裂纹曝光递增（原版 MaxExposure +0.25 clamp 0.95）
        A.ptCrackExpose = Math.min(0.95, A.ptCrackExpose + 0.3 * interp);
        // ★ 裂纹缩放逐次放大（原版 CrackScale += 0.525 × interp × 0.75）——形状完全相同，只是越裂越大
        A.ptCrackScale += PT_CRACK_STEP_INC * interp * 0.75;
      }
      if (A.ptTimer <= 0) {
        A.ptStage = 3;
        A.ptTimer = 0.5;   // 裂缝在 P2 钻出时渐隐（drawPhaseTransitionRift 用其做 fade）
        A.ptCracksT = 0;   // ★ 放射裂纹淡出计时重置
        screenShake.set(14);   // 爆炸震屏（原版 AddScreenshakeAt(14)；旧版 22 偏高）
        // ★ 最终爆炸：裂纹猛增跳最大（原版 SwitchAIStates: CrackScale += 3）→ 玻璃彻底碎裂
        A.ptCrackScale += PT_CRACK_FINAL_BOOST;
        // ★★ SpawnExplosionVisuals 移植：撞击瞬间整套爆炸视觉
        const ex = A.ptEmergenceX, ey = A.ptEmergenceY;
        // ① 25 条程序化放射裂纹（DoGRiftCrack）
        A.ptCracks = spawnRiftCracks(ex, ey);
        // ② 等离子爆炸 ×3（PlasmaExplosion：紫色 twlight×0.8，scale 0.53-0.57 ≈ 原 1.25-1.35 ×0.42）
        //   ★ 黑底 jpg 贴图必须用 tintBlackBgImg(multiply) 染色（source-in 会把黑底变纯色矩形，已踩坑）
        for (let i = 0; i < 3; i++) {
          spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, ex, ey, {
            life: 45, scale: 0.525 + i * 0.02, finalScale: 0.525 + i * 0.02,
            rotation: Math.random() * Math.PI * 2,
            squish: 0.8 + Math.random() * 0.4,
            blackBg: true, color: 'rgba(187,103,255,0.8)', tex: imgs.plasma_explosion,
          });
        }
        // ③ 闪光：ShineExplosion1(紫 0.32) + ShineExplosion2(白 0.21) + StrongBloom(白强辉光 3.4)
        //   （原 0.75/0.5/8 → ×0.42 整体缩小两轮）
        spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, ex, ey, {
          life: 45, scale: 0.32, finalScale: 0.32, rotation: Math.random() * Math.PI * 2,
          blackBg: true, color: 'rgba(187,103,255,1)', tex: imgs.shine1,
        });
        spawnDogParticle(DOG_PARTICLE_TYPES.EXPLOSION, ex, ey, {
          life: 45, scale: 0.21, finalScale: 0.21, rotation: Math.random() * Math.PI * 2,
          blackBg: true, color: 'rgba(255,255,255,0.6)', tex: imgs.shine2,
        });
        spawnDogParticle(DOG_PARTICLE_TYPES.BLOOM, ex, ey, {
          life: 30, scale: 3.4, blackBg: true, tex: imgs.bloom_circle,   // ★ 黑底 → multiply
        });
        // ④ 火花 ×25（速度 12-16，scale 0.76-0.84 ≈ 原 1.8-2 ×0.42，life 30-45）
        for (let i = 0; i < 25; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 12 + Math.random() * 4;
          spawnDogParticle(DOG_PARTICLE_TYPES.SPARKLE, ex, ey, {
            life: 30 + Math.random() * 15,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            scale: 0.76 + Math.random() * 0.08,
            color: sparkColor(), tex: Math.random() < 0.5 ? imgs.sparkle : imgs.sparkle2,
          });
        }
        // ⑤ 软光 ×20（速度 16-20）
        for (let i = 0; i < 20; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 16 + Math.random() * 4;
          spawnDogParticle(DOG_PARTICLE_TYPES.SQUISHY, ex, ey, {
            life: 30 + Math.random() * 15,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            scale: 0.76 + Math.random() * 0.08,
            color: sparkColor(), blackBg: true, tex: imgs.bloom_circle,   // ★ 黑底 → multiply
          });
        }
        // ⑥ metaball 扭曲泡（DoGDistortionMetaball：35 方形原地 + 15-21 圆形飞散，紫边）
        //   注：原版是 500px 屏幕空间扭曲（metaball shader），Canvas 无 shader；用紫描边+极淡填充近似，
        //        缩小原地 size 并降低填充 alpha，避免遮住放射裂纹等核心视觉
        for (let i = 0; i < 35; i++) {
          spawnDogParticle(DOG_PARTICLE_TYPES.METABALL,
            ex + (Math.random() - 0.5) * 35, ey + (Math.random() - 0.5) * 35, {
            life: 999, scale: 17 + Math.random() * 10, square: true,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        const mCount = 15 + Math.floor(Math.random() * 6);
        for (let i = 0; i < mCount; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 25 + Math.random() * 10;
          spawnDogParticle(DOG_PARTICLE_TYPES.METABALL, ex, ey, {
            life: 999, scale: 13 + Math.random() * 8,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          });
        }
        // ★ 切换到 P2 + 冲刺钻出
        currentChar.phase = 2;
        buildSegments();
        // 把所有体节堆到钻出点（屏幕内）
        for (let i = 0; i < points.length; i++) {
          points[i].x = A.ptEmergenceX;
          points[i].y = A.ptEmergenceY;
        }
        // ★ 设置冲刺惯性速度：朝钻出时刻的鼠标位置高速冲刺（会冲过鼠标）
        const tdx = A.ptMouseAtEmergeX - A.ptEmergenceX;
        const tdy = A.ptMouseAtEmergeY - A.ptEmergenceY;
        const tdist = Math.hypot(tdx, tdy) || 1;
        A.ptChargeVx = (tdx / tdist) * PT_CHARGE_SPEED / 60;  // 转 px/帧
        A.ptChargeVy = (tdy / tdist) * PT_CHARGE_SPEED / 60;
        A.ptChargeActive = true;
        A.ptOpacity = 1;   // 可见（从裂缝钻出）
        A.dashJawFadeProgress = 1;
        A.dashJawFadeTimer = 0.6;
      }
      break;
    }
    case 3: { // EMERGE_CHARGE：P2 惯性冲刺钻出（Scourge.update 读 ptChargeActive）
      A.ptTimer -= dt;   // 裂缝渐隐计时
      A.ptCracksT += dt;     // ★ 放射裂纹淡出计时（0.5s）
      A.ptChargeVx *= PT_FRICTION;
      A.ptChargeVy *= PT_FRICTION;
      const speed = Math.hypot(A.ptChargeVx, A.ptChargeVy);
      if (speed < PT_CHARGE_THRESH) {
        A.ptStage = 4;  // 进入慢回阶段
        A.ptChargeActive = false;
      }
      break;
    }
    case 4: { // done
      A.ptActive = false;
      A.ptStage = 5;
      A.ptOpacity = 1;   // 确保实体层恢复可见（下帧 A.opacity = 1）
      break;
    }
  }
}

// 漩涡门绘制：忠实移植 DoGPortalShader.fx 的逐像素数学
// — VoronoiShapes 噪声 + 径向扭曲旋转 + 青→品红渐变 + R通道调制亮度
// ★ 性能关键（2026-08-14）：原实现每帧对 384×384 做逐像素运算 + 每帧 getImageData 读噪声图，
//   导致过场（Stage0 / P2 钻出）严重掉帧。改为【一次性预渲染旋转帧序列】，之后每帧只 drawImage 一帧。
//   涡旋旋转仅由 time*6 决定（sin/cos 周期 2π），故预渲染 N 帧覆盖一个完整旋转周期即可无缝循环。
//   注：帧内 opacity 固定=1（中心漩涡始终可见），门的「淡入淡出/张开」由外层 globalAlpha=scale 控制。

let _portalFrames = null;   // 预渲染的旋转帧数组（opacity=1）
let _portalNoise  = null;   // 噪声像素只读取一次
let _portalFrameNext = 0;   // 下一个待渲染帧索引（分帧预渲染用）
const PORTAL_FRAMES_TOTAL = 30;

// 渲染单帧（k=0..29，一个 2π 旋转周期内均匀分布）
function renderPortalFrame(k) {
  const nw = _portalNoiseW, nh = _portalNoiseH;
  const CYAN = [0, 255, 255], FUCHSIA = [255, 0, 255];
  const w = 384, h = 384, opacity = 1;
  const timeK = k * (Math.PI * 2 / 6) / PORTAL_FRAMES_TOTAL;   // time*6 均匀分布
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const pctx = c.getContext('2d');
  const imgData = pctx.createImageData(w, h);
  const d = imgData.data;
  const noiseData = _portalNoise;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const coordsU = (px + 0.5) / w, coordsV = (py + 0.5) / h;
      const dist = Math.hypot(coordsU - 0.5, coordsV - 0.5);
      const cu = coordsU - 0.5, cv = coordsV - 0.5;
      const swirlRot = Math.hypot(cu, cv) * 41.2 - timeK * 6;
      const swirlSin = Math.sin(swirlRot), swirlCos = Math.cos(swirlRot);
      const sx = swirlCos * cu - swirlSin * cv + 0.5;
      const sy = swirlSin * cu + swirlCos * cv + 0.5;
      const nsx = ((sx % 1) + 1) % 1, nsy = ((sy % 1) + 1) % 1;
      const nix = Math.min(nw - 1, Math.floor(nsx * nw));
      const niy = Math.min(nh - 1, Math.floor(nsy * nh));
      const noiseR = noiseData[(niy * nw + nix) * 4] / 255;
      const fade = Math.min(1, dist * 3) / opacity;
      const tPow = Math.pow(fade, 0.33);
      const br = CYAN[0] + (FUCHSIA[0] - CYAN[0]) * tPow;
      const bg = CYAN[1] + (FUCHSIA[1] - CYAN[1]) * tPow;
      const bb = CYAN[2] + (FUCHSIA[2] - CYAN[2]) * tPow;
      const mask = noiseR * (1 - fade);
      const boost = 1 + (1 - fade) * 2;
      const idx = (py * w + px) * 4;
      d[idx] = br * boost; d[idx + 1] = bg * boost; d[idx + 2] = bb * boost; d[idx + 3] = mask * 255;
    }
  }
  pctx.putImageData(imgData, 0, 0);
  _portalFrames[k] = c;
}

let _portalNoiseW = 0, _portalNoiseH = 0;

// ★ 隔帧渲染：每 2 个 rAF 渲染 1 张（后台占用减半），30 帧约 1s 补全，不抢游戏帧
let _portalFrameSkipped = false;
function schedulePortalFrame() {
  if (_portalFrameNext >= PORTAL_FRAMES_TOTAL) return;
  requestAnimationFrame(function step() {
    if (_portalFrameSkipped) {
      _portalFrameSkipped = false;
      schedulePortalFrame();
      return;
    }
    _portalFrameSkipped = true;
    renderPortalFrame(_portalFrameNext);
    _portalFrameNext++;
    if (_portalFrameNext < PORTAL_FRAMES_TOTAL) schedulePortalFrame();
  });
}

function getPortalFrames() {
  if (_portalFrames) return _portalFrames;
  const noiseImg = imgs.voronoi_shapes;
  if (!noiseImg) return null;
  // 噪声像素只读一次
  if (!_portalNoise) {
    const nc = document.createElement('canvas');
    nc.width = noiseImg.width; nc.height = noiseImg.height;
    const nctx = nc.getContext('2d');
    nctx.drawImage(noiseImg, 0, 0);
    _portalNoise = nctx.getImageData(0, 0, noiseImg.width, noiseImg.height).data;
    _portalNoiseW = noiseImg.width; _portalNoiseH = noiseImg.height;
  }
  _portalFrames = [];
  // ★ 首帧同步渲染（第一次绘制立刻有图），其余 29 帧隔帧补齐——
  //   避免一次性 30×14.7 万次逐像素运算阻塞主线程（按 P 卡顿根因，2026-08-14 修）。
  //   drawPortalVortex 按 k % frames.length 取帧，帧数从 1 增长到 30 时自动平滑适配。
  renderPortalFrame(0);
  _portalFrameNext = 1;
  _portalFrameSkipped = false;
  schedulePortalFrame();
  return _portalFrames;
}

export function drawPortalVortex(x, y, scale, time) {
  if (scale < 0.01) return;
  const frames = getPortalFrames();
  if (!frames) return;
  const w = 384, h = 384;
  let phase = (time * 6) % (Math.PI * 2);
  if (phase < 0) phase += Math.PI * 2;
  const N = frames.length;
  const k = Math.floor(phase / (Math.PI * 2) * N) % N;
  // 绘制到主画布（additive blending）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp01(scale);
  ctx.translate(x, y);
  ctx.scale(PT_PORTAL_SCALE * scale, PT_PORTAL_SCALE * scale);
  ctx.drawImage(frames[k], -w / 2, -h / 2);
  ctx.restore();
}

// P2 钻出裂缝绘制（复用 cracked_glass / bloom_ring / star_proj 视觉）

// ★ DoGRiftCrack.cs 移植：生成 25 条程序化随机分叉放射裂纹
//   每条：中心起点 → 第1点沿均匀角度方向(长度20-80px)+随机偏移 → 后续点沿上一点方向累积 ±5°×i×0.25 偏转，
//         间距 25-50px（末点减半），1/9 概率加 10px 抖动。宽度沿 completion 由 MaxWidth(20-30)→0 渐变。
export function spawnRiftCracks(x, y) {
  const cracks = [];
  const COUNT = 25, N = 9;   // 25 条 × 每条约 9 段（原版 25 点，Canvas 上 9 段足够平滑且省性能）
  for (let i = 0; i < COUNT; i++) {
    const angle = i * (Math.PI * 2 / COUNT);
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const len = 20 + Math.random() * 60;   // 20-80px（原版 crackOffset 半径）
    const pts = [];
    pts.push({ x, y });   // 第 0 点 = 撞击中心
    const r1 = 0.8 + Math.random() * 0.4;
    pts.push({ x: x + dirX * len * r1 + (Math.random() - 0.5) * 60,
               y: y + dirY * len * r1 + (Math.random() - 0.5) * 60 });
    for (let j = 2; j <= N; j++) {
      const prev = pts[j - 1], prev2 = pts[j - 2];
      let dx = prev.x - prev2.x, dy = prev.y - prev2.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      let dist = 25 + Math.random() * 25;   // 25-50px
      if (j === N) dist *= 0.5;             // 末点距离减半（原版）
      const rot = (Math.random() - 0.5) * 10 * j * 0.25 * Math.PI / 180;   // ±5°×i×0.25
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const nx = dx * cosR - dy * sinR, ny = dx * sinR + dy * cosR;
      let px = prev.x + nx * dist, py = prev.y + ny * dist;
      if (Math.random() < 1 / 9) { px += (Math.random() - 0.5) * 20; py += (Math.random() - 0.5) * 20; }
      pts.push({ x: px, y: py });
    }
    cracks.push({ pts, maxWidth: 20 + Math.random() * 10 });   // MaxWidth 20-30px
  }
  return cracks;
}

// ★ 绘制放射裂纹：白色 additive，逐段 lineWidth = maxWidth×(1-completion)×scale，整体 scale 1→0 淡出
function drawRiftCracks(cracks, t) {
  if (!cracks || !cracks.length) return;
  const scale = clamp01(1 - t / 0.5);   // 0.5s 淡出（原版 timeLeft=30 tick）
  if (scale <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const cr of cracks) {
    const pts = cr.pts;
    for (let i = 1; i < pts.length; i++) {
      const comp = i / (pts.length - 1);              // 0→1 沿裂纹线
      const w = cr.maxWidth * (1 - comp) * scale;      // MaxWidth→0（CrackWidthFunction）
      if (w < 0.4) continue;
      ctx.lineWidth = w;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * scale).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawPhaseTransitionRift() {
  const A = DoGAnim;
  if (A.ptStage < 1 || A.ptStage > 3) return;  // 裂缝：内爆出现 → 停留 → P2 钻出时仍在
  const x = A.ptEmergenceX, y = A.ptEmergenceY;
  // grow：第一次撞击后裂缝渐显；fade：整体淡出（仅 P2 钻出 stage3 时渐隐）
  let grow = 1, fade = 1;
  if (A.ptStage === 1) {
    // ★ 停顿期内爆未开始（timer 从「停顿+内爆」总长递减到 pause 时值为负→clamp 0），
    //   进入内爆段（timer 从 pause 递减到 0）裂缝才随 progress 0→1 渐显。
    grow = clamp01((PT_IMPLODE_DUR - A.ptTimer) / PT_IMPLODE_DUR);
  } else if (A.ptStage === 3) {
    fade = clamp01(A.ptTimer / 0.5);  // 用 stage3 的 ptTimer 做渐隐（在 update 中递减）
  }
  const progress = grow;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ★ 收缩光环（原版 DoGTeleportRift.PreDraw：AIState != 1 时，scale lerp(8,0,charge)，白→紫）
  //   只在蓄力期（Stage2）随 charge 0→1 收缩闭合 → 能量向一点聚集；爆炸后不画（AIState=1）
  const charge01 = (A.ptStage === 2) ? clamp01(1 - A.ptTimer / PT_RIFT_DELAY) : 0;
  if (imgs.bloom_ring && A.ptStage === 2 && charge01 > 0.01) {
    const ringS = lerp(8, 0, charge01);
    ctx.globalAlpha = clamp01(charge01 * 0.6 * fade);
    // 白 → 黄昏紫渐变（Color.Lerp(White, DoGTwlight, charge)）
    const rA = Math.round(255 + (187 - 255) * charge01);
    const gA = Math.round(255 + (103 - 255) * charge01);
    const bA = Math.round(255 + (255 - 255) * charge01);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ringS, ringS);
    ctx.drawImage(tintBlackBgImg(imgs.bloom_ring, 'rgb(' + rA + ',' + gA + ',' + bA + ')'),
      -imgs.bloom_ring.width / 2, -imgs.bloom_ring.height / 2);
    ctx.restore();
  }

  // ★ 十字星（原版 DoGTeleportRift.PreDraw 移植）：
  //   非等比双条（垂直 (1,8) / 水平 (1,5)），白 0.7 + 黄昏紫 0.9×0.8，additive，SineInOut 缓动
  //   **只在蓄力期**（Stage2）随 charge 0→1 逐渐长大；爆炸后 Timer 归零 → charge=0 → 消失（原版行为）
  if (imgs.star_proj && A.ptStage === 2 && charge01 > 0.01) {
    const charge = Math.pow((1 - Math.cos(charge01 * Math.PI)) / 2, 1);   // SineInOutEasing
    if (charge > 0.01) {
      const cS = charge * 3.25;
      const starW = imgs.star_proj.width / 2, starH = imgs.star_proj.height / 2;
      ctx.globalCompositeOperation = 'source-over';
      // 白条
      ctx.globalAlpha = clamp01(0.7 * charge * fade);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 8 * cS); ctx.drawImage(imgs.star_proj, -starW, -starH); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2); ctx.scale(1, 5 * cS); ctx.drawImage(imgs.star_proj, -starW, -starH); ctx.restore();
      // 紫条（×0.8 更小）
      ctx.globalAlpha = clamp01(0.9 * 0.8 * charge * fade);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 8 * cS * 0.8); ctx.drawImage(imgs.star_proj, -starW, -starH); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2); ctx.scale(1, 5 * cS * 0.8); ctx.drawImage(imgs.star_proj, -starW, -starH); ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }
  }

  // ★ 裂纹（DoGTeleportRift.cs 原版机制）：三次小撞击同形状逐步放大（玻璃逐渐开裂），
  //   最终爆炸 ptCrackScale 已 +=3 跳最大，且 3 张 CrackedGlass 旋转 0/120°/240° 叠加（crackCount=3）
  if (imgs.cracked_glass) {
    let crackS, crackAlpha;
    if (A.ptStage === 1) {
      // 第1次撞击：裂纹【固定大小】瞬间出现（原版 CrackScale 跳变 + CrackExposure 渐显，缩放不变），
      //   只随 progress 做 alpha 渐显——避免「一边出现一边变大」的违和感（用户反馈，2026-08-14）
      crackS = PT_CRACK_STEP1;
      crackAlpha = clamp01(progress * 0.95 * fade);
    } else if (A.ptStage === 2) {
      // 蓄力期（第2/3次小撞击后）：形状完全不变，只随曝光逐级变亮（原版 CrackExposure 逼近 MaxExposure）
      crackS = A.ptCrackScale;
      crackAlpha = clamp01((0.15 + 0.8 * A.ptCrackExpose) * 0.95);
    } else {
      // 最终爆炸：裂纹已跳最大，但中心裂纹变暗（原版 overallOpacity=Opacity×0.1）→ 让位给 25 条放射裂纹
      crackS = A.ptCrackScale;
      crackAlpha = clamp01(0.25 * fade);
    }
    const cw = imgs.cracked_glass.width / 2, ch = imgs.cracked_glass.height / 2;
    ctx.globalAlpha = crackAlpha;
    ctx.save();
    ctx.translate(x, y);
    // ★ 2026-08-18 P键过场裂纹尺寸倍率（debug 面板 P键裂纹滑块 → DoGSky.riftSize.pt，默认 1）
    const ptSize = (DoGSky && DoGSky.riftSize && DoGSky.riftSize.pt) || 1;
    // ★ 2026-08-14 修复：CrackedGlass_Glowing 是黑底贴图（alpha 全 255，960×640）——
    //   直接 additive 画 = 整张黑底矩形亮起（用户反馈"长方形外壳"）。
    //   用 tintBlackBgImg(multiply) 染白：黑×白=黑(additive 不可见)、裂纹白×白=白(亮起)。
    const crackTex = tintBlackBgImg(imgs.cracked_glass, '#FFFFFF');
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI * 2 / 3);   // 0° / 120° / 240°
      ctx.scale(crackS * ptSize, crackS * ptSize);
      ctx.drawImage(crackTex, -cw, -ch);
      ctx.restore();
    }
    ctx.restore();
  }

  // ★ 程序化放射裂纹（DoGRiftCrack）：Stage3 撞击瞬间 25 条白色裂纹，0.5s 淡出
  if (A.ptStage === 3) drawRiftCracks(A.ptCracks, A.ptCracksT);

  ctx.restore();
}

export function drawTeleportRift() {
  const A = DoGAnim;
  const x = A.teleportX, y = A.teleportY;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp01(A.riftOpacity);

  // 收缩光环 (BloomRing) — black-bottom, Additive（★ 黑底需 tintBlackBgImg 染白，否则矩形）
  if (imgs.bloom_ring && A.ringScale > 0.1) {
    ctx.translate(x, y);
    ctx.scale(A.ringScale, A.ringScale);
    ctx.drawImage(tintBlackBgImg(imgs.bloom_ring, '#FFFFFF'), -imgs.bloom_ring.width/2, -imgs.bloom_ring.height/2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // 发光十字星 (StarProj) — transparent-bottom, use source-over
  if (imgs.star_proj) {
    const chargeT = clamp01(1 - A.teleportTimer / 90);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp01(chargeT * A.riftOpacity);
    ctx.translate(x, y);
    ctx.scale(0.5 + chargeT * 1.5, 0.5 + chargeT * 1.5);
    ctx.drawImage(imgs.star_proj, -imgs.star_proj.width/2, -imgs.star_proj.height/2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; // back to additive for remaining
  }

  // 裂纹 (CrackedGlass_Glowing) — black-bottom, Additive（★ 黑底需 tintBlackBgImg 染白，否则矩形）
  if (imgs.cracked_glass && A.crackExposure > 0.01) {
    ctx.globalAlpha = clamp01(A.crackExposure * A.riftOpacity);
    ctx.translate(x, y);
    ctx.scale(A.crackScale, A.crackScale);
    ctx.drawImage(tintBlackBgImg(imgs.cracked_glass, '#FFFFFF'), -imgs.cracked_glass.width/2, -imgs.cracked_glass.height/2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  ctx.restore();
}

// DoG 颌部单实例绘制（v0812af：head.png已去颚，颚部整体下移补偿，与无颚头部嵌合重叠）
//
// 与 v0812u 完全一致的部分：左右两片 side∈{-1,+1}、side==1 水平翻转、
//   水平偏移 +sinR*24、旋转 JawRotation*side、三层(基础/发光 lighter/冲刺 additive)、整体放大 1.2。
// 关键改动：v0812u 用中心锚点(originY=jh/2)，颚绕自身中心转 → 用户反馈「枢轴偏上」。
//   现把枢轴下移到「颚底端」：三层均以 -jh 为顶对齐锚点（颚整体位于枢轴上方），
//   并把 translate 的 y 同步下移 半高，使颚整体屏幕位置与 v0812u 完全相同、只改变绕转中心。
//
// 参数：jawImg=基础颌部, headH=头部高度, jawRot=当前咬合角度,
//       side=-1(左)/1(右), phase2=P2形态, dashAlpha=冲刺高亮

export function drawDogJawInstance(tctx, jawImg, headH, jawRot, side, phase2, dashAlpha) {
  const ctx = tctx;                                 // 目标画布（默认主画布；刻遮挡时传 occ）
  const w = jawImg.width, jh = jawImg.height;
  const originX = w / 2;                            // 水平中心锚（左右对称）
  const JAW_S = 1.2 * DoGAnim.jawChargeScale;       // 整体放大（v0812u）；蓄力时随 jawChargeScale 增大

  const sinR = Math.sin(jawRot);
  // C# 偏移参数（原版值不变）
  const jawBaseOffset = phase2 ? 42 : 28;
  const jx = side * (jawBaseOffset + sinR * 24);    // 水平偏移（C# 原式）
  // 垂直偏移（C# 原式基值 + v0812af 下移补偿）：
  //   新 head.png 已擦除烤制颚，仅保留上方面部。颚需整体下移，
  //   使铰链窄区与新头部底缘重叠（无间隙），颚尖略低于原头底缘。
  const JAW_Y_OFFSET = phase2 ? -4 : 18;             // P1/P2 分别下移补偿（P2：-4 贴合头部，无大缝隙）
  const jyCenter = -headH / 2 - ((phase2 ? 44 : 8) + sinR * (phase2 ? 30 : -6)) + JAW_Y_OFFSET;
  // 枢轴在「颚底端」：颚向枢轴上方伸出，绕下端摆动咬合（v0812ae）
  const jy = jyCenter + (jh * JAW_S) / 2;

  ctx.save();
  ctx.translate(jx, jy);
  // 旋转：C# rotation = NPC.rotation + JawRotation * i（本帧只取后半）
  ctx.rotate(jawRot * side);
  // 右侧水平翻转（C# SpriteEffects.FlipHorizontally when i==1）
  if (side === 1) ctx.scale(-1, 1);
  ctx.scale(JAW_S, JAW_S);

  // 三层均以「颚底」(-jh) 为锚点：枢轴 = 颚底，颚向枢轴上方伸出，旋转绕下端
  // ① 基础颌部纹理
  ctx.drawImage(jawImg, -originX, -jh);

  // ② 发光层（仅 P1：base 层、lighter、被夜暗压暗、被头盖；P2 明亮发光由 drawDogJawGlow 在暗化层之后绘制）
  if (!phase2) {
    const jawGlowImg = imgs.jaw_glow;
    if (jawGlowImg) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(jawGlowImg, -originX, -jh);
      ctx.restore();
    }
  }

  // ③ GodSlayer 冲刺叠加层（DevourerofGodsHead.cs.Teleport 原版机制）：
  //   P2 钻出瞬间在普通颚部之上额外绘制 GodSlayerDashJaw 专用贴图，黑底 + Additive + 品红/青双层。
  //   ★ 染色必须用 tintBlackBgImg（multiply）：黑底×色=黑 → additive 下黑底仍不可见，只显示形状；
  //     用 tintedImg(source-in) 会把黑底也染成纯色 → 整张矩形变「正方形」（已踩坑）。
  //   ★ 锚点对齐：GodSlayer 高 126 > jaw 高 96，按 jh 高度等比缩放 + 颚底中心锚（-w/2, -h），
  //     否则贴图超出颚部飘在头上（已踩坑）。
  if (dashAlpha > 0.02) {
    const dashJaw = imgs.godslayer_dash_jaw;
    if (dashJaw) {
      const aspect = dashJaw.width / dashJaw.height;   // 58/126 ≈ 0.46
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 品红主色 1.6×（原版 Color.Fuchsia）
      const h1 = jh * 1.6, w1 = aspect * h1;
      ctx.globalAlpha = dashAlpha;
      ctx.drawImage(tintBlackBgImg(dashJaw, '#FF00FF'), -w1 / 2, -h1, w1, h1);
      // 青色高光 1.3×（原版 Color.Cyan）
      const h2 = jh * 1.3, w2 = aspect * h2;
      ctx.globalAlpha = dashAlpha * 0.8;
      ctx.drawImage(tintBlackBgImg(dashJaw, '#00FFFF'), -w2 / 2, -h2, w2, h2);
      ctx.restore();
    }
  }

  ctx.restore();
}

// DoG 颚发光（v0812as）：跟随颚旋转、在暗化层之后绘制，确保可见且不被头盖住/不被夜暗压暗。
// 复用与 drawDogJawInstance 完全相同的颚变换（jx/jy/rotate/scale），保证与颚本体精准对齐。
// 调用方控制：P2 始终明亮发光；P1 仅在 armorOff（纯能量）形态显示明亮颚发光，
// 普通 P1 的暗淡颚发光仍由 drawDogJawInstance 在 base 层绘制（被夜暗压暗）。

export function drawDogJawGlow(tctx, jawImg, headH, jawRot, side, phase2) {
  const w = jawImg.width, jh = jawImg.height;
  const originX = w / 2;
  const JAW_S = 1.2 * DoGAnim.jawChargeScale;
  const sinR = Math.sin(jawRot);
  const jawBaseOffset = phase2 ? 42 : 28;
  const jx = side * (jawBaseOffset + sinR * 24);
  const JAW_Y_OFFSET = phase2 ? -4 : 18;
  const jyCenter = -headH / 2 - ((phase2 ? 44 : 8) + sinR * (phase2 ? 30 : -6)) + JAW_Y_OFFSET;
  const jy = jyCenter + (jh * JAW_S) / 2;
  const jawGlowImg = phase2 ? imgs.jaw_final_glow : imgs.jaw_glow;
  if (!jawGlowImg) return;
  // 随 DoG 整体透明度淡出（隐身时颚发光一起隐），非 DoG 恒为 1
  const dogAlpha = (currentCharKey === 'devourer_of_gods') ? clamp01(DoGAnim.opacity * DoGAnim.deathOpacity) : 1;
  tctx.save();
  tctx.translate(jx, jy);
  tctx.rotate(jawRot * side);
  if (side === 1) tctx.scale(-1, 1);
  tctx.scale(JAW_S, JAW_S);
  tctx.globalCompositeOperation = 'lighter';
  tctx.globalAlpha = dogAlpha;
  tctx.drawImage(jawGlowImg, -originX, -jh);
  tctx.globalAlpha = 1;
  tctx.restore();
}

// DoG 激光墙可见特效：旋转激光墙（辐条）+ 中心粗激光，含预警阶段
// Laser Wall 攻击开关（v0813c：用户确认“背景激光线”即此攻击的 8 辐条+中竖线，默认关闭；设 true 可恢复）

export const DOG_LASER_WALL_ENABLED = true;   // ★ 2026-08-18 启用：仅 armorOff 形态下 8 键释放激光墙


// ★ 2026-08-18 激光墙（DoGLaserWalls.cs + DoGLaserWallsBigBeam.cs 移植）
//   原版 = 固定横竖交叉网格（laserType=0 正交，laserDist=250 间距，laserCount=6000/laserDist）
//   + 攻击瞬间 BigBeam 大光束（从屏幕外 3000px 射向目标）。
//   每根激光 5 层（主光 BloomLineThick + 4 黑核 LineThick）+ sine 脉动 + drawColor 渐变。
let _laserGL = null;   // 惰性创建（首次按 8 键时）

export function drawLaserWall() {
  const A = DoGAnim;
  if (!A.laserActive) { if (_laserGL) _laserGL.clear(); return; }
  // GL 路径（WebGL2 + 原版贴图）。失败回退 2D 保底。
  let glReady = false;
  try {
    if (!_laserGL) {
      _laserGL = new DogLaserWallGL();
      if (imgs.laser_beam && imgs.laser_line) _laserGL.setTextures(imgs.laser_beam, imgs.laser_line);
    }
    glReady = !!( _laserGL && _laserGL.ready && _laserGL._beamTex && _laserGL._lineTex);
  } catch (e) {
    console.error('[drawLaserWall] GL 初始化失败，回退 2D:', e);
    _laserGL = null;
    glReady = false;
  }
  if (glReady) { drawLaserWallGL(); return; }
  drawLaserWall2D();
}

// ★ WebGL2 路径：原版 DoGLaserWalls.cs 网格 + DoGLaserWallsBigBeam.cs 大光束
function drawLaserWallGL() {
  const A = DoGAnim;
  // ★ 2026-08-18 必须在 addLaser 前设置 GL canvas 尺寸：否则 _pushLayer 里 this.W=0 → 顶点 Infinity → 全灭
  _laserGL.setSize(W, H);
  const cx = points[0].x, cy = points[0].y;            // 网格中心 = 头部位置（原版 Projectile.Center）
  const fx = A.laserFX;
  // 原版 opacity = (doneAttack ? 0.65 : 0.3) × min(laserFX,1)²
  const opacity = (A.laserDoneAttack ? 0.65 : 0.3) * Math.pow(Math.min(fx, 1), 2);
  const cr = A.laserColor[0] / 255, cg = A.laserColor[1] / 255, cb = A.laserColor[2] / 255;
  const dist = A.laserDist || 240;
  const count = Math.max(1, Math.floor(6000 / dist));   // 原版 laserCount = 6000/laserDist（25）
  // ★ 2026-08-18 quad 长度修复：原版 length=3000 拉伸 6030px（远超 720 屏），屏幕只看到 quad 底部 12% UV（贴图底边
  //   alpha 接近 0 → 完全透明）。改为屏幕最大边×1.5（约 1920），UV 0~1 覆盖贴图核心发光区 → 可见。
  const length = Math.max(W, H) * 1.5;
  // ★ 网格（laserType=0 正交：横线 + 竖线，间距 dist，中心向两侧铺开）
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * dist;           // 对称分布在中心两侧
    // 竖线（x=cx+off 处垂直贯穿屏幕 → quad 沿 Y 拉伸 → rot=0）
    _laserGL.addLaser({ x: cx + off, y: cy, rot: 0, length, fx, opacity, r: cr, g: cg, b: cb, sine: A.laserSine });
    // 横线（y=cy+off 处水平贯穿屏幕 → quad 沿 X 拉伸 → rot=π/2）
    _laserGL.addLaser({ x: cx, y: cy + off, rot: Math.PI / 2, length, fx, opacity, r: cr, g: cg, b: cb, sine: A.laserSine });
  }
  // ★ BigBeam（DoGLaserWallsBigBeam.cs）：攻击瞬间从屏幕外射向头部
  if (A.laserBigBeamActive) {
    const bbFx = A.laserBigBeamFX;
    const bbOpacity = 0.65 * Math.pow(Math.min(bbFx, 1), 2);
    const br = A.laserBigBeamColor[0] / 255, bg = A.laserBigBeamColor[1] / 255, bb = A.laserBigBeamColor[2] / 255;
    // 原版 laserType 0/4/5 → UnitX（水平方向）射向 targetPos；beamStart = targetPos + dir×3000
    // laserRot = ±0.4 随机角
    const rot = A.laserBigBeamRot || 0;
    const dirX = Math.cos(rot), dirY = Math.sin(rot);
    const beamStartX = cx + dirX * 3000, beamStartY = cy + dirY * 3000;
    // directionToTarget = beamStart.DirectionTo(targetPos)（指向头部）
    const tdx = cx - beamStartX, tdy = cy - beamStartY;
    const tl = Math.hypot(tdx, tdy) || 1;
    const dx = tdx / tl, dy = tdy / tl;
    // quad 主轴方向 = (-sin rot, cos rot)；要沿 (dx,dy) → sin rot = -dx, cos rot = dy → rot = atan2(-dx, dy)
    const beamRot = Math.atan2(-dx, dy);
    // ★ BigBeam 长度也按屏幕修正（覆盖整个屏幕 + 一点延伸）
    _laserGL.addLaser({
      x: beamStartX, y: beamStartY, rot: beamRot,
      length: Math.max(W, H) * 1.5, fx: bbFx, opacity: bbOpacity,
      r: br, g: bg, b: bb, sine: A.laserSine,
    });
  }
  _laserGL.render({ W, H });
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';   // 原版 AlphaBlend
  ctx.globalAlpha = 1;
  ctx.drawImage(_laserGL.canvas, 0, 0, W, H);
  ctx.restore();
}

// 回退：简易 2D 激光（GL 不可用时保底，避免"按了没反应"）
function drawLaserWall2D() {
  const A = DoGAnim;
  const cx = points[0].x, cy = points[0].y;
  const fx = A.laserFX;
  const opacity = (A.laserDoneAttack ? 0.65 : 0.3) * Math.pow(Math.min(fx, 1), 2);
  const col = `rgba(${A.laserColor[0]},${A.laserColor[1]},${A.laserColor[2]},${opacity})`;
  const dist = A.laserDist || 240;
  const count = Math.max(1, Math.floor(6000 / dist));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 3 * Math.min(fx, 1);
  ctx.strokeStyle = col;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * dist;
    ctx.beginPath(); ctx.moveTo(cx + off, -H); ctx.lineTo(cx + off, H * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W, cy + off); ctx.lineTo(W * 2, cy + off); ctx.stroke();
  }
  ctx.restore();
}

// DoG 死亡顶层爆炸（全屏白闪之上叠加强光环 + 核心，确保可见）
// ★ 2026-08-18 主渲染改 WebGL2 GLSL（DogDeathBoomGL），2D 近似为回退

let _boomGL = null;   // 惰性创建（首次死亡爆炸时）

export function drawDeathBurst() {
  const A = DoGAnim;
  // ★ 2026-08-18 DoGDeathBoom 主绘制（原版 BaseMassiveExplosionProjectile.PreDraw）：
  //   WebGL2 GLSL 还原 ForceField 护盾爆炸（Perlin 扰动 + 壳层亮边 + Cyan→Fuchsia + (1-√t)*0.7）
  if (A.deathBoomActive) {
    const t = clamp01(A.deathBoomT / DEATH_BOOM_LIFETIME);          // 0→1 完成度
    const pulse = clamp01(1 - A.deathBoomT / DEATH_BOOM_LIFETIME);  // 1→0 剩余
    // 原版 Fadeout = (1 - sqrt(completion)) * 0.7
    const fade = Math.max(0, (1 - Math.sqrt(t)) * 0.7);
    // 原版 GetCurrentExplosionColor = Lerp(Cyan, Fuchsia, clamp(pulse*1.75, 0, 1))
    const cm = clamp01(pulse * 1.75);
    if (fade <= 0.01) return;
    // 惰性创建 GL 渲染器（WebGL2 可用时；失败回退旧 2D 近似）
    if (!_boomGL) {
      _boomGL = new DogDeathBoomGL();
      if (imgs.perlin) _boomGL.setPerlin(imgs.perlin);
    }
    if (_boomGL && _boomGL.ready && _boomGL._perlinTex) {
      _boomGL.render({
        W, H,
        cx: A.deathBoomX, cy: A.deathBoomY,
        radius: Math.max(1, A.deathBoomRadius),
        time: A.deathBoomT / 60,
        mix: cm,
        fade,
      });
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';   // 原版 AlphaBlend
      ctx.globalAlpha = 1;
      ctx.drawImage(_boomGL.canvas, 0, 0, W, H);
      ctx.restore();
      return;   // GL 路径成功，跳过 2D 近似
    }
  }
  // 回退 2D 近似（无 WebGL2 / 无 Perlin 时）+ 旧白环（Boom 未激活时补充）
  if (A.deathBoomActive) {
    const t = clamp01(A.deathBoomT / DEATH_BOOM_LIFETIME);
    const pulse = clamp01(1 - A.deathBoomT / DEATH_BOOM_LIFETIME);
    const fade = Math.max(0, (1 - Math.sqrt(t)) * 0.7);
    const cm = clamp01(pulse * 1.75);
    const cr = Math.round(0 + (255 - 0) * cm), cg = Math.round(221 + (0 - 221) * cm), cb = Math.round(250 + (255 - 250) * cm);
    const cx = A.deathBoomX, cy = A.deathBoomY, R = A.deathBoomRadius;
    if (fade > 0.01 && R > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy);
      ctx.scale(1.5, 1);
      ctx.globalAlpha = Math.min(1, fade);
      if (imgs.perlin) {
        const innerR = R * 0.92;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.35)`);
        grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.18)`);
        grad.addColorStop(0.85, `rgba(${cr},${cg},${cb},0.05)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.rotate(A.deathBoomT * 0.01);
        ctx.globalAlpha = Math.min(1, fade) * 0.28;
        ctx.drawImage(imgs.perlin, -R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
        ctx.restore();
      }
      ctx.globalAlpha = Math.min(1, fade * 1.2);
      ctx.lineWidth = Math.max(4, R * 0.06);
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.shadowColor = `rgb(${cr},${cg},${cb})`;
      ctx.shadowBlur = Math.min(120, R * 0.15);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = Math.min(1, fade * 0.8);
      ctx.lineWidth = Math.max(2, R * 0.02);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
  // 旧简易白环（保留给非 Boom 路径 / Boom 未启动时的补充）—— Boom 激活时跳过，避免双层
  if (!A.deathBoomActive && A.deathExploded && A.deathExplodeT > 0 && A.deathExplodeT < 1.5) {
    const t = clamp01(A.deathExplodeT / 1.5);
    const cx = A.deathExplodeX, cy = A.deathExplodeY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = '#bfe0ff';
    ctx.lineWidth = lerp(40, 2, t);
    ctx.beginPath(); ctx.arc(cx, cy, lerp(20, Math.max(W, H), t), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - t);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, lerp(10, 120, t), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// 把任意图片渲染成"白色剪影"（保留原 alpha 形状、颜色替换为白），用于满蓄力时精灵自身闪白。
// 按图片缓存，避免每帧重建离屏画布。

export function draw() {
  drawBackground();
  if (DoGSky.intensity > 0.001) DoGSky.draw(ctx);   // DoG 战天背景天空盒（v0812bc），?solo=N 可单测某层
  if (rainOn) drawRain();   // 雨在背景之上、蠕虫之后之下：作为背景层天气，夜里被暗化层压暗

  // 所有角色的基础体节都在暗化层之前绘制，受昼夜暗化影响（Astrum Deus 的暗色体节也会随夜变暗）
  drawSegmentsBase();

  // 昼夜光系统：夜晚整体压暗（背景/云/雷/粒子/蠕虫一并变暗），day 不叠
  if (darkLevel > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(3,6,18,${darkLevel})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 闪电 bolt：在暗化层之后绘制，不被黑夜暗化层压暗 → 高亮可见（配合下方全屏闪白）
  drawLightning();
  // 闪电照亮环境：在暗化层之后叠加全屏闪光，让闪电瞬间把夜空提亮（跟随 lightningIntensity）
  drawLightningFlash();

  // 塔纳托斯红光散发：在暗化之后叠加，让红色光点在暗场景里"照亮"周围、更醒目
  drawThanatosGlow();

  // 自发光角色（如 Astrum Deus）：暗化层「之后」单独绘制发光像素（glow 图里有颜色的那些点），
  // 原色输出、不受黑夜压暗 → 呈现显眼亮色；并按真实深度（A 在最前、头在尾前）正确遮挡，
  // 既不会被后方虫体盖掉，也不会浮到另一条虫之上。
  if (currentChar.selfLuminous) drawSegmentsGlow();

  // DoG 颚发光：暗化层 + 头部之后绘制（跟随颚旋转，可见且不被压暗/不被头盖）
  // P2：始终显示明亮颚发光；P1：仅在 armorOff（纯能量）形态显示颚发光（普通 P1 暗淡发光在 base 层）。
  // ★ 2026-08-18 死亡时 head deathGone 后【硬消失】：不加 !seg.deathGone 会导致头部崩解后
  //   两片颚的亮纹还挂在屏幕上（用户反馈违和）。直接整块跳过，无渐隐。
  if (currentCharKey === 'devourer_of_gods' && !segments[0]?.deathGone) {
    const seg = segments[0], p = points[0];
    if (seg && seg.type === 'head' && seg.img) {
      const jawImg = currentChar.phase >= 2 ? imgs.jaw_final : imgs.jaw;
      const phase2 = currentChar.phase >= 2;
      const armorOff = !!currentChar.armorOff;
      // P2 始终发光；P1 仅在 armorOff 或 蓄力中 发光（蓄力时颚变为发光形态）
      if (jawImg && (phase2 || armorOff || DoGAnim.jawCharging)) {
        const applyJawXf = (c) => {
          c.translate(p.x, p.y + DoGAnim.jawShakeY);   // 蓄力时与头同步垂直震动
          c.rotate(seg.angle + Math.PI / 2);
          c.scale(currentChar.scale, currentChar.scale);
        };
        if (DoGAnim.jawCharging && !armorOff) {
          // 蓄力时颚被放大（JAW_S 随 jawChargeScale 到 1.62×）且张开上摆，发光会盖到脸上形成"头部中心大亮斑"。
          // 解决：先把两片颚发光画到离屏，再用头部实体剪影 destination-out 扣掉重叠部分，最后 lighter 合成。
          // （不缩小 JAW_S，避免发光与实体颚错位）
          const fx = ensureFxCanvas();
          const f = fx.getContext('2d');
          f.setTransform(1, 0, 0, 1, 0, 0);
          f.globalCompositeOperation = 'source-over';
          f.clearRect(0, 0, W, H);
          f.save(); applyJawXf(f);
          drawDogJawGlow(f, jawImg, seg.img.height, DoGAnim.jawRotation, -1, phase2);
          drawDogJawGlow(f, jawImg, seg.img.height, DoGAnim.jawRotation,  1, phase2);
          f.restore();
          f.save();
          f.globalCompositeOperation = 'destination-out';
          applyJawXf(f);
          f.drawImage(seg.img, -seg.img.width / 2, -seg.img.height);   // 扣掉头部剪影
          f.restore();
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(fx, 0, 0);
          ctx.restore();
        } else {
          ctx.save();
          applyJawXf(ctx);
          drawDogJawGlow(ctx, jawImg, seg.img.height, DoGAnim.jawRotation, -1, phase2);
          drawDogJawGlow(ctx, jawImg, seg.img.height, DoGAnim.jawRotation,  1, phase2);
          ctx.restore();
        }
      }
    }
  }

  // DoG 粒子层（背景之上、虫体之下）
  if (currentCharKey === 'devourer_of_gods') drawDogParticles();

  // DoG 传送裂隙（暗化层之上，不受黑暗影响）
  if (currentCharKey === 'devourer_of_gods' && DoGAnim.teleportActive) drawTeleportRift();

  // DoG P1→P2 过场视觉（漩涡门 + 钻出裂缝）
  if (currentCharKey === 'devourer_of_gods' && DoGAnim.ptActive) {
    // Stage 0/1: 漩涡门在头部位置（0=常开钻入，1=内爆消失）
    if (DoGAnim.ptStage === 0 || DoGAnim.ptStage === 1) {
      drawPortalVortex(DoGAnim.ptPortalX, DoGAnim.ptPortalY, DoGAnim.ptPortalScale, DoGAnim.ptTime);
    }
    // Stage 1/2/3: 裂缝（内爆出现 → 停留 → P2 钻出渐隐）
    drawPhaseTransitionRift();
  }

  // DoG 激光墙可见特效（暗化层之上）—— v0813c 默认关闭（DOG_LASER_WALL_ENABLED）
  if (DOG_LASER_WALL_ENABLED && currentCharKey === 'devourer_of_gods' && DoGAnim.laserActive) drawLaserWall();
  // DoG 死亡顶层爆炸 + 全屏白闪（最上层，确保可见）
  if (currentCharKey === 'devourer_of_gods') drawDeathBurst();
  if (DoGAnim.deathFlash > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp01(DoGAnim.deathFlash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 满蓄力警告：整个头部 + 左右两颚精灵自身闪白（非光晕），提示即将达到最大蓄力
  if (DoGAnim.maxChargeWarn && currentCharKey === 'devourer_of_gods') {
    const headSeg = segments[0], hp = points[0];
    if (headSeg && headSeg.img) {
      const h = headSeg.img;
      const pulse = Math.max(0, 0.5 + 0.5 * Math.sin(animTime * 16));  // 0~1 闪烁（谷底全灭=清晰闪白）
      const ang = headSeg.angle + Math.PI / 2;
      const headW = getWhiteTint(h);
      // 头部整体闪白（叠加白剪影，覆盖实际头部精灵）
      if (headW) {
        ctx.save();
        ctx.translate(hp.x, hp.y + DoGAnim.jawShakeY);
        ctx.rotate(ang);
        ctx.scale(currentChar.scale, currentChar.scale);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        ctx.drawImage(headW, -h.width / 2, -h.height);
        ctx.restore();
      }
      // 左右两颚整体闪白：必须用【实体颚】(jaw / jaw_final)，
      // 用亮纹图(jaw_glow / jaw_final_glow) 只会让颚上的发光线条闪、整片颚不闪。
      const jawSolidImg = (currentChar.phase >= 2 ? imgs.jaw_final : imgs.jaw);
      const jawW = getWhiteTint(jawSolidImg);
      if (jawW) {
        const jr = DoGAnim.jawRotation, phase2 = currentChar.phase >= 2;
        const jh = jawSolidImg.height, originX = jawSolidImg.width / 2;
        const sinR = Math.sin(jr);
        const jawBaseOffset = phase2 ? 42 : 28;
        const JAW_Y_OFFSET = phase2 ? -4 : 18;
        const jyCenter = -h.height / 2 - ((phase2 ? 44 : 8) + sinR * (phase2 ? 30 : -6)) + JAW_Y_OFFSET;
        const JAW_S = 1.2 * DoGAnim.jawChargeScale;
        ctx.save();
        ctx.translate(hp.x, hp.y + DoGAnim.jawShakeY);
        ctx.rotate(ang);
        ctx.scale(currentChar.scale, currentChar.scale);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        for (const side of [-1, 1]) {
          const jx = side * (jawBaseOffset + sinR * 24);
          const jy = jyCenter + (jh * JAW_S) / 2;
          ctx.save();
          ctx.translate(jx, jy);
          ctx.rotate(jr * side);
          if (side === 1) ctx.scale(-1, 1);
          ctx.scale(JAW_S, JAW_S);
          ctx.drawImage(jawW, -originX, -jh);
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  // 扩展接口：在最上层绘制自定义拖尾/粒子效果（默认空，不影响现有画面）
  effects.draw(ctx);
}

// 普通（非自发光）角色的体节绘制：在暗化层之前画，受暗化影响

export function drawLightningFlash() {
  if (!lightningOn || (currentTheme !== 'void' && currentTheme !== 'thanatos')) return;
  if (lightningIntensity <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(190, 210, 255, ${Math.min(1, lightningIntensity) * 0.4})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 塔纳托斯发光：以每个体节中心为原点画柔和径向光晕（持续稳定发光，不脉动），叠加在暗化场景之上

export function drawThanatosGlow() {
  if (currentTheme !== 'void' && currentTheme !== 'thanatos') return;           // 仅塔纳托斯（thanatos 现主题，void 为旧主题兼容）
  if (!currentChar.frames) return;
  // 计算当前光晕颜色：blue=0 → red=1（过渡阶段线性插值）
  let mix = 0;
  if (thanatosPhase === 'red') mix = 1;
  else if (thanatosPhase === 'toRed') mix = Math.min(1, thanatosTimer / THANATOS_TRANS);
  else if (thanatosPhase === 'toBlue') mix = Math.max(0, 1 - thanatosTimer / THANATOS_TRANS);
  const col = [
    Math.round(THANATOS_BLUE[0] + (THANATOS_RED[0] - THANATOS_BLUE[0]) * mix),
    Math.round(THANATOS_BLUE[1] + (THANATOS_RED[1] - THANATOS_BLUE[1]) * mix),
    Math.round(THANATOS_BLUE[2] + (THANATOS_RED[2] - THANATOS_BLUE[2]) * mix),
  ];
  const colStr = `${col[0]},${col[1]},${col[2]}`;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const p = points[i];
    if (!seg.frameKey) continue;
    const fr = currentChar.frames[seg.frameKey];
    if (!fr.glow || !imgs[fr.glow]) continue;
    const anchored = fr.anchor === 'base' || seg.type === 'head';
    const dyBase = anchored ? -fr.fh : -fr.fh / 2;
    // 持续发光：恒定亮度、不做脉动（蓝/红之间的缓慢变色由 thanatosPhase 状态机驱动，不是闪烁）
    const isNight = darkLevel > 0;
    const cx = 0, cy = dyBase + fr.fh / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(seg.angle + Math.PI / 2);
    ctx.scale(currentChar.scale, currentChar.scale);
    ctx.globalCompositeOperation = 'lighter';

    // 外晕：低强度光，柔和向外晕开（半径已缩小、亮度已调暗，仅颜色随阶段在蓝↔红间渐变）
    const grHalo = fr.w * (isNight ? 1.2 : 1.0);
    const haloA = isNight ? 0.09 : 0.05;  // 恒定外晕强度（持续发光，已调暗）
    const gh = ctx.createRadialGradient(cx, cy, 0, cx, cy, grHalo);
    gh.addColorStop(0, `rgba(${colStr},${haloA})`);
    gh.addColorStop(0.5, `rgba(${colStr},${haloA * 0.4})`);
    gh.addColorStop(1, `rgba(${colStr},0)`);
    ctx.fillStyle = gh;
    ctx.beginPath();
    ctx.arc(cx, cy, grHalo, 0, Math.PI * 2);
    ctx.fill();

    // 核心亮斑：收紧、偏亮，呈现"发光体"本身（半径已缩小、强度已调暗）
    const grCore = fr.w * (isNight ? 0.62 : 0.5);
    const coreA = isNight ? 0.28 : 0.18;  // 恒定核心强度（持续发光，已调暗）
    const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, grCore);
    gc.addColorStop(0, `rgba(${colStr},${coreA})`);
    gc.addColorStop(0.5, `rgba(${colStr},${coreA * 0.6})`);
    gc.addColorStop(1, `rgba(${colStr},0)`);
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.arc(cx, cy, grCore, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// 计算第 i 个体节的当前动画帧（带相位偏移，让光脉冲沿身体传播）
