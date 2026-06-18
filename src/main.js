import * as PIXI from 'pixi.js';
import { Game } from './core/Game.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config/constants.js';

// ============================================================
// 入口 — 创建 PIXI Application 并启动游戏
// ============================================================

const main = async () => {
  const app = new PIXI.Application({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // 添加到页面
  const container = document.getElementById('game-container');
  container.appendChild(app.view);

  // 设置 canvas 样式保持比例
  app.view.style.maxWidth = '100%';
  app.view.style.maxHeight = '100%';

  // 启动游戏
  window.__game = new Game(app);
};

main().catch(console.error);
