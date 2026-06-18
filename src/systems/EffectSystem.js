import * as PIXI from 'pixi.js';
import { EFFECTS } from '../config/constants.js';

// ============================================================
// 特效系统 — 高品质粒子 / 屏幕震动 / 分数弹窗
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
  }

  /** 合成爆发粒子
   * @param {number} count  粒子数(可选)
   * @param {number} speedMul 速度倍率(可选)
   */
  emitMergeParticles(x, y, color, count = EFFECTS.particleCount, speedMul = 1) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = EFFECTS.particleSpeed * (0.5 + Math.random()) * speedMul;
      const life = EFFECTS.particleLife * (0.5 + Math.random() * 0.5);
      const size = 1.5 + Math.random() * 5;

      // 光点形状 (小圆 + 星形火花混合)
      const gfx = new PIXI.Graphics();
      if (Math.random() < 0.3) {
        // 星形火花 (drawPolygon 手动构造)
        gfx.beginFill(color, 0.9);
        const starVerts = buildStarPoints(0, 0, 4, size, size * 0.35);
        gfx.drawPolygon(starVerts);
        gfx.endFill();
      } else {
        // 圆形光点
        gfx.beginFill(color, 0.85);
        gfx.drawCircle(0, 0, size);
        gfx.endFill();
        // 内层亮核
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
    const i = this._shakeAmount * decay * decay; // 二次衰减更自然
    return {
      x: (Math.random() - 0.5) * i * 2,
      y: (Math.random() - 0.5) * i * 2,
    };
  }

  update(dt) {
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
      // ease-out 上飘
      p.container.y = p.y - t * 55 * (1 - t * 0.3);
      p.container.alpha = 1 - t * t;
      p.container.scale.set(1 + t * 0.4);
    }

    // -- 震动 --
    if (this._shakeElapsed < this._shakeDuration) {
      this._shakeElapsed += dt;
    }
  }

  // ---- 内部 ----

  reset() {
    for (const p of this._particles) {
      p.gfx.parent?.removeChild(p.gfx);
      p.gfx.destroy();
    }
    this._particles = [];
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

/** 构建星形多边形顶点 (drawPolygon 使用) */
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
