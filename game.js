/**
 * 合成球球 - 微信小游戏入口
 *
 * 微信小游戏环境:
 * - 使用 wx.createCanvas() 创建画布
 * - 无 DOM API (document / window 受限)
 * - 入口文件名必须为 game.js
 * - 配置文件 game.json 必须存在
 */

// ============================================================
// 微信小游戏适配层 — 补丁
// ============================================================

// 1. 为 PIXI 提供必要的全局对象 (微信环境缺失)
if (typeof window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: function (tag) {
      if (tag === 'canvas') {
        // 微信小游戏中用 wx.createCanvas / createOffscreenCanvas
        const canOffscreen = typeof wx.createOffscreenCanvas === 'function';
        const c = canOffscreen ? wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 }) : wx.createCanvas();
        c.style = {};
        if (!c.getContext) {
          // fallback: 创建一个普通对象模拟 canvas
          return { width: 1, height: 1, style: {}, getContext: function () { return null; } };
        }
        return c;
      }
      return {};
    },
    createElementNS: function () { return {}; },
    body: { appendChild: function () {}, style: {} },
    documentElement: { style: {} },
    addEventListener: function () {},
    removeEventListener: function () {},
    getElementById: function () { return null; },
  };
}

// 2. HTMLCanvasElement polyfill (某些库需要)
if (typeof HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class {};
}

// 3. localStorage → wx Storage 适配
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _prefix: 'ls_',
    getItem(key) {
      try { return wx.getStorageSync(this._prefix + key); } catch (_) { return null; }
    },
    setItem(key, value) {
      try { wx.setStorageSync(this._prefix + key, value); } catch (_) { /* ignore */ }
    },
    removeItem(key) {
      try { wx.removeStorageSync(this._prefix + key); } catch (_) { /* ignore */ }
    },
  };
}

// 4. navigator.vibrate → wx.vibrateShort 适配
if (typeof navigator === 'undefined') {
  globalThis.navigator = {};
}
if (!navigator.vibrate) {
  navigator.vibrate = function (ms) {
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      wx.vibrateShort({ type: ms > 20 ? 'heavy' : 'light' });
    }
  };
}

// 5. performance.now polyfill (微信基础库较早版本需要)
if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}
if (!performance.now) {
  performance.now = () => Date.now();
}

// 7. AudioContext → wx WebAudio 适配 (微信基础库 2.19+ 支持)
// 微信小游戏部分版本支持原生 WebAudio，不支持的降级处理
if (typeof AudioContext === 'undefined' && typeof wx !== 'undefined') {
  try {
    // 微信小游戏支持原生 WebAudio API
    globalThis.AudioContext = wx.createWebAudioContext?.()?.constructor || class {};
  } catch (_) {
    // 降级: 无声音
  }
}

// ============================================================
// 启动游戏
// ============================================================

// 动态导入主模块
import('./src/main.js').catch((err) => {
  console.error('游戏启动失败:', err);
});
