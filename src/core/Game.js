import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { gameStore } from '../stores/GameStore.js';
import { Container } from '../entities/Container.js';
import { Ball } from '../entities/Ball.js';
import { MergeSystem } from '../systems/MergeSystem.js';
import { EffectSystem } from '../systems/EffectSystem.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  CONTAINER, DANGER_LINE_Y, PHYSICS,
  BALL_LEVELS, DROP, GAME_OVER, THEME,
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

    // 用于动画计算的累计时间
    this._animTime = 0;
    this._lastPreviewLevel = -1; // 缓存避免每帧重绘预览

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

    // -- 1. 渐变背景 (canvas texture) --
    const bgGradient = this._createGradient(W, H, '#07071a', '#101838');
    const bgSprite = new PIXI.Sprite(bgGradient);
    this.bgLayer.addChild(bgSprite);

    // -- 2. 微网格 (非常淡) --
    const grid = new PIXI.Graphics();
    grid.lineStyle(0.5, 0x334488, 0.06);
    const step = 30;
    for (let x = 0; x <= W; x += step) { grid.moveTo(x, 0); grid.lineTo(x, H); }
    for (let y = 0; y <= H; y += step) { grid.moveTo(0, y); grid.lineTo(W, y); }
    this.bgLayer.addChild(grid);

    // -- 3. 容器底板 (玻璃质感) --
    const { x, y, width, height, cornerRadius: cr } = CONTAINER;
    const bg = new PIXI.Graphics();

    // 外层辉光 (多圈半透明)
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

    // 顶部微光扫过 (模拟玻璃反射)
    bg.beginFill(0xFFFFFF, 0.03);
    bg.drawRoundedRect(x + 4, y + 4, width - 8, height * 0.3, cr - 4);
    bg.endFill();

    // 边框
    bg.lineStyle(1, THEME.containerBorder, 0.7);
    bg.drawRoundedRect(x, y, width, height, cr);
    bg.lineStyle(0);

    // 墙壁可视
    const t = CONTAINER.wallThickness;
    bg.beginFill(THEME.containerBorder, 0.3);
    bg.drawRect(x - t, y, t, height);
    bg.drawRect(x + width, y, t, height);
    bg.drawRect(x - t, y + height, width + t * 2, t);
    bg.endFill();

    // 危险线 (会呼吸 — 存储引用以做动画)
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
  }

  // ==================== 主循环 ====================

  _gameLoop() {
    const dt = this.app.ticker.deltaMS;
    this._animTime += dt;

    if (gameStore.gameState !== 'playing') return;

    // 1. 物理 (delta 上限防止快速帧导致不稳定)
    const physDt = Math.min(dt, 16.667);
    Matter.Engine.update(this.engine, physDt);

    // 2. 合成
    this.mergeSystem.processMerges();

    // 3. 清理
    this._cleanupDeadBalls();

    // 4. 冷却 → 自动出球
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
      // 入场缩放恢复
      if (ball.display.scale.x < 1) {
        ball.display.scale.set(Math.min(1, ball.display.scale.x + 0.06));
        ball.display.alpha = Math.min(1, ball.display.alpha + 0.06);
      }
      ball.syncDisplay();
    }

    // 6. 检查入容器
    this._checkBallEntry();

    // 7. 游戏结束检测
    this._checkGameOver(dt);

    // 8. 特效更新
    this.effectSystem.update(dt);

    // 9. 同步球体
    for (const ball of this.balls) {
      if (ball.body && !ball._markedForRemoval) {
        ball.update(dt);
        ball.syncDisplay();
      }
    }

    // 10. 屏幕震动
    const shake = this.effectSystem.getShakeOffset();
    this.stage.x = shake.x;
    this.stage.y = shake.y;

    // 11. 危险线呼吸动画
    this._updateDangerLine();

    // 12. UI
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

  _checkBallEntry() {
    for (const ball of this.balls) {
      if (ball.isDropped && !ball.isInContainer) {
        if (this.container.isBallInside(ball)) {
          ball.isInContainer = true;
          // 入水波纹特效 (轻量)
          this.effectSystem.emitMergeParticles(
            ball.body.position.x, CONTAINER.y + ball.radius, ball.color, 6, 0.3
          );
        }
      }
    }
  }

  _checkGameOver(_dt) {
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
      }
      if (performance.now() - gameStore.dangerStartTime >= GAME_OVER.dangerTime) {
        this._endGame();
      }
    } else {
      if (gameStore.isInDanger) {
        gameStore.isInDanger = false;
        gameStore.dangerStartTime = 0;
      }
    }
  }

  _updateDangerLine() {
    const g = this._dangerLineGfx;
    g.clear();
    // 呼吸效果
    const breath = 0.4 + 0.25 * Math.sin(this._animTime * 0.004);
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
    // 危险线辉光
    g.lineStyle(4, THEME.danger, breath * 0.2);
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
    // 合成生成球出现缩放动画
    newBall.display.scale.set(1.3);
    newBall.display.alpha = 0.7;

    const def = BALL_LEVELS[newBall.level];
    this.effectSystem.emitMergeParticles(x, y, def.body);
    this.effectSystem.emitMergeParticles(x, y, 0xFFFFFF, 6, 0.7); // 金色火花
    this.effectSystem.showScorePopup(x, y, score, gameStore.comboText);

    if (newBall.level >= 5) {
      this.effectSystem.shakeScreen(newBall.level >= 8 ? 8 : 5, newBall.level >= 8 ? 400 : 250);
    } else if (newBall.level >= 3) {
      this.effectSystem.shakeScreen(3, 150);
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

    this._beginAim(CANVAS_WIDTH / 2);
  }

  _endGame() {
    gameStore.endGame();
    this.gameOverPanel.visible = true;
    this._finalScoreText.text = `${gameStore.score}`;
    this._finalHighText.text = gameStore.score >= gameStore.highScore
      ? '🎉 新纪录!' : `最高分: ${gameStore.highScore}`;

    const lvlDef = BALL_LEVELS[gameStore.maxLevel];
    this._finalLevelText.text = `最高合成: ${lvlDef.emoji} ${lvlDef.name}`;
    this._finalScoreText.style.fill = gameStore.score >= gameStore.highScore && gameStore.score > 0
      ? THEME.accent : 0xffffff;
  }

  _restart() { this._startGame(); }

  _cleanAllBalls() {
    for (const b of this.balls) b.destroy();
    this.balls = [];
    this.mergeSystem.reset();
    this.effectSystem.reset();
    this.stage.x = 0; this.stage.y = 0;
  }

  // ==================== UI ====================

  _setupUI() {
    const { x, y, width, height } = CONTAINER;

    // -- 顶栏背景 --
    const topBar = new PIXI.Graphics();
    topBar.beginFill(0x000000, 0.2);
    topBar.drawRoundedRect(x - 4, y - 115, width + 8, 130, 10);
    topBar.endFill();
    this.uiLayer.addChild(topBar);

    // -- 分数 --
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

    // -- 最高分 --
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

    // -- 下一个球预览 --
    this.previewBall = new PIXI.Container();
    this.previewBall.x = CANVAS_WIDTH / 2;
    this.previewBall.y = y - 52;
    this.uiLayer.addChild(this.previewBall);

    // 预览环
    this._previewRing = new PIXI.Graphics();
    this.previewBall.addChild(this._previewRing);

    const previewLabel = new PIXI.Text('下一个', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textSecondary, letterSpacing: 1,
    });
    previewLabel.anchor.set(0.5);
    previewLabel.x = CANVAS_WIDTH / 2; previewLabel.y = y - 82;
    this.uiLayer.addChild(previewLabel);

    // -- 连击 --
    this.comboText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold',
      fill: THEME.accent,
      dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 5, dropShadowDistance: 0,
      align: 'center',
    });
    this.comboText.anchor.set(0.5);
    this.comboText.x = CANVAS_WIDTH / 2; this.comboText.y = y + height + 35;
    this.uiLayer.addChild(this.comboText);

    // -- 容器内球数 --
    this.ballCountText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 11,
      fill: THEME.textDim, align: 'center',
    });
    this.ballCountText.anchor.set(0.5);
    this.ballCountText.x = CANVAS_WIDTH / 2; this.ballCountText.y = y - 8;
    this.uiLayer.addChild(this.ballCountText);

    // -- 瞄准引导线 --
    this._guideLine = new PIXI.Graphics();
    this.uiLayer.addChild(this._guideLine);

    // -- 面板 --
    this._createStartPanel();
    this._createGameOverPanel();
  }

  // ========== 开始面板 ==========

  _createStartPanel() {
    const p = new PIXI.Container();
    const W = CANVAS_WIDTH, H = CANVAS_HEIGHT;

    // 半透明遮罩
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x07071a, 0.82);
    overlay.drawRect(0, 0, W, H);
    overlay.endFill();
    p.addChild(overlay);

    // 标题
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

    // 按钮
    const btn = new PIXI.Graphics();
    btn.beginFill(0x4466cc);
    btn.drawRoundedRect(-90, -28, 180, 56, 28);
    btn.endFill();
    // 按钮高光
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

    // 最高分
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
    this._finalScoreText.anchor.set(0.5); this._finalScoreText.x = W / 2; this._finalScoreText.y = 255;
    p.addChild(this._finalScoreText);

    this._finalHighText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 20, fill: THEME.accent,
    });
    this._finalHighText.anchor.set(0.5); this._finalHighText.x = W / 2; this._finalHighText.y = 305;
    p.addChild(this._finalHighText);

    this._finalLevelText = new PIXI.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 16, fill: THEME.textSecondary,
    });
    this._finalLevelText.anchor.set(0.5); this._finalLevelText.x = W / 2; this._finalLevelText.y = 335;
    p.addChild(this._finalLevelText);

    // 按钮
    const btn = new PIXI.Graphics();
    btn.beginFill(0x4466cc);
    btn.drawRoundedRect(-80, -25, 160, 50, 25);
    btn.endFill();
    btn.beginFill(0xFFFFFF, 0.08);
    btn.drawRoundedRect(-80, -25, 160, 25, 25);
    btn.endFill();
    btn.x = W / 2; btn.y = 410;
    btn.interactive = true; btn.buttonMode = true;
    btn.on('pointerdown', () => this._restart());
    p.addChild(btn);

    const btnText = new PIXI.Text('再来一局', {
      fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 'bold', fill: 0xffffff,
    });
    btnText.anchor.set(0.5); btnText.x = W / 2; btnText.y = 410;
    p.addChild(btnText);

    this.gameOverPanel = p;
    this.uiLayer.addChild(p);
  }

  // ==================== UI 更新 ====================

  _updateUI() {
    this.scoreText.text = `${gameStore.score}`;
    this.highScoreText.text = `🏆 ${gameStore.highScore}`;
    this.comboText.text = gameStore.combo >= 3
      ? `🔥 ${gameStore.combo}连击! ${gameStore.comboText}`
      : '';

    const count = this.balls.filter(b => b.body && !b._markedForRemoval).length;
    this.ballCountText.text = count > 4 ? `容器内 ${count} 个球` : '';

    // 瞄准引导线
    this._updateGuideLine();

    // 预览球
    this._updatePreview();

    // 合成出生球的缩放恢复
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

    // 虚线引导
    g.lineStyle(1.5, 0xffffff, 0.12);
    const dash = 6, gap = 6;
    let dy = startY;
    while (dy < endY) {
      const to = Math.min(dy + dash, endY);
      g.moveTo(x, dy);
      g.lineTo(x, to);
      dy = to + gap;
    }

    // 底部小箭头
    const ay = endY;
    g.moveTo(x - 5, ay - 10); g.lineTo(x, ay); g.lineTo(x + 5, ay - 10);
  }

  _updatePreview() {
    const level = gameStore.nextBallLevel;
    // 只在等级变化时重绘，避免每帧创建新对象
    if (level === this._lastPreviewLevel) return;
    this._lastPreviewLevel = level;

    const def = BALL_LEVELS[level];
    this.previewBall.removeChildren();
    this._previewRing = new PIXI.Graphics();

    const pr = Math.min(def.radius, 18);

    // 辉光环
    const ringBreath = 0.2 + 0.15 * Math.sin(this._animTime * 0.005);
    this._previewRing.lineStyle(2, def.glow, ringBreath);
    this._previewRing.drawCircle(0, 0, pr + 6);
    this._previewRing.lineStyle(0);
    this.previewBall.addChild(this._previewRing);

    // 小球
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
