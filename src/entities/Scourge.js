// ===== entities/Scourge.js (migrated from scourge_selector.html) =====
import { lightningIntensity } from '../core/Background.js';
import { DoGAnim, drawDogJawInstance, updateHUD, PT_DIVE_SPEED, PT_SUCTION } from '../core/Renderer.js';
import { dogDialogue } from '../core/DogDialogue.js';
import { H, THANATOS_HOLD, THANATOS_TRANS, W, _glowOcc, _glowTmp, animTime, canvas, clamp01, ctx, currentChar, currentCharKey, imgs, isDual, lastHead, mouse, points, segments, thanatosPhase, thanatosTimer, worms, dogClip, set_isDual, set_worms, set_segments, set_points, set_lastHead, set_thanatosTimer, set_thanatosPhase, set__glowTmp, set__glowOcc} from '../core/globals.js';
import { screenShake } from '../utils/ScreenShake.js';

export function segBodyHalf(seg) {
  // 所有角色的头部均统一以根部（底缘中点）为旋转轴：连接点即根部，自身贡献 0 半高
  if (seg.type === 'head') return 0;
  // 荒漠尾：像头部一样以根部（顶缘 = 接 body_04 那一端）为旋转轴，自身贡献 0 半高，
  // 使其绕连接端旋转、始终粘在 04 上；重叠量由 tailOverlap 控制（制造重叠、且弯曲不露缝）。
  if (seg.type === 'tail' && currentCharKey === 'desert_scourge') return 0;
  if (seg.frameKey) {
    const fr = currentChar.frames[seg.frameKey];
    if (fr.anchor === 'base') return 0; // 根部为轴的头部：连接点即根部，自身贡献 0 半高
    return fr.fh / 2; // 塔纳托斯：用单帧高度
  }
  if (!seg.img) return 0;
  return (seg.orient === 'h' ? seg.img.width : seg.img.height) / 2;
}


export function buildSegments() {
  if (currentCharKey === 'astrum_deus') {
    set_isDual(true);
    set_worms([]);
    const sc = currentChar.scale, ov = currentChar.overlap;
    // defs 顺序 [B, A]：B 用旧橙红 glow、A 用新青色 glow。
    // 绘制时先 B 后 A，使 A（主角）叠在最上方。A 跟随鼠标全屏游走，B 以屏幕竖直中线为轴做左右镜像。
    const defs = [
      { suffix: '_old', isPrimary: false, x0: W * 0.73, phase: 2.1 },
      { suffix: '',      isPrimary: true,  x0: W * 0.27, phase: 0 }
    ];
    for (const d of defs) {
      const res = currentChar.buildSegments(imgs, currentChar.bodyCount, d.suffix);
      const segs = res.segments;
      for (let i = 1; i < segs.length; i++) segs[i].dist = (segBodyHalf(segs[i - 1]) + segBodyHalf(segs[i])) * sc - ov;
      const pts = [];
      let cum = 0;
      for (let i = 0; i < segs.length; i++) { pts.push({ x: d.x0, y: H * 0.5 + cum }); cum += (i > 0 ? segs[i].dist : 0); }
      worms.push({ segments: segs, points: pts, lastHead: { x: pts[0].x, y: pts[0].y }, glowSuffix: d.suffix, isPrimary: d.isPrimary, phase: d.phase, t: Math.random() * 20, _tx: d.x0, _ty: H * 0.5 });
    }
    return;
  }
  set_isDual(false);
  const result = currentChar.buildSegments(imgs, currentChar.bodyCount, currentChar.phase);
  set_segments(result.segments);
  if (currentCharKey === 'aquatic_scourge') currentChar.bodyCount = result.bodyCount;
  const sc = currentChar.scale, ov = currentChar.overlap;
  // 荒漠尾：以顶缘(接04端)为旋转轴，重叠量用 tailOverlap（默认8px），不再额外推远（推远只挪中心、弯曲仍露缝）
  const isDesertTail = (currentCharKey === 'desert_scourge');
  const tailOv = isDesertTail ? (currentChar.tailOverlap != null ? currentChar.tailOverlap : ov) : ov;
  for (let i = 1; i < segments.length; i++) {
    const useOv = (isDesertTail && i === segments.length - 1) ? tailOv : ov;
    segments[i].dist = (segBodyHalf(segments[i - 1]) + segBodyHalf(segments[i])) * sc - useOv;
  }
  const hx = points.length ? points[0].x : W / 2, hy = points.length ? points[0].y : H / 2;
  const newPoints = [{ x: hx, y: hy }];
  let cum = 0;
  for (let i = 1; i < segments.length; i++) { cum += segments[i].dist; newPoints.push({ x: hx, y: hy + cum }); }
  set_points(newPoints);
  set_lastHead({ x: points[0].x, y: points[0].y });
  updateHUD();
}

