import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { BALL_LEVELS } from '../config/constants.js';

// ============================================================
// 球体 — 多层渲染模拟玻璃/陶瓷质感
// ============================================================

let ballIdCounter = 0;

export class Ball {
  constructor(level, x, y, world) {
    this.id = ++ballIdCounter;
    this.level = level;
    this._world = world;

    const def = BALL_LEVELS[level] || BALL_LEVELS[0];
    this.radius = def.radius;
    this.color = def.body;
    this.name = def.name;

    // ---- 物理体 ----
    this.body = Matter.Bodies.circle(x, y, this.radius, {
      restitution: 0.15,
      friction: 0.4,
      density: 0.002,
      label: `ball_${this.id}`,
    });
    this.body._ballRef = this;
    this.body._level = level;

    // ---- 渲染 ----
    this.display = new PIXI.Container();
    this._draw(level);
    this.display.addChild(this._gfx);

    // emoji 标签
    this._text = new PIXI.Text(def.emoji, {
      fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
      fontSize: Math.round(this.radius * 0.75),
      align: 'center',
    });
    this._text.anchor.set(0.5);
    this.display.addChild(this._text);

    // ---- 状态 ----
    this.isDropped = false;
    this.isInContainer = false;
    this._mergeCooldown = 0;
    this._markedForRemoval = false;
  }

  // ============ 多层玻璃球渲染 ============

  _draw(level) {
    const g = new PIXI.Graphics();
    const r = this.radius;
    const def = BALL_LEVELS[level];

    // ---- 0. 外层辉光 (高级球) ----
    if (level >= 5) {
      const glowRings = level >= 8 ? 3 : level >= 6 ? 2 : 1;
      for (let i = glowRings; i >= 1; i--) {
        g.beginFill(def.glow, 0.04 / i);
        g.drawCircle(0, 0, r + 6 * i);
        g.endFill();
      }
    }

    // ---- 1. 投影 ----
    g.beginFill(0x000000, 0.18);
    g.drawEllipse(r * 0.1, r * 0.2, r * 1.05, r * 0.95);
    g.endFill();

    // ---- 2. 主体底色 ----
    g.beginFill(def.body, 0.95);
    g.drawCircle(0, 0, r);
    g.endFill();

    // ---- 3. 暗面渐变 (右下) ----
    // 用多个半透明圆叠加模拟
    g.beginFill(def.dark, 0.25);
    g.drawCircle(r * 0.08, r * 0.15, r * 0.9);
    g.endFill();
    g.beginFill(def.dark, 0.15);
    g.drawCircle(r * 0.12, r * 0.25, r * 0.7);
    g.endFill();

    // ---- 4. 内发光 (左上大面积高光) ----
    g.beginFill(0xFFFFFF, 0.14);
    g.drawCircle(-r * 0.18, -r * 0.22, r * 0.62);
    g.endFill();
    g.beginFill(0xFFFFFF, 0.10);
    g.drawCircle(-r * 0.25, -r * 0.28, r * 0.45);
    g.endFill();

    // ---- 5. 顶部亮斑 (高光点) ----
    g.beginFill(0xFFFFFF, 0.38);
    g.drawEllipse(-r * 0.12, -r * 0.34, r * 0.28, r * 0.22);
    g.endFill();

    // ---- 6. 底部反光 ----
    g.beginFill(0xFFFFFF, 0.06);
    g.drawEllipse(0, r * 0.55, r * 0.6, r * 0.2);
    g.endFill();

    // ---- 7. 描边高光 (左上缘) ----
    g.lineStyle(1.2, 0xFFFFFF, 0.22);
    g.arc(-r * 0.02, -r * 0.02, r - 1, -Math.PI * 0.65, -Math.PI * 0.1);
    g.lineStyle(0);

    this._gfx = g;
  }

  // ============ 方法 ============

  syncDisplay() {
    this.display.x = this.body.position.x;
    this.display.y = this.body.position.y;
    this.display.rotation = this.body.angle;
  }

  update(dt) {
    if (this._mergeCooldown > 0) {
      this._mergeCooldown -= dt;
    }
  }

  canMerge() {
    return !this._markedForRemoval && this._mergeCooldown <= 0;
  }

  setMergeCooldown(ms) {
    this._mergeCooldown = ms;
  }

  markForRemoval() {
    this._markedForRemoval = true;
  }

  removeFromWorld() {
    if (this.body) {
      Matter.Composite.remove(this._world, this.body);
      this.body = null;
    }
  }

  destroy() {
    this.removeFromWorld();
    if (this.display.parent) {
      this.display.parent.removeChild(this.display);
    }
    this.display.destroy({ children: true });
    this._world = null;
  }
}
