/**
 * Audio analysis module.
 * Decodes an ArrayBuffer to raw samples and computes per-window energy metrics
 * without OfflineAudioContext / AnalyserNode (avoids the pause/resume trap).
 */

async function analyzeAudioFile(arrayBuffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return analyzeBuffer(audioBuffer);
  } finally {
    await ctx.close();
  }
}

function analyzeBuffer(audioBuffer, windowSize = 1024, maxFrames = 3000) {
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const total = ch0.length;
  const rawFrameCount = Math.floor(total / windowSize);

  // For long tracks, increase the window size so we keep ≤maxFrames data points.
  // Larger windows = better per-frame RMS estimate anyway.
  if (rawFrameCount > maxFrames) {
    windowSize = Math.ceil(total / maxFrames);
  }
  const frameCount = Math.floor(total / windowSize);

  const frames = new Array(frameCount);

  // IIR low-pass coefficient (controls cutoff — lower α = lower cutoff)
  const alpha = 0.06;

  for (let i = 0; i < frameCount; i++) {
    const start = i * windowSize;
    let sumSq = 0;
    let lowPrev = 0;
    let lowSumSq = 0;

    for (let j = 0; j < windowSize; j++) {
      const idx = start + j;
      const s = ch1 ? (ch0[idx] + ch1[idx]) * 0.5 : ch0[idx];
      sumSq += s * s;
      lowPrev = alpha * s + (1 - alpha) * lowPrev;
      lowSumSq += lowPrev * lowPrev;
    }

    const rms  = Math.sqrt(sumSq    / windowSize);
    const low  = Math.sqrt(lowSumSq / windowSize);
    const high = Math.max(0, rms - low);

    frames[i] = { rms, low, high };
  }

  _normalize(frames, 'rms');
  _normalize(frames, 'low');
  _normalize(frames, 'high');

  return {
    frames: _smooth(frames, 8),
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    windowSize,
  };
}

function _normalize(frames, key) {
  let max = 0;
  for (const f of frames) if (f[key] > max) max = f[key];
  if (max === 0) return;
  for (const f of frames) f[key] /= max;
}

function _smooth(frames, radius) {
  const n = frames.length;
  return frames.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    const count = hi - lo + 1;
    let rms = 0, low = 0, high = 0;
    for (let j = lo; j <= hi; j++) {
      rms  += frames[j].rms;
      low  += frames[j].low;
      high += frames[j].high;
    }
    return { rms: rms / count, low: low / count, high: high / count };
  });
}
