/**
 * Visual engine — three modes, two rendering passes (glow + crisp).
 *
 * Performance design:
 *   - Geometry (trig, coordinate math) is computed ONCE per draw() call and
 *     reused for both the glow pass and the crisp pass.
 *   - Each mode makes ≤12 ctx.stroke()/fill() calls total — never one per frame.
 *   - Float32Array for coordinate buffers → avoids GC pressure.
 *   - No offscreen canvas; glow uses inline ctx.filter + 'screen' blend.
 *
 * Modes:
 *   spiral — 10-turn Archimedean, dramatic energy wobble, 12 color bands
 *   onde   — Full-canvas horizontal waveform (mirrored, fill + stroke + treble)
 *   bloom  — 5-fold radial mandala: same waveform drawn 5× with rotation offset
 */
class VisualEngine {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.mode     = 'spiral';
    this._pal     = null;
    this._raw     = defaultPalette();
    this._geo     = null;
    this._geoKey  = '';
    this.mode     = 'bloom';
  }

  setPalette(colors) {
    this._raw = colors;
    this._pal = colors.map(_parseRGB);
    this._geo = null;
  }

  resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect  = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.round(rect.width  * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._geo = null;
  }

  get _w() { return this.canvas.getBoundingClientRect().width;  }
  get _h() { return this.canvas.getBoundingClientRect().height; }

  // ── Draw entry point ──────────────────────────────────────────────────────

  draw(frames, p = 1) {
    if (!this._pal) this._pal = this._raw.map(_parseRGB);

    const count = Math.max(2, Math.floor(frames.length * Math.min(1, Math.max(0, p))));
    const sub   = frames.slice(0, count);

    // Geometry cache — compute once, reuse for both passes in the same draw()
    const geoKey = `${this.mode}:${sub.length}:${this._w}`;
    if (this._geoKey !== geoKey) {
      this._geo    = this._buildGeo(sub);
      this._geoKey = geoKey;
    }

    this.clear();

    // ── Background bar visualizer ─────────────────────────────────────────
    const curIdx   = Math.min(Math.round(p * (frames.length - 1)), frames.length - 1);
    const curFrame = frames[curIdx];
    this._drawBgBars(curFrame);

    const ctx = this.ctx;

    // ── Pass 1: Glow (blurred, screen-composited) ─────────────────────────
    ctx.save();
    ctx.filter                   = 'blur(9px)';
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha              = 0.40;
    ctx.lineCap                  = 'round';
    ctx.lineJoin                 = 'round';
    this._render(ctx, sub, p, 2.6);
    ctx.restore();

    // ── Pass 2: Crisp core ────────────────────────────────────────────────
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    this._render(ctx, sub, p, 1.0);
    ctx.restore();
  }

  clear() {
    const { ctx, _w: W, _h: H } = this;
    ctx.fillStyle = '#090910';
    ctx.fillRect(0, 0, W, H);
    if (this._pal && this._pal.length >= 2) {
      const [r, g, b] = this._pal[Math.floor(this._pal.length / 2)];
      const gr = ctx.createRadialGradient(W * .5, H * .5, 0, W * .5, H * .5, Math.max(W, H) * .6);
      gr.addColorStop(0, `rgba(${r},${g},${b},0.07)`);
      gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
  }

  exportPNG() {
    return new Promise(r => this.canvas.toBlob(r, 'image/png'));
  }

  // ── Geometry pre-computation ──────────────────────────────────────────────

  _buildGeo(frames) {
    switch (this.mode) {
      case 'spiral': return this._geoSpiral(frames);
      case 'bloom':  return this._geoBloom(frames);
      default:       return { frames };  // onde doesn't benefit from pre-computation
    }
  }

  _render(ctx, frames, p, wm) {
    switch (this.mode) {
      case 'spiral': this._drawSpiral(ctx, frames, p, wm); break;
      case 'onde':   this._drawOnde(ctx, frames, wm);      break;
      case 'bloom':  this._drawBloom(ctx, frames, wm);     break;
    }
  }

  // ── Mode: Spirale ─────────────────────────────────────────────────────────
  //
  //   Archimedean spiral, 10 turns, fills min(W,H)*0.44.
  //   Energy drives ±35% radius wobble — strong visual variation.
  //   Bass drives line width (0.6 px → 6 px).
  //   12 color-banded sections → 12 stroke() calls per pass.
  //   Bright playhead dot marks the current tip during active playback.

  _geoSpiral(frames) {
    const W = this._w, H = this._h;
    const cx    = W * .5, cy = H * .5;
    const maxR  = Math.min(W, H) * .44;
    const n     = frames.length;
    const TURNS = 10;
    const xs    = new Float32Array(n);
    const ys    = new Float32Array(n);
    const lows  = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f     = frames[i];
      const t     = i / Math.max(1, n - 1);
      const theta = t * Math.PI * 2 * TURNS;
      const base  = maxR * Math.pow(t, 0.68);
      const r     = Math.max(0, base + (f.rms - 0.5) * maxR * 0.35);
      xs[i]   = cx + r * Math.cos(theta);
      ys[i]   = cy + r * Math.sin(theta);
      lows[i] = f.low;
    }
    return { xs, ys, lows, n };
  }

  _drawSpiral(ctx, frames, p, wm) {
    const { xs, ys, lows, n } = this._geo;
    const SEGS = 12;

    for (let s = 0; s < SEGS; s++) {
      const i0 = Math.floor(s / SEGS * n);
      const i1 = Math.min(Math.floor((s + 1) / SEGS * n) + 1, n);
      if (i1 - i0 < 2) continue;

      let sumLow = 0;
      for (let i = i0; i < i1; i++) sumLow += lows[i];

      ctx.beginPath();
      ctx.moveTo(xs[i0], ys[i0]);
      for (let i = i0 + 1; i < i1; i++) {
        if (i < i1 - 1) {
          ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i+1]) * .5, (ys[i] + ys[i+1]) * .5);
        } else {
          ctx.lineTo(xs[i], ys[i]);
        }
      }
      ctx.strokeStyle = this._colorAt((s + .5) / SEGS);
      ctx.lineWidth   = (.6 + (sumLow / (i1 - i0)) * 5.5) * wm;
      ctx.stroke();
    }

    // Playhead — small glow dot at the tip (only during partial-progress playback)
    if (p < 0.999 && wm < 2) {
      const [r, g, b] = this._pal[this._pal.length - 1];
      ctx.beginPath();
      ctx.arc(xs[n - 1], ys[n - 1], 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)},0.95)`;
      ctx.fill();
    }
  }

  // ── Mode: Onde ────────────────────────────────────────────────────────────
  //
  //   Full-canvas horizontal waveform, symmetric top/bottom.
  //   ┌──────────────────────────────────┐ ← treble hairline (high)
  //   │        palette fill              │ ← rms envelope (top)
  //   │──────────────────────────────────│ ← center
  //   │        palette fill              │ ← rms envelope (bottom)
  //   └──────────────────────────────────┘ ← treble hairline
  //   Draw calls: 1 fill + 4 strokes = 5 per pass.

  _drawOnde(ctx, frames, wm) {
    const W = this._w, H = this._h;
    const n    = frames.length;
    const cy   = H * .5;
    const AMPL = H * .42;
    const AMPH = H * .28;

    // Downsample to 2× pixel width at most
    const maxP = Math.min(n, Math.ceil(W * 2));
    const step = Math.max(1, Math.floor(n / maxP));
    const pts  = [];
    for (let i = 0; i < n; i += step) pts.push(frames[i]);
    const m  = pts.length;
    const xf = i => (i / Math.max(1, m - 1)) * W;

    // Fill gradient
    const fillGr = ctx.createLinearGradient(0, 0, W, 0);
    this._pal.forEach((c, i) => {
      fillGr.addColorStop(i / (this._pal.length - 1), `rgba(${c[0]},${c[1]},${c[2]},0.22)`);
    });
    ctx.beginPath();
    for (let i = 0; i < m; i++) ctx.lineTo(xf(i), cy - pts[i].rms * AMPL);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(xf(i), cy + pts[i].rms * AMPL);
    ctx.closePath();
    ctx.fillStyle = fillGr;
    ctx.fill();

    // Outer strokes
    const strokeGr = ctx.createLinearGradient(0, 0, W, 0);
    this._pal.forEach((c, i) => {
      strokeGr.addColorStop(i / (this._pal.length - 1), `rgba(${c[0]},${c[1]},${c[2]},0.92)`);
    });
    ctx.strokeStyle = strokeGr;
    ctx.lineWidth   = 1.6 * wm;

    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const x = xf(i), y = cy - pts[i].rms * AMPL;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const x = xf(i), y = cy + pts[i].rms * AMPL;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Treble hairlines
    const [r1, g1, b1] = this._pal[this._pal.length - 1];
    const [r0, g0, b0] = this._pal[0];
    ctx.lineWidth = .85 * wm;

    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const x = xf(i), y = cy - pts[i].high * AMPH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${r1},${g1},${b1},0.65)`;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const x = xf(i), y = cy + pts[i].high * AMPH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.65)`;
    ctx.stroke();
  }

  // ── Mode: Bloom ───────────────────────────────────────────────────────────
  //
  //   The full radial waveform is drawn 5 times, each rotated by 2π/5.
  //   The overlapping copies create a natural mandala / rose appearance.
  //   Trig is pre-computed once in _geoBloom; _drawBloom only does lineTo.
  //   5 stroke() calls per pass.

  _geoBloom(frames) {
    const W = this._w, H = this._h;
    const cx   = W * .5, cy = H * .5;
    const maxR = Math.min(W, H) * .44;
    const n    = frames.length;
    const N    = 5;

    // Base angles and radii (computed once)
    const baseAngle = new Float32Array(n);
    const radius    = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      baseAngle[i] = (i / Math.max(1, n - 1)) * Math.PI * 2;
      radius[i]    = (.08 + frames[i].rms * .92) * maxR;
    }

    // Pre-rotate for each fold — no trig in the draw loop
    const folds = [];
    for (let f = 0; f < N; f++) {
      const off = (f / N) * Math.PI * 2;
      const cosO = Math.cos(off), sinO = Math.sin(off);
      const xs = new Float32Array(n);
      const ys = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const cosA = Math.cos(baseAngle[i]), sinA = Math.sin(baseAngle[i]);
        const rr   = radius[i];
        xs[i] = cx + rr * (cosA * cosO - sinA * sinO);
        ys[i] = cy + rr * (sinA * cosO + cosA * sinO);
      }
      folds.push({ xs, ys });
    }
    return { folds, n, N };
  }

  _drawBloom(ctx, frames, wm) {
    const { folds, n, N } = this._geo;
    for (let f = 0; f < N; f++) {
      const { xs, ys } = folds[f];
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < n; i++) {
        if (i < n - 1) {
          ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i+1]) * .5, (ys[i] + ys[i+1]) * .5);
        } else {
          ctx.lineTo(xs[i], ys[i]);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = this._colorAt(f / N);
      ctx.lineWidth   = .85 * wm;
      ctx.stroke();
    }
  }

  // ── Background bar visualizer ─────────────────────────────────────────────
  //
  //   N symmetric bars (grow from H/2 upward AND downward) driven by the
  //   current-frame energy. Drawn with heavy blur → soft neon glow layer.
  //   Fake spectrum: 3 bands (low/mid/high) spread across N bins with a
  //   log-like weighting + per-bar shimmer tied to rms.

  _drawBgBars(frame) {
    if (!frame) return;
    const { ctx, _w: W, _h: H } = this;
    const N     = 72;
    const bars  = this._spectrum(frame, N);
    const barW  = W / N;
    const halfH = H * 0.46;

    ctx.save();
    ctx.filter      = 'blur(22px)';
    ctx.globalAlpha = 0.28;

    for (let i = 0; i < N; i++) {
      const h  = bars[i] * halfH;
      if (h < 1) continue;
      const x  = i * barW;
      const t  = i / (N - 1);
      // Solid color — heavy blur makes per-bar gradients invisible anyway
      ctx.fillStyle = this._colorAt(t);
      ctx.fillRect(x, H * 0.5 - h, barW - 1, h * 2);
    }

    ctx.restore();
  }

  // Distribute 3 energy bands across N bins with log-like frequency warping.
  _spectrum(frame, N) {
    const { rms, low, high } = frame;
    const mid  = Math.max(0, rms - low * 0.6 - high * 0.4);
    const bars = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t       = i / (N - 1);
      const tSq     = t * t;                       // log-like: denser at low end
      const wLow    = Math.exp(-tSq * 6);
      const wMid    = Math.exp(-(tSq - 0.18) ** 2 / 0.06);
      const wHigh   = Math.pow(t, 1.6);
      const energy  = wLow * low + wMid * mid * 0.9 + wHigh * high;
      // Per-bar shimmer: shifts with rms so bars appear to breathe
      const shimmer = 0.82 + 0.18 * Math.sin(i * 1.9 + rms * 8);
      bars[i] = Math.min(1, energy * shimmer);
    }
    return bars;
  }

  // ── Color ─────────────────────────────────────────────────────────────────

  _colorAt(t) {
    const pal = this._pal;
    const n   = pal.length;
    const pos = Math.min(t, .9999) * (n - 1);
    const i0  = Math.floor(pos);
    const f   = pos - i0;
    const [r1, g1, b1] = pal[i0];
    const [r2, g2, b2] = pal[Math.min(i0 + 1, n - 1)];
    const k = 1.1;
    return `rgb(${Math.min(255, Math.round((r1+(r2-r1)*f)*k))},${Math.min(255, Math.round((g1+(g2-g1)*f)*k))},${Math.min(255, Math.round((b1+(b2-b1)*f)*k))})`;
  }
}

// ── Module helpers ─────────────────────────────────────────────────────────────

function _parseRGB(str) {
  if (str.startsWith('#')) {
    const h = str.slice(1);
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  const m = str.match(/\d+/g);
  return m ? [+m[0], +m[1], +m[2]] : [120, 120, 120];
}
