# 🫧 合成球球 (Merge Balls)

> 物理合成掉落游戏 · 11 级合成链 · 玻璃拟态 · Web Audio 音效 · 新手引导

[![Tech](https://img.shields.io/badge/pixi.js-v6.5-E4405F?logo=pixiv)](https://pixijs.com/)
[![Physics](https://img.shields.io/badge/matter.js-v0.20-4B8BBE)](https://brm.io/matter-js/)
[![State](https://img.shields.io/badge/mobx-v6.16-FF9955?logo=mobx)](https://mobx.js.org/)
[![Build](https://img.shields.io/badge/vite-v8-646CFF?logo=vite)](https://vitejs.dev/)
[![Audio](https://img.shields.io/badge/audio-Web%20Audio%20API-8B5CF6)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![License](https://img.shields.io/badge/license-ISC-green)](./LICENSE)

---

## 📖 目录

- [快速开始](#-快速开始)
- [项目架构](#-项目架构)
- [游戏机制](#-游戏机制)
- [功能系统](#-功能系统)
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
├── index.html                  # 入口 HTML (移动端适配)
├── vite.config.js              # Vite 构建配置
├── package.json                # 依赖声明
└── src/
    ├── main.js                 # 应用入口 — 创建 PIXI.Application
    ├── config/
    │   └── constants.js        # 集中配置 (物理 / 视觉 / 音效 / 游戏参数)
    ├── core/
    │   └── Game.js             # 主控制器 (游戏循环 + UI + 输入 + 教程 + 暂停)
    ├── entities/
    │   ├── Ball.js             # 球体实体 (7层玻璃渲染 + matter 物理体)
    │   └── Container.js        # 容器 (静态墙壁 + 碰撞检测)
    ├── systems/
    │   ├── MergeSystem.js      # 合成系统 (碰撞检测 + 合并执行)
    │   ├── EffectSystem.js     # 特效系统 (粒子 / 冲击波 / 震动 / 弹窗 / 氛围粒子)
    │   └── SoundSystem.js      # 音效系统 (Web Audio API 合成音)
    └── stores/
        └── GameStore.js        # 状态管理 (MobX observable + localStorage)
```

### 架构图

```
┌──────────────────────────────────────────────────────────┐
│                         Game                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  PIXI.js │  │Matter.js │  │   MobX   │  │  Web    │  │
│  │  渲染层   │  │  物理层   │  │  状态层   │  │  Audio  │  │
│  └────┬─────┘  └────┬─────┘  └─────┬────┘  └────┬────┘  │
│       │             │              │            │         │
│  ┌────▼─────────────▼──────────────▼────────────▼─────┐  │
│  │                   Game Loop                         │  │
│  │  Input → Physics → Merge → SFX → Effects → Render  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │   Tutorial (3-step)  ·  Pause/Resume  ·  Combo     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
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
PIXI Render               EffectSystem (particles, shockwave, shake, popup)
                             │
                             ▼
                          SoundSystem (drop / merge / milestone / gameover)
```

---

## 🎮 游戏机制

### 核心玩法

```
┌──────────────────────┐
│      得分  0         │
│   🏆 最高  0         │
│                      │
│     ◉ 下一个球       │  ← 呼吸光环预览
│                      │
│  ┌────────────────┐  │
│  │  ─ ─ 危险线 ─ ─│  │  ← 危急时加速脉动
│  │                │  │
│  │    ○           │  │
│  │  🍊 橘子       │  │  ← 玻璃质感球体
│  │       ○        │  │
│  │     🍒 樱桃    │  │
│  │                │  │
│  │  ▄▄▄▄▄▄▄▄▄▄  │  │  ← 地板
│  └────────────────┘  │
│                      │
│   🔥 3连击! x2.0    │  ← 连击倍率
└──────────────────────┘
```

### 操作流程

| 步骤 | 操作 | 视觉反馈 | 音效 |
|------|------|----------|------|
| ① | 点击"开始游戏" | 面板淡出，球从顶部弹入 | UI 点击音 |
| ② | 移动手指/鼠标 | 球水平跟随 + 虚线引导 + 箭头 | — |
| ③ | 松手释放 | 球物理下落，入水波纹 | 掉落音 |
| ④ | 同級碰撞合成 | 粒子爆炸 + 冲击波 + 屏幕震动 + 分数弹窗 | 合成音 (音高随等级↑) |
| ⑤ | 连续合成 | 连击计数器 + 金色倍率显示 | — |
| ⑥ | 里程碑合成 | 金色粒子雨 + 庆祝文字 + 强烈震动 | 双拍和弦 |
| ⑦ | 超过危险线 | 危险线呼吸加速 + 辉光翻倍 | — |
| ⑧ | 游戏结束 | 结算面板 (分数/记录/等级/统计) | 下行三音 |

### 合成链 (11 级)

| Lv | 名称 | 半径 | 分数 | 主体色 | 里程碑 |
|----|------|------|------|--------|--------|
| 1 | 🍒 樱桃 | 13px | 1 | `#FF4757` | |
| 2 | 🍊 橘子 | 18px | 3 | `#FF6348` | |
| 3 | 🍋 柠檬 | 24px | 6 | `#FFA502` | |
| 4 | 🍈 青柠 | 30px | 12 | `#FFD32A` | |
| 5 | 🥝 猕猴桃 | 37px | 25 | `#7BED9F` | ⭐ |
| 6 | 🫐 蓝莓 | 45px | 50 | `#45AAF2` | |
| 7 | 🍇 葡萄 | 54px | 100 | `#5352ED` | ⭐ |
| 8 | 💎 紫水晶 | 64px | 200 | `#A55EEA` | |
| 9 | 🍓 草莓 | 75px | 400 | `#FF6B81` | ⭐ |
| 10 | ⭐ 星辰 | 88px | 800 | `#FFD700` | ⭐ |
| 11 | 🌌 宇宙 | 102px | 1600 | `#F8F8FF` | |

> 里程碑等级 (⭐) 触发全屏金色庆祝 + 冲击波 + 和弦音效

### 连击系统

```
连击窗口: 1.8 秒内连续合成

连击数   倍率
  1      x1.0
  2      x1.6
  3      x2.2
  4      x2.8
  5      x3.4
  ...
  ≥8     x5.0 (上限)
```

---

## 🎯 功能系统

### 🔊 音效系统

纯 Web Audio API 合成音，**零外部音频文件**：

| 音效 | 触发时机 | 合成方式 |
|------|----------|----------|
| 掉落音 | 松手释放球体 | 三角波 220→150Hz 下行 (0.1s) |
| 合成音 | 同級球合并 | 正弦波 + 泛音，音高随等级上升 (330+level×55Hz) |
| 里程碑 | Lv5/7/9/10 合成 | 双拍三音和弦 (根音+大三度+五度) |
| 游戏结束 | 危险线超时 | 下行三音 (440→330→220Hz) |
| UI 点击 | 按钮交互 | 短促高音 (880Hz，0.05s) |

> AudioContext 在首次用户手势时自动解锁，无需手动操作。

### 📖 新手引导

首次进入自动展示 **3 步半透明覆盖层**：

| 步骤 | 图标 | 标题 | 说明 |
|------|------|------|------|
| Step 1 | 👆 | 拖动瞄准 | 移动手指或鼠标，控制球左右位置 |
| Step 2 | 👇 | 松手释放 | 松开手指让球掉落进容器 |
| Step 3 | ✨ | 碰撞合成 | 相同球碰撞会自动合成更大的球！ |

- 步骤指示器 (3 个圆点) + "下一步" / "开始玩!" 按钮
- "跳过引导" 按钮可随时关闭
- `localStorage.tutorial_done_v1` 标记，仅首次显示

### ⏸ 暂停 / 恢复

- `document.visibilitychange` 监听
- 切换到后台 → 物理引擎冻结 (`timeScale = 0`)，显示"已暂停"遮罩
- 回到前台 → 自动恢复物理引擎
- 不影响游戏状态，不丢失进度

### 🎨 视觉特效一览

| 特效 | 触发条件 | 说明 |
|------|----------|------|
| 7 层玻璃球体 | 所有球 | 辉光→投影→主体→暗面→内发光→亮斑→缘高光 |
| 渐变背景 | 全局 | 深空渐变 + 微网格线 |
| 玻璃容器 | 全局 | 辉光边框 + 顶部反光条 |
| 危险线呼吸 | 全局 | 正弦波透明度脉动 |
| 危险线加速 | 球超线时 | 3x 呼吸频率 + 辉光翻倍 |
| 瞄准引导线 | 瞄准中 | 虚线 + 底部箭头 |
| 预览球光环 | 始终 | 下一个球外围呼吸环 |
| 入场弹跳 | 新球出现 | scale 0.6→1.0 弹性恢复 |
| 入水波纹 | 球进入容器 | 6 个慢速粒子 |
| 合成粒子爆发 | 每次合成 | 22 粒子 (70% 光点 + 30% 星形) |
| 冲击波 | Lv6+ 合成 | 1-4 圈扩散光环 |
| 分数弹窗 | 每次合成 | 上飘 + 缩放 + 淡出 |
| 屏幕震动 | Lv3+ 合成 | 二次衰减随机偏移 |
| 金色庆祝粒子 | 里程碑 | 40+25 高密度金/白粒子 |
| 里程碑文字 | 里程碑 | "🎉 里程碑达成!" 弹出放大淡出 |
| 氛围漂浮粒子 | 全局 | 30 个缓慢上浮呼吸光点 |
| 触觉反馈 | 每次合成 | `navigator.vibrate` (移动端) |
| 结算面板 | 游戏结束 | 分数 + 新纪录高亮 + 统计战报 |

---

## ⚙ 配置手册

所有可调参数集中在 `src/config/constants.js`。

### 画布

```js
CANVAS_WIDTH: 390      // 画布宽度 (移动端 9:16)
CANVAS_HEIGHT: 750     // 画布高度
```

### 物理引擎

```js
PHYSICS: {
  gravity: 2.2,            // 重力加速度
  ballFriction: 0.3,       // 球体摩擦系数
  ballRestitution: 0.28,   // 球体弹性 (越高碰撞越弹)
  ballDensity: 0.0018,     // 球体密度
  wallFriction: 0.6,       // 墙壁摩擦
}
```

### 球体等级

在 `BALL_LEVELS` 数组中修改，每项三个颜色通道：

```js
{
  radius: 30,          // 像素半径
  score: 12,           // 基础分数
  body: 0xFFD32A,      // 主体色
  dark: 0xDDB000,      // 暗面色 (用于阴影侧)
  glow: 0xFFE066,      // 辉光色 (用于发光/冲击波)
  name: '柠檬',         // 中文名
  emoji: '🍋',         // 图标
}
```

### 掉落 & 合成

```js
DROP: {
  spawnY: 177,              // 瞄准时球 Y 位置
  maxGenerateLevel: 4,      // 随机生成最高等级 (0-4)
  cooldown: 350,            // 掉落冷却 (ms)
}
MERGE: {
  cooldown: 60,             // 合成后冷却 (防连续合成)
  minVelocityForMerge: 0.25,// 最小碰撞速度阈值
}
```

### 里程碑

```js
MILESTONE_LEVELS: [5, 7, 9, 10]
// 等级 5/7/9/10 触发金色庆祝 + 和弦音效
```

### 连击

```js
COMBO: {
  window: 1800,           // 连击窗口 (ms)
  multiplier: 0.6,        // 每次连击额外倍率增额
  maxMultiplier: 5,       // 最大倍率上限
}
```

### 特效参数

```js
EFFECTS: {
  particleCount: 22,      // 合成粒子数量
  particleSpeed: 7,       // 粒子初速度
  particleLife: 800,      // 粒子存活时间 (ms)
  shakeIntensity: 6,      // 震动强度
  shakeDuration: 300,     // 震动持续 (ms)
  popupDuration: 1000,    // 分数弹窗持续 (ms)
}
```

### 主题色

```js
THEME: {
  bgTop: '#0a0a23',          // 渐变背景顶部
  bgBottom: '#141838',       // 渐变背景底部
  containerBg: 0x0e1738,     // 容器底色
  containerBorder: 0x3355aa, // 容器边框
  containerGlow: 0x5577dd,   // 容器辉光
  accent: 0xffd700,          // 强调色 (金)
  danger: 0xff4444,          // 危险色
}
```

---

## 🛠 开发指南

### 技术选型

| 库 | 版本 | 用途 | 选型理由 |
|----|------|------|----------|
| **pixi.js** | v6.5.10 | 2D WebGL 渲染 | 高性能 canvas，粒子特效友好 |
| **matter-js** | v0.20.0 | 物理引擎 | 轻量 2D 物理，碰撞检测成熟 |
| **mobx** | v6.16.1 | 状态管理 | 响应式 observable，游戏状态适配 |
| **vite** | v8 | 构建工具 | 毫秒级 HMR，ESM 原生支持 |
| **Web Audio API** | 原生 | 音效合成 | 零依赖，OscillatorNode 合成 |

### 添加新音效

在 `SoundSystem.js` 中添加方法：

```js
playPowerUp() {
  playTone(660, 0.2, 'square', 0.12, 880);
}
```

### 添加新特效

在 `EffectSystem.js` 中添加方法：

```js
spawnRipple(x, y) {
  const ripple = new PIXI.Graphics();
  ripple.lineStyle(2, 0xFFFFFF, 0.5);
  ripple.drawCircle(0, 0, 10);
  this.stage.addChild(ripple);
  // ... 扩散 + 淡出动画
}
```

### 添加新球等级

在 `constants.js` 的 `BALL_LEVELS` 数组中追加：

```js
{ radius: 120, score: 3200, body: 0xFF0000, dark: 0xCC0000, glow: 0xFF4444, name: '黑洞', emoji: '🕳️' },
```

### 调试技巧

```js
// 浏览器控制台
window.__game                           // Game 实例
window.__game.engine.timing.timeScale   // 物理速度
window.__game.balls                     // 当前所有球
gameStore                               // MobX 状态 (全局)
```

---

## 📦 构建部署

### 生产构建

```bash
npm run build
# 产物 → dist/
#   index.html          (0.9 kB)
#   assets/index-*.js   (661 kB / gzip 188 kB)
```

### 部署到静态服务

```bash
# Nginx
cp -r dist/* /var/www/html/

# Vercel / Netlify
# 关联 GitHub 仓库，构建命令: npm run build，发布目录: dist
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
| **v1.0** | 核心掉落 + 合成 + 物理 | ✅ 已完成 |
| **v1.0** | 11 级合成链 + 游戏结束 | ✅ 已完成 |
| **v1.0** | 连击系统 + 粒子特效 + 冲击波 | ✅ 已完成 |
| **v1.0** | 玻璃拟态视觉 + 氛围粒子 | ✅ 已完成 |
| **v1.0** | 里程碑庆祝系统 | ✅ 已完成 |
| **v1.0** | Web Audio 音效 (5种) | ✅ 已完成 |
| **v1.0** | 3 步新手引导 | ✅ 已完成 |
| **v1.0** | 暂停 / 恢复 | ✅ 已完成 |
| **v1.1** | 道具系统 (炸弹/冰冻/磁铁) | 📋 待规划 |
| **v1.2** | 微信小游戏适配 (WX API) | 📋 待规划 |
| **v1.3** | 好友排行榜 (云开发) | 📋 待规划 |
| **v2.0** | 多人对战模式 | 💡 远期 |

---

## 📄 License

ISC © 2025

---

<p align="center">
  <sub>🤖 Built with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>