// 各族体节特点 → 决定每次 ↑/↓ 增减的体节数与下限（数据驱动，集中记录特征）
//  交替两种体节（渊海 / 塔纳托斯 / 穿孔者 large）：一次加/减 2 节（成对其加入，保持交替）
//  星神 Astrum Deus（两条龙）：一次加 2 节且保持奇数，两条龙共用 bodyCount 同时增长
//  其余（荒漠 4 部件 / 单体型 / DoG）：一次加/减 1 节；体节上的亮纹/动画由 buildSegments 自动继承

export function segStep() {
  if (currentCharKey === 'astrum_deus') return 2;                 // 两条龙同时增 + 维持奇数
  if (currentCharKey === 'the_perforator')
    return currentChar.variants[currentChar.currentVariant].hasAltBody ? 2 : 1;
  if (currentChar && currentChar.bodyStyle === 'alternating') return 2;
  return 1;
}

export function segMin() {
  // 最短体节下限 = 用户预设 segFloor（独立于默认 segBase）。↑/↓ 不可低于此；保证不会缩到畸形
  if (currentCharKey === 'the_perforator') {
    const v = currentChar.variants[currentChar.currentVariant];
    return v.segFloor || 2;
  }
  return currentChar.segFloor || 2;
}


export function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  let diff = (b - a) % TAU;
  if (diff < -Math.PI) diff += TAU;
  if (diff > Math.PI) diff -= TAU;
  return a + diff * t;
}


