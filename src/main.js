import * as PIXI from 'pixi.js';
import { Game } from './core/Game.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config/constants.js';

// ============================================================
// 入口 — 加载画面 → 创建 PIXI Application → 启动游戏
// ============================================================

// 显示加载画面
const loadingEl = document.createElement('div');
loadingEl.id = 'loading-screen';
loadingEl.innerHTML = `
  <div style="text-align:center;color:#8899cc;font-family:Arial,sans-serif">
    <div style="font-size:48px;margin-bottom:16px">🫧</div>
    <div style="font-size:18px;font-weight:bold;color:#fff">合成球球</div>
    <div style="font-size:12px;margin-top:8px">加载中...</div>
  </div>
`;
loadingEl.style.cssText = `
  position:fixed;top:0;left:0;width:100%;height:100%;
  display:flex;align-items:center;justify-content:center;
  background:#0a0a23;z-index:9999;
`;
document.body.appendChild(loadingEl);

const main = async () => {
  const app = new PIXI.Application({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const container = document.getElementById('game-container');
  container.appendChild(app.view);

  app.view.style.maxWidth = '100%';
  app.view.style.maxHeight = '100%';

  // 隐藏加载画面
  loadingEl.style.opacity = '0';
  loadingEl.style.transition = 'opacity 0.3s';
  setTimeout(() => loadingEl.remove(), 350);

  // 启动游戏
  window.__game = new Game(app);
};

main().catch(console.error);
