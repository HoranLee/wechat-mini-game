import * as PIXI from 'pixi.js';
import { EFFECTS } from '../config/constants.js';

// ============================================================
// 背景氛围粒子系统
// ============================================================

class AmbientParticles {
  constructor(stage) {
    this.stage = stage;
    this.particles = [];
    this.container = new PIXI.Container();
    stage.addChild(this.container);
    this._init();
  }

  _init() {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      const size = 0.5 + Math.random() * 2;
      const alpha = 0.1 + Math.random() * 0.35;
      const color = Math.random() < 0.3 ? 0x6688cc : 0x8899dd;
      g.beginFill(color, alpha);
      g.drawCircle(0, 0, size);
      g.endFill();
      g.x = Math.random() * 390;
      g.y = Math.random() * 750;
      this.container.addChild(g);
      this.particles.push({
        gfx: g,
        baseX: g.x,
        baseY: g.y,
        speedY: 0.08 + Math.random() * 0.3,
        speedX: (Math.random() - 0.5) * 0.15,
        amplitude: 0.3 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        freq: 0.001 + Math.random() * 0.003,
      });
    }
  }

  update(dt, time) {
    for (const p of this.particles) {
      p.gfx.y = p.baseY - ((time * p.speedY) % 750);
      if (p.gfx.y < -10) p.gfx.y = 760;
      p.gfx.x = p.baseX + Math.sin(time * p.freq + p.phase) * p.amplitude;
      p.gfx.alpha = 0.1 + Math.sin(time * 0.001 + p.phase) * 0.12;
    }
  }
}

// ============================================================
// 特效系统 — 高品质粒子 / 屏幕震动 / 分数弹窗 / 冲击波
// ============================================================

export class EffectSystem {
  constructor(stage, uiLayer) {
    this.stage = stage;
    this.uiLayer = uiLayer;
    this._particles = [];
    this._popups = [];
    this._shakeAmount = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
    this._shockwaves = [];
    this.ambientParticles = new AmbientParticles(stage);
  }

  /** 环形冲击波特效（高等级合并使用） */
  emitShockwave(x, y, color, numRings = 3) {
    for (let i = 0; i < numRings; i++) {
      const ring = new PIXI.Graphics();
      ring.x = x; ring.y = y;
      this.stage.addChild(ring);
      this._shockwaves.push({
        gfx: ring,
        color,
        currentRadius: 5 + i * 8,
        maxRadius: 80 + i * 30,
        alpha: 0.7 - i * 0.2,
        elapsed: 0,
        duration: 400 + i * 80 + Math.random() * 100,
      });
    }
  }

  /** 合并爆发粒子 */
  emitMergeParticles(x, y, color, count = EFFECTS.particleCount, speedMul = 1) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = EFFECTS.particleSpeed * (0.5 + Math.random()) * speedMul;
      const life = EFFECTS.particleLife * (0.5 + Math.random() * 0.5);
      const size = 1.5 + Math.random() * 5;

      const gfx = new PIXI.Graphics();
      if (Math.random() < 0.3) {
        gfx.beginFill(color, 0.9);
        const starVerts = buildStarPoints(0, 0, 4, size, size * 0.35);
        gfx.drawPolygon(starVerts);
        gfx.endFill();
      } else {
        gfx.beginFill(color, 0.85);
        gfx.drawCircle(0, 0, size);
        gfx.endFill();
        if (size > 2.5) {
          gfx.beginFill(0xFFFFFF, 0.5);
          gfx.drawCircle(0, 0, size * 0.4);
          gfx.endFill();
        }
      }

      gfx.x = x; gfx.y = y;
      this.stage.addChild(gfx);