export function update(dt) {
  if (isDual) {
    const aWorm = worms.find(w => w.isPrimary);
    const bWorm = worms.find(w => !w.isPrimary);
    updateWorm(aWorm, dt);
    updateWorm(bWorm, dt, aWorm);
    return;
  }
  const head = points[0];

  // P1→P2 过场：整个过渡期间头部不受鼠标控制，由过场逻辑驱动
  if (DoGAnim.ptActive) {
    if (DoGAnim.ptDiveActive) {
      // Stage 0（穿门）：沿 startPhaseTransition 锁定的方向【匀速直线】前进，不追鼠标。
      // 头部穿过门中心后继续飞出去，后面的体节被链条拖着依次经过门正中心，
      // 各自在触碰中心时消失（"穿针"效果）。
      // ★ 方向必须用锁定值，不能每帧重算「朝向门中心」：逼近中心时单帧步长会超过剩余距离，
      //   越过后方向反转再走回来 → 头部原地震荡、整条虫永远穿不过门（已踩坑，探针实测复现）。
      // 按 dt 积分（PT_DIVE_SPEED 单位 px/秒），保证任意帧率下穿门速度与总时长一致
      const ux = DoGAnim.ptDiveUx, uy = DoGAnim.ptDiveUy;
      const step = PT_DIVE_SPEED * dt;
      head.x += ux * step;
      head.y += uy * step;
      segments[0].angle = lerpAngle(segments[0].angle, Math.atan2(uy, ux), currentChar.turnSmooth);
    } else if (DoGAnim.ptChargeActive) {
      // Stage 2（钻出+冲刺）：惯性积分（速度由 updateDogPhaseTransition 衰减）
      head.x += DoGAnim.ptChargeVx;
      head.y += DoGAnim.ptChargeVy;
      const cvx = DoGAnim.ptChargeVx, cvy = DoGAnim.ptChargeVy;
      if (Math.hypot(cvx, cvy) > 0.1) {
        segments[0].angle = lerpAngle(segments[0].angle, Math.atan2(cvy, cvx), currentChar.turnSmooth);
      }
    }
    // Stage 1（裂缝）：头部已收拢到门位置、静止，不追鼠标
    lastHead.x = head.x; lastHead.y = head.y;
  } else if (DoGAnim.deathActive && currentCharKey === 'devourer_of_gods') {
    // ★ 2026-08-18 死亡减速飞行（原版 DoDeathAnimation）：
    //   idealSpeed = Lerp(8.4, 4, GetLerpValue(15, 210, DeathAnimationTimer))，每帧向 idealSpeed 收敛 0.08。
    //   死亡瞬间锁定当前移动方向，之后沿该方向逐渐减速飞行，不追鼠标。
    if (!DoGAnim.deathDirLocked) {
      let dx = head.x - lastHead.x, dy = head.y - lastHead.y;
      const dl = Math.hypot(dx, dy);
      if (dl > 0.5) { DoGAnim.deathDirX = dx / dl; DoGAnim.deathDirY = dy / dl; }
      else { DoGAnim.deathDirX = Math.cos(segments[0].angle); DoGAnim.deathDirY = Math.sin(segments[0].angle); }
      DoGAnim.deathDirLocked = true;
    }
    // 死亡计时（帧）：原版 GetLerpValue(15, 210, DeathAnimationTimer) → 8.4 → 4
    //   ★ 原版是 Terraria 的 8.4px/帧；本游戏 DoG maxSpeed=6，按比例缩放到 4.2 → 2 更协调
    const dtfDeath = DoGAnim.deathTimer;
    const g = clamp01((dtfDeath - 15) / (210 - 15));
    const idealSpeed = 4.2 + (2 - 4.2) * g;                      // 4.2 → 2（px/帧，按游戏尺度缩放）
    // 当前速度向 idealSpeed 收敛 0.08（原版 velocity = normalize × Lerp(cur, ideal, 0.08)）
    if (DoGAnim.deathSpeed == null) DoGAnim.deathSpeed = 4.2;
    DoGAnim.deathSpeed += (idealSpeed - DoGAnim.deathSpeed) * 0.08 * dt * 60;
    const spd = DoGAnim.deathSpeed;
    head.x += DoGAnim.deathDirX * spd * dt;
    head.y += DoGAnim.deathDirY * spd * dt;
    segments[0].angle = lerpAngle(segments[0].angle, Math.atan2(DoGAnim.deathDirY, DoGAnim.deathDirX), currentChar.turnSmooth);
    lastHead.x = head.x; lastHead.y = head.y;
  } else if (DoGAnim.entranceActive) {
    // ★ 进场冲刺（2026-08-19 v8，用户确认 P2 式）：白屏透明后满速启动 → 惯性冲过头 → 缓冲减速 → 恢复鼠标跟随。
    //   与 P2 ptCharge 同手感：不"刹停"在目标点（旧版比例减速会卡一下）。
    if (DoGAnim.entranceDelay > 0) {
      DoGAnim.entranceDelay -= dt;
      lastHead.x = head.x; lastHead.y = head.y;
    } else {
      const dx = DoGAnim.entranceTX - head.x;
      const dy = DoGAnim.entranceTY - head.y;
      const dist = Math.hypot(dx, dy);
      // 首次启动：满速指向目标（P2 冲刺感）+ 震动（boss 进入屏幕可见时，用户要求"进入屏幕再震"）
      if (!DoGAnim.entranceFired) {
        DoGAnim.entranceFired = true;
        const sp0 = DoGAnim.entranceSpeed || 2600;
        DoGAnim.entranceVx = (dx / (dist || 1)) * sp0;
        DoGAnim.entranceVy = (dy / (dist || 1)) * sp0;
        screenShake.set(24);
        setTimeout(() => { if (screenShake.active) screenShake.set(16); }, 400);  // 延续震感
      }
      // 向目标速度收敛（v 保持 85% 惯性 → 冲过头后缓冲回来，不平滑刹停）
      const ts = Math.min(DoGAnim.entranceSpeed || 2600, dist * 4);
      const tVx = (dx / (dist || 1)) * ts;
      const tVy = (dy / (dist || 1)) * ts;
      DoGAnim.entranceVx = DoGAnim.entranceVx * 0.85 + tVx * 0.15;
      DoGAnim.entranceVy = DoGAnim.entranceVy * 0.85 + tVy * 0.15;
      head.x += DoGAnim.entranceVx * dt;
      head.y += DoGAnim.entranceVy * dt;
      segments[0].angle = lerpAngle(segments[0].angle, Math.atan2(DoGAnim.entranceVy, DoGAnim.entranceVx), currentChar.turnSmooth);
      // 冲过头缓冲后（低速度 + 已回近目标）→ 结束进场，恢复鼠标跟随（向鼠标移动，P2 式收尾）
      if (dist < 60 && Math.hypot(DoGAnim.entranceVx, DoGAnim.entranceVy) < 160) {
        DoGAnim.entranceActive = false;
        dogDialogue.say('spawn');   // ★ 开场白：冲刺进场完成后输出
      }
      lastHead.x = head.x; lastHead.y = head.y;
    }
  } else {
    // 常规鼠标跟随
    const dx = mouse.x - head.x;
    const dy = mouse.y - head.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.min(dist * currentChar.accel, currentChar.maxSpeed) * ((currentCharKey === 'devourer_of_gods' && DoGAnim.jawCharging) ? 0.4 : 1);
    if (dist > 0.5) { head.x += (dx / dist) * speed; head.y += (dy / dist) * speed; }
    const movedX = head.x - lastHead.x, movedY = head.y - lastHead.y;
    if (Math.hypot(movedX, movedY) > 0.05) segments[0].angle = lerpAngle(segments[0].angle, Math.atan2(movedY, movedX), currentChar.turnSmooth);
    lastHead.x = head.x; lastHead.y = head.y;
  }
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], p = points[i];
    const vx = prev.x - p.x, vy = prev.y - p.y;
    const d = Math.hypot(vx, vy);
    const target = segments[i].dist;
    if (d > target && d > 0) { const ratio = target / d; p.x = prev.x - vx * ratio; p.y = prev.y - vy * ratio; }
    segments[i].angle = lerpAngle(segments[i].angle, Math.atan2(vy, vx), currentChar.turnSmooth);
  }
  // ★ 穿门吸入（Stage 0 钻入期）：靠近传送门中心的体节被额外拉向门中心，
  //   让虫体在门前「收拢、压缩着涌进」门中心，呈现整条虫被吸进去，而不是前端被删、后端远远吊着。
  //   头部(i=0)不吸（由锁定方向领航）；消失判定仍是 dogClip.core，所以仍是「触到正中心才消失」，不会被提前抹掉。
  if (DoGAnim.ptDiveActive && dogClip.active) {
    const SUCTION_R = 240;                       // 吸入作用半径（px）：超出此距离不受吸力
    for (let i = 1; i < points.length; i++) {
      if (segments[i].ptGone) continue;
      const p = points[i];
      const dx = dogClip.px - p.x, dy = dogClip.py - p.y;
      const d = Math.hypot(dx, dy);
      if (d > dogClip.core && d < SUCTION_R) {
        const k = 1 - d / SUCTION_R;             // 越近吸力越强（线性）
        const pull = PT_SUCTION * k * k * dt;    // 本帧位移（px）；k^2 让近门处吸力急剧增强
        if (d > 0.0001) { p.x += (dx / d) * pull; p.y += (dy / d) * pull; }
      }
    }
  }
  if (currentCharKey === 'xm05_thanatos') {
    set_thanatosTimer(thanatosTimer + dt);
    if (thanatosPhase === 'blue' && thanatosTimer >= THANATOS_HOLD) { set_thanatosPhase('toRed'); set_thanatosTimer(0); }
    else if (thanatosPhase === 'toRed' && thanatosTimer >= THANATOS_TRANS) { set_thanatosPhase('red'); set_thanatosTimer(0); }
    else if (thanatosPhase === 'red' && thanatosTimer >= THANATOS_HOLD) { set_thanatosPhase('toBlue'); set_thanatosTimer(0); }
    else if (thanatosPhase === 'toBlue' && thanatosTimer >= THANATOS_TRANS) { set_thanatosPhase('blue'); set_thanatosTimer(0); }
  }
}

