// ===== ui/DebugPanel.js (Stage 3: F3 live debug overlay) =====
// 纯附加模块：按 F3 切换显示，实时反映共享状态，用于排查视觉/运行时问题。
// 不影响任何游戏逻辑；生产构建中也可安全保留。
import {
  currentCharKey, currentChar, segments, points, isDual,
  animTime, darkLevel, currentTheme, cloudsOn, lightningOn, mouse, W, H
} from '../core/globals.js';
import { DoGAnim } from '../core/Renderer.js';
import { rainOn, lightningIntensity } from '../core/Background.js';
import { screenShake } from '../utils/ScreenShake.js';

let panel = null;
let visible = false;
let lastT = 0;
let fps = 0;
let frames = 0;

export function initDebugPanel() {
  panel = document.createElement('div');
  panel.id = 'debug-panel';
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', left: '8px', zIndex: '9999',
    background: 'rgba(0,0,0,0.72)', color: '#7CFC00',
    font: '12px Consolas, "Courier New", monospace',
    padding: '8px 10px', borderRadius: '6px', whiteSpace: 'pre',
    pointerEvents: 'none', display: 'none', lineHeight: '1.5em', maxWidth: '340px'
  });
  document.body.appendChild(panel);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      visible = !visible;
      panel.style.display = visible ? 'block' : 'none';
    }
  });

  setInterval(update, 200);
  requestAnimationFrame(fpsLoop);
}

function fpsLoop(t) {
  frames++;
  if (!lastT) lastT = t;
  if (t - lastT >= 1000) {
    fps = Math.round((frames * 1000) / (t - lastT));
    frames = 0; lastT = t;
  }
  requestAnimationFrame(fpsLoop);
}

function update() {
  if (!visible || !panel) return;
  const segN = Array.isArray(segments) ? segments.length : 0;
  const ptN = Array.isArray(points) ? points.length : 0;
  const lines = [];
  lines.push('DEVOURER DEBUG  [F3]');
  lines.push('char : ' + (currentCharKey || '-'));
  lines.push('fps  : ' + fps);
  lines.push('seg  : ' + segN + '  pts: ' + ptN + '  dual: ' + isDual);
  lines.push('theme: ' + currentTheme + '  dark: ' + darkLevel.toFixed(2));
  lines.push('cloud: ' + (cloudsOn ? 'on' : 'off') + '  rain: ' + (rainOn ? 'on' : 'off') + '  bolt: ' + lightningIntensity.toFixed(2));
  lines.push('DoG  : ph' + (currentChar ? currentChar.phase : '-') +
             ' jaw:' + DoGAnim.jawState + ' shake:' + screenShake.intensity.toFixed(2));
  lines.push('animT: ' + animTime.toFixed(2));
  lines.push('mouse: ' + Math.round(mouse.x) + ',' + Math.round(mouse.y));
  lines.push('size : ' + Math.round(W) + 'x' + Math.round(H));
  panel.textContent = lines.join('\n');
}
