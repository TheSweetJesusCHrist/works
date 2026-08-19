// ===== utils/ScreenShake.js =====
// Standalone, reusable screen-shake utility.
//
// This replaces the shake logic that used to be inlined inside DoGAnim
// (shakeX / shakeY / shakeIntensity) and applied in Game.loop via a raw
// ctx.translate. It is now a small, self-contained class you can drop into
// any project.
//
// Behaviour is intentionally matched to the original game:
//   • trauma magnitude is in *pixels* (gameplay events previously did
//     `DoGAnim.shakeIntensity = N` with N in px, e.g. 8 / 10 / 15)
//   • decay is ~×0.9 per 60fps frame (`pow(0.9, dt*60)`), so it looks
//     identical at any frame-rate
//   • offset is a fresh random value each frame in [-mag, +mag]

export class ScreenShake {
  constructor({ maxOffset = Infinity, decayPerSecond = 0.9 } = {}) {
    this.intensity = 0;          // current trauma magnitude (px)
    this.x = 0;                  // offset applied this frame
    this.y = 0;
    this.maxOffset = maxOffset;   // clamp on the resulting offset magnitude
    this.decayPerSecond = decayPerSecond; // per-frame ×0.9 at 60fps
  }

  /** Absolute trauma set (matches old `DoGAnim.shakeIntensity = N`). */
  set(amount) {
    if (amount > this.intensity) this.intensity = Math.min(this.maxOffset, amount);
  }

  /** Additive trauma (nice for stacking multiple hits). */
  add(amount) {
    this.intensity = Math.min(this.maxOffset, this.intensity + amount);
  }

  /** Advance one frame: compute offset from current trauma, then decay. */
  update(dt) {
    if (this.intensity <= 0) { this.x = 0; this.y = 0; return; }
    const mag = Math.min(this.maxOffset, this.intensity);
    this.x = (Math.random() - 0.5) * 2 * mag;
    this.y = (Math.random() - 0.5) * 2 * mag;
    this.intensity *= Math.pow(this.decayPerSecond, dt * 60);
    if (this.intensity < 0.3) { this.intensity = 0; this.x = 0; this.y = 0; }
  }

  get active() { return this.intensity > 0; }
}

// Shared singleton used by the game loop (Game.loop) and by the gameplay
// event triggers (Renderer's DoG bite / teleport / death).
export const screenShake = new ScreenShake();