// 单条虫的自主更新：头部朝目标移动（主虫跟随鼠标全屏，副虫镜像主虫头部），体节链式跟随

export function updateWorm(w, dt, mirrorOf) {
  const head = w.points[0];
  let tx, ty;
  if (w.isPrimary) {
    const margin = 70 + currentChar.scale * 30;
    tx = Math.max(margin, Math.min(W - margin, mouse.x));
    ty = Math.max(margin, Math.min(H - margin, mouse.y));
  } else {
    // 左右镜像（以屏幕竖直中线为轴）：B 头部 = A 头部的左右镜像，随鼠标一起对称移动
    const a = (mirrorOf && mirrorOf.points) ? mirrorOf : worms.find(x => x.isPrimary);
    tx = W - a.points[0].x;
    ty = a.points[0].y;
  }
  const dx = tx - head.x, dy = ty - head.y;
  const dist = Math.hypot(dx, dy);
  const speed = Math.min(dist * currentChar.accel, currentChar.maxSpeed) * ((currentCharKey === 'devourer_of_gods' && DoGAnim.jawCharging) ? 0.4 : 1);
  if (dist > 0.5) { head.x += (dx / dist) * speed; head.y += (dy / dist) * speed; }
  const movedX = head.x - w.lastHead.x, movedY = head.y - w.lastHead.y;
  if (Math.hypot(movedX, movedY) > 0.05) w.segments[0].angle = lerpAngle(w.segments[0].angle, Math.atan2(movedY, movedX), currentChar.turnSmooth);
  w.lastHead.x = head.x; w.lastHead.y = head.y;
  for (let i = 1; i < w.points.length; i++) {
    const prev = w.points[i - 1], p = w.points[i];
    const vx = prev.x - p.x, vy = prev.y - p.y;
    const d = Math.hypot(vx, vy);
    const target = w.segments[i].dist;
    if (d > target && d > 0) { const ratio = target / d; p.x = prev.x - vx * ratio; p.y = prev.y - vy * ratio; }
    w.segments[i].angle = lerpAngle(w.segments[i].angle, Math.atan2(vy, vx), currentChar.turnSmooth);
  }
}


