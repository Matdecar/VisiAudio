/**
 * App orchestration.
 *
 * Layout notes (new glass-overlay UI):
 * - Canvas fills 100vw × 100vh behind glass panels.
 * - Drag & drop targets the whole document body.
 * - Modes: 'spiral' | 'onde' | 'bloom'
 */
class App {
  constructor() {
    this.engine   = new VisualEngine(document.getElementById('visualizer'));
    this.audioEl  = document.getElementById('audio-player');
    this.analysis = null;
    this.rafId    = null;

    this._initResize();
    this._bindUI();
    populateLibrarySelect(document.getElementById('library-select'));
    this._checkProtocol();

    this.engine.setPalette(defaultPalette());
    this._drawIdle();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  _initResize() {
    this.engine.resize();
    const ro = new ResizeObserver(() => {
      this.engine.resize();
      if (this.analysis) this._redraw(this._progress());
      else this._drawIdle();
    });
    ro.observe(document.getElementById('visualizer'));
  }

  _checkProtocol() {
    if (location.protocol !== 'file:') return;
    document.getElementById('file-warning').hidden     = false;
    document.getElementById('library-select').disabled = true;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindUI() {
    // File input
    const fi = document.getElementById('file-input');
    fi.addEventListener('change', (e) => {
      if (e.target.files[0]) this._loadFile(e.target.files[0]);
      fi.value = '';
    });

    // Drag & drop — whole body as target
    const overlay = document.getElementById('drag-overlay');

    let dragDepth = 0;
    document.body.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      dragDepth++;
      overlay.hidden = false;
    });
    document.body.addEventListener('dragleave', () => {
      dragDepth--;
      if (dragDepth <= 0) { dragDepth = 0; overlay.hidden = true; }
    });
    document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      overlay.hidden = true;
      const file = e.dataTransfer.files[0];
      if (file) this._loadFile(file);
    });

    // Library select
    document.getElementById('library-select').addEventListener('change', (e) => {
      const entry = LIBRARY.find(t => t.id === e.target.value);
      if (entry) this._loadLibraryEntry(entry);
    });

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.engine.mode = btn.dataset.mode;
        if (this.analysis) this._redraw(this._progress());
      });
    });

    // Play / Pause
    document.getElementById('play-btn').addEventListener('click', () => this._togglePlay());

    // Scrub
    document.getElementById('progress-bar').addEventListener('click', (e) => {
      if (!this.analysis) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const t    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.audioEl.currentTime = t * (this.audioEl.duration || 0);
      this._redraw(t);
      this._updateProgress(t);
    });

    // Audio state
    this.audioEl.addEventListener('play',  () => { this._setPlayIcon(false); this._startRAF(); });
    this.audioEl.addEventListener('pause', () => { this._setPlayIcon(true);  this._stopRAF();  this._redraw(this._progress()); });
    this.audioEl.addEventListener('ended', () => { this._setPlayIcon(true);  this._stopRAF();  this._redraw(1); this._updateProgress(1); });

    // Export
    document.getElementById('export-btn').addEventListener('click', () => this._export());
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async _loadFile(file) {
    if (!this._isAudio(file)) {
      this._toast('Format non reconnu.\nAcceptés : mp3, wav, ogg, flac, m4a'); return;
    }
    this._showLoading('Décodage audio…');
    try {
      const ab  = await file.arrayBuffer();

      this._showLoading('Calcul de l\'empreinte…');
      this.analysis = await analyzeAudioFile(ab.slice(0));

      this.audioEl.src = URL.createObjectURL(new Blob([ab], { type: file.type || 'audio/mpeg' }));

      this._showLoading('Extraction de la pochette…');
      const cover = await extractCoverFromFile(file);
      this._applyPalette(cover);
      this._setTrackMeta(file.name.replace(/\.[^.]+$/, ''), '', '');
      this._showPlayer();
      this._redraw(1);
    } catch (err) {
      console.error(err);
      this._toast(`Impossible d'analyser ce fichier.\n${err.message}`);
    } finally { this._hideLoading(); }
  }

  async _loadLibraryEntry(entry) {
    this._showLoading('Chargement…');
    try {
      const { arrayBuffer, coverImg } = await loadLibraryTrack(entry);

      this._showLoading('Calcul de l\'empreinte…');
      this.analysis    = await analyzeAudioFile(arrayBuffer.slice(0));
      this.audioEl.src = URL.createObjectURL(new Blob([arrayBuffer]));

      this._applyPalette(coverImg ? { img: coverImg } : null);
      const sub = entry.genre ? `${entry.artist} · ${entry.genre}` : entry.artist;
      this._setTrackMeta(entry.title, sub, entry.attribution || '');
      this._showPlayer();
      this._redraw(1);
    } catch (err) {
      console.error(err);
      this._toast(`Impossible de charger ce morceau.\n${err.message}`);
    } finally { this._hideLoading(); }
  }

  _isAudio(file) {
    if (file.type.startsWith('audio/')) return true;
    return /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name);
  }

  // ── Palette ───────────────────────────────────────────────────────────────

  _applyPalette(cover) {
    const coverImg   = document.getElementById('cover-img');
    const fallback   = document.getElementById('cover-fallback');

    if (cover && cover.img) {
      coverImg.src     = cover.img.src || '';
      coverImg.hidden  = false;
      fallback.hidden  = true;
      this.engine.setPalette(extractColorsFromImage(cover.img));
    } else {
      coverImg.hidden  = true;
      fallback.hidden  = false;
      this.engine.setPalette(defaultPalette());
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  _togglePlay() {
    if (!this.analysis) return;
    this.audioEl.paused
      ? this.audioEl.play().catch(e => this._toast(e.message))
      : this.audioEl.pause();
  }

  _startRAF() {
    const tick = () => {
      const p = this._progress();
      this._redraw(p);
      this._updateProgress(p);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _stopRAF() {
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  _progress() {
    return this.audioEl.duration ? this.audioEl.currentTime / this.audioEl.duration : 1;
  }

  // ── Canvas ────────────────────────────────────────────────────────────────

  _redraw(progress) {
    if (!this.analysis) return;
    this.engine.draw(this.analysis.frames, progress);
  }

  _drawIdle() {
    const { ctx, _w: W, _h: H } = this.engine;
    this.engine.clear();
    // Soft vignette accent
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.55);
    grad.addColorStop(0,   'rgba(90, 30, 160, 0.12)');
    grad.addColorStop(0.5, 'rgba(0, 150, 200, 0.04)');
    grad.addColorStop(1,   'rgba(9, 9, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  _updateProgress(p) {
    document.getElementById('progress-fill').style.width = `${p * 100}%`;
    const t = this.audioEl.currentTime || 0;
    const d = this.audioEl.duration    || 0;
    document.getElementById('time-current').textContent = _fmt(t);
    document.getElementById('time-total').textContent   = _fmt(d);
  }

  _setPlayIcon(paused) {
    document.getElementById('play-btn').innerHTML = paused
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
  }

  _setTrackMeta(title, artist, attribution) {
    document.getElementById('track-title').textContent  = title;
    document.getElementById('track-artist').textContent = artist;
    const bar = document.getElementById('attr-bar');
    document.getElementById('footer-attribution').textContent = attribution;
    bar.hidden = !attribution;
  }

  _showLoading(msg) {
    document.getElementById('loading-overlay').hidden = false;
    document.getElementById('loading-text').textContent = msg;
  }
  _hideLoading() { document.getElementById('loading-overlay').hidden = true; }

  _showPlayer() {
    document.getElementById('player-panel').hidden  = false;
    document.getElementById('export-btn').disabled  = false;
    document.getElementById('empty-hint').hidden    = true;
    this._setPlayIcon(true);
    this._updateProgress(0);
  }

  _toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('visible'), 4200);
  }

  async _export() {
    if (!this.analysis) return;
    const blob = await this.engine.exportPNG();
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'visiaudio.png' }).click();
    URL.revokeObjectURL(url);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _fmt(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', () => { new App(); });
