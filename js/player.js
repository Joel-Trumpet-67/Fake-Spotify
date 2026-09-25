// Playback engine: queue, shuffle, repeat, lock-screen controls.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Player extends EventTarget {
  constructor(audio, { getBlob, getTrack, getArtUrl }) {
    super();
    this.audio = audio;
    this.getBlob = getBlob;
    this.getTrack = getTrack;
    this.getArtUrl = getArtUrl;
    this.queue = [];
    this.original = [];
    this.index = -1;
    this.shuffle = false;
    this.repeat = 'off'; // off | all | one
    this.context = null; // { type, id, name }
    this.url = null;
    this.loadedId = null;
    this.pendingSeek = 0;
    this.loadToken = 0;

    audio.addEventListener('play', () => this.emit('state'));
    audio.addEventListener('pause', () => this.emit('state'));
    audio.addEventListener('ended', () => { this.emit('ended', this.current); this.next(true); });
    audio.addEventListener('timeupdate', () => this.emit('time'));
    audio.addEventListener('durationchange', () => this.emit('time'));
    audio.addEventListener('error', () => {
      if (audio.src && audio.src !== SILENT_WAV && this.loadedId) this.emit('error', this.current);
    });
    this.setupMediaSession();
    this.setupUnlock();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  get current() { return this.queue[this.index] ?? null; }
  get playing() { return !this.audio.paused && !!this.loadedId; }

  // iOS only lets audio start from a user gesture; "unlock" the element on first touch
  // so later plays (after async IndexedDB reads) are allowed.
  setupUnlock() {
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      if (this.audio.src) return;
      this.audio.src = SILENT_WAV;
      this.audio.play().then(() => {
        if (this.audio.src === SILENT_WAV) { this.audio.pause(); this.audio.removeAttribute('src'); }
      }).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  playList(ids, start = 0, context = null) {
    if (!ids.length) return;
    this.context = context;
    this.original = ids.slice();
    if (this.shuffle) {
      const first = start >= 0 ? ids[start] : ids[Math.floor(Math.random() * ids.length)];
      const rest = ids.slice();
      rest.splice(rest.indexOf(first), 1);
      this.queue = [first, ...shuffled(rest)];
      this.index = 0;
    } else {
      this.queue = ids.slice();
      this.index = Math.max(0, start);
    }
    this.load(true);
    this.emit('queue');
  }

  async load(autoplay = true, seek = 0) {
    const id = this.current;
    if (!id) return;
    const token = ++this.loadToken;
    const blob = await this.getBlob(id);
    if (token !== this.loadToken) return;
    if (!blob) { this.emit('error', id); return; }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.audio.src = this.url;
    this.loadedId = id;
    if (seek) {
      const apply = () => { this.audio.currentTime = seek; };
      this.audio.addEventListener('loadedmetadata', apply, { once: true });
    }
    this.emit('track', id);
    this.updateMediaSession();
    if (autoplay) {
      try { await this.audio.play(); } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
    }
  }

  toggle() {
    if (!this.current) return false;
    if (this.loadedId !== this.current) { this.load(true, this.pendingSeek); this.pendingSeek = 0; return true; }
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
    return true;
  }

  play() { if (this.audio.paused) this.toggle(); }
  pause() { this.audio.pause(); }

  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') { this.audio.currentTime = 0; this.audio.play().catch(() => {}); return; }
    if (this.index < this.queue.length - 1) this.index++;
    else if (this.repeat !== 'off' || !auto) this.index = 0;
    else { this.audio.pause(); this.audio.currentTime = 0; this.emit('state'); return; }
    this.load(true);
    this.emit('queue');
  }

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 3 || this.index === 0) { this.audio.currentTime = 0; return; }
    this.index--;
    this.load(true);
    this.emit('queue');
  }

  jump(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    this.load(true);
    this.emit('queue');
  }

  seek(fraction) {
    const d = this.audio.duration;
    if (isFinite(d) && d > 0) this.audio.currentTime = fraction * d;
  }

  setShuffle(on) {
    this.shuffle = on;
    const cur = this.current;
    if (cur) {
      if (on) {
        const rest = this.queue.filter((_, i) => i > this.index);
        const before = this.queue.slice(0, this.index);
        this.queue = [...before, cur, ...shuffled(rest)];
      } else {
        // Back to the original order, keeping anything the user queued manually.
        const extras = this.queue.filter((id) => !this.original.includes(id));
        this.queue = this.original.concat(extras);
        this.index = Math.max(0, this.queue.indexOf(cur));
      }
    }
    this.emit('queue');
    this.emit('mode');
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this.emit('mode');
  }

  playNext(ids) {
    if (!this.queue.length) return this.playList(ids, 0, null);
    this.queue.splice(this.index + 1, 0, ...ids);
    this.emit('queue');
  }

  addToQueue(ids) {
    if (!this.queue.length) return this.playList(ids, 0, null);
    this.queue.push(...ids);
    this.emit('queue');
  }

  removeAt(i) {
    if (i === this.index || i < 0 || i >= this.queue.length) return;
    this.queue.splice(i, 1);
    if (i < this.index) this.index--;
    this.emit('queue');
  }

  // Remove a track everywhere (e.g., deleted from library).
  purge(id) {
    const wasCurrent = this.current === id;
    this.original = this.original.filter((x) => x !== id);
    const before = this.queue.slice(0, this.index).filter((x) => x === id).length;
    this.queue = this.queue.filter((x) => x !== id);
    this.index -= before;
    if (wasCurrent) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.loadedId = null;
      if (this.index >= this.queue.length) this.index = this.queue.length - 1;
      this.emit('track', this.current);
    }
    this.emit('queue');
  }

  snapshot() {
    return {
      queue: this.queue, original: this.original, index: this.index, shuffle: this.shuffle,
      repeat: this.repeat, context: this.context,
      time: this.loadedId ? this.audio.currentTime : this.pendingSeek,
    };
  }

  restore(s, exists) {
    if (!s) return;
    const keep = (arr) => (arr || []).filter(exists);
    const cur = s.queue?.[s.index];
    this.queue = keep(s.queue);
    this.original = keep(s.original);
    this.index = cur && exists(cur) ? this.queue.indexOf(cur) : (this.queue.length ? 0 : -1);
    this.shuffle = !!s.shuffle;
    this.repeat = s.repeat || 'off';
    this.context = s.context || null;
    this.pendingSeek = cur && exists(cur) ? s.time || 0 : 0;
    this.emit('track', this.current);
    this.emit('queue');
    this.emit('mode');
  }

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* unsupported */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekto', (e) => { if (e.seekTime != null) this.audio.currentTime = e.seekTime; });
    set('seekbackward', (e) => { this.audio.currentTime = Math.max(0, this.audio.currentTime - (e.seekOffset || 10)); });
    set('seekforward', (e) => { this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + (e.seekOffset || 10)); });
    let last = 0;
    this.addEventListener('time', () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      const d = this.audio.duration;
      if (ms.setPositionState && isFinite(d) && d > 0) {
        try { ms.setPositionState({ duration: d, position: Math.min(this.audio.currentTime, d), playbackRate: this.audio.playbackRate || 1 }); } catch { /* ignore */ }
      }
    });
    this.addEventListener('state', () => { ms.playbackState = this.audio.paused ? 'paused' : 'playing'; });
  }

  async updateMediaSession() {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    const t = this.getTrack(this.current);
    if (!t) return;
    const art = await this.getArtUrl(t.artKey);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: art ? [{ src: art, sizes: '512x512' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
