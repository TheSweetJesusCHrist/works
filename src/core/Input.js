// ===== core/Input.js (migrated) =====
import { mouse } from './globals.js';

// 鼠标 / 触摸坐标追踪：把屏幕坐标写入共享的 mouse 对象。
export function initInput() {
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('touchmove', e => {
    if (e.touches.length) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchstart', e => {
    if (e.touches.length) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
  }, { passive: true });
}
