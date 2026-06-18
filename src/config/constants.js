// ============================================================
// 游戏常量配置 — 全部可调参数
// ============================================================

// ---- 画布 ----
export const CANVAS_WIDTH = 390;
export const CANVAS_HEIGHT = 750;

// ---- 视觉主题色 ----
export const THEME = {
  bgTop: '#0a0a23',          // 背景顶部
  bgBottom: '#141838',      // 背景底部
  containerBg: 0x0e1738,    // 容器底色
  containerBorder: 0x3355aa, // 容器边框
  containerGlow: 0x5577dd,  // 容器外侧辉光
  accent: 0xffd700,         // 强调色 (金)
  danger: 0xff4444,         // 危险色
  textPrimary: 0xffffff,
  textSecondary: 0x8899cc,
  textDim: 0x556688,
};

// ---- 容器 ----
export const CONTAINER = {
  x: 25,
  y: 155,
  width: 340,
  height: 485,
  wallThickness: 10,
  cornerRadius: 12,
};

// 危险线
export const DANGER_LINE_Y = CONTAINER.y + 55;

// ---- 物理 ----
export const PHYSICS = {
  gravity: 2.2,
  ballFriction: 0.3,
  ballRestitution: 0.28,
  ballDensity: 0.0018,
  wallFriction: 0.6,
  wallRestitution: 0.15,
};

// ---- 球体等级 ----
// 每个球的颜色分三层: body(主色) / dark(暗面) / glow(发光)
export const BALL_LEVELS = [
  { radius: 13,  score: 1,    body: 0xFF4757, dark: 0xCC2233, glow: 0xFF6B7A, name: '樱桃',   emoji: '🍒' },
  { radius: 18,  score: 3,    body: 0xFF6348, dark: 0xDD4020, glow: 0xFF8570, name: '橘子',   emoji: '🍊' },
  { radius: 24,  score: 6,    body: 0xFFA502, dark: 0xDD8800, glow: 0xFFC04D, name: '柠檬',   emoji: '🍋' },
  { radius: 30,  score: 12,   body: 0xFFD32A, dark: 0xDDB000, glow: 0xFFE066, name: '青柠',   emoji: '🍈' },
  { radius: 37,  score: 25,   body: 0x7BED9F, dark: 0x44CC66, glow: 0xA0F5C0, name: '猕猴桃', emoji: '🥝' },
  { radius: 45,  score: 50,   body: 0x45AAF2, dark: 0x1E88DD, glow: 0x70C0FF, name: '蓝莓',   emoji: '🫐' },
  { radius: 54,  score: 100,  body: 0x5352ED, dark: 0x3030CC, glow: 0x7B7AF5, name: '葡萄',   emoji: '🍇' },
  { radius: 64,  score: 200,  body: 0xA55EEA, dark: 0x7B33DD, glow: 0xC488F5, name: '紫水晶', emoji: '💎' },
  { radius: 75,  score: 400,  body: 0xFF6B81, dark: 0xDD3355, glow: 0xFF99A8, name: '草莓',   emoji: '🍓' },
  { radius: 88,  score: 800,  body: 0xFFD700, dark: 0xCC9900, glow: 0xFFE44D, name: '星辰',   emoji: '⭐' },
  { radius: 102, score: 1600, body: 0xF8F8FF, dark: 0xCCCCDD, glow: 0xFFFFFF, name: '宇宙',   emoji: '🌌' },
];

export const MAX_LEVEL = BALL_LEVELS.length - 1;

// ---- 掉落 ----
export const DROP = {
  spawnY: CONTAINER.y + 22,
  maxGenerateLevel: 4,
  cooldown: 350,
};

// ---- 合成 ----
export const MERGE = {
  cooldown: 60,
  minVelocityForMerge: 0.25,
};

// ---- 游戏结束 ----
export const GAME_OVER = {
  dangerTime: 2500,
};

// ---- 特效 ----
export const EFFECTS = {
  particleCount: 22,
  particleSpeed: 7,
  particleLife: 800,
  shakeIntensity: 6,
  shakeDuration: 300,
  popupDuration: 1000,
};

// ---- 里程碑等级 (合成到这些等级触发特殊庆祝) ----
export const MILESTONE_LEVELS = [5, 7, 9, 10]; // 蓝莓/紫水晶/草莓/宇宙

// ---- 连击 ----
export const COMBO = {
  window: 1800,
  multiplier: 0.6,
  maxMultiplier: 5,
};
