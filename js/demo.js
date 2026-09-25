// Generates a few original demo songs + cover art entirely in the browser,
// so the app has something to play before you add your own music.
const SR = 32000;
const LEN = 34;

const QUAL = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10] };
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const SONGS = [
  { title: 'Neon Hours', artist: 'Midnight Arcade', album: 'Neon Hours', track: 1, year: 2026, genre: 'Synthwave',
    bpm: 108, key: 57, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], style: 'synth', arp: [0, 1, 2, 1, 2, 3, 2, 1], lead: 'square' },
  { title: 'Afterglow', artist: 'Midnight Arcade', album: 'Neon Hours', track: 2, year: 2026, genre: 'Synthwave',
    bpm: 96, key: 52, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], style: 'synth', arp: [0, 2, 1, 2, 3, 2, 1, 2], lead: 'triangle' },
  { title: 'City Lights', artist: 'Midnight Arcade', album: 'Neon Hours', track: 3, year: 2026, genre: 'Synthwave',
    bpm: 118, key: 55, prog: [[0, 'm'], [-4, 'M'], [-9, 'M'], [-2, 'M']], style: 'synth', arp: [0, 1, 2, 3, 2, 1, 0, 1], lead: 'sawtooth' },
  { title: 'Golden Static', artist: 'Luma', album: 'Golden Static', track: 1, year: 2025, genre: 'Lo-fi',
    bpm: 78, key: 50, prog: [[0, 'm7'], [5, 'd7'], [-2, 'M7'], [7, 'm7']], style: 'lofi', arp: [0, 2, 3, 1], lead: 'sine' },
  { title: 'Slow Sunday', artist: 'Luma', album: 'Golden Static', track: 2, year: 2025, genre: 'Lo-fi',
    bpm: 70, key: 53, prog: [[0, 'M7'], [-1, 'm7'], [-3, 'm7'], [-5, 'M7']], style: 'lofi', arp: [3, 2, 1, 0], lead: 'triangle' },
];