      this._particles.push({
        gfx, x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life, maxLife: life,
      });
    }
  }

  /** 分数弹窗 */
  showScorePopup(x, y, score, comboText = '') {
    const c = new PIXI.Container();

    const scoreTxt = new PIXI.Text(`+${score}`, {
      fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: '900',
      fill: 0xffffff,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 4, dropShadowDistance: 1,
      align: 'center',
    });
    scoreTxt.anchor.set(0.5);
    c.addChild(scoreTxt);

    if (comboText) {
      const comboTxt = new PIXI.Text(comboText, {
        fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: 'bold',
        fill: 0xffd700,
        dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 3, dropShadowDistance: 0,
        align: 'center',
      });
      comboTxt.anchor.set(0.5);
      comboTxt.y = 26;
      c.addChild(comboTxt);
    }

    c.x = x; c.y = y;
    this.uiLayer.addChild(c);

    this._popups.push({ container: c, x, y, elapsed: 0, duration: EFFECTS.popupDuration });
  }

  /** 全屏闪白 */
  flashScreen(duration = 120) {
    const flash = new PIXI.Graphics();
    flash.beginFill(0xFFFFFF, 0.35);
    flash.drawRect(0, 0, 390, 750);
    flash.endFill();
    this.uiLayer.addChild(flash);
    // 快速衰减
    const start = performance.now();
    const ticker = () => {
      const t = (performance.now() - start) / duration;
      if (t >= 1) {
        this.uiLayer.removeChild(flash);
        flash.destroy();
        return;
      }
      flash.alpha = 0.35 * (1 - t);
      requestAnimationFrame(ticker);
    };
    ticker();
  }

  /** 屏幕震动 */
  shakeScreen(intensity = EFFECTS.shakeIntensity, duration = EFFECTS.shakeDuration) {
    if (intensity > this._shakeAmount || this._shakeElapsed <= 0) {
      this._shakeAmount = intensity;
      this._shakeDuration = duration;
      this._shakeElapsed = 0;
    }
  }

  getShakeOffset() {
    if (this._shakeElapsed >= this._shakeDuration || this._shakeAmount <= 0) {
      return { x: 0, y: 0 };
    }
    const decay = 1 - this._shakeElapsed / this._shakeDuration;
    const i = this._shakeAmount * decay * decay;
    return {
      x: (Math.random() - 0.5) * i * 2,
      y: (Math.random() - 0.5) * i * 2,
    };
  }

  update(dt) {
    // -- 冲击波 --
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.elapsed += dt;
      if (sw.elapsed >= sw.duration) {
        sw.gfx.parent?.removeChild(sw.gfx);
        sw.gfx.destroy();
        this._shockwaves.splice(i, 1);
        continue;
      }
      const t = sw.elapsed / sw.duration;
      sw.currentRadius = 5 + (sw.maxRadius - 5) * t;
      sw.gfx.clear();
      sw.gfx.lineStyle(3 * (1 - t), sw.color, sw.alpha * (1 - t));
      sw.gfx.drawCircle(0, 0, sw.currentRadius);
      sw.gfx.lineStyle(1.5 * (1 - t), 0xFFFFFF, sw.alpha * 0.5 * (1 - t));
      sw.gfx.drawCircle(0, 0, sw.currentRadius * 0.85);
    }

    // -- 粒子 --
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.gfx.parent?.removeChild(p.gfx);
        p.gfx.destroy();
        this._particles.splice(i, 1);
        continue;
      }
      p.vx *= 0.98;
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.gfx.x = p.x;
      p.gfx.y = p.y;
      const t = Math.max(0, p.life / p.maxLife);
      p.gfx.alpha = t;
      p.gfx.scale.set(t);
      p.gfx.rotation += p.vx * 0.03;
    }

    // -- 弹窗 --
    for (let i = this._popups.length - 1; i >= 0; i--) {
      const p = this._popups[i];
      p.elapsed += dt;
      if (p.elapsed >= p.duration) {
        p.container.parent?.removeChild(p.container);
        p.container.destroy({ children: true });
        this._popups.splice(i, 1);
        continue;
      }
      const t = p.elapsed / p.duration;
      p.container.y = p.y - t * 55 * (1 - t * 0.3);
      p.container.alpha = 1 - t * t;
      p.container.scale.set(1 + t * 0.4);
    }

    // -- 震动 --
    if (this._shakeElapsed < this._shakeDuration) {
      this._shakeElapsed += dt;
    }
  }

  reset() {
    for (const p of this._particles) {
      p.gfx.parent?.removeChild(p.gfx);
      p.gfx.destroy();
    }
    this._particles = [];
    for (const sw of this._shockwaves) {
      sw.gfx.parent?.removeChild(sw.gfx);
      sw.gfx.destroy();
    }
    this._shockwaves = [];
    for (const p of this._popups) {
      p.container.parent?.removeChild(p.container);
      p.container.destroy({ children: true });
    }
    this._popups = [];
    this._shakeAmount = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
  }
}

// ========== 工具 ==========

function buildStarPoints(cx, cy, spikes, outerR, innerR) {
  const verts = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = step * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    verts.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  return verts;
}