import { makeAutoObservable } from 'mobx';

// ============================================================
// 游戏状态管理 (MobX)
// ============================================================

const HIGH_SCORE_KEY = 'merge_ball_high_score';

class GameStore {
  // ---- 分数 ----
  score = 0;
  highScore = 0;

  // ---- 游戏状态: 'ready' | 'playing' | 'gameover' ----
  gameState = 'ready';

  // ---- 当前正在掉落的球 / 下一个预览的球 ----
  currentBall = null;        // 正在被瞄准/下落的 Ball 实例引用
  nextBallLevel = 0;        // 下一个球的等级

  // ---- 瞄准 ----
  isAiming = false;         // 是否正在瞄准
  aimX = 195;               // 当前瞄准 X 位置

  // ---- 连击 ----
  combo = 0;               // 当前连击数
  lastMergeTime = 0;       // 上次合成时间(用于连击窗口)

  // ---- 统计 ----
  maxLevel = 0;            // 本局合成的最高等级
  totalMerges = 0;         // 总合成次数
  containerBallCount = 0;  // 容器内球数

  // ---- 危险线计时 ----
  dangerStartTime = 0;     // 球超过危险线的时间戳(0=无球超线)
  isInDanger = false;

  constructor() {
    makeAutoObservable(this);
    this._loadHighScore();
  }

  // ---- 计算方法 ----

  /** 当前连击倍率 */
  get comboMultiplier() {
    if (this.combo <= 1) return 1;
    return Math.min(1 + (this.combo - 1) * 0.5, 5);
  }

  /** 格式化后的倍率文本 */
  get comboText() {
    const m = this.comboMultiplier;
    return m >= 2 ? `x${m.toFixed(1)}` : '';
  }

  // ---- 操作方法 ----

  reset() {
    this.score = 0;
    this.gameState = 'ready';
    this.currentBall = null;
    this.nextBallLevel = 0;
    this.isAiming = false;
    this.aimX = 195;
    this.combo = 0;
    this._maxCombo = 0;
    this.lastMergeTime = 0;
    this.maxLevel = 0;
    this.totalMerges = 0;
    this.containerBallCount = 0;
    this.dangerStartTime = 0;
    this.isInDanger = false;
  }

  addScore(points) {
    const multiplied = Math.round(points * this.comboMultiplier);
    this.score += multiplied;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this._saveHighScore();
    }
    return multiplied; // 返回实际得分(含倍率)供弹窗显示
  }

  /** 当次连击最高值 */
  get maxCombo() {
    return this._maxCombo || 0;
  }

  _maxCombo = 0;

  recordMerge() {
    const now = Date.now();
    if (now - this.lastMergeTime < 1800) {
      this.combo += 1;
    } else {
      this.combo = 1;
    }
    if (this.combo > this._maxCombo) {
      this._maxCombo = this.combo;
    }
    this.lastMergeTime = now;
    this.totalMerges += 1;
  }

  setMaxLevel(level) {
    if (level > this.maxLevel) {
      this.maxLevel = level;
    }
  }

  startGame() {
    this.reset();
    this.gameState = 'playing';
    this.nextBallLevel = this._randomLevel();
  }

  endGame() {
    this.gameState = 'gameover';
    this.isAiming = false;
    this.currentBall = null;
  }

  // ---- 内部方法 ----

  _randomLevel() {
    const max = 4; // 只生成 0-4 级
    // 加权随机：低级概率更高
    const weights = [30, 28, 20, 14, 8]; // 总和 100
    const r = Math.random() * 100;
    let acc = 0;
    for (let i = 0; i <= max; i++) {
      acc += weights[i];
      if (r <= acc) return i;
    }
    return 0;
  }

  _loadHighScore() {
    try {
      const val = localStorage.getItem(HIGH_SCORE_KEY);
      if (val) this.highScore = parseInt(val, 10) || 0;
    } catch (_) { /* 隐私模式下 localStorage 不可用 */ }
  }

  _saveHighScore() {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    } catch (_) { /* 忽略 */ }
  }
}

// 单例导出
export const gameStore = new GameStore();
