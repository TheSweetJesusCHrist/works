// ===== core/Game.js (migrated from scourge_selector.html) =====
import { DoGSky, RAIN_COUNT, clouds, computeDarkLevel, getBackground, initClouds, initLightning, initRain, loadBackgrounds, rainDrops, rainOn, spawnRainDrop, updateClouds, updateLightning, updateRain, set_rainOn, set_rainDrops} from './Background.js';
import { DOG_LASER_WALL_ENABLED, DoGAnim, draw, initParticles, prewarmDoGEffects, startArmorFadeTransition, startPhaseTransition, updateDoGAnimations, updateParticles } from './Renderer.js';
import { buildSegments, segMin, segStep, update } from '../entities/Scourge.js';
import { handleRebind, hideControls, isBound, showTitle } from '../ui/SelectionScreen.js';
import { CHARACTERS, IMAGES, onCharactersReload } from '../config/characters.js';
import { screenShake } from '../utils/ScreenShake.js';
import { effects } from '../utils/effects.js';
import { H, W, animTime, canvas, cloudsOn, ctx, currentChar, currentCharKey, currentTheme, darkLevel, imgs, isDual, lastTs, lightningOn, mouse, points, rafId, segments, thanatosPhase, thanatosTimer, timeOfDayOverride, worms, set_canvas, set_ctx, set_W, set_H, set_lastTs, set_animTime, set_rafId, set_currentCharKey, set_currentChar, set_currentTheme, set_cloudsOn, set_lightningOn, set_timeOfDayOverride, set_darkLevel, set_imgs, set_thanatosPhase, set_thanatosTimer, set_segments, set_points, set_worms, set_isDual} from './globals.js';
import { initInput } from './Input.js';

export function init() {
  set_canvas(document.getElementById('c'));
  set_ctx(canvas.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  loadBackgrounds();
  initClouds();
  initLightning();
  initRain();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function(e) {
    // When controls panel is open and rebinding, capture key for rebind
    if (document.getElementById('controls').style.display === 'flex' && handleRebind(e)) return;
    onKey(e);
  });

  window.addEventListener('keyup', function(e) {
    onKeyUp(e);
  });

  document.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('click', () => startGame(card.dataset.char));
  });

  document.getElementById('preview-aquatic').src = IMAGES.aquatic_scourge.head;
  document.getElementById('preview-desert').src = IMAGES.desert_scourge.head;
  document.getElementById('preview-perforator').src = IMAGES.the_perforator.large_head;
  // 塔纳托斯预览：裁剪精灵表第 0 帧显示
  (function () {
    const im = new Image();
    im.onload = () => {
      const fh = Math.floor(im.height / 5); // 5 帧均分
      const c = document.createElement('canvas');
      c.width = im.width; c.height = fh;
      const cx = c.getContext('2d');
      cx.drawImage(im, 0, 0, im.width, fh, 0, 0, im.width, fh);
      document.getElementById('preview-thanatos').src = c.toDataURL();
    };
    im.src = IMAGES.xm05_thanatos.head_sheet.url;
  })();
  document.getElementById('preview-astrum').src = IMAGES.astrum_deus.head;
  // 选角预览用独立 preview 字段（避免把二阶段头覆盖进游戏内一阶段 head）
  document.getElementById('preview-devourer').src = (IMAGES.devourer_of_gods.preview || IMAGES.devourer_of_gods.head).url;
}


export function resize() {
  if (!canvas) return;
  set_W(canvas.width = innerWidth);
  set_H(canvas.height = innerHeight);
}

// 每个体节的体长半值：竖直(朝上)贴图取高度的一半，水平(朝右)贴图取宽度的一半

