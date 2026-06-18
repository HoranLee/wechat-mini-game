# 🫧 合成球球 (Merge Balls)

> 基于物理引擎的 Suika-like 合成掉落游戏 · 11 级合成链 · 玻璃拟态视觉

[![Tech](https://img.shields.io/badge/pixi.js-v6.5-E4405F?logo=pixiv)](https://pixijs.com/)
[![Physics](https://img.shields.io/badge/matter.js-v0.20-4B8BBE)](https://brm.io/matter-js/)
[![State](https://img.shields.io/badge/mobx-v6.16-FF9955?logo=mobx)](https://mobx.js.org/)
[![Build](https://img.shields.io/badge/vite-v8-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-ISC-green)](./LICENSE)

---

## 📖 目录

- [快速开始](#-快速开始)
- [项目架构](#-项目架构)
- [游戏机制](#-游戏机制)
- [配置手册](#-配置手册)
- [开发指南](#-开发指南)
- [构建部署](#-构建部署)
- [路线图](#-路线图)

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 16.x |
| npm | ≥ 8.x |

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/HoranLee/wechat-mini-game.git
cd wechat-mini-game

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 浏览器打开
# Local:   http://localhost:3000
# Network: http://<your-ip>:3000   (手机扫码即可体验)
```

### NPM Scripts

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 (HMR) |
| `npm run build` | 生产构建 → `dist/` |
| `npm run preview` | 预览生产构建 |

---

## 🏗 项目架构

```
wechat-mini-game/
├── index.html                  # 入口 HTML
├── vite.config.js              # Vite 构建配置
├── package.json                # 依赖声明
└── src/
    ├── main.js                 # 应用入口 — 创建 PIXI.Application
    ├── config/
    │   └── constants.js        # 集中配置 — 物理 / 视觉 / 游戏参数
    ├── core/
    │   └── Game.js             # 主控制器 — 游戏循环 + UI + 输入处理
    ├── entities/
    │   ├── Ball.js             # 球体实体 — pixi 渲染 + matter 物理体
    │   └── Container.js        # 容器 — 静态墙壁 + 碰撞检测
    ├── systems/
    │   ├── MergeSystem.js      # 合成系统 — 碰撞检测 + 合并执行
    │   └── EffectSystem.js     # 特效系统 — 粒子 / 震动 / 分数弹窗
    └── stores/
        └── GameStore.js        # 状态管理 — MobX observable store
```

### 架构图

```
┌──────────────────────────────────────────────┐
│                    Game                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  PIXI.js │  │Matter.js│  │   MobX     │  │
│  │  渲染层   │  │  物理层   │  │  状态层    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │             │              │          │
│  ┌────▼─────────────▼──────────────▼──────┐  │
│  │              Game Loop                 │  │
│  │  Physics → Merge → Cleanup → Render   │  │
│  └───────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 数据流

```
Input (Touch/Mouse)
  │
  ▼
Game._onPointerDown/Move/Up  ──►  GameStore (aimX, isAiming, currentBall)
  │                                     │
  ▼                                     ▼
Ball (matter body)                 UI Text (score, combo, preview)
  │
  ▼
Matter.Engine.update()  ──►  collisionStart Event
  │                                     │
  ▼                                     ▼
physics settles              MergeSystem.checkCollision()
  │                                     │
  ▼                                     ▼
Ball.syncDisplay()           MergeSystem._executeMerge()
  │                                     │
  ▼                                     ▼
PIXI Render               EffectSystem (particles, shake, popup)
```

---

## 🎮 游戏机制

### 核心玩法

```
┌──────────────────────┐
│      得分  0         │
│   🏆 最高  0         │
│                      │
│     ◉ 下一个球       │  ← 预览
│                      │
│  ┌────────────────┐  │
│  │  ─ ─ 危险线 ─ ─│  │  ← 呼吸红线
│  │                │  │
│  │    ○           │  │
│  │  🍊 橘子       │  │  ← 已掉落球
│  │       ○        │  │
│  │     🍒 樱桃    │  │
│  │                │  │
│  │  ▄▄▄▄▄▄▄▄▄▄  │  │  ← 地板
│  └────────────────┘  │
│                      │
│   🔥 3连击! x2.0    │  ← 连击提示
└──────────────────────┘
```

### 操作流程

| 步骤 | 操作 | 说明 |
|------|------|------|
| ① | 点击"开始游戏" | 进入游戏 |
| ② | 移动手指/鼠标 | 球跟随水平移动 ↕ |
| ③ | 松手释放 | 球物理下落 ⬇ |
| ④ | 自动 | 相同球碰撞 → 合成更大的球 ✨ |
| ⑤ | 自动 | 连击触发倍率加分 🔥 |
| ⑥ | 重复 ②-⑤ | 直到球堆过危险线 |

### 合成链 (11 级)

| Lv | 名称 | 半径 | 分数 | 颜色 |
|----|------|------|------|------|
| 1 | 🍒 樱桃 | 13px | 1 | `#FF4757` |
| 2 | 🍊 橘子 | 18px | 3 | `#FF6348` |
| 3 | 🍋 柠檬 | 24px | 6 | `#FFA502` |
| 4 | 🍈 青柠 | 30px | 12 | `#FFD32A` |
| 5 | 🥝 猕猴桃 | 37px | 25 | `#7BED9F` |
| 6 | 🫐 蓝莓 | 45px | 50 | `#45AAF2` |
| 7 | 🍇 葡萄 | 54px | 100 | `#5352ED` |
| 8 | 💎 紫水晶 | 64px | 200 | `#A55EEA` |
| 9 | 🍓 草莓 | 75px | 400 | `#FF6B81` |
| 10 | ⭐ 星辰 | 88px | 800 | `#FFD700` |
| 11 | 🌌 宇宙 | 102px | 1600 | `#F8F8FF` |

### 连击系统

```
连击窗口: 1.5 秒内连续合成

连击数   倍率
  1      x1.0
  2      x1.5
  3      x2.0
  4      x2.5
  5      x3.0
  ...
  ≥9     x5.0 (上限)
```

### 游戏结束条件

- 任意球体**超过危险线连续 2.5 秒** → Game Over
- 合成出 🌌 宇宙 → 不会结束，但宇宙级不再合成

---

## ⚙ 配置手册

所有可调参数集中在 `src/config/constants.js`，无需改动业务代码。

### 画布

```js
CANVAS_WIDTH: 390    // 画布宽度 (移动端 9:16)
CANVAS_HEIGHT: 700   // 画布高度
```

### 物理引擎

```js
PHYSICS: {
  gravity: 2.5,          // 重力加速度
  ballFriction: 0.4,     // 球体摩擦系数
  ballRestitution: 0.15, // 球体弹性 (0=完全非弹性)
  ballDensity: 0.002,    // 球体密度
  wallFriction: 0.6,     // 墙壁摩擦
}
```

### 掉落机制

```js
DROP: {
  spawnY: 177,            // 球生成 Y 坐标
  maxGenerateLevel: 4,    // 随机生成最高等级 (0-4)
  cooldown: 350,          // 掉落冷却 (ms)
}
```

### 合成机制

```js
MERGE: {
  cooldown: 80,              // 合成后冷却 (防连续合成)
  minVelocityForMerge: 0.3,  // 最小碰撞速度阈值
}
```

### 特效

```js
EFFECTS: {
  particleCount: 16,     // 合成粒子数量
  particleSpeed: 6,      // 粒子初速度
  particleLife: 700,     // 粒子存活时间 (ms)
  shakeIntensity: 5,     // 震动强度
  shakeDuration: 280,    // 震动持续 (ms)
}
```

### 球体等级

在 `BALL_LEVELS` 数组中添加/修改/删除等级：

```js
{
  radius: 30,                    // 像素半径
  score: 12,                     // 基础分数
  body: 0xFFD32A,                // 主体色
  dark: 0xDDB000,                // 暗面色
  glow: 0xFFE066,                // 辉光色
  name: '柠檬',                   // 中文名
  emoji: '🍋',                   // 图标
}
```

---

## 🛠 开发指南

### 技术选型

| 库 | 版本 | 用途 | 选型理由 |
|----|------|------|----------|
| **pixi.js** | v6.5.10 | 2D WebGL 渲染 | 高性能 canvas 渲染，粒子特效友好 |
| **matter-js** | v0.20.0 | 物理引擎 | 轻量 2D 物理，碰撞检测成熟 |
| **mobx** | v6.16.1 | 状态管理 | 响应式 observable，游戏状态天然适配 |
| **vite** | v8 | 构建工具 | 毫秒级 HMR，ESM 原生支持 |

### 添加新特效

```js
// 在 EffectSystem.js 中添加新方法
spawnRipple(x, y) {
  const ripple = new PIXI.Graphics();
  ripple.lineStyle(2, 0xFFFFFF, 0.5);
  ripple.drawCircle(0, 0, 10);
  this.stage.addChild(ripple);
  // ... 动画逻辑
}
```

### 添加新球等级

在 `src/config/constants.js` 的 `BALL_LEVELS` 数组中追加：

```js
{ radius: 120, score: 3200, body: 0xFF0000, dark: 0xCC0000, glow: 0xFF4444, name: '黑洞', emoji: '🕳️' },
```

### 调试技巧

```js
// 在浏览器控制台开启物理调试渲染
window.__game.engine.render = { visible: true };

// 手动查看游戏状态
window.__gameStore = gameStore;  // mobx store
console.log(gameStore.score, gameStore.combo);
```

---

## 📦 构建部署

### 生产构建

```bash
npm run build
# 产物 → dist/
#   index.html          (0.9 kB)
#   assets/index-*.js   (653 kB / gzip 185 kB)
```

### 部署到静态服务

```bash
# Nginx
cp -r dist/* /var/www/html/

# Vercel / Netlify
# 直接关联 GitHub 仓库，构建命令: npm run build，发布目录: dist
```

### Docker 部署

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
```

```bash
docker build -t merge-balls .
docker run -p 8080:80 merge-balls
```

---

## 🗺 路线图

| 阶段 | 功能 | 状态 |
|------|------|------|
| **MVP** | 核心掉落 + 合成 + 物理 | ✅ 已完成 |
| **MVP** | 11 级合成链 + 游戏结束 | ✅ 已完成 |
| **MVP** | 连击系统 + 粒子特效 | ✅ 已完成 |
| **MVP** | 玻璃拟态视觉 | ✅ 已完成 |
| **v1.1** | 音效系统 (Howler.js) | 🚧 计划中 |
| **v1.2** | 道具系统 (炸弹/冰冻/磁铁) | 📋 待规划 |
| **v1.3** | 微信小游戏适配 (WX API) | 📋 待规划 |
| **v1.4** | 好友排行榜 (云开发) | 📋 待规划 |
| **v2.0** | 多人对战模式 | 💡 远期 |

---

## 📄 License

ISC © 2025

---

<p align="center">
  <sub>🤖 Built with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>
