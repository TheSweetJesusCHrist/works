// ===== utils/effects.js =====
// Extension interfaces for the game's visual effects layer.
//
// The goal of this module is to make it *cheap* to add new trail / particle
// behaviours without touching the render pipeline. Two building blocks are
// provided:
//
//   • EffectRegistry  — a named registry of effects, each with an
//                       update(dt) and draw(ctx). The game loop calls
//                       registry.update(dt) once per frame and the renderer
//                       calls registry.draw(ctx) (top layer). Registering an
//                       effect is enough to get it ticked and drawn.
//
//   • ParticleEmitter — base class for a pooled particle system. Override
//                       spawnParticle()/drawParticle() to define a look.
//
//   • TrailRenderer   — base class that records a moving point every frame
//                       and draws a fading ribbon behind it.
//
// To add your own effect: subclass one of the bases (or implement the
// {update, draw, enabled} interface) and call `effects.register('myFx', fx)`.
// No other file needs to change.

import { currentCharKey, isDual, points, worms } from '../core/globals.js';

// ── Registry ────────────────────────────────────────────────────────────

export class EffectRegistry {
  constructor() { this._effects = new Map(); }

  register(name, effect) {
    this._effects.set(name, effect);
    return effect;
  }

  unregister(name) { this._effects.delete(name); }

  get(name) { return this._effects.get(name); }

  has(name) { return this._effects.has(name); }

  clear() { this._effects.clear(); }

  update(dt) {
    for (const fx of this._effects.values()) {
      if (fx && fx.enabled !== false) fx.update(dt);
    }
  }

  draw(ctx) {
    for (const fx of this._effects.values()) {
      if (fx && fx.enabled !== false) fx.draw(ctx);
    }
  }
}

// Shared registry. The game loop and renderer wire into this instance.
export const effects = new EffectRegistry();

// ── Particle emitter base ─────────────────────────────────────────────────

export class ParticleEmitter {
  constructor({ max = 400 } = {}) {
    this.particles = [];
    this.max = max;
    this.enabled = true;
  }

  emit(x, y, opts = {}) {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push(this.spawnParticle(x, y, opts));
  }

  // Override: return a plain particle descriptor object.
  spawnParticle(x, y, opts) {
    return { x, y, vx: 0, vy: 0, life: 60, maxLife: 60, ...opts };
  }

  update(dt) {
    const f = dt * 60;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= f;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += (p.vx || 0) * f;
      p.y += (p.vy || 0) * f;
      if (p.onUpdate) p.onUpdate(p, dt);
    }
  }

  // Override: draw a single particle. Default = small additive dot.
  drawParticle(ctx, p) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) this.drawParticle(ctx, p);
    ctx.restore();
  }
}

// ── Trail renderer base ───────────────────────────────────────────────────

export class TrailRenderer {
  constructor({ length = 24, width = 10, color = 'rgba(255,255,255,0.5)', minDist = 4 } = {}) {
    this.samples = [];           // recent {x, y}
    this.length = length;        // max samples retained
    this.width = width;
    this.color = color;
    this.minDist = minDist;      // only record when head moved ≥ minDist
    this.enabled = true;
  }

  // Sample the current head position. Subclasses override getHead().
  sample() {
    const h = this.getHead();
    if (!h) return;
    const last = this.samples[this.samples.length - 1];
    if (last && Math.hypot(h.x - last.x, h.y - last.y) < this.minDist) return;
    this.samples.push({ x: h.x, y: h.y });
    if (this.samples.length > this.length) this.samples.shift();
  }

  // Override: return the world-space point to trail, or null to skip.
  getHead() { return null; }

  update(dt) { this.sample(); }

  draw(ctx) {
    if (this.samples.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.samples.length; i++) {
      const t = i / this.samples.length;          // older → thinner/fainter
      ctx.globalAlpha = t * 0.6;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.width * t;
      ctx.beginPath();
      ctx.moveTo(this.samples[i - 1].x, this.samples[i - 1].y);
      ctx.lineTo(this.samples[i].x, this.samples[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Example: trail that follows the controlled worm's head ────────────────
// Registered but DISABLED by default so it does not change existing visuals.
// Toggle live with the `T` key (see bottom of this file) or via
// `effects.get('headTrail').enabled = true`.

class HeadTrail extends TrailRenderer {
  getHead() {
    if (!currentCharKey) return null;
    if (isDual) {
      const w = worms.find(x => x.isPrimary);
      return w ? w.points[0] : null;
    }
    return points[0] || null;
  }
}

export const headTrail = effects.register('headTrail', new HeadTrail({ length: 28, width: 12, color: 'rgba(180,220,255,0.7)' }));
headTrail.enabled = false;

// Lightweight live toggle so the extension point is demonstrable without
// editing key bindings. Only acts while a character is on screen.
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && currentCharKey) {
      headTrail.enabled = !headTrail.enabled;
    }
  });
  // expose for console / DebugPanel use
  window.__effects = effects;
}
