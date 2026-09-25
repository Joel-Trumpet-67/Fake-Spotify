// Read tags + album art from audio files (ID3v2 for MP3, iTunes atoms for M4A, Vorbis comments for FLAC).

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

function ascii(b, p, n) {
  let s = '';
  for (let i = 0; i < n && p + i < b.length; i++) s += String.fromCharCode(b[p + i]);
  return s;
}
const u32be = (b, p) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const u32le = (b, p) => b[p] + (b[p + 1] << 8) + (b[p + 2] << 16) + ((b[p + 3] << 24) >>> 0);
const syncsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];

function decodeWith(enc, bytes) {
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) { le = true; bytes = bytes.subarray(2); }
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) { le = false; bytes = bytes.subarray(2); }
    return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(bytes);
  }
  return (enc === 3 ? utf8 : latin1).decode(bytes);
}

const clean = (s) => (s || '').replace(/\0.*$/s, '').trim();

// ---------- ID3v2 ----------
function parseID3(b) {
  if (ascii(b, 0, 3) !== 'ID3') return null;
  const ver = b[3];
  const flags = b[5];
  const end = Math.min(10 + syncsafe(b, 6), b.length);
  let p = 10;
  if (flags & 0x40) p += ver === 4 ? syncsafe(b, p) : u32be(b, p) + 4;
  const out = {};
  while (p + 10 <= end) {
    let id, size, hdr = 10;
    if (ver === 2) { id = ascii(b, p, 3); size = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]; hdr = 6; }
    else { id = ascii(b, p, 4); size = ver === 4 ? syncsafe(b, p + 4) : u32be(b, p + 4); }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || size <= 0) break;
    let d = b.subarray(p + hdr, Math.min(p + hdr + size, end));
    if (ver === 4 && (b[p + 9] & 0x01)) d = d.subarray(4); // data length indicator
    const text = () => clean(decodeWith(d[0], d.subarray(1)));
    switch (id) {
      case 'TIT2': case 'TT2': out.title = text(); break;
      case 'TPE1': case 'TP1': out.artist = text(); break;
      case 'TPE2': case 'TP2': out.albumArtist = text(); break;
      case 'TALB': case 'TAL': out.album = text(); break;
      case 'TRCK': case 'TRK': out.track = parseInt(text(), 10) || 0; break;
      case 'TYER': case 'TYE': case 'TDRC': out.year = parseInt(text(), 10) || 0; break;
      case 'TCON': case 'TCO': out.genre = text().replace(/^\(\d+\)/, '') || undefined; break;
      case 'APIC': case 'PIC': if (!out.picture) out.picture = parseAPIC(d, ver === 2); break;
    }
    p += hdr + size;
  }
  return out;
}

function parseAPIC(d, v22) {
  const enc = d[0];
  let i, mime;
  if (v22) { mime = ascii(d, 1, 3).toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg'; i = 4; }
  else {
    let j = 1;
    while (j < d.length && d[j] !== 0) j++;
    mime = ascii(d, 1, j - 1).toLowerCase() || 'image/jpeg';
    if (!mime.includes('/')) mime = 'image/' + (mime === 'png' ? 'png' : 'jpeg');
    i = j + 1;
  }
  i++; // picture type
  if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; }
  else { while (i < d.length && d[i] !== 0) i++; i++; }
  if (i >= d.length) return null;
  return new Blob([d.slice(i)], { type: mime });
}

// ---------- MP4 / M4A ----------
function parseMP4(b) {
  if (ascii(b, 4, 4) !== 'ftyp') return null;
  const find = (start, end, path) => {
    let p = start;
    while (p + 8 <= end) {
      let size = u32be(b, p);
      const type = ascii(b, p + 4, 4);
      let hdr = 8;
      if (size === 1) { size = u32be(b, p + 12); hdr = 16; } // 64-bit size (assume < 4GB)
      if (size === 0) size = end - p;
      if (size < 8) return null;
      if (type === path[0]) {
        const cStart = p + hdr + (type === 'meta' ? 4 : 0);
        return path.length === 1 ? [cStart, Math.min(p + size, end)] : find(cStart, Math.min(p + size, end), path.slice(1));
      }
      p += size;
    }
    return null;
  };
  const ilst = find(0, b.length, ['moov', 'udta', 'meta', 'ilst']);
  if (!ilst) return {};
  const out = {};
  let p = ilst[0];
  while (p + 8 <= ilst[1]) {
    const size = u32be(b, p);
    if (size < 8) break;
    const key = ascii(b, p + 4, 4);
    const dp = p + 8; // expect 'data' atom
    if (ascii(b, dp + 4, 4) === 'data') {
      const dsize = u32be(b, dp);
      const type = u32be(b, dp + 8) & 0xffffff;
      const val = b.subarray(dp + 16, dp + dsize);
      const str = () => clean(utf8.decode(val));
      switch (key) {
        case '\xa9nam': out.title = str(); break;
        case '\xa9ART': out.artist = str(); break;
        case 'aART': out.albumArtist = str(); break;
        case '\xa9alb': out.album = str(); break;
        case '\xa9day': out.year = parseInt(str(), 10) || 0; break;
        case '\xa9gen': out.genre = str(); break;
        case 'trkn': out.track = (val[2] << 8) | val[3]; break;
        case 'covr': out.picture = new Blob([val.slice()], { type: type === 14 ? 'image/png' : 'image/jpeg' }); break;
      }
    }
    p += size;
  }
  return out;
}