const COVERS = {
  'Neon Hours': (ctx, S) => {
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#1a0536'); g.addColorStop(0.55, '#b0106e'); g.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // sun with stripes
    const sun = ctx.createLinearGradient(0, S * 0.2, 0, S * 0.62);
    sun.addColorStop(0, '#ffe46b'); sun.addColorStop(1, '#ff3d7f');
    ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S * 0.5, S * 0.26, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = sun; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#6a0a5a';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, S * (0.5 + i * 0.045), S, S * (0.008 + i * 0.004));
    ctx.restore();
    // grid floor
    ctx.fillStyle = '#12001f'; ctx.fillRect(0, S * 0.66, S, S);
    ctx.strokeStyle = '#ff3dd4'; ctx.lineWidth = S * 0.004;
    for (let i = 0; i < 9; i++) { const y = S * 0.66 + (S * 0.34) * (i / 8) ** 1.8; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(S / 2 + i * S * 0.02, S * 0.66); ctx.lineTo(S / 2 + i * S * 0.16, S); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = `900 ${S * 0.1}px Figtree, system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.shadowColor = '#ff3dd4'; ctx.shadowBlur = S * 0.03;
    ctx.fillText('NEON HOURS', S / 2, S * 0.16);
  },
  'Golden Static': (ctx, S) => {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#f6c66a'); g.addColorStop(1, '#d9653b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // window + plant silhouette vibe
    ctx.fillStyle = 'rgba(40,20,10,.18)';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, Math.random() * S * 0.12, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#2b1a14';
    ctx.beginPath(); ctx.arc(S * 0.5, S * 0.55, S * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6c66a';
    ctx.beginPath(); ctx.arc(S * 0.5, S * 0.55, S * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(246,198,106,.35)'; ctx.lineWidth = S * 0.003;
    for (let r = 0.08; r < 0.22; r += 0.018) { ctx.beginPath(); ctx.arc(S * 0.5, S * 0.55, S * r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#2b1a14'; ctx.font = `800 ${S * 0.085}px Figtree, system-ui, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText('golden', S * 0.08, S * 0.16); ctx.fillText('static', S * 0.08, S * 0.25);
    // grain
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 28; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  },
};

function makeCover(album) {
  const S = 600;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  COVERS[album](c.getContext('2d'), S);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
}

function render(cfg) {
  const ctx = new OfflineAudioContext(1, SR * LEN, SR);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 1.5);
  master.gain.setValueAtTime(0.9, LEN - 3);
  master.gain.linearRampToValueAtTime(0, LEN);
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);

  // Echo bus for space
  const beat = 60 / cfg.bpm;
  const echo = ctx.createDelay(2); echo.delayTime.value = beat * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2500;
  echo.connect(tone); tone.connect(fb); fb.connect(echo); tone.connect(wet); wet.connect(master);

  const noise = ctx.createBuffer(1, SR, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const voice = (freq, t, len, { type = 'sine', gain = 0.1, attack = 0.01, pluck = false, cutoff = 0, send = 0, detune = 0 }) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    if (pluck) g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    else { g.gain.setValueAtTime(gain, t + Math.max(attack, len - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + len); }
    let n = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 2; o.connect(f); n = f; }
    n.connect(g); g.connect(master);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(echo); }
    o.start(t); o.stop(t + len + 0.05);
  };
  const kick = (t, v = 1) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
  };
  const hit = (t, { freq, type, gain, len }) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  };

  const bar = beat * 4;
  const lofi = cfg.style === 'lofi';
  const swing = lofi ? beat * 0.08 : 0;
  for (let b = 0; b * bar < LEN; b++) {
    const t0 = b * bar;
    const [off, q] = cfg.prog[b % cfg.prog.length];
    const root = cfg.key + off;
    const notes = QUAL[q].map((i) => root + i);
    // pad / keys
    notes.forEach((m) => {
      if (lofi) {
        voice(mtof(m), t0, bar * 0.95, { type: 'sine', gain: 0.07, attack: 0.02, pluck: true });
        voice(mtof(m + 12), t0 + beat * 2, bar * 0.45, { type: 'triangle', gain: 0.025, pluck: true, send: 0.4 });
      } else {
        voice(mtof(m), t0, bar, { type: 'sawtooth', gain: 0.035, attack: 0.3, cutoff: 1200, detune: -7 });
        voice(mtof(m), t0, bar, { type: 'sawtooth', gain: 0.035, attack: 0.3, cutoff: 1200, detune: 7 });
      }
    });
    // bass
    const bassSteps = lofi ? [0, 1.5, 2.5] : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    bassSteps.forEach((s) => voice(mtof(root - 12), t0 + s * beat, beat * (lofi ? 0.9 : 0.45), { type: lofi ? 'sine' : 'sawtooth', gain: lofi ? 0.22 : 0.09, cutoff: lofi ? 0 : 500, pluck: true }));
    if (b < 1) continue; // intro: pads only
    // arp / melody
    const steps = lofi ? 8 : 16;
    for (let s = 0; s < steps; s++) {
      if (lofi && s % 2 === 1 && Math.random() < 0.5) continue;
      const deg = cfg.arp[s % cfg.arp.length] % notes.length;
      const oct = lofi ? 12 : 24;
      const st = t0 + s * (bar / steps) + (s % 2 ? swing : 0);
      voice(mtof(notes[deg] + oct), st, bar / steps * 1.6, { type: cfg.lead, gain: lofi ? 0.05 : 0.035, pluck: true, cutoff: lofi ? 2400 : 3200, send: 0.5 });
    }
    if (b < 2) continue;
    // drums
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      if (lofi) { if (k === 0) kick(t); if (k === 2) kick(t + beat * 0.5, 0.8); }
      else kick(t);
      if (k === 1 || k === 3) hit(t, { freq: 1800, type: 'bandpass', gain: lofi ? 0.35 : 0.5, len: 0.18 });
      hit(t, { freq: 7000, type: 'highpass', gain: 0.12, len: 0.04 });
      hit(t + beat / 2 + swing, { freq: 7000, type: 'highpass', gain: 0.08, len: 0.04 });
    }
  }
  if (lofi) { // vinyl crackle
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0.015;
    s.connect(f); f.connect(g); g.connect(master); s.start(0);
  }
  return ctx.startRendering();
}

function toWav(buf) {
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (p, s) => { for (let i = 0; i < s.length; i++) out.setUint8(p + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, SR, true); out.setUint32(28, SR * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}

export async function* generateDemo() {
  const covers = {};
  for (const album of Object.keys(COVERS)) covers[album] = await makeCover(album);
  for (const cfg of SONGS) {
    const buf = await render(cfg);
    const { bpm, key, prog, style, arp, lead, ...meta } = cfg;
    yield { ...meta, albumArtist: meta.artist, blob: toWav(buf), picture: covers[cfg.album], duration: LEN, sourceKey: `demo:${cfg.title}`, total: SONGS.length };
  }
}
