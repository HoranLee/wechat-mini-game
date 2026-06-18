import Matter from 'matter-js';
import { Ball } from '../entities/Ball.js';
import { BALL_LEVELS, MAX_LEVEL, MERGE } from '../config/constants.js';
import { gameStore } from '../stores/GameStore.js';

// ============================================================
// 合成系统 — 检测碰撞 + 执行合成 + 触发特效回调
// ============================================================

export class MergeSystem {
  /**
   * @param {object} world     - Matter.World
   * @param {Function} onMerge - 回调 (newBall, x, y, score) 用于触发特效
   */
  constructor(world, onMerge) {
    this.world = world;
    this.onMerge = onMerge;
    this._pendingMerges = [];  // 待处理的合成对 [[ballA, ballB, contactPoint], ...]
  }

  /** 检查两个碰撞体是否可以合成 */
  checkCollision(bodyA, bodyB, contactPoint) {
    const ballA = bodyA._ballRef;
    const ballB = bodyB._ballRef;
    if (!ballA || !ballB) return;
    if (ballA.level !== ballB.level) return;
    if (ballA.level >= MAX_LEVEL) return; // 最高级不再合成
    if (!ballA.canMerge() || !ballB.canMerge()) return;
    if (!ballA.isDropped || !ballB.isDropped) return; // 瞄准中的球不参与合成

    // 检查相对速度 — 太慢的碰撞不触发合成 (防止静止球意外合成)
    const relVel = Math.sqrt(
      (bodyA.velocity.x - bodyB.velocity.x) ** 2 +
      (bodyA.velocity.y - bodyB.velocity.y) ** 2
    );
    if (relVel < MERGE.minVelocityForMerge) return;

    // 避免重复添加
    const pairKey = this._pairKey(ballA.id, ballB.id);
    if (this._pendingMerges.some(m => m.key === pairKey)) return;

    this._pendingMerges.push({
      key: pairKey,
      ballA,
      ballB,
      x: contactPoint ? contactPoint.x : (ballA.body.position.x + ballB.body.position.x) / 2,
      y: contactPoint ? contactPoint.y : (ballA.body.position.y + ballB.body.position.y) / 2,
    });
  }

  /** 每帧处理合成队列 */
  processMerges() {
    if (this._pendingMerges.length === 0) return;

    // 按合成位置从上到下排序 (防止下方合成影响上方)
    this._pendingMerges.sort((a, b) => a.y - b.y);

    for (const m of this._pendingMerges) {
      // 验证两个球都还在 (没被之前的合成消耗)
      if (m.ballA._markedForRemoval || m.ballB._markedForRemoval) continue;
      if (!m.ballA.body || !m.ballB.body) continue;
      if (m.ballA.level !== m.ballB.level) continue; // 可能被其他合成改了等级

      this._executeMerge(m);
    }

    this._pendingMerges = [];
  }

  _executeMerge(m) {
    const { ballA, ballB, x, y } = m;
    const newLevel = ballA.level + 1;
    const def = BALL_LEVELS[newLevel];

    // 标记旧球移除
    ballA.markForRemoval();
    ballB.markForRemoval();

    // 创建新球
    const newBall = new Ball(newLevel, x, y, this.world);
    newBall.setMergeCooldown(MERGE.cooldown);
    newBall.isDropped = true;
    newBall.isInContainer = true;
    Matter.Composite.add(this.world, newBall.body);

    // 给新球一个微小的随机速度 (让物理更自然)
    Matter.Body.setVelocity(newBall.body, {
      x: (Math.random() - 0.5) * 1.5,
      y: -0.5,
    });

    // 更新游戏状态
    gameStore.recordMerge();
    gameStore.setMaxLevel(newLevel);
    const actualScore = gameStore.addScore(def.score);

    // 回调 (触发特效)
    if (this.onMerge) {
      this.onMerge(newBall, x, y, actualScore);
    }
  }

  _pairKey(idA, idB) {
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }

  reset() {
    this._pendingMerges = [];
  }
}