// ---------- FLAC ----------
function parseFLAC(b) {
  if (ascii(b, 0, 4) !== 'fLaC') return null;
  const out = {};
  let p = 4;
  for (;;) {
    if (p + 4 > b.length) break;
    const last = b[p] & 0x80;
    const type = b[p] & 0x7f;
    const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    const s = p + 4;
    if (type === 4) {
      let q = s + 4 + u32le(b, s);
      const n = u32le(b, q); q += 4;
      for (let i = 0; i < n && q < s + len; i++) {
        const l = u32le(b, q); q += 4;
        const kv = utf8.decode(b.subarray(q, q + l)); q += l;
        const eq = kv.indexOf('=');
        const k = kv.slice(0, eq).toUpperCase();
        const v = kv.slice(eq + 1).trim();
        if (k === 'TITLE') out.title = v;
        else if (k === 'ARTIST' && !out.artist) out.artist = v;
        else if (k === 'ALBUMARTIST') out.albumArtist = v;
        else if (k === 'ALBUM') out.album = v;
        else if (k === 'TRACKNUMBER') out.track = parseInt(v, 10) || 0;
        else if (k === 'DATE') out.year = parseInt(v, 10) || 0;
        else if (k === 'GENRE') out.genre = v;
      }
    } else if (type === 6 && !out.picture) {
      let q = s + 4;
      const ml = u32be(b, q); q += 4;
      const mime = ascii(b, q, ml) || 'image/jpeg'; q += ml;
      q += 4 + u32be(b, q); // description
      q += 16; // width, height, depth, colors
      const dl = u32be(b, q); q += 4;
      out.picture = new Blob([b.slice(q, q + dl)], { type: mime });
    }
    p = s + len;
    if (last) break;
  }
  return out;
}

export function fromFilename(name) {
  let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  base = base.replace(/^\d{1,3}[\s.\-]+/, '');
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { title: base };
}

export async function readTags(buf, filename) {
  const b = new Uint8Array(buf);
  let tags = null;
  try { tags = parseID3(b) || parseMP4(b) || parseFLAC(b); } catch (e) { console.warn('tag parse failed', filename, e); }
  const fb = fromFilename(filename);
  tags = tags || {};
  return {
    title: tags.title || fb.title || 'Untitled',
    artist: tags.artist || tags.albumArtist || fb.artist || 'Unknown Artist',
    albumArtist: tags.albumArtist || '',
    album: tags.album || '',
    track: tags.track || 0,
    year: tags.year || 0,
    genre: tags.genre || '',
    picture: tags.picture && tags.picture.size > 100 ? tags.picture : null,
  };
}

export function probeDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    const finish = (d) => { a.removeAttribute('src'); a.load(); resolve(d); };
    const t = setTimeout(() => finish(0), 8000);
    a.onloadedmetadata = () => { clearTimeout(t); finish(isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => { clearTimeout(t); finish(-1); };
    a.src = url;
  });
}

// Pick a vivid-but-dark background color from album art.
export async function dominantColor(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 32, 32);
    URL.revokeObjectURL(url);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, bl = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = max ? (max - min) / max : 0;
      const weight = 0.05 + sat * sat * (max / 255);
      r += d[i] * weight; g += d[i + 1] * weight; bl += d[i + 2] * weight; w += weight;
    }
    return normalize([r / w, g / w, bl / w]);
  } catch {
    return null;
  }
}

// Keep colors in a range that reads well behind white text.
function normalize([r, g, b]) {
  const max = Math.max(r, g, b) || 1;
  const target = Math.min(Math.max(max, 110), 180);
  const k = target / max;
  return [r, g, b].map((v) => Math.round(v * k)).join(',');
}

export function hashColor(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hue = h % 360;
  // HSL -> RGB (s=55%, l=42%)
  const s = 0.55, l = 0.42;
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `${f(0)},${f(8)},${f(4)}`;
}

// ---------- palette (for the Now Playing background) ----------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
// Pull a color into a range that looks rich behind white text.
function tone([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, s < 0.08 ? s : Math.min(1, s * 1.15 + 0.05), Math.min(0.52, Math.max(0.22, l))).join(',');
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Returns { colors: ['r,g,b', ...3-4], light: bool } describing a cover's standout colors.
export async function extractPalette(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    const S = 48;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    URL.revokeObjectURL(url);
    const d = ctx.getImageData(0, 0, S, S).data;
    const bins = new Map();
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      bin.n++; bin.r += r; bin.g += g; bin.b += b;
      bins.set(key, bin);
    }
    const cands = [...bins.values()].map((bin) => {
      const rgb = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
      const max = Math.max(...rgb), min = Math.min(...rgb);
      const sat = max ? (max - min) / max : 0;
      const v = max / 255;
      return { rgb, score: bin.n * (0.3 + sat * 1.6) * (v < 0.1 ? 0.15 : v > 0.95 && sat < 0.1 ? 0.4 : 1) };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const cand of cands) {
      if (picked.every((p) => dist(p, cand.rgb) > 70)) picked.push(cand.rgb);
      if (picked.length === 4) break;
    }
    if (!picked.length) return null;
    // Single-color covers: derive neighbors by rotating the hue.
    while (picked.length < 3) {
      const [h, s, l] = rgbToHsl(...picked[0]);
      picked.push(hslToRgb((h + (picked.length === 1 ? 35 : -40) + 360) % 360, Math.max(s, 0.35), l));
    }
    return { colors: picked.map(tone), light: lum / (S * S) > 165 };
  } catch {
    return null;
  }
}

// Palette for songs without a cover, derived from a name.
export function seedPalette(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hue = h % 360;
  return { colors: [0, 40, -45, 180].map((o) => hslToRgb((hue + o + 360) % 360, 0.55, 0.38).join(',')), light: false };
}
