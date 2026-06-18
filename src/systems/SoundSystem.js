// ============================================================
// 音效系统 — Web Audio API 合成音，无需外部音频文件
// ============================================================

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // 某些浏览器需要 resume
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 播放一个简短的合成音 */
function playTone(freq, duration, type = 'sine', volume = 0.15, glideTo = null) {
  try {
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (glideTo) {
      osc.frequency.linearRampToValueAtTime(glideTo, now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(c.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (_) { /* 静默处理不支持的情况 */ }
}

/** 多个音调叠加 (和弦) */
function playChord(freqs, duration, volume = 0.1) {
  for (const f of freqs) {
    playTone(f, duration, 'sine', volume / freqs.length);
  }
}

// ========== 公开 API ==========

export const SoundSystem = {
  /** 掉落音 — 短促低音 */
  playDrop() {
    playTone(220, 0.1, 'triangle', 0.12, 150);
  },

  /** 合成音 — 音高随等级上升 */
  playMerge(level = 0) {
    const baseFreq = 330 + level * 55; // 330Hz ~ 880Hz
    playTone(baseFreq, 0.15, 'sine', 0.18);
    // 泛音
    playTone(baseFreq * 1.5, 0.1, 'sine', 0.08);
  },

  /** 里程碑庆祝 — 三音和弦 */
  playMilestone(level = 0) {
    const root = 440 + level * 55;
    playChord([root, root * 1.25, root * 1.5], 0.4, 0.15);
    // 延迟第二拍
    setTimeout(() => {
      playChord([root * 1.25, root * 1.5, root * 2], 0.35, 0.12);
    }, 150);
  },

  /** 游戏结束音 — 下行三音 */
  playGameOver() {
    playTone(440, 0.2, 'triangle', 0.14, 330);
    setTimeout(() => playTone(330, 0.2, 'triangle', 0.12, 220), 150);
    setTimeout(() => playTone(220, 0.35, 'triangle', 0.1, 110), 300);
  },

  /** UI 点击音 */
  playClick() {
    playTone(880, 0.05, 'sine', 0.08);
  },

  /** 初始化 (需要用户手势后调用以解锁 AudioContext) */
  init() {
    try {
      const c = getCtx();
      if (c.state === 'suspended') c.resume();
    } catch (_) { /* ignore */ }
  },
};