export function drawSegmentsBase() {
  // DoG 透明度（变身淡出/传送渐变/死亡溶解）× ★ 6 键 armorFade 渐变（隐铠甲只留亮纹）
  // armorFadeAlpha：非渐变期恒 1；渐变期 base 层（含颚部）随之 1→0→1，glow 层不受影响（见 drawSegmentsGlow）
  const dogAlpha = currentCharKey === 'devourer_of_gods'
    ? clamp01(DoGAnim.opacity * DoGAnim.deathOpacity) * (DoGAnim.armorFadeActive ? DoGAnim.armorFadeAlpha : 1) : 1;
  const needDogAlpha = dogAlpha < 0.99;
  const clipActive = dogClip.active, clipBand = dogClip.band;
  const groups = isDual ? worms : [{ segments, points }];
  for (const grp of groups) {
    const n = grp.segments.length;
    for (let i = n - 1; i >= 0; i--) {
      const seg = grp.segments[i];
      const p = grp.points[i];
      // ★ 死亡动画体节崩解：被销毁的段（deathGone）跳过绘制（原版 n.active=false）
      if (seg.deathGone) continue;
      // ★ 穿门吸入：按【本节到传送门正中心的距离】决定可见性（不是链条顺序）。
      //   已没入（触碰过中心）→ 跳过；在消散带内 → 越近中心越小越透明。
      let segAlpha = 1, segScale = 1;
      if (clipActive && clipBand > 0) {
        if (seg.ptGone) continue;
        const dToCore = Math.hypot(p.x - dogClip.px, p.y - dogClip.py) - dogClip.core;
        if (dToCore <= 0) continue;                     // 已在中心内（本帧刚触碰，标记稍后由 update 打上）
        if (dToCore < clipBand) {                        // 处于消散带：距中心越近越缩没、越淡
          const fade = dToCore / clipBand;               // 0（贴中心）→ 1（带外缘）
          segAlpha = fade;
          segScale = 0.3 + 0.7 * fade;
        }
      }
      if (!(seg.img || seg.frameKey)) continue;
      ctx.save();
      ctx.globalAlpha = (needDogAlpha ? dogAlpha : 1) * segAlpha;
      // 蓄力时仅头部（含颚）随 jawShakeY 垂直震动，体节不受影响
      const headShakeBase = (currentCharKey === 'devourer_of_gods' && seg.type === 'head') ? DoGAnim.jawShakeY : 0;
      ctx.translate(p.x, p.y + headShakeBase);
      ctx.rotate(seg.angle + Math.PI / 2);
      ctx.scale(currentChar.scale * segScale, currentChar.scale * segScale);
      if (seg.frameKey) {
        const fr = currentChar.frames[seg.frameKey];
        const period = fr.period != null ? fr.period : fr.fh + 2;
        const fi = frameIndex(i);
        const sy = fi * period;
        const anchored = fr.anchor === 'base' || seg.type === 'head';
        const dyBase = anchored ? -fr.fh : -fr.fh / 2;
        ctx.drawImage(imgs[fr.sheet], 0, sy, fr.w, fr.fh, -fr.w / 2, dyBase, fr.w, fr.fh);
        if (fr.glow && imgs[fr.glow]) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(imgs[fr.glow], 0, sy, fr.w, fr.fh, -fr.w / 2, dyBase, fr.w, fr.fh);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        const h = seg.img;
        const dy = seg.type === 'head' ? -h.height
                 : (seg.type === 'tail' && currentCharKey === 'desert_scourge') ? 0  // 荒漠尾：以顶缘(接04端)为锚点，向远离04方向延伸、绕该端旋转
                 : -h.height / 2;
        
        // DoG 头部分离绘制：活动颚 + 无颚头部（v0812af：head/head_final 已去颚，先颚后头→头盖住颚铰链区）
        if (currentCharKey === 'devourer_of_gods' && seg.type === 'head') {
          // 1. 左右两片活动下颌（先绘制，在头部之下）
          //    armorOff（隐去铠甲）形态无颚，跳过。
          const jawImg = currentChar.phase >= 2 ? imgs.jaw_final : imgs.jaw;
          if (jawImg && !currentChar.armorOff) {
            // 左片 (side=-1)
            drawDogJawInstance(ctx, jawImg, h.height, DoGAnim.jawRotation, -1, currentChar.phase >= 2, DoGAnim.dashJawFadeProgress);
            // 右片 (side=1)
            drawDogJawInstance(ctx, jawImg, h.height, DoGAnim.jawRotation,  1, currentChar.phase >= 2, DoGAnim.dashJawFadeProgress);
          }
          // 2. 无颚头骨（后绘制，盖住颚部上缘/铰链区——仅露出颚尖）
          ctx.drawImage(h, -h.width / 2, dy);
        } else {
          ctx.drawImage(h, -h.width / 2, dy);
        }
        // 亮纹（glow）不在此层绘制：若在此画会被暗化层压暗、失去显眼亮色。
        // 改由 drawSegmentsGlow() 在暗化层之后统一绘制，原色不受黑夜影响、且按深度正确遮挡。
      }
      ctx.restore();
    }
  }
}