export function loop(ts) {
  if (!currentChar) return;
  if (!lastTs) set_lastTs(ts);            // 首次由 rAF 驱动，ts 为真实时间戳
  let dt = (ts - lastTs) / 1000;
  if (!isFinite(dt) || dt < 0) dt = 0;  // 防止首帧/时钟异常导致 NaN
  dt = Math.min(dt, 0.1);
  set_lastTs(ts);
  set_animTime(animTime + dt);
  try {
    update(dt);
    updateParticles();
    updateClouds(dt);
    updateLightning(dt);
    updateRain(dt);
    updateDoGAnimations(dt);       // DoG 动画状态机 + 粒子更新
    DoGSky.update(dt, currentCharKey, currentChar);   // DoG 战天背景：淡入淡出 + 天空色联动
    effects.update(dt);             // 扩展接口：驱动自定义拖尾/粒子效果
    screenShake.update(dt);         // 屏幕震动：计算本帧偏移并衰减
    if (screenShake.active) {
      ctx.save();
      ctx.translate(screenShake.x, screenShake.y);
    }
    try {
      draw();
    } finally {
      // ★ 2026-08-18 修复：draw() 内任何异常都必须复位 transform——
      //   之前 restore 在 try 外，drawLaserWall 抛异常被 catch 吞掉后 ctx 残留 translate，
      //   屏幕震动结束后画面永远偏移不复位（用户反馈）。
      if (screenShake.active) ctx.restore();
    }
  } catch (err) {
    console.error('[loop] 渲染异常，已跳过本帧：', err);
  }
  set_rafId(requestAnimationFrame(loop));
}


export function startGame(key) {
  set_currentCharKey(key);
  set_currentChar(CHARACTERS[key]);
  // 进入时把体节数重置为“默认”值（= segBase，注意区别于最短下限 segFloor），避免上次增减残留，保证每次进虫都是默认大小
  if (currentCharKey === 'the_perforator') {
    for (const vk in currentChar.variants) currentChar.variants[vk].bodyCount = currentChar.variants[vk].segBase;
  } else {
    currentChar.bodyCount = currentChar.segBase;
  }
  // 由 background 参数推导行为主题，由 clouds/lightning 参数推导各自的开关
  const bg = getBackground(currentChar.background);
  set_currentTheme(bg.theme);
  set_cloudsOn(currentChar.clouds === 1);
  set_lightningOn(currentChar.lightning === 1);
  // 由 timeOfDay 参数推导昼夜暗化强度（切换角色时清掉 L 键的覆盖，回到默认）
  set_timeOfDayOverride(null);
  set_darkLevel(computeDarkLevel(currentChar.timeOfDay || 'day'));
  // DoG 战天背景（v0812bc）：进入 DoG 时淡入，切换其他角色时淡出
  DoGSky.targetIntensity = (key === 'devourer_of_gods') ? 1 : 0;
  set_imgs({});
  let loaded = 0;
  const sources = IMAGES[key];
  const entries = Object.entries(sources);
  entries.forEach(([type, src]) => {
    // 数组值（如 Astrum Deus 的 glow 帧序列）：逐张加载为 Image 数组，全部就绪后再计入完成
    if (Array.isArray(src)) {
      const arr = new Array(src.length);
      if (src.length === 0) { imgs[type] = arr; loaded++; if (loaded === entries.length) enterGame(); return; }
      let done = 0;
      const finish = () => { imgs[type] = arr; loaded++; if (loaded === entries.length) enterGame(); };
      src.forEach((s, idx) => {
        const im = new Image();
        im.onload = () => { arr[idx] = im; if (++done === src.length) finish(); };
        im.onerror = () => { if (++done === src.length) finish(); };
        im.src = s; // 数组元素为 base64 data URI
      });
      return;
    }
    // 塔纳托斯贴图为 {url, b64} 对象（url 优先，加载失败回退 base64）；其余角色为纯 base64 串
    const url = (src && typeof src === 'object') ? src.url : src;
    const fb  = (src && typeof src === 'object') ? src.b64 : null;
    const img = new Image();
    img.onload = () => {
      imgs[type] = img;
      loaded++;
      if (loaded === entries.length) enterGame();
    };
    // 防御：相对路径失败则回退 base64；仍失败才计入完成，避免整局卡死、点击无反应
    img.onerror = () => {
      if (fb && !img.dataset.fell) { img.dataset.fell = '1'; img.src = fb; }
      else { console.warn('[startGame] 图片加载失败，已跳过：', type); loaded++; if (loaded === entries.length) enterGame(); }
    };
    img.src = url;
  });
}


