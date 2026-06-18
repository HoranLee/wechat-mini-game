import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { gameStore } from '../stores/GameStore.js';
import { Container } from '../entities/Container.js';
import { Ball } from '../entities/Ball.js';
import { MergeSystem } from '../systems/MergeSystem.js';
import { EffectSystem } from '../systems/EffectSystem.js';
import { SoundSystem } from '../systems/SoundSystem.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  CONTAINER, DANGER_LINE_Y, PHYSICS,
  BALL_LEVELS, MAX_LEVEL, DROP, GAME_OVER, THEME,
  MILESTONE_LEVELS,
} from '../config/constants.js';

// ============================================================
// 主游戏 — 全部视觉、交互、循环
// ============================================================

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.balls = [];
    this._dropCooldownRemaining = 0;
    this._canSpawn = true;

    this._setupPhysics();
    this._setupLayers();
    this._drawBackground();
    this.container = new Container(this.engine.world);
    this.effectSystem = new EffectSystem(this.effectLayer, this.uiLayer);
    this.mergeSystem = new MergeSystem(this.engine.world, this._onMerge.bind(this));
    this._setupCollisions();
    this._setupInput();
    this._setupUI();

    this._animTime = 0;
    this._lastPreviewLevel = -1;
    this._tutorialStep = -1;
    this._isPaused = false;
    this._bulletTimeRemaining = 0;    // 子弹时间剩余
    this._displayScore = 0;           // 显示分数 (tween 目标)
    this._realScore = 0;              // 实际分数
    this._bombCount = 0;              // 炸弹道具数

    this._setupPauseResume();
    this.app.ticker.add(() => this._gameLoop());
  }

  // ==================== 初始化 ====================

  _setupPhysics() {
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: PHYSICS.gravity },
    });
  }

  _setupLayers() {
    this.bgLayer = new PIXI.Container();
    this.ballLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();
    this.uiLayer = new PIXI.Container();
    this.stage.addChild(this.bgLayer, this.ballLayer, this.effectLayer, this.uiLayer);
  }

  // ==================== 背景绘制 ====================

  _drawBackground() {
    const W = CANVAS_WIDTH, H = CANVAS_HEIGHT;

    // 1. 渐变背景
    const bgGradient = this._createGradient(W, H, THEME.bgTop, THEME.bgBottom);
    const bgSprite = new PIXI.Sprite(bgGradient);
    this.bgLayer.addChild(bgSprite);

    // 2. 微网格
    const grid = new PIXI.Graphics();
    grid.lineStyle(0.5, 0x334488, 0.06);
    const step = 30;
    for (let x = 0; x <= W; x += step) { grid.moveTo(x, 0); grid.lineTo(x, H); }
    for (let y = 0; y <= H; y += step) { grid.moveTo(0, y); grid.lineTo(W, y); }
    this.bgLayer.addChild(grid);

    // 3. 容器底板 (玻璃质感)
    const { x, y, width, height, cornerRadius: cr } = CONTAINER;
    const bg = new PIXI.Graphics();

    // 外层辉光
    bg.beginFill(THEME.containerGlow, 0.07);
    bg.drawRoundedRect(x - 6, y - 6, width + 12, height + 12, cr + 4);
    bg.endFill();
    bg.beginFill(THEME.containerGlow, 0.04);
    bg.drawRoundedRect(x - 14, y - 14, width + 28, height + 28, cr + 8);
    bg.endFill();

    // 容器底色
    bg.beginFill(THEME.containerBg, 0.75);
    bg.drawRoundedRect(x, y, width, height, cr);
    bg.endFill();

    // 顶部微光扫过
    bg.beginFill(0xFFFFFF, 0.03);
    bg.drawRoundedRect(x + 4, y + 4, width - 8, height * 0.3, cr - 4);
    bg.endFill();

    // 边框
    bg.lineStyle(1, THEME.containerBorder, 0.7);
    bg.drawRoundedRect(x, y, width, height, cr);
    bg.lineStyle(0);

    // 墙壁
    const t = CONTAINER.wallThickness;
    bg.beginFill(THEME.containerBorder, 0.3);
    bg.drawRect(x - t, y, t, height);
    bg.drawRect(x + width, y, t, height);
    bg.drawRect(x - t, y + height, width + t * 2, t);
    bg.endFill();

    // 危险线 (动态呼吸)
    this._dangerLineGfx = new PIXI.Graphics();
    bg.addChild(this._dangerLineGfx);

    // 危险线标签
    const dangerLabel = new PIXI.Text('⚠ 危险线', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 10, fill: THEME.danger, align: 'right',
    });
    dangerLabel.anchor.set(1, 0.5);
    dangerLabel.x = x + width - 10;
    dangerLabel.y = DANGER_LINE_Y - 10;
    dangerLabel.alpha = 0.6;
    bg.addChild(dangerLabel);

    this.bgLayer.addChild(bg);
  }

  _createGradient(w, h, topColor, bottomColor) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.5, '#0b1330');
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return PIXI.Texture.from(canvas);
  }

  // ==================== 碰撞 ====================

  _setupCollisions() {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        // 墙壁碰撞辉光
        const isWallA = pair.bodyA.isStatic && !pair.bodyA._ballRef;
        const isWallB = pair.bodyB.isStatic && !pair.bodyB._ballRef;
        if ((isWallA || isWallB) && pair.collision && pair.collision.supports[0]) {
          const cp = pair.collision.supports[0];
          this.effectSystem.emitMergeParticles(cp.x, cp.y, 0x5577dd, 2, 0.25);
        }

        this.mergeSystem.checkCollision(
          pair.bodyA, pair.bodyB,
          pair.collision ? pair.collision.supports[0] || null : null
        );
      }
    });
  }

  // ==================== 输入 ====================

  _setupInput() {
    const v = this.app.view;
    v.addEventListener('mousedown', (e) => this._onPointerDown(e));
    v.addEventListener('mousemove', (e) => this._onPointerMove(e));
    v.addEventListener('mouseup', () => this._onPointerUp());
    v.addEventListener('touchstart', (e) => { e.preventDefault(); this._onPointerDown(e.touches[0]); }, { passive: false });
    v.addEventListener('touchmove', (e) => { e.preventDefault(); this._onPointerMove(e.touches[0]); }, { passive: false });
    v.addEventListener('touchend', (e) => { e.preventDefault(); this._onPointerUp(); });
  }

  _onPointerDown(e) {
    if (gameStore.gameState === 'ready') { this._startGame(); return; }
    if (gameStore.gameState !== 'playing') return;
    if (!this._canSpawn || gameStore.isAiming) return;
    if (this._dropCooldownRemaining > 0) return;
    this._beginAim(this._getCanvasX(e));
  }

  _onPointerMove(e) {
    if (gameStore.gameState !== 'playing' || !gameStore.isAiming) return;
    gameStore.aimX = this._clampAimX(this._getCanvasX(e));
  }

  _onPointerUp() {
    if (gameStore.gameState !== 'playing' || !gameStore.isAiming) return;
    this._releaseBall();
  }

  // ==================== 暂停/恢复 ====================

  _setupPauseResume() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._pause();
      } else {
        this._resume();
      }
    });
  }

  _pause() {
    if (gameStore.gameState !== 'playing' || this._isPaused) return;
    this._isPaused = true;
    this._pausedTimeScale = this.engine.timing.timeScale;
    this.engine.timing.timeScale = 0; // 冻结物理

    // 显示暂停遮罩
    if (!this._pauseOverlay) {
      this._pauseOverlay = new PIXI.Container();
      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.6);
      bg.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      bg.endFill();
      this._pauseOverlay.addChild(bg);
      const text = new PIXI.Text('已暂停', {
        fontFamily: 'Arial, sans-serif', fontSize: 32, fontWeight: '900', fill: 0xffffff,
        dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 6, dropShadowDistance: 0,
      });
      text.anchor.set(0.5);
      text.x = CANVAS_WIDTH / 2; text.y = CANVAS_HEIGHT / 2;
      this._pauseOverlay.addChild(text);
      const hint = new PIXI.Text('返回页面继续游戏', {
        fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0x8899cc,
      });
      hint.anchor.set(0.5);
      hint.x = CANVAS_WIDTH / 2; hint.y = CANVAS_HEIGHT / 2 + 40;
      this._pauseOverlay.addChild(hint);
    }
    this.uiLayer.addChild(this._pauseOverlay);
  }

  _resume() {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.engine.timing.timeScale = this._pausedTimeScale || 1;

    if (this._pauseOverlay && this._pauseOverlay.parent) {
      this._pauseOverlay.parent.removeChild(this._pauseOverlay);
    }
  }

  _getCanvasX(e) {
    const rect = this.app.view.getBoundingClientRect();
    return (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  }

  _clampAimX(x) {
    const r = BALL_LEVELS[gameStore.nextBallLevel].radius;
    return Math.max(CONTAINER.x + r + 2, Math.min(CONTAINER.x + CONTAINER.width - r - 2, x));
  }

  // ==================== 瞄准 & 掉落 ====================

  _beginAim(x) {
    const level = gameStore.nextBallLevel;
    gameStore.aimX = this._clampAimX(x);
    gameStore.isAiming = true;

    const ball = new Ball(level, gameStore.aimX, DROP.spawnY, this.engine.world);
    ball.isDropped = false;
    Matter.Body.setStatic(ball.body, true);
    Matter.Composite.add(this.engine.world, ball.body);

    gameStore.currentBall = ball;
    this.balls.push(ball);
    this.ballLayer.addChild(ball.display);

    // 入场弹跳动画
    ball.display.scale.set(0.6);
    ball.display.alpha = 0.6;

    gameStore.nextBallLevel = randomLevel();
  }

  _releaseBall() {
    const ball = gameStore.currentBall;
    if (!ball) return;

    gameStore.isAiming = false;
    ball.isDropped = true;

    Matter.Body.setStatic(ball.body, false);
    Matter.Body.setVelocity(ball.body, { x: 0, y: 1.5 });

    this._dropCooldownRemaining = DROP.cooldown;
    this._canSpawn = false;
    gameStore.containerBallCount += 1;

    SoundSystem.playDrop();
  }

  // ==================== 主循环 ====================

  _gameLoop() {
    const dt = this.app.ticker.deltaMS;
    this._animTime += dt;

    if (gameStore.gameState !== 'playing') return;

    // 1. 物理 (delta 上限防止快速帧导致不稳定)
    const physDt = Math.min(dt, 16.667);
    Matter.Engine.update(this.engine, physDt);

    // 1b. 子弹时间恢复
    if (this._bulletTimeRemaining > 0) {
      this._bulletTimeRemaining -= dt;
      const target = this._bulletTimeRemaining > 0 ? 0.3 : 1;
      this.engine.timing.timeScale += (target - this.engine.timing.timeScale) * 0.1;
      if (this._bulletTimeRemaining <= 0) {
        this.engine.timing.timeScale = 1;
      }
    }

    // 2. 合成
    this.mergeSystem.processMerges();

    // 3. 清理死球
    this._cleanupDeadBalls();

    // 4. 冷却 -> 自动出球
    if (this._dropCooldownRemaining > 0) {
      this._dropCooldownRemaining -= dt;
      if (this._dropCooldownRemaining <= 0) {
        this._dropCooldownRemaining = 0;
        this._canSpawn = true;
        if (!gameStore.isAiming && gameStore.gameState === 'playing') {
          this._beginAim(CANVAS_WIDTH / 2);
        }
      }
    }

    // 5. 瞄准球定位 + 入场动画
    if (gameStore.isAiming && gameStore.currentBall && !gameStore.currentBall.isDropped) {
      const ball = gameStore.currentBall;
      Matter.Body.setPosition(ball.body, { x: gameStore.aimX, y: DROP.spawnY });
      Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
      if (ball.display.scale.x < 1) {
        ball.display.scale.set(Math.min(1, ball.display.scale.x + 0.06));
        ball.display.alpha = Math.min(1, ball.display.alpha + 0.06);
      }
      ball.syncDisplay();
    }

    // 5b. 下落球拖尾粒子
    this._emitDropTrail(dt);

    // 6. 检查入容器
    this._checkBallEntry();

    // 7. 游戏结束检测
    this._checkGameOver();

    // 8. 氛围粒子
    this.effectSystem.ambientParticles.update(dt, this._animTime);

    // 9. 特效更新
    this.effectSystem.update(dt);

    // 10. 同步球体
    for (const ball of this.balls) {
      if (ball.body && !ball._markedForRemoval) {
        ball.update(dt);
        ball.syncDisplay();
      }
    }

    // 11. 屏幕震动
    const shake = this.effectSystem.getShakeOffset();
    this.stage.x = shake.x;
    this.stage.y = shake.y;

    // 12. 危险线呼吸动画
    this._updateDangerLine();

    // 13. UI 更新
    this._updateUI();
  }

  _cleanupDeadBalls() {
    const rm = this.balls.filter(b => b._markedForRemoval);
    for (const b of rm) {
      b.destroy();
      const idx = this.balls.indexOf(b);
      if (idx >= 0) this.balls.splice(idx, 1);
    }
  }

  _emitDropTrail(_dt) {
    // 为正在下落但未入容器的球生成拖尾
    for (const ball of this.balls) {
      if (ball.isDropped && !ball.isInContainer && ball.body && !ball._markedForRemoval) {
        // 每 3 帧大约一个粒子
        if (Math.random() < 0.35) {
          this.effectSystem.emitMergeParticles(
            ball.body.position.x,
            ball.body.position.y,
            ball.color, 1, 0.2
          );
        }
      }
    }
  }

  _checkBallEntry() {
    for (const ball of this.balls) {
      if (ball.isDropped && !ball.isInContainer) {
        if (this.container.isBallInside(ball)) {
          ball.isInContainer = true;
          this.effectSystem.emitMergeParticles(
            ball.body.position.x, CONTAINER.y + ball.radius, ball.color, 6, 0.3
          );
        }
      }
    }
  }

  _checkGameOver() {
    let anyAbove = false;
    for (const ball of this.balls) {
      if (!ball.isInContainer || !ball.body || ball._markedForRemoval) continue;
      if (ball.isDropped && ball.isInContainer) {
        if (ball.body.position.y - ball.radius < DANGER_LINE_Y) {
          anyAbove = true;
          break;
        }
      }
    }

    if (anyAbove) {
      if (!gameStore.isInDanger) {
        gameStore.isInDanger = true;
        gameStore.dangerStartTime = performance.now();
        this._dangerHeartbeatTimer = 0;
      }
      // 暗角随危险时间加深
      this._updateDangerVignette();
      // 心跳音效 (每 0.8s 一次，强度递增)
      this._dangerHeartbeatTimer += this.app.ticker.deltaMS;
      const intensity = Math.min(1, (performance.now() - gameStore.dangerStartTime) / GAME_OVER.dangerTime);
      if (this._dangerHeartbeatTimer > 800 - intensity * 400) {
        this._dangerHeartbeatTimer = 0;
        SoundSystem.playHeartbeat(intensity);
      }
      if (performance.now() - gameStore.dangerStartTime >= GAME_OVER.dangerTime) {
        this._endGame();
      }
    } else {
      if (gameStore.isInDanger) {
        gameStore.isInDanger = false;
        gameStore.dangerStartTime = 0;
        this._dangerVignette.visible = false;
      }
    }
  }

  _updateDangerVignette() {
    if (!gameStore.isInDanger) return;
    const elapsed = performance.now() - gameStore.dangerStartTime;
    const intensity = Math.min(1, elapsed / GAME_OVER.dangerTime);
    const g = this._dangerVignette;
    g.visible = true;
    g.clear();
    // 顶部红色渐变暗角
    const h = CONTAINER.y + CONTAINER.height;
    for (let i = 0; i < 15; i++) {
      const t = i / 15;
      const alpha = intensity * t * 0.5;
      g.beginFill(0xFF2222, alpha);
      g.drawRect(0, CONTAINER.y - 20 + i * 3, CANVAS_WIDTH, 3);
      g.endFill();
    }
  }

  _updateDangerLine() {
    const g = this._dangerLineGfx;
    g.clear();

    // 危急时呼吸加速、辉光增强
    const danger = gameStore.isInDanger;
    const freq = danger ? 0.012 : 0.004;          // 3x 呼吸频率
    const baseAlpha = danger ? 0.65 : 0.4;         // 更高基础透明度
    const amplitude = danger ? 0.35 : 0.25;        // 更大幅度
    const glowAlpha = danger ? 0.45 : 0.2;         // 辉光翻倍

    const breath = baseAlpha + amplitude * Math.sin(this._animTime * freq);
    g.lineStyle(2, THEME.danger, breath);
    const { x, width } = CONTAINER;
    const dl = 12, gap = 7;
    let dx = x;
    while (dx < x + width) {
      const end = Math.min(dx + dl, x + width);
      g.moveTo(dx, DANGER_LINE_Y);
      g.lineTo(end, DANGER_LINE_Y);
      dx = end + gap;
    }
    g.lineStyle(4, THEME.danger, breath * glowAlpha);
    dx = x;
    while (dx < x + width) {
      const end = Math.min(dx + dl, x + width);
      g.moveTo(dx, DANGER_LINE_Y);
      g.lineTo(end, DANGER_LINE_Y);
      dx = end + gap;
    }
  }

  // ==================== 合成回调 ====================

  _onMerge(newBall, x, y, score) {
    this.balls.push(newBall);
    this.ballLayer.addChild(newBall.display);

    newBall.display.scale.set(1.3);
    newBall.display.alpha = 0.7;

    const def = BALL_LEVELS[newBall.level];

    // 完美合并判定 — 合成出 Lv4+ 且连击 ≥3 视为 Perfect
    const isPerfect = newBall.level >= 4 && gameStore.combo >= 3;
    if (isPerfect) {
      this.effectSystem.flashScreen(200);
      this.effectSystem.emitMergeParticles(x, y, 0xFFD700, 30, 1.8);
      this.effectSystem.showScorePopup(x, y - 20, score, '✨ PERFECT! ✨');
    } else {
      this.effectSystem.showScorePopup(x, y, score, gameStore.comboText);
    }

    this.effectSystem.emitMergeParticles(x, y, def.body);
    this.effectSystem.emitMergeParticles(x, y, 0xFFFFFF, 6, 0.7);

    // 冲击波 + 闪白 + 子弹时间
    if (newBall.level >= 6) {
      this.effectSystem.emitShockwave(x, y, def.glow, newBall.level >= 9 ? 4 : 3);
      this.effectSystem.flashScreen(newBall.level >= 8 ? 180 : 120);
      if (newBall.level >= 7) {
        this._bulletTimeRemaining = 500;
        this.engine.timing.timeScale = 0.3;
      }
    }

    // 音效
    SoundSystem.playMerge(newBall.level);

    // 追踪实际分数 (MergeSystem 已经调过 addScore)
    this._realScore = gameStore.score;

    // 里程碑庆祝
    if (MILESTONE_LEVELS.includes(newBall.level)) {
      this.effectSystem.emitMergeParticles(x, y, 0xFFD700, 40, 1.5);
      this.effectSystem.emitMergeParticles(x, y, 0xFFFFFF, 25, 1.2);
      this.effectSystem.shakeScreen(12, 500);
      this._celebrateMilestone(y);
      SoundSystem.playMilestone(newBall.level);
    }

    // 普通震动 (里程碑不重复)
    if (!MILESTONE_LEVELS.includes(newBall.level)) {
      if (newBall.level >= 5) {
        this.effectSystem.shakeScreen(newBall.level >= 8 ? 8 : 5, newBall.level >= 8 ? 400 : 250);
      } else if (newBall.level >= 3) {
        this.effectSystem.shakeScreen(3, 150);
      }
    }

    // 每 10 次合成获得一个炸弹
    if (gameStore.totalMerges > 0 && gameStore.totalMerges % 10 === 0) {
      this._bombCount += 1;
      this._bombCountText.text = `${this._bombCount}`;
    }

    if (navigator.vibrate) {
      navigator.vibrate(Math.min(newBall.level * 5, 50));
    }
  }

  // ==================== 游戏状态 ====================

  _startGame() {
    gameStore.startGame();
    this._cleanAllBalls();

    this.startPanel.visible = false;
    this.gameOverPanel.visible = false;
    this._dropCooldownRemaining = 0;
    this._canSpawn = true;
    this._animTime = 0;
    this._lastPreviewLevel = -1;
    this._bombCount = 0;
    this._bombCountText.text = '0';

    this._beginAim(CANVAS_WIDTH / 2);

    // 首次游戏显示引导
    if (!localStorage.getItem('tutorial_done_v1')) {
      this._showTutorial(0);
    }
  }

  _endGame() {
    gameStore.endGame();
    this.gameOverPanel.visible = true;
    SoundSystem.playGameOver();
    this._finalScoreText.text = `${gameStore.score}`;

    const isNewRecord = gameStore.score >= gameStore.highScore && gameStore.score > 0;
    this._finalHighText.text = isNewRecord
      ? '🎉 新纪录！'
      : `🏆 最高分: ${gameStore.highScore}`;

    const lvlDef = BALL_LEVELS[gameStore.maxLevel];
    this._finalLevelText.text = `最高合成: ${lvlDef.emoji} ${lvlDef.name}`;

    this._finalStatsText.text = gameStore.totalMerges > 0
      ? `合并 ${gameStore.totalMerges} 次 · 最高 ${gameStore.maxCombo} 连击`
      : '';

    // "差一点就合成" 钩子
    const nextMilestone = MILESTONE_LEVELS.find(l => l > gameStore.maxLevel);
    if (nextMilestone !== undefined) {
      const nextDef = BALL_LEVELS[nextMilestone];
      this._almostText.text = `💡 差 ${nextMilestone - gameStore.maxLevel} 级合成 ${nextDef.emoji} ${nextDef.name}!`;
    } else if (gameStore.maxLevel < MAX_LEVEL) {
      const nextDef = BALL_LEVELS[gameStore.maxLevel + 1];
      this._almostText.text = `💡 试试合成 ${nextDef.emoji} ${nextDef.name}吧!`;
    } else {
      this._almostText.text = '🌟 你已合成最高等级！传奇！';
    }

    this._finalScoreText.style.fill = isNewRecord ? THEME.accent : 0xffffff;
  }

  _restart() { this._startGame(); }

  _useBomb() {
    if (this._bombCount <= 0 || gameStore.gameState !== 'playing') return;
    this._bombCount -= 1;
    this._bombCountText.text = `${this._bombCount}`;
    SoundSystem.playClick();

    // 消除容器内最顶部的 3 个球
    const containerBalls = this.balls.filter(b =>
      b.isInContainer && b.body && !b._markedForRemoval
    );
    // 按 Y 坐标排序 (顶部 = Y 最小)
    containerBalls.sort((a, b) => a.body.position.y - b.body.position.y);
    const targets = containerBalls.slice(0, 3);

    for (const ball of targets) {
      // 爆炸粒子
      this.effectSystem.emitMergeParticles(
        ball.body.position.x, ball.body.position.y,
        ball.color, 18, 1.0
      );
      ball.markForRemoval();
    }

    if (targets.length > 0 && navigator.vibrate) {
      navigator.vibrate(30);
    }

    // 闪烁效果
    this.effectSystem.flashScreen(100);
  }

  _celebrateMilestone(y) {
    const text = new PIXI.Text('🎉 里程碑达成!', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 26,
      fontWeight: '900',
      fill: 0xFFD700,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 8,
      dropShadowDistance: 0,
      align: 'center',
    });
    text.anchor.set(0.5);
    text.x = CANVAS_WIDTH / 2;
    text.y = y - 40;
    text.alpha = 1;
    this.uiLayer.addChild(text);

    const startTime = this._animTime;
    const duration = 1500;
    const ticker = () => {
      const elapsed = this._animTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      text.scale.set(1 + t * 0.6);
      text.alpha = 1 - t * t;
      if (t >= 1) {
        this.uiLayer.removeChild(text);
        text.destroy();
        this.app.ticker.remove(ticker);
      }
    };
    this.app.ticker.add(ticker);
  }

  // ==================== 新手引导 ====================

  _showTutorial(step) {
    if (this._tutorialOverlay) {
      this.uiLayer.removeChild(this._tutorialOverlay);
      this._tutorialOverlay.destroy({ children: true });
    }

    this._tutorialStep = step;
    const W = CANVAS_WIDTH, H = CANVAS_HEIGHT;
    const c = new PIXI.Container();
    this._tutorialOverlay = c;

    // 半透明遮罩
    const mask = new PIXI.Graphics();
    mask.beginFill(0x000000, 0.65);
    mask.drawRect(0, 0, W, H);
    mask.endFill();
    c.addChild(mask);

    // 镂空高亮区域
    const hole = new PIXI.Graphics();
    hole.beginFill(0xFFFFFF, 0.08);
    if (step === 0 || step === 1) {
      hole.drawRoundedRect(CONTAINER.x, CONTAINER.y - 20, CONTAINER.width, 60, 10);
    } else {
      hole.drawRoundedRect(CONTAINER.x + 40, CONTAINER.y + 80, CONTAINER.width - 80, 120, 10);
    }
    hole.endFill();
    c.addChild(hole);

    // 手势图标
    const handEmoji = step === 0 ? '👆' : step === 1 ? '👇' : '✨';
    const handIcon = new PIXI.Text(handEmoji, { fontSize: 42, align: 'center' });
    handIcon.anchor.set(0.5);
    handIcon.x = W / 2;
    handIcon.y = step === 2 ? CONTAINER.y + 140 : CONTAINER.y + 10;
    c.addChild(handIcon);

    // 步骤标题
    const titles = [
      '拖动瞄准',
      '松手释放',
      '碰撞合成',
    ];
    const title = new PIXI.Text(titles[step], {
      fontFamily: 'Arial, sans-serif', fontSize: 28, fontWeight: '900',
      fill: 0xffffff,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 6, dropShadowDistance: 0,
    });
    title.anchor.set(0.5); title.x = W / 2; title.y = H / 2 + 30;
    c.addChild(title);

    // 描述
    const descs = [
      '移动手指或鼠标，控制球左右位置',
      '松开手指让球掉落进容器',
      '相同球碰撞会自动合成更大的球！',
    ];
    const desc = new PIXI.Text(descs[step], {
      fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0x8899cc, align: 'center',
    });
    desc.anchor.set(0.5); desc.x = W / 2; desc.y = H / 2 + 60;
    c.addChild(desc);

    // 步骤指示器
    for (let i = 0; i < 3; i++) {
      const dot = new PIXI.Graphics();
      dot.beginFill(i === step ? 0xffffff : 0x556688, i === step ? 1 : 0.4);
      dot.drawCircle(0, 0, 4);
      dot.endFill();
      dot.x = W / 2 - 16 + i * 16; dot.y = H / 2 + 95;
      c.addChild(dot);
    }

    // 按钮
    const isLast = step === 2;
    const btn = new PIXI.Graphics();
    btn.beginFill(isLast ? 0x69DB7C : 0x4466cc);
    btn.drawRoundedRect(-60, -20, 120, 40, 20);
    btn.endFill();
    btn.beginFill(0xFFFFFF, 0.08);
    btn.drawRoundedRect(-60, -20, 120, 20, 20);
    btn.endFill();
    btn.x = W / 2; btn.y = H / 2 + 140;
    btn.interactive = true; btn.buttonMode = true;
    btn.on('pointerdown', () => {
      SoundSystem.init();
      SoundSystem.playClick();
      if (isLast) {
        this._dismissTutorial();
      } else {
        this._showTutorial(step + 1);
      }
    });
    c.addChild(btn);

    const btnText = new PIXI.Text(isLast ? '开始玩!' : '下一步', {
      fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xffffff,
    });
    btnText.anchor.set(0.5); btnText.x = W / 2; btnText.y = H / 2 + 140;
    c.addChild(btnText);

    // 跳过按钮
    const skip = new PIXI.Text('跳过引导', {
      fontFamily: 'Arial, sans-serif', fontSize: 13, fill: 0x667799,
    });
    skip.anchor.set(0.5);
    skip.x = W / 2; skip.y = H / 2 + 185;
    skip.interactive = true; skip.buttonMode = true;
    skip.on('pointerdown', () => {
      SoundSystem.init();
      this._dismissTutorial();
    });
    c.addChild(skip);

    this.uiLayer.addChild(c);
  }

  _dismissTutorial() {
    this._tutorialStep = -1;
    if (this._tutorialOverlay) {
      this.uiLayer.removeChild(this._tutorialOverlay);
      this._tutorialOverlay.destroy({ children: true });
      this._tutorialOverlay = null;
    }
    try { localStorage.setItem('tutorial_done_v1', '1'); } catch (_) { /* ignore */ }
    SoundSystem.init(); // 解锁 AudioContext
  }

  _cleanAllBalls() {
    for (const b of this.balls) b.destroy();
    this.balls = [];
    this.mergeSystem.reset();
    this.effectSystem.reset();
    this.stage.x = 0; this.stage.y = 0;
    // 清理残留遮罩
    this._dangerVignette.visible = false;
    this._displayScore = 0;
    this._realScore = 0;
    this._bulletTimeRemaining = 0;
    this.engine.timing.timeScale = 1;
    // 清理庆祝动画 ticker
    if (this._tutorialOverlay) {
      try { this.uiLayer.removeChild(this._tutorialOverlay); this._tutorialOverlay.destroy({ children: true }); } catch (_) { /**/ }
      this._tutorialOverlay = null;
    }
    if (this._pauseOverlay && this._pauseOverlay.parent) {
      this._pauseOverlay.parent.removeChild(this._pauseOverlay);
    }
  }

  // ==================== UI 构建 ====================

  _setupUI() {
    const { x, y, width, height } = CONTAINER;

    // 顶栏背景
    const topBar = new PIXI.Graphics();
    topBar.beginFill(0x000000, 0.2);
    topBar.drawRoundedRect(x - 4, y - 115, width + 8, 130, 10);
    topBar.endFill();
    this.uiLayer.addChild(topBar);

    // 分数
    this.scoreText = new PIXI.Text('0', {
      fontFamily: 'Arial, "Helvetica Neue", sans-serif',
      fontSize: 34, fontWeight: '900', fill: 0xffffff,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 4, dropShadowDistance: 1,
    });
    this.scoreText.x = x + 14; this.scoreText.y = y - 95;
    this.uiLayer.addChild(this.scoreText);

    const scoreLabel = new PIXI.Text('得分', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textSecondary, letterSpacing: 2,
    });
    scoreLabel.x = x + 16; scoreLabel.y = y - 118;
    this.uiLayer.addChild(scoreLabel);

    // 最高分
    this.highScoreText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 'bold',
      fill: THEME.accent,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 3, dropShadowDistance: 1,
    });
    this.highScoreText.anchor.set(1, 0);
    this.highScoreText.x = x + width - 14; this.highScoreText.y = y - 92;
    this.uiLayer.addChild(this.highScoreText);

    const highLabel = new PIXI.Text('🏆 最高', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textSecondary, letterSpacing: 2,
    });
    highLabel.anchor.set(1, 0);
    highLabel.x = x + width - 14; highLabel.y = y - 115;
    this.uiLayer.addChild(highLabel);

    // 下一个球预览
    this.previewBall = new PIXI.Container();
    this.previewBall.x = CANVAS_WIDTH / 2;
    this.previewBall.y = y - 52;
    this.uiLayer.addChild(this.previewBall);

    this._previewRing = new PIXI.Graphics();
    this.previewBall.addChild(this._previewRing);

    const previewLabel = new PIXI.Text('下一个', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textSecondary, letterSpacing: 1,
    });
    previewLabel.anchor.set(0.5);
    previewLabel.x = CANVAS_WIDTH / 2; previewLabel.y = y - 82;
    this.uiLayer.addChild(previewLabel);

    // 连击
    this.comboText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold',
      fill: THEME.accent,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 5, dropShadowDistance: 0,
      align: 'center',
    });
    this.comboText.anchor.set(0.5);
    this.comboText.x = CANVAS_WIDTH / 2; this.comboText.y = y + height + 35;
    this.uiLayer.addChild(this.comboText);

    // 容器内球数
    this.ballCountText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textDim, align: 'center',
    });
    this.ballCountText.anchor.set(0.5);
    this.ballCountText.x = CANVAS_WIDTH / 2; this.ballCountText.y = y - 8;
    this.uiLayer.addChild(this.ballCountText);

    // 瞄准引导线
    this._guideLine = new PIXI.Graphics();
    this.uiLayer.addChild(this._guideLine);

    // 危险暗角遮罩
    this._dangerVignette = new PIXI.Graphics();
    this._dangerVignette.visible = false;
    this.uiLayer.addChild(this._dangerVignette);

    // 静音按钮
    this._muteBtn = new PIXI.Container();
    this._muteBtn.x = CANVAS_WIDTH - 32; this._muteBtn.y = CONTAINER.y - 52;
    const muteBg = new PIXI.Graphics();
    muteBg.beginFill(0x000000, 0.3);
    muteBg.drawRoundedRect(-14, -12, 28, 24, 6);
    muteBg.endFill();
    this._muteBtn.addChild(muteBg);
    this._muteIcon = new PIXI.Text('🔊', { fontSize: 14 });
    this._muteIcon.anchor.set(0.5);
    this._muteBtn.addChild(this._muteIcon);
    this._muteBtn.interactive = true; this._muteBtn.buttonMode = true;
    this._muteBtn.on('pointerdown', () => {
      const muted = SoundSystem.toggleMute();
      this._muteIcon.text = muted ? '🔇' : '🔊';
      SoundSystem.playClick();
    });
    this.uiLayer.addChild(this._muteBtn);

    // 炸弹按钮
    this._bombBtn = new PIXI.Container();
    this._bombBtn.x = CANVAS_WIDTH - 68; this._bombBtn.y = CONTAINER.y - 52;
    const bombBg = new PIXI.Graphics();
    bombBg.beginFill(0x000000, 0.3);
    bombBg.drawRoundedRect(-18, -12, 36, 24, 6);
    bombBg.endFill();
    this._bombBtn.addChild(bombBg);
    this._bombIcon = new PIXI.Text('💣', { fontSize: 13 });
    this._bombIcon.anchor.set(0.5);
    this._bombBtn.addChild(this._bombIcon);
    this._bombCountText = new PIXI.Text('0', {
      fontFamily: 'Arial, sans-serif', fontSize: 10, fill: 0xffffff,
    });
    this._bombCountText.anchor.set(0.5); this._bombCountText.y = 13;
    this._bombBtn.addChild(this._bombCountText);
    this._bombBtn.interactive = true; this._bombBtn.buttonMode = true;
    this._bombBtn.on('pointerdown', () => this._useBomb());
    this.uiLayer.addChild(this._bombBtn);

    // 面板
    this._createStartPanel();
    this._createGameOverPanel();
  }

  // ========== 开始面板 ==========

  _createStartPanel() {
    const p = new PIXI.Container();
    const W = CANVAS_WIDTH;

    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x07071a, 0.82);
    overlay.drawRect(0, 0, W, CANVAS_HEIGHT);
    overlay.endFill();
    p.addChild(overlay);

    const title = new PIXI.Text('合成球球', {
      fontFamily: 'Arial, sans-serif', fontSize: 44, fontWeight: '900',
      fill: 0xffffff,
      dropShadow: true, dropShadowColor: 0x4466cc, dropShadowBlur: 12, dropShadowDistance: 0,
    });
    title.anchor.set(0.5); title.x = W / 2; title.y = 220;
    p.addChild(title);

    const subtitle = new PIXI.Text('相同球碰撞 → 合成更大的球', {
      fontFamily: 'Arial, sans-serif', fontSize: 15, fill: THEME.textSecondary,
    });
    subtitle.anchor.set(0.5); subtitle.x = W / 2; subtitle.y = 270;
    p.addChild(subtitle);

    const btn = new PIXI.Graphics();
    btn.beginFill(0x4466cc);
    btn.drawRoundedRect(-90, -28, 180, 56, 28);
    btn.endFill();
    btn.beginFill(0xFFFFFF, 0.08);
    btn.drawRoundedRect(-90, -28, 180, 28, 28);
    btn.endFill();
    btn.x = W / 2; btn.y = 370;
    btn.interactive = true; btn.buttonMode = true;
    btn.on('pointerdown', () => this._startGame());
    p.addChild(btn);

    const btnText = new PIXI.Text('开始游戏', {
      fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 'bold', fill: 0xffffff,
    });
    btnText.anchor.set(0.5); btnText.x = W / 2; btnText.y = 370;
    p.addChild(btnText);

    if (gameStore.highScore > 0) {
      const hs = new PIXI.Text(`最高分: ${gameStore.highScore}`, {
        fontFamily: 'Arial, sans-serif', fontSize: 16, fill: THEME.accent,
      });
      hs.anchor.set(0.5); hs.x = W / 2; hs.y = 425;
      p.addChild(hs);
    }

    this.startPanel = p;
    this.uiLayer.addChild(p);
  }

  // ========== 结束面板 ==========

  _createGameOverPanel() {
    const p = new PIXI.Container();
    p.visible = false;
    const W = CANVAS_WIDTH;

    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x07071a, 0.82);
    overlay.drawRect(0, 0, W, CANVAS_HEIGHT);
    overlay.endFill();
    p.addChild(overlay);

    const title = new PIXI.Text('游戏结束', {
      fontFamily: 'Arial, sans-serif', fontSize: 34, fontWeight: '900', fill: 0xffffff,
    });
    title.anchor.set(0.5); title.x = W / 2; title.y = 180;
    p.addChild(title);

    this._finalScoreText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 56, fontWeight: '900', fill: 0xffffff,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 8, dropShadowDistance: 2,
    });
    this._finalScoreText.anchor.set(0.5); this._finalScoreText.x = W / 2; this._finalScoreText.y = 245;
    p.addChild(this._finalScoreText);

    this._finalHighText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 18, fill: THEME.accent,
    });
    this._finalHighText.anchor.set(0.5); this._finalHighText.x = W / 2; this._finalHighText.y = 295;
    p.addChild(this._finalHighText);

    this._finalLevelText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 15, fill: THEME.textSecondary,
    });
    this._finalLevelText.anchor.set(0.5); this._finalLevelText.x = W / 2; this._finalLevelText.y = 318;
    p.addChild(this._finalLevelText);

    this._finalStatsText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 13, fill: THEME.textDim, align: 'center',
    });
    this._finalStatsText.anchor.set(0.5); this._finalStatsText.x = W / 2; this._finalStatsText.y = 346;
    p.addChild(this._finalStatsText);

    // "差一点就合成" 钩子
    this._almostText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0xFFA502,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 3, dropShadowDistance: 0,
      align: 'center',
    });
    this._almostText.anchor.set(0.5); this._almostText.x = W / 2; this._almostText.y = 372;
    p.addChild(this._almostText);

    const btn = new PIXI.Graphics();
    btn.beginFill(0x4466cc);
    btn.drawRoundedRect(-90, -24, 180, 48, 24);
    btn.endFill();
    btn.beginFill(0xFFFFFF, 0.08);
    btn.drawRoundedRect(-90, -24, 180, 24, 24);
    btn.endFill();
    btn.x = W / 2; btn.y = 420;
    btn.interactive = true; btn.buttonMode = true;
    btn.on('pointerdown', () => this._restart());
    p.addChild(btn);

    const btnText = new PIXI.Text('再来一局', {
      fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xffffff,
    });
    btnText.anchor.set(0.5); btnText.x = W / 2; btnText.y = 420;
    p.addChild(btnText);

    // 分享按钮
    const shareBtn = new PIXI.Text('📤 炫耀战绩', {
      fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0x8899cc,
    });
    shareBtn.anchor.set(0.5); shareBtn.x = W / 2; shareBtn.y = 470;
    shareBtn.interactive = true; shareBtn.buttonMode = true;
    shareBtn.on('pointerdown', () => {
      const shareLvl = BALL_LEVELS[gameStore.maxLevel];
      const msg = `🫧 合成球球\n🏆 得分: ${gameStore.score}\n🔥 最高合成: ${shareLvl.emoji} ${shareLvl.name}\n💥 连击: ${gameStore.maxCombo}次\n来挑战我吧!`;
      if (navigator.share) {
        navigator.share({ title: '合成球球', text: msg });
      } else {
        // 复制到剪贴板
        navigator.clipboard?.writeText(msg).then(() => {
          shareBtn.text = '✅ 已复制!';
          setTimeout(() => { shareBtn.text = '📤 炫耀战绩'; }, 2000);
        }).catch(() => {});
      }
    });
    p.addChild(shareBtn);

    this.gameOverPanel = p;
    this.uiLayer.addChild(p);
  }

  // ==================== UI 更新 ====================

  _updateUI() {
    // 分数 tween 动画 — 让数字滚动而不是瞬间跳变
    if (Math.abs(this._displayScore - this._realScore) > 1) {
      this._displayScore += (this._realScore - this._displayScore) * 0.25;
    } else {
      this._displayScore = this._realScore;
    }
    this.scoreText.text = `${Math.round(this._displayScore)}`;
    this.highScoreText.text = `🏆 ${gameStore.highScore}`;

    this.comboText.text = gameStore.combo >= 3
      ? `🔥 ${gameStore.combo}连击! ${gameStore.comboText}`
      : '';

    const count = this.balls.filter(b => b.body && !b._markedForRemoval).length;
    this.ballCountText.text = count > 4 ? `容器内 ${count} 个球` : '';

    this._updateGuideLine();
    this._updatePreview();

    for (const b of this.balls) {
      if (!b._markedForRemoval && b.display.scale.x > 1.01) {
        b.display.scale.set(b.display.scale.x + (1 - b.display.scale.x) * 0.15);
        b.display.alpha = Math.min(1, b.display.alpha + 0.1);
      }
    }
  }

  _updateGuideLine() {
    const g = this._guideLine;
    g.clear();
    if (!gameStore.isAiming || !gameStore.currentBall) return;

    const x = gameStore.aimX;
    const startY = DROP.spawnY + BALL_LEVELS[gameStore.nextBallLevel].radius;
    const endY = CONTAINER.y + CONTAINER.height - 20;

    g.lineStyle(1.5, 0xffffff, 0.12);
    const dash = 6, gap = 6;
    let dy = startY;
    while (dy < endY) {
      const to = Math.min(dy + dash, endY);
      g.moveTo(x, dy);
      g.lineTo(x, to);
      dy = to + gap;
    }

    const ay = endY;
    g.moveTo(x - 5, ay - 10); g.lineTo(x, ay); g.lineTo(x + 5, ay - 10);
  }

  _updatePreview() {
    const level = gameStore.nextBallLevel;
    if (level === this._lastPreviewLevel) return;
    this._lastPreviewLevel = level;

    const def = BALL_LEVELS[level];
    this.previewBall.removeChildren();
    this._previewRing = new PIXI.Graphics();

    const pr = Math.min(def.radius, 18);

    const ringBreath = 0.2 + 0.15 * Math.sin(this._animTime * 0.005);
    this._previewRing.lineStyle(2, def.glow, ringBreath);
    this._previewRing.drawCircle(0, 0, pr + 6);
    this._previewRing.lineStyle(0);
    this.previewBall.addChild(this._previewRing);

    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.12);
    g.drawEllipse(pr * 0.12, pr * 0.18, pr, pr * 0.9);
    g.endFill();
    g.beginFill(def.body, 0.9);
    g.drawCircle(0, 0, pr);
    g.endFill();
    g.beginFill(0xFFFFFF, 0.14);
    g.drawCircle(-pr * 0.2, -pr * 0.25, pr * 0.5);
    g.endFill();
    g.beginFill(0xFFFFFF, 0.3);
    g.drawCircle(-pr * 0.1, -pr * 0.32, pr * 0.22);
    g.endFill();
    this.previewBall.addChild(g);

    const emoji = new PIXI.Text(def.emoji, { fontSize: Math.round(pr * 0.7), align: 'center' });
    emoji.anchor.set(0.5);
    this.previewBall.addChild(emoji);
  }
}

// ==================== 工具 ====================

function randomLevel() {
  const weights = [30, 28, 20, 14, 8];
  const r = Math.random() * 100;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r <= acc) return i;
  }
  return 0;
}
