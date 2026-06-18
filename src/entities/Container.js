import Matter from 'matter-js';
import { CONTAINER, PHYSICS } from '../config/constants.js';

// ============================================================
// 容器 — 创建游戏区域的静态墙壁 + 危险线
// ============================================================

export class Container {
  constructor(world) {
    this.world = world;
    this.walls = [];

    this._createWalls();
  }

  _createWalls() {
    const { x, y, width, height, wallThickness: t } = CONTAINER;

    const opts = {
      isStatic: true,
      restitution: PHYSICS.wallRestitution,
      friction: PHYSICS.wallFriction,
      render: { fillStyle: 'transparent' },
    };

    // 左墙
    const leftWall = Matter.Bodies.rectangle(
      x - t / 2,
      y + height / 2,
      t,
      height,
      { ...opts, label: 'wall_left' }
    );
    // 右墙
    const rightWall = Matter.Bodies.rectangle(
      x + width + t / 2,
      y + height / 2,
      t,
      height,
      { ...opts, label: 'wall_right' }
    );
    // 地板
    const floor = Matter.Bodies.rectangle(
      x + width / 2,
      y + height + t / 2,
      width + t * 2,
      t,
      { ...opts, label: 'floor' }
    );

    this.walls = [leftWall, rightWall, floor];
    Matter.Composite.add(this.world, this.walls);
  }

  /** 检查球是否在容器内 (已越过顶部) */
  isBallInside(ball) {
    if (!ball.body) return false;
    const by = ball.body.position.y;
    const bx = ball.body.position.x;
    const r = ball.radius;
    return (
      by - r >= CONTAINER.y &&
      bx - r >= CONTAINER.x &&
      bx + r <= CONTAINER.x + CONTAINER.width
    );
  }

  /** 检查球是否在容器上方 (还没掉进去) */
  isBallAboveContainer(ball) {
    if (!ball.body) return false;
    return ball.body.position.y + ball.radius < CONTAINER.y;
  }

  remove() {
    if (this.world) {
      Matter.Composite.remove(this.world, this.walls);
    }
    this.walls = [];
  }
}