// 自发光角色（Astrum Deus 星神）的发光层：在「暗化层之后」绘制，
// 因此发光像素原色输出、不受黑夜压暗，呈现显眼亮色。
// 遮挡规则：一条虫的发光只会被「更靠前（绘制更晚）的虫体/体节」遮挡，不会被后方虫体遮挡，
// 从而避免亮纹浮到另一条虫之上。深度约定：worms[0]=B 在后、worms[末]=A 在前
// （与 drawSegmentsBase 一致：B 先画=在后，A 后画=在上）；同虫内头节在前、尾节在后。

export function drawSegmentsGlow() {
  if (!_glowTmp) { set__glowTmp(document.createElement('canvas')); set__glowOcc(document.createElement('canvas')); }
  if (_glowTmp.width !== W || _glowTmp.height !== H) { _glowTmp.width = W; _glowTmp.height = H; _glowOcc.width = W; _glowOcc.height = H; }
  const tctx = _glowTmp.getContext('2d');
  const octx = _glowOcc.getContext('2d');

  // 收集所有体节，按「从前到后」深度排序：跨虫先 A 后 B，同虫内 头→尾。
  // 这样 occ 累积「已处理（更靠前）体节轮廓」，后续更后的体节发光被其正确遮挡。
  const segs = [];
  const clipActive = dogClip.active, clipBand = dogClip.band;
  // 收集时按「本节到传送门正中心的距离」计算消散透明度/缩放，已没入的跳过（与 drawSegmentsBase 同一判据）
  const clipGather = (segArr, ptArr) => {
    for (let i = 0; i < segArr.length; i++) {
      if (segArr[i].deathGone) continue;   // ★ 死亡体节崩解：已销毁段跳过（含 glow）
      let a = 1, s = 1;
      if (clipActive && clipBand > 0) {
        if (segArr[i].ptGone) continue;          // 已触碰过门中心 → 永久消失
        const p = ptArr[i];
        const dToCore = Math.hypot(p.x - dogClip.px, p.y - dogClip.py) - dogClip.core;
        if (dToCore <= 0) continue;             // 已在中心内
        if (dToCore < clipBand) { const fade = dToCore / clipBand; a = fade; s = 0.3 + 0.7 * fade; }
      }
      segs.push({ seg: segArr[i], p: ptArr[i], alpha: a, scale: s });
    }
  };
  if (isDual && worms.length) {
    for (let wi = worms.length - 1; wi >= 0; wi--) clipGather(worms[wi].segments, worms[wi].points);
  } else {
    clipGather(segments, points);
  }

  const stampSil = (c, seg, p, scale) => {
    if (!seg.img) return;
    const h = seg.img;
    const dy = seg.type === 'head' ? -h.height
             : (seg.type === 'tail' && currentCharKey === 'desert_scourge') ? 0
             : -h.height / 2;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(seg.angle + Math.PI / 2);
    c.scale(currentChar.scale * (scale || 1), currentChar.scale * (scale || 1));
    c.drawImage(h, -h.width / 2, dy);
    c.restore();
  };

  // 刻遮挡：头基底 + DoG 活动颚两片剪影（颚在头部之下，须一并写入 occ，
  // 否则颚区无基底覆盖 → 后方体节亮纹从颚区透上来、且颚咬合时盖不住下方亮纹）
  const stampSegAndJaws = (c, seg, p, h, scale) => {
    stampSil(c, seg, p, scale);
    if (currentCharKey === 'devourer_of_gods' && seg.type === 'head' && !currentChar.armorOff && h) {
      const phase2 = currentChar.phase >= 2;
      const jawImg = phase2 ? imgs.jaw_final : imgs.jaw;
      if (jawImg) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(seg.angle + Math.PI / 2);
        c.scale(currentChar.scale * (scale || 1), currentChar.scale * (scale || 1));
        drawDogJawInstance(c, jawImg, h.height, DoGAnim.jawRotation, -1, phase2, 0);
        drawDogJawInstance(c, jawImg, h.height, DoGAnim.jawRotation,  1, phase2, 0);
        c.restore();
      }
    }
  };

  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = 'source-over';
  octx.clearRect(0, 0, W, H);

  for (const { seg, p, alpha, scale } of segs) {
    const gk = seg.glowKey ? seg.glowKey : null;
    const glowArr = (gk && imgs[gk] && Array.isArray(imgs[gk])) ? imgs[gk] : null;
    if (!seg.img || !glowArr || !glowArr.length) { stampSegAndJaws(octx, seg, p, seg.img, scale); continue; }
    const h = seg.img;
    const dy = seg.type === 'head' ? -h.height
             : (seg.type === 'tail' && currentCharKey === 'desert_scourge') ? 0
             : -h.height / 2;
    // 离屏 lighter 合成该体节全部 glow 帧（用户给的每一张都被用上、始终点亮、不闪）
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, W, H);
    tctx.save();
    // 蓄力时仅头部（含颚）随 jawShakeY 垂直震动，体节不受影响
    const headShakeGlow = (currentCharKey === 'devourer_of_gods' && seg.type === 'head') ? DoGAnim.jawShakeY : 0;
    tctx.translate(p.x, p.y + headShakeGlow);
    tctx.rotate(seg.angle + Math.PI / 2);
    tctx.scale(currentChar.scale * scale, currentChar.scale * scale);
    tctx.globalCompositeOperation = 'lighter';
    // 自发光亮纹随 DoG 整体透明度淡出（隐身时亮纹一起隐），非 DoG 角色恒为 1；
    // 过场钻门时再乘上沿链吞噬的消散透明度（亮纹随体节一起平滑缩没）
    const dogAlpha = (currentCharKey === 'devourer_of_gods') ? clamp01(DoGAnim.opacity * DoGAnim.deathOpacity) : 1;
    tctx.globalAlpha = dogAlpha * alpha;
    for (const g of glowArr) tctx.drawImage(g, -h.width / 2, dy);
    tctx.globalAlpha = 1;
    tctx.restore();
    // 扣掉更靠前体节（含另一条更前的虫）轮廓：避免发光穿透 / 浮到上方
    tctx.globalCompositeOperation = 'destination-out';
    tctx.drawImage(_glowOcc, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    // 原色输出、不受暗化压暗（本函数在暗化层之后调用）
    ctx.drawImage(_glowTmp, 0, 0);
    // 把当前体节轮廓（含颚）加入 occ，供更后体节遮挡
    stampSegAndJaws(octx, seg, p, h, scale);
  }
}

// 闪电全屏环境照亮：跟随 lightningIntensity，在暗化层之后绘制，让闪电瞬间把夜空整体提亮
// （即使 bolt 已消失、intensity 仍在衰减中也持续照亮，产生雷暴照亮夜空的感觉）

export function frameIndex(i) {
  // 塔纳托斯：由「蓝↔红」状态机驱动帧号（精灵表 0=蓝 1=紫 2=红 3=亮橙 4=过渡）
  if (currentCharKey === 'xm05_thanatos') {
    if (thanatosPhase === 'blue') return 0;
    if (thanatosPhase === 'red') return 2;
    const r = Math.min(1, thanatosTimer / THANATOS_TRANS);  // 0→1 过渡进度
    if (thanatosPhase === 'toRed') return Math.round(r * 2);       // 0(蓝)→1(紫)→2(红)
    /* toBlue */                return Math.round((1 - r) * 2);     // 2(红)→1(紫)→0(蓝)
  }
  const fc = currentChar.frameCount;
  const t = animTime + i * currentChar.waveOffset;
  let fi = Math.floor(t / currentChar.framePeriod) % fc;
  if (fi < 0) fi += fc;
  return fi;
}