export function enterGame() {
  console.log('[scourge_selector] BUILD v14 — 亮纹移回暗化层之后绘制（显眼亮色、不受黑夜压暗），遮挡改按真实从前到后深度：A 最前、B 在后、头在尾前');
  const sel = document.getElementById('selection');
  sel.style.opacity = 0;
  setTimeout(() => {
    sel.style.display = 'none';
    document.getElementById('game').style.display = 'block';
  }, 400);
  mouse.x = W / 2;
  mouse.y = H / 2;
  buildSegments();
  initParticles();
  // ★ DoG 过场特效预热（空闲时分帧渲染漩涡帧 + 预建 tint 缓存）→ 消除第一次按 P 的卡顿
  if (currentCharKey === 'devourer_of_gods') prewarmDoGEffects();
  if (rafId) cancelAnimationFrame(rafId);
  set_lastTs(0);     // 重置时间戳，确保下一帧 dt 从 0 开始
  set_animTime(0);
  set_thanatosPhase('blue');   // 塔纳托斯每次进入都从蓝色状态开始
  set_thanatosTimer(0);
  set_rafId(requestAnimationFrame(loop));  // 用 rAF 启动，首帧即拿到真实 ts
}


export function returnToSelection() {
  if (rafId) cancelAnimationFrame(rafId);
  set_currentCharKey(null);
  set_currentChar(null);
  set_imgs({});
  set_segments([]);
  set_points([]);
  set_worms([]);
  set_isDual(false);
  const sel = document.getElementById('selection');
  sel.style.display = 'flex';
  sel.style.opacity = 1;
  document.getElementById('game').style.display = 'none';
}

// 角色数据热更新（HMR）：重新套用最新配置到当前运行的角色，
// 不重置位置、不重新加载已缓存的贴图（仅重建体节 + 重置环境粒子）。
export function reloadCurrentCharacter() {
  if (!currentCharKey) return;
  set_currentChar(CHARACTERS[currentCharKey]);
  buildSegments();
  initParticles();
}
onCharactersReload(reloadCurrentCharacter);

// 松开咬合键：若在蓄力中则触发咬合（松开瞬间完成蓄力快照，进入快速咬合）

export function onKeyUp(e) {
  if (currentCharKey !== 'devourer_of_gods') return;
  if (!isBound('dog_bite', e)) return;
  if (!DoGAnim.jawCharging) return;            // 只有真正在蓄力才咬合
  DoGAnim.jawCharging = false;
  DoGAnim.jawChargeAtRelease = DoGAnim.jawCharge;   // 快照蓄力值 → 驱动震动强度/颚尺寸
  DoGAnim.jawState = 'chomping';
  DoGAnim.jawChompProgress = 0;
  DoGAnim.jawChompTimer = 0;
  DoGAnim.shouldSpawnChompVFX = true;
  DoGAnim.dashJawFadeProgress = 1;
  DoGAnim.dashJawFadeTimer = 0.5;   // 咬合后放大高亮层保持 ~0.5s 后淡出（dt 已为真实秒，原为 60 帧误当 60 秒）
}


export function onKey(e) {
  // Back / ESC: return to title or selection
  if (isBound('back_key', e)) {
    if (!currentChar) {
      if (document.getElementById('controls').style.display === 'flex') hideControls();
      else showTitle();
    } else {
      returnToSelection();
    }
    return;
  }
  if (!currentChar) return;

  // Day / Dusk / Night cycle
  if (isBound('day_cycle', e)) {
    const order = ['day', 'dusk', 'night'];
    const cur = timeOfDayOverride || (currentChar.timeOfDay || 'day');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    set_timeOfDayOverride(next);
    set_darkLevel(computeDarkLevel(next));
  }
  // Add / Remove segments (all worms)
  if (isBound('seg_up', e) || isBound('seg_down', e)) {
    const delta = isBound('seg_up', e) ? segStep() : -segStep();
    if (currentCharKey === 'the_perforator') {
      const v = currentChar.variants[currentChar.currentVariant];
      v.bodyCount = Math.max(segMin(), v.bodyCount + delta);
    } else {
      currentChar.bodyCount = Math.max(segMin(), (currentChar.bodyCount || 0) + delta);
    }
    buildSegments();
  }
  // Devourer of Gods — animation triggers
  if (currentCharKey === 'devourer_of_gods') {
    if (isBound('dog_toggleform', e) && !currentChar.armorOff) {
      // P 键：触发 P1→P2 过场（钻门 → 裂缝 → 冲刺钻出）
      // 仅 P1 可触发；P2 / armorOff 无操作
      startPhaseTransition();
    }
    if (isBound('dog_bite', e) && currentCharKey === 'devourer_of_gods') {
      // 长按蓄力：仅在空闲、无冷却时开始蓄力（忽略 keydown 自动重复）
      if (!DoGAnim.jawCharging && DoGAnim.jawCooldown <= 0 && DoGAnim.jawState === 'idle') {
        DoGAnim.jawCharging = true;
        DoGAnim.jawState = 'charging';
        DoGAnim.jawCharge = 0;
        DoGAnim.jawChargeRatio = 0;
        DoGAnim.jawChargeScale = 1;
        DoGAnim.jawShakeY = 0;
        DoGAnim.jawChompProgress = 0;
        DoGAnim.maxChargeWarn = false;
      }
    }
    if (isBound('dog_phase2', e)) {
      // 6 = 隐去铠甲形态切换（toggle）：仅二阶段专属，一阶段按无效。
      // 二阶段按一下渐变隐去铠甲只留亮纹（armorOff），再按渐变恢复。
      // 切换由 startArmorFadeTransition() 驱动（0.6s 淡出 + 0.1s 原位换贴图 + 0.6s 淡入），
      // 不再立即 buildSegments 瞬换贴图（旧版=“重新刷新生成一条虫”）。
      startArmorFadeTransition();   // 内部已判断 phase>=2 / 渐变中 / 过场中
    }
    if (isBound('dog_death', e)) {
      // 7 = 死亡演示：仅 P2（二阶段）可触发（用户要求：死亡动画只能 P2 才能触发）
      if (currentChar.phase < 2) return;
      DoGAnim.deathActive = true;
      DoGAnim.deathTimer = 0;
      DoGAnim.deathStage = 0;         // 从 slowdown 开始
      DoGAnim.deathOpacity = 1;
    }
    if (isBound('dog_laser', e) && DOG_LASER_WALL_ENABLED && currentChar.armorOff) {
      // 8 = 释放激光墙技能：仅 armorOff（隐铠甲纯能量）形态可释放。
      // 触发可见激光墙特效（原版 DoGLaserWalls.cs 网格 + BigBeam 大光束，约 5 秒）。
      DoGAnim.laserActive = true;
      DoGAnim.laserTimer = 480;      // 总时长（帧，8s）
      DoGAnim.laserTime = 0;         // 原版 time（0→300）
      DoGAnim.laserFX = 0;           // 淡入从 0 开始
      DoGAnim.laserDoneAttack = false;
      DoGAnim.laserStoredTime = 0;
      DoGAnim.laserColor = [0, 221, 250];   // 起始 Cyan（原版 drawColor）
      DoGAnim.laserSine = 0;
      DoGAnim.laserBigBeamActive = false;
      DoGAnim.laserBigBeamTime = 0;
      DoGAnim.laserBigBeamFX = 0;
      DoGAnim.laserBigBeamRot = (Math.random() - 0.5) * 0.8;   // 原版 laserRot ±0.4
      DoGAnim.laserBigBeamColor = [255, 0, 255];               // 起始 Magenta（BigBeam 反向）
      screenShake.set(6);
    }
    if (isBound('dog_reset', e)) {
      DoGAnim.reset();
      currentChar.phase = 1;
      currentChar.armorOff = false;
      buildSegments();
    }
  }
  // Reset position
  if (isBound('reset_pos', e)) {
    if (isDual) {
      for (const w of worms) {
        const cx = w.isPrimary ? W * 0.27 : W * 0.73, cy = H * 0.5;
        let cum = 0;
        w.points.forEach((p, i) => { cum += (i > 0 ? w.segments[i].dist : 0); p.x = cx; p.y = cy + cum; });
        w.segments.forEach(s => s.angle = 0);
      }
    } else {
      const cx = W / 2, cy = H / 2;
      let cum = 0;
      points.forEach((p, i) => {
        cum += (segments[i] ? segments[i].dist : 0);
        p.x = cx;
        p.y = cy + cum;
      });
      segments.forEach(s => s.angle = 0);
    }
  }
  // Toggle rain
  if (isBound('toggle_rain', e)) {
    set_rainOn(!rainOn);
    set_rainDrops([]);
    if (rainOn) for (let i = 0; i < RAIN_COUNT; i++) spawnRainDrop(true);
  }

  // Perforator form switch
  if (currentCharKey === 'the_perforator') {
    const formMap = { form_large: 'large', form_medium: 'medium', form_small: 'small' };
    for (const [actionId, variant] of Object.entries(formMap)) {
      if (isBound(actionId, e) && variant !== currentChar.currentVariant) {
        currentChar.currentVariant = variant;
        buildSegments();
        break;
      }
    }
  }
}



// ===== 日月交替动画（开始界面） =====
