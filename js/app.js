import * as db from './db.js';
import { icon, hydrateIcons } from './icons.js';
import { readTags, probeDuration, dominantColor, hashColor } from './meta.js';
import { Player } from './player.js';

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isMobile = () => matchMedia('(max-width: 899px)').matches;
const coarse = () => matchMedia('(pointer: coarse)').matches;

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtLong(sec) {
  const m = Math.round(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)} hr ${m % 60} min`;
  if (m >= 1) return `${m} min`;
  return `${Math.round(sec)} sec`;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('encore:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('encore:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- state
const S = {
  tracks: new Map(),
  playlists: [],
  liked: [], // newest first
  likedSet: new Set(),
  recent: [], // [{type,id}] newest first
  albums: new Map(),
  artists: new Map(),
  genres: new Map(),
  query: '',
  libFilter: store.get('libFilter', 'all'),
  page: null,
  importing: false,
};

const audio = $('#audio');
const player = new Player(audio, {
  getBlob: (id) => db.get('audio', id),
  getTrack: (id) => S.tracks.get(id),
  getArtUrl: (k) => artUrl(k),
});

const albumKeyOf = (t) => `${(t.albumArtist || t.artist || '').toLowerCase()}|${(t.album || '').toLowerCase()}`;
const artistKeyOf = (name) => (name || '').toLowerCase();

function rebuildIndex() {
  S.albums.clear(); S.artists.clear(); S.genres.clear();
  for (const t of S.tracks.values()) {
    if (t.album) {
      let a = S.albums.get(t.albumKey);
      if (!a) S.albums.set(t.albumKey, (a = { key: t.albumKey, name: t.album, artist: t.albumArtist || t.artist, tracks: [], artKey: null, color: null, year: 0, addedAt: 0 }));
      a.tracks.push(t.id);
      if (!a.artKey && t.artKey) { a.artKey = t.artKey; a.color = t.color; }
      a.color ||= t.color;
      a.year ||= t.year;
      a.addedAt = Math.max(a.addedAt, t.addedAt);
    }
    const ak = artistKeyOf(t.artist);
    let ar = S.artists.get(ak);
    if (!ar) S.artists.set(ak, (ar = { key: ak, name: t.artist, tracks: [], albums: new Set(), artKey: null, color: null, addedAt: 0 }));
    ar.tracks.push(t.id);
    if (t.album) ar.albums.add(t.albumKey);
    if (!ar.artKey && t.artKey) { ar.artKey = t.artKey; ar.color = t.color; }
    ar.color ||= t.color;
    ar.addedAt = Math.max(ar.addedAt, t.addedAt);
    if (t.genre) {
      const gk = t.genre.toLowerCase();
      let g = S.genres.get(gk);
      if (!g) S.genres.set(gk, (g = { key: gk, name: t.genre, tracks: [], artKey: null, color: hashColor('genre' + gk) }));
      g.tracks.push(t.id);
      g.artKey ||= t.artKey;
    }
  }
  const byTrackNo = (a, b) => (S.tracks.get(a).track || 999) - (S.tracks.get(b).track || 999) || S.tracks.get(a).title.localeCompare(S.tracks.get(b).title);
  for (const a of S.albums.values()) a.tracks.sort(byTrackNo);
  for (const ar of S.artists.values()) ar.tracks.sort((a, b) => (S.tracks.get(b).plays || 0) - (S.tracks.get(a).plays || 0) || byTrackNo(a, b));
}

const allSongs = () => [...S.tracks.values()].sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title)).map((t) => t.id);
const exists = (id) => S.tracks.has(id);

function collection(kind, id) {
  switch (kind) {
    case 'album': { const a = S.albums.get(id); return a && { ids: a.tracks, name: a.name }; }
    case 'artist': { const a = S.artists.get(id); return a && { ids: a.tracks, name: a.name }; }
    case 'genre': { const g = S.genres.get(id); return g && { ids: g.tracks, name: g.name }; }
    case 'playlist': { const p = S.playlists.find((x) => x.id === id); return p && { ids: p.trackIds.filter(exists), name: p.name }; }
    case 'liked': return { ids: S.liked.filter(exists), name: 'Liked Songs' };
    case 'songs': return { ids: allSongs(), name: 'All Songs' };
  }
  return null;
}
const hrefFor = (kind, id) => (kind === 'liked' || kind === 'songs' ? `#/${kind}` : `#/${kind}/${enc(id)}`);

// ---------------------------------------------------------------- persistence
async function loadAll() {
  const [tracks, playlists, liked, recent] = await Promise.all([
    db.getAll('tracks'), db.getAll('playlists'), db.get('kv', 'liked'), db.get('kv', 'recent'),
  ]);
  tracks.forEach((t) => S.tracks.set(t.id, t));
  S.playlists = playlists.sort((a, b) => b.createdAt - a.createdAt);
  S.liked = (liked || []).filter(exists);
  S.likedSet = new Set(S.liked);
  S.recent = recent || [];
  rebuildIndex();
}
const saveLiked = () => db.put('kv', S.liked, 'liked');
const savePlaylist = (p) => db.put('playlists', p);
const saveRecent = () => db.put('kv', S.recent.slice(0, 20), 'recent');
const savePlayer = () => store.set('player', player.snapshot());

// ---------------------------------------------------------------- art
const artCache = new Map();
function artUrl(key) {
  if (!key) return Promise.resolve(null);
  if (!artCache.has(key)) artCache.set(key, db.get('art', key).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  return artCache.get(key);
}
function art(key, seed = '', cls = '') {
  return `<div class="art ${cls}" style="--seed:${hashColor(seed || 'x')}"${key ? ` data-art="${esc(key)}"` : ''}>${icon('note', 'ph')}</div>`;
}
const likedArt = (cls = '') => `<div class="art liked-art ${cls}">${icon('heart-f')}</div>`;
const songsArt = (cls = '') => `<div class="art songs-art ${cls}">${icon('note')}</div>`;
function playlistArt(p, cls = '') {
  const keys = [...new Set(p.trackIds.filter(exists).map((id) => S.tracks.get(id).artKey).filter(Boolean))];
  if (keys.length >= 4) return `<div class="art mosaic ${cls}">${keys.slice(0, 4).map((k) => art(k)).join('')}</div>`;
  if (keys.length) return art(keys[0], p.name, cls);
  return `<div class="art pl-art ${cls}" style="--seed:${hashColor(p.name)}">${icon('note')}</div>`;
}
function hydrateArt(root) {
  root.querySelectorAll('[data-art]:not([data-loaded])').forEach(async (el) => {
    el.dataset.loaded = '1';
    const url = await artUrl(el.dataset.art);
    if (url) { el.insertAdjacentHTML('beforeend', `<img src="${url}" alt="" decoding="async">`); el.classList.add('has-img'); }
  });
}
new MutationObserver(() => { hydrateArt(document.body); hydrateIcons(document.body); })
  .observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------- import
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|mp4|wav|flac|ogg|oga|opus|webm|aif|aiff|caf)$/i;
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf' };

async function addTrack(m, albumArt) {
  const id = uid();
  const t = {
    id, title: m.title, artist: m.artist, albumArtist: m.albumArtist || '', album: m.album || '',
    track: m.track || 0, year: m.year || 0, genre: m.genre || '', duration: m.duration || 0,
    artKey: null, color: null, addedAt: Date.now(), plays: 0, lastPlayed: 0, sourceKey: m.sourceKey, size: m.blob.size,
  };
  t.albumKey = albumKeyOf(t);
  const shared = t.album ? albumArt.get(t.albumKey) : null;
  if (shared) Object.assign(t, shared);
  else if (m.picture) {
    t.artKey = t.album ? t.albumKey : 't:' + id;
    await db.put('art', m.picture, t.artKey);
    artCache.delete(t.artKey);
    t.color = await dominantColor(m.picture);
    if (t.album) albumArt.set(t.albumKey, { artKey: t.artKey, color: t.color });
  }
  t.color ||= hashColor(t.album || t.title);
  await db.put('audio', m.blob, id);
  await db.put('tracks', t);
  S.tracks.set(id, t);
  return t;
}

function albumArtMap() {
  const m = new Map();
  for (const t of S.tracks.values()) if (t.album && t.artKey && !m.has(t.albumKey)) m.set(t.albumKey, { artKey: t.artKey, color: t.color });
  return m;
}

async function importFiles(list) {
  if (S.importing) return toast('Already importing — hang tight');
  const files = [...list].filter((f) => AUDIO_EXT.test(f.name) || (f.type || '').startsWith('audio/'));
  if (!files.length) return toast('No audio files found');
  S.importing = true;
  navigator.storage?.persist?.().catch(() => {});
  const seen = new Set([...S.tracks.values()].map((t) => t.sourceKey));
  const albumArt = albumArtMap();
  let added = 0, dupes = 0, bad = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progressToast(`Adding ${i + 1} of ${files.length}`, (i + 1) / files.length);
    const sourceKey = `${f.name}|${f.size}`;
    if (seen.has(sourceKey)) { dupes++; continue; }
    try {
      const buf = await f.arrayBuffer();
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const blob = new Blob([buf], { type: f.type || MIME[ext] || 'audio/mpeg' });
      const tags = await readTags(buf, f.name);
      const url = URL.createObjectURL(blob);
      const duration = await probeDuration(url);
      URL.revokeObjectURL(url);
      if (duration < 0) { bad++; continue; }
      await addTrack({ ...tags, blob, duration, sourceKey }, albumArt);
      seen.add(sourceKey);
      added++;
    } catch (e) {
      console.error(e);
      bad++;
      if (e && e.name === 'QuotaExceededError') { toast('Out of storage space on this device'); break; }
    }
  }
  S.importing = false;
  rebuildIndex();
  refresh();
  const parts = [`Added ${plural(added, 'song')}`];
  if (dupes) parts.push(`${dupes} already in library`);
  if (bad) parts.push(`${bad} couldn't be played here`);
  toast(parts.join(' · '));
}

async function loadDemo() {
  if (S.importing) return;
  S.importing = true;
  try {
    const { generateDemo } = await import('./demo.js');
    const seen = new Set([...S.tracks.values()].map((t) => t.sourceKey));
    const albumArt = albumArtMap();
    let i = 0;
    progressToast('Creating demo songs…', 0.05);
    for await (const m of generateDemo()) {
      i++;
      progressToast(`Creating demo songs… ${i}/${m.total}`, i / m.total);
      if (!seen.has(m.sourceKey)) await addTrack(m, albumArt);
    }
    rebuildIndex();
    refresh();
    toast('Demo songs added — hit play!');
  } catch (e) {
    console.error(e);
    toast('Could not create demo songs in this browser');
  } finally {
    S.importing = false;
  }
}

async function deleteTracks(ids) {
  for (const id of ids) {
    const t = S.tracks.get(id);
    if (!t) continue;
    player.purge(id);
    S.tracks.delete(id);
    await db.del('tracks', id);
    await db.del('audio', id);
    if (t.artKey && ![...S.tracks.values()].some((x) => x.artKey === t.artKey)) { await db.del('art', t.artKey); artCache.delete(t.artKey); }
  }
  S.liked = S.liked.filter(exists); S.likedSet = new Set(S.liked); saveLiked();
  for (const p of S.playlists) { const before = p.trackIds.length; p.trackIds = p.trackIds.filter(exists); if (p.trackIds.length !== before) savePlaylist(p); }
  rebuildIndex();
  refresh();
}

// ---------------------------------------------------------------- actions
function toggleLike(id) {
  if (!id) return;
  if (S.likedSet.has(id)) { S.liked = S.liked.filter((x) => x !== id); S.likedSet.delete(id); toast('Removed from Liked Songs'); }
  else { S.liked.unshift(id); S.likedSet.add(id); toast('Added to Liked Songs'); }
  saveLiked();
  updateLikes();
  if (S.page?.kind === 'liked') refresh();
  renderSideLib();
}

async function newPlaylist(trackIds = []) {
  const name = await promptDialog({ title: 'Create playlist', value: `My Playlist #${S.playlists.length + 1}`, confirm: 'Create' });
  if (!name) return null;
  const p = { id: uid(), name, trackIds: [...trackIds], createdAt: Date.now(), updatedAt: Date.now() };
  S.playlists.unshift(p);
  await savePlaylist(p);
  renderSideLib();
  if (trackIds.length) toast(`Added to ${name}`);
  location.hash = `#/playlist/${p.id}`;
  return p;
}

function addToPlaylist(p, ids) {
  const fresh = ids.filter((id) => !p.trackIds.includes(id));
  if (!fresh.length) return toast(`Already in ${p.name}`);
  p.trackIds.push(...fresh);
  p.updatedAt = Date.now();
  savePlaylist(p);
  toast(`Added to ${p.name}`);
  renderSideLib();
  if (S.page?.kind === 'playlist' && S.page.id === p.id) refresh();
}

async function renamePlaylist(p) {
  const name = await promptDialog({ title: 'Rename playlist', value: p.name, confirm: 'Save' });
  if (!name) return;
  p.name = name;
  savePlaylist(p);
  refresh();
}

async function deletePlaylist(p) {
  const ok = await confirmDialog({ title: `Delete “${p.name}”?`, message: 'This removes the playlist. Your songs stay in your library.', confirm: 'Delete' });
  if (!ok) return;
  S.playlists = S.playlists.filter((x) => x !== p);
  await db.del('playlists', p.id);
  toast('Playlist deleted');
  location.hash = '#/library';
  renderSideLib();
}

function playCollection(kind, id, start = 0) {
  const c = collection(kind, id);
  if (!c || !c.ids.length) return toast('Nothing to play yet');
  const ctx = player.context;
  if (ctx && ctx.type === kind && ctx.id === id && start === 0 && player.current) { player.toggle(); return; }
  player.playList(c.ids, player.shuffle && start === 0 ? -1 : start, { type: kind, id, name: c.name });
}

function noteRecent(ctx) {
  if (!ctx || ctx.type === 'queue') return;
  S.recent = [ctx, ...S.recent.filter((r) => !(r.type === ctx.type && r.id === ctx.id))].slice(0, 20);
  saveRecent();
}

// ---------------------------------------------------------------- rendering pieces
function card({ kind, id, title, sub, artHtml, round = false }) {
  return `<div class="card${round ? ' round' : ''}" data-action="nav" data-href="${hrefFor(kind, id)}" role="link" tabindex="0">
    <div class="card-art">${artHtml}<button class="fab" data-action="play-collection" data-kind="${kind}" data-id="${esc(id ?? '')}" aria-label="Play ${esc(title)}">${icon('play')}</button></div>
    <div class="card-title">${esc(title)}</div>
    <div class="card-sub">${esc(sub)}</div>
  </div>`;
}
const albumCard = (a) => card({ kind: 'album', id: a.key, title: a.name, sub: `${a.year ? a.year + ' • ' : ''}${a.artist}`, artHtml: art(a.artKey, a.name) });
const artistCard = (a) => card({ kind: 'artist', id: a.key, title: a.name, sub: 'Artist', artHtml: art(a.artKey, a.name, 'round'), round: true });
const playlistCard = (p) => card({ kind: 'playlist', id: p.id, title: p.name, sub: `Playlist • ${plural(p.trackIds.filter(exists).length, 'song')}`, artHtml: playlistArt(p) });

function shelf(title, items, href) {
  if (!items.length) return '';
  return `<section class="shelf"><header><h2>${href ? `<span class="link" data-action="nav" data-href="${href}">${esc(title)}</span>` : esc(title)}</h2>${href ? `<span class="link muted small" data-action="nav" data-href="${href}">Show all</span>` : ''}</header><div class="shelf-row">${items.join('')}</div></section>`;
}

function recentItem(r) {
  if (r.type === 'album') { const a = S.albums.get(r.id); return a && { ...r, title: a.name, sub: a.artist, artHtml: art(a.artKey, a.name) }; }
  if (r.type === 'artist') { const a = S.artists.get(r.id); return a && { ...r, title: a.name, sub: 'Artist', artHtml: art(a.artKey, a.name, 'round'), round: true }; }
  if (r.type === 'playlist') { const p = S.playlists.find((x) => x.id === r.id); return p && { ...r, title: p.name, sub: 'Playlist', artHtml: playlistArt(p) }; }
  if (r.type === 'genre') { const g = S.genres.get(r.id); return g && { ...r, title: g.name, sub: 'Genre', artHtml: art(g.artKey, g.name) }; }
  if (r.type === 'liked') return { ...r, title: 'Liked Songs', sub: 'Playlist', artHtml: likedArt() };
  if (r.type === 'songs') return { ...r, title: 'All Songs', sub: 'Your library', artHtml: songsArt() };
  return null;
}

function tile(it) {
  return `<div class="tile" data-action="nav" data-href="${hrefFor(it.type, it.id)}" role="link" tabindex="0">
    ${it.artHtml}<span>${esc(it.title)}</span>
    <button class="fab sm" data-action="play-collection" data-kind="${it.type}" data-id="${esc(it.id ?? '')}" aria-label="Play">${icon('play')}</button>
  </div>`;
}

function trackRow(t, i, o) {
  const liked = S.likedSet.has(t.id);
  return `<div class="row" data-action="${o.action || 'play-row'}" data-index="${i}" data-id="${t.id}"${o.qi != null ? ` data-qi="${o.qi}"` : ''}>
    <div class="row-num"><span class="n">${o.numbers === false ? '' : (o.num ?? i + 1)}</span><span class="eq"><i></i><i></i><i></i></span>${icon('play', 'rp')}</div>
    ${o.showArt ? art(t.artKey, t.album || t.title, 'sm') : ''}
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${liked ? `<span class="liked-dot">${icon('heart-f')}</span>` : ''}<span class="link" data-action="nav" data-href="#/artist/${enc(artistKeyOf(t.artist))}">${esc(t.artist)}</span></div></div>
    ${o.showAlbum ? `<div class="row-album">${t.album ? `<span class="link" data-action="nav" data-href="#/album/${enc(t.albumKey)}">${esc(t.album)}</span>` : ''}</div>` : ''}
    <button class="icon-btn row-like${liked ? ' on' : ''}" data-action="like" data-id="${t.id}" aria-label="${liked ? 'Remove from' : 'Save to'} Liked Songs">${icon(liked ? 'heart-f' : 'heart')}</button>
    <div class="row-dur">${fmt(t.duration)}</div>
    <button class="icon-btn row-more" data-action="track-menu" data-id="${t.id}"${o.qi != null ? ` data-qi="${o.qi}"` : ''} aria-label="More options">${icon('more')}</button>
  </div>`;
}

function tracklist(ids, o = {}) {
  const opts = { showArt: true, showAlbum: true, ...o };
  const cls = `tracklist${opts.showArt ? ' with-art' : ''}${opts.showAlbum ? ' with-album' : ''}`;
  const head = o.noHead ? '' : `<div class="tl-head"><span>#</span>${opts.showArt ? '<span></span>' : ''}<span>Title</span>${opts.showAlbum ? '<span>Album</span>' : ''}<span></span><span class="r">${icon('clock')}</span><span></span></div>`;
  return `<div class="${cls}">${head}${ids.map((id, i) => trackRow(S.tracks.get(id), i, opts)).join('')}</div>`;
}

function hero({ type, title, meta, artHtml, round }) {
  const size = title.length > 28 ? 'xl' : title.length > 14 ? 'lg' : '';
  return `<section class="hero${round ? ' round' : ''}">
    <div class="hero-art">${artHtml}</div>
    <div class="hero-text"><div class="hero-type">${esc(type)}</div><h1 class="hero-title ${size}">${esc(title)}</h1><div class="hero-meta">${meta}</div></div>
  </section>`;
}

function actions(kind, id, extra = '') {
  return `<div class="actions">
    <button class="big-play" data-action="play-collection" data-kind="${kind}" data-id="${esc(id ?? '')}" aria-label="Play">${icon('play')}</button>
    <button class="icon-btn toggle big${player.shuffle ? ' on' : ''}" data-action="shuffle" aria-label="Shuffle">${icon('shuffle')}</button>
    ${extra}
  </div>`;
}

function totalMeta(ids) {
  const d = ids.reduce((s, id) => s + (S.tracks.get(id)?.duration || 0), 0);
  return `${plural(ids.length, 'song')}${d ? `, <span class="muted">${fmtLong(d)}</span>` : ''}`;
}

function emptyState(iconName, title, text, btn = '') {
  return `<div class="empty">${icon(iconName)}<h2>${esc(title)}</h2><p>${esc(text)}</p>${btn}</div>`;
}

// ---------------------------------------------------------------- views
const VIEWS = {
  home() {
    if (!S.tracks.size) {
      return {
        color: '30,160,90',
        html: `<section class="welcome">
          <div class="welcome-glow"></div>
          <div class="welcome-badge">${icon('check-circle')} Zero ads. Forever.</div>
          <h1>Your music.<br><span class="grad">No interruptions.</span></h1>
          <p>Add songs from your phone or Mac and they’re saved right here on this device — playable offline, with lock-screen controls, playlists, shuffle and more.</p>
          <div class="welcome-actions">
            <button class="cta" data-action="add-files">${icon('upload')} Add your music</button>
            <button class="pill-btn outline" data-action="demo">${icon('sparkle')} Try demo songs</button>
          </div>
          <div class="welcome-tips">
            <div>${icon('upload')}<b>Drag & drop</b><span>Drop files or whole folders onto the window on your Mac.</span></div>
            <div>${icon('download')}<b>Install it</b><span>iPhone: Share → Add to Home Screen. Mac: File → Add to Dock.</span></div>
            <div>${icon('heart')}<b>Make it yours</b><span>Like songs, build playlists and pick up where you left off.</span></div>
          </div>
        </section>`,
      };
    }
    const h = new Date().getHours();
    const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const quick = [];
    if (S.liked.length) quick.push({ type: 'liked', title: 'Liked Songs', artHtml: likedArt() });
    S.recent.forEach((r) => { const it = recentItem(r); if (it && !quick.some((q) => q.type === r.type && q.id === r.id)) quick.push(it); });
    S.playlists.forEach((p) => { if (!quick.some((q) => q.type === 'playlist' && q.id === p.id)) quick.push({ type: 'playlist', id: p.id, title: p.name, artHtml: playlistArt(p) }); });
    [...S.albums.values()].sort((a, b) => b.addedAt - a.addedAt).forEach((a) => { if (!quick.some((q) => q.type === 'album' && q.id === a.key)) quick.push({ type: 'album', id: a.key, title: a.name, artHtml: art(a.artKey, a.name) }); });
    if (quick.length < 8) quick.push({ type: 'songs', title: 'All Songs', artHtml: songsArt() });
    const recentCards = S.recent.map(recentItem).filter(Boolean).map((it) => card({ kind: it.type, id: it.id, title: it.title, sub: it.sub, artHtml: it.artHtml, round: it.round }));
    const albums = [...S.albums.values()].sort((a, b) => b.addedAt - a.addedAt).map(albumCard);
    const artists = [...S.artists.values()].sort((a, b) => b.tracks.length - a.tracks.length).map(artistCard);
    const top = [...S.tracks.values()].filter((t) => t.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5).map((t) => t.id);
    const tail = [...S.tracks.values()].sort((a, b) => b.addedAt - a.addedAt).slice(0, 5).map((t) => t.id);
    const listIds = top.length >= 3 ? top : tail;
    return {
      color: S.recent[0] ? (collectionColor(S.recent[0]) || '40,40,60') : '40,40,60',
      list: { ids: listIds, context: { type: 'songs', name: top.length >= 3 ? 'Your top songs' : 'Recently added' } },
      html: `<h1 class="greeting">${greet}</h1>
        <div class="quick">${quick.slice(0, 8).map(tile).join('')}</div>
        ${shelf('Jump back in', recentCards)}
        <section class="shelf"><header><h2>${top.length >= 3 ? 'Your top songs' : 'Recently added songs'}</h2><span class="link muted small" data-action="nav" data-href="#/songs">Show all</span></header>${tracklist(listIds, { noHead: true, showAlbum: !isMobile() })}</section>
        ${shelf('Your albums', albums, '#/library')}
        ${shelf('Your artists', artists)}
        ${shelf('Your playlists', S.playlists.map(playlistCard))}
        <div class="footer-note">${icon('check-circle')} Ad-free. Your music lives on this device.</div>`,
    };
  },

  search() {
    return {
      color: '18,18,18',
      html: `<div class="search-head"><h1 class="mobile-title">Search</h1>
        <label class="search-box">${icon('search')}<input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="What do you want to listen to?" value="${esc(S.query)}"><button class="icon-btn clear" data-action="clear-search" aria-label="Clear">${icon('x')}</button></label></div>
        <div id="results"></div>`,
      after() { renderResults(); if (!coarse()) $('#q')?.focus(); },
    };
  },

  library() {
    return {
      color: '18,18,18',
      html: `<div class="lib-head"><h1>Your Library</h1><div class="spacer"></div>
        <button class="icon-btn" data-action="add-music" aria-label="Add music">${icon('upload')}</button>
        <button class="icon-btn" data-action="new-playlist" aria-label="Create playlist">${icon('plus')}</button></div>
        ${libChips()}
        <div class="lib-list big">${libItems()}</div>
        <div class="storage" id="storage"></div>`,
      after: showStorage,
    };
  },

  album(key) {
    const a = S.albums.get(key);
    if (!a) return notFound();
    const artist = S.artists.get(artistKeyOf(a.artist));
    return {
      kind: 'album', id: key, color: a.color, title: a.name,
      list: { ids: a.tracks, context: { type: 'album', id: key, name: a.name } },
      html: hero({ type: 'Album', title: a.name, artHtml: art(a.artKey, a.name),
        meta: `${artist ? `<span class="link strong" data-action="nav" data-href="#/artist/${enc(artist.key)}">${esc(a.artist)}</span>` : `<b>${esc(a.artist)}</b>`}${a.year ? ` • ${a.year}` : ''} • ${totalMeta(a.tracks)}` })
        + actions('album', key, `<button class="icon-btn big" data-action="collection-menu" data-kind="album" data-id="${esc(key)}" aria-label="More">${icon('more')}</button>`)
        + tracklist(a.tracks, { showArt: false, showAlbum: false }),
    };
  },

  artist(key) {
    const a = S.artists.get(key);
    if (!a) return notFound();
    const albums = [...a.albums].map((k) => S.albums.get(k)).filter(Boolean).sort((x, y) => (y.year || 0) - (x.year || 0));
    return {
      kind: 'artist', id: key, color: a.color, title: a.name,
      list: { ids: a.tracks, context: { type: 'artist', id: key, name: a.name } },
      html: hero({ type: 'Artist', title: a.name, artHtml: art(a.artKey, a.name, 'round'), round: true, meta: `${plural(a.tracks.length, 'song')} • ${plural(albums.length, 'album')}` })
        + actions('artist', key)
        + `<h2 class="section-title">Songs</h2>` + tracklist(a.tracks, { noHead: true, showAlbum: !isMobile() })
        + shelf('Albums', albums.map(albumCard)),
    };
  },

  genre(key) {
    const g = S.genres.get(key);
    if (!g) return notFound();
    return {
      kind: 'genre', id: key, color: g.color, title: g.name,
      list: { ids: g.tracks, context: { type: 'genre', id: key, name: g.name } },
      html: hero({ type: 'Genre', title: g.name, artHtml: art(g.artKey, g.name), meta: totalMeta(g.tracks) }) + actions('genre', key) + tracklist(g.tracks),
    };
  },

  playlist(id) {
    const p = S.playlists.find((x) => x.id === id);
    if (!p) return notFound();
    const ids = p.trackIds.filter(exists);
    return {
      kind: 'playlist', id, color: hashColor(p.name), title: p.name,
      list: { ids, context: { type: 'playlist', id, name: p.name } },
      html: hero({ type: 'Playlist', title: p.name, artHtml: playlistArt(p), meta: `<b>You</b> • ${totalMeta(ids)}` })
        + actions('playlist', id, `<button class="icon-btn big" data-action="collection-menu" data-kind="playlist" data-id="${esc(id)}" aria-label="More">${icon('more')}</button>`)
        + (ids.length ? tracklist(ids, { inPlaylist: id })
          : emptyState('note', 'Let’s find something for your playlist', 'Tap ••• on any song and choose “Add to playlist”.', `<button class="pill-btn light" data-action="nav" data-href="#/songs">Browse your songs</button>`)),
    };
  },

  liked() {
    const ids = S.liked.filter(exists);
    return {
      kind: 'liked', color: '80,56,160', title: 'Liked Songs',
      list: { ids, context: { type: 'liked', name: 'Liked Songs' } },
      html: hero({ type: 'Playlist', title: 'Liked Songs', artHtml: likedArt(), meta: `<b>You</b> • ${totalMeta(ids)}` })
        + actions('liked')
        + (ids.length ? tracklist(ids) : emptyState('heart', 'Songs you like will appear here', 'Save songs by tapping the heart icon.')),
    };
  },

  songs() {
    const ids = allSongs();
    return {
      kind: 'songs', color: '32,110,90', title: 'All Songs',
      list: { ids, context: { type: 'songs', name: 'All Songs' } },
      html: hero({ type: 'Library', title: 'All Songs', artHtml: songsArt(), meta: totalMeta(ids) })
        + actions('songs')
        + (ids.length ? tracklist(ids) : emptyState('note', 'No songs yet', 'Add music to start listening.', `<button class="pill-btn light" data-action="add-files">Add music</button>`)),
    };
  },

  queue() {
    const cur = player.current && S.tracks.get(player.current);
    const next = player.queue.slice(player.index + 1).map((id, i) => ({ id, qi: player.index + 1 + i })).filter((x) => exists(x.id));
    const ctxName = player.context?.name;
    return {
      color: cur?.color || '40,40,60', title: 'Queue',
      html: `<h1 class="page-title">Queue</h1>
        ${cur ? `<h2 class="section-title">Now playing</h2><div class="tracklist with-art">${trackRow(cur, 0, { showArt: true, numbers: false, action: 'noop' })}</div>` : emptyState('queue', 'Your queue is empty', 'Play something and it will show up here.')}
        ${next.length ? `<h2 class="section-title">Next${ctxName ? ` from: <span class="link" data-action="nav" data-href="${hrefFor(player.context.type, player.context.id)}">${esc(ctxName)}</span>` : ' up'}</h2>
          <div class="tracklist with-art">${next.map((x, i) => trackRow(S.tracks.get(x.id), i, { showArt: true, action: 'queue-jump', qi: x.qi })).join('')}</div>` : ''}`,
    };
  },
};

function notFound() {
  return { color: '40,40,40', html: emptyState('disc', 'Couldn’t find that', 'It may have been removed from your library.', `<button class="pill-btn light" data-action="nav" data-href="#/home">Go home</button>`) };
}

function collectionColor(r) {
  if (r.type === 'album') return S.albums.get(r.id)?.color;
  if (r.type === 'artist') return S.artists.get(r.id)?.color;
  if (r.type === 'playlist') { const p = S.playlists.find((x) => x.id === r.id); return p && hashColor(p.name); }
  if (r.type === 'liked') return '80,56,160';
  return null;
}

// Library list (used on the Library page and in the desktop sidebar)
function libChips() {
  const chip = (k, label) => `<button class="chip${S.libFilter === k ? ' on' : ''}" data-action="lib-filter" data-filter="${k}">${S.libFilter === k && k !== 'all' ? icon('x') : ''}${label}</button>`;
  return `<div class="chips">${chip('playlists', 'Playlists')}${chip('albums', 'Albums')}${chip('artists', 'Artists')}</div>`;
}
function libItems() {
  const f = S.libFilter;
  const items = [];
  const item = (href, artHtml, title, sub, active, pin) => `<div class="lib-item${active ? ' active' : ''}" data-action="nav" data-href="${href}" role="link" tabindex="0">${artHtml}<div class="lib-text"><div class="lib-title">${esc(title)}</div><div class="lib-sub">${pin ? `<span class="pin">${icon('check-circle')}</span>` : ''}${esc(sub)}</div></div></div>`;
  const r = parseRoute();
  const on = (name, arg) => r.name === name && (arg == null || r.arg === arg);
  if (f === 'all' || f === 'playlists') {
    items.push(item('#/liked', likedArt('sm'), 'Liked Songs', `Playlist • ${plural(S.liked.filter(exists).length, 'song')}`, on('liked'), true));
    items.push(item('#/songs', songsArt('sm'), 'All Songs', `Library • ${plural(S.tracks.size, 'song')}`, on('songs'), true));
    S.playlists.forEach((p) => items.push(item(`#/playlist/${p.id}`, playlistArt(p, 'sm'), p.name, `Playlist • ${plural(p.trackIds.filter(exists).length, 'song')}`, on('playlist', p.id))));
  }
  if (f === 'all' || f === 'albums') [...S.albums.values()].sort((a, b) => b.addedAt - a.addedAt).forEach((a) => items.push(item(`#/album/${enc(a.key)}`, art(a.artKey, a.name, 'sm'), a.name, `Album • ${a.artist}`, on('album', a.key))));
  if (f === 'all' || f === 'artists') [...S.artists.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => items.push(item(`#/artist/${enc(a.key)}`, art(a.artKey, a.name, 'sm round'), a.name, 'Artist', on('artist', a.key))));
  if (!S.tracks.size) items.push(`<div class="lib-empty"><b>Build your library</b><p>Add songs from your device — they stay here, ad-free.</p><button class="pill-btn light" data-action="add-files">Add music</button> <button class="pill-btn outline" data-action="demo">Try demo</button></div>`);
  return items.join('');
}
function renderSideLib() {
  const el = $('#sideLib');
  el.innerHTML = libChips() + `<div class="lib-list">${libItems()}</div>`;
}

async function showStorage() {
  const el = $('#storage');
  if (!el) return;
  const bytes = [...S.tracks.values()].reduce((s, t) => s + (t.size || 0), 0);
  let quota = '';
  try { const est = await navigator.storage.estimate(); if (est.quota) quota = ` of ${(est.quota / 1e9).toFixed(1)} GB available`; } catch { /* unsupported */ }
  el.innerHTML = `${icon('check-circle')} ${plural(S.tracks.size, 'song')} · ${(bytes / 1e6).toFixed(1)} MB stored on this device${quota}`;
}

function renderResults() {
  const el = $('#results');
  if (!el) return;
  const q = S.query.trim().toLowerCase();
  if (!q) {
    const tiles = [];
    const bt = (href, title, color, artHtml) => `<div class="browse" data-action="nav" data-href="${href}" style="--c:${color}" role="link" tabindex="0"><span>${esc(title)}</span>${artHtml}</div>`;
    tiles.push(bt('#/liked', 'Liked Songs', '80,56,160', likedArt()));
    tiles.push(bt('#/songs', 'All Songs', '32,110,90', songsArt()));
    S.genres.forEach((g) => tiles.push(bt(`#/genre/${enc(g.key)}`, g.name, g.color, art(g.artKey, g.name))));
    S.albums.forEach((a) => tiles.push(bt(`#/album/${enc(a.key)}`, a.name, a.color || hashColor(a.name), art(a.artKey, a.name))));
    S.artists.forEach((a) => tiles.push(bt(`#/artist/${enc(a.key)}`, a.name, a.color || hashColor(a.name), art(a.artKey, a.name, 'round'))));
    el.innerHTML = `<h2 class="section-title">Browse all</h2><div class="browse-grid">${tiles.join('')}</div>`;
    S.page.list = null;
    return;
  }
  const words = q.split(/\s+/);
  const match = (s) => words.every((w) => s.includes(w));
  const songs = [...S.tracks.values()].filter((t) => match(`${t.title} ${t.artist} ${t.album}`.toLowerCase()));
  songs.sort((a, b) => (b.title.toLowerCase().startsWith(q) - a.title.toLowerCase().startsWith(q)) || (b.plays || 0) - (a.plays || 0));
  const albums = [...S.albums.values()].filter((a) => match(`${a.name} ${a.artist}`.toLowerCase()));
  const artists = [...S.artists.values()].filter((a) => match(a.name.toLowerCase()));
  const playlists = S.playlists.filter((p) => match(p.name.toLowerCase()));
  if (!songs.length && !albums.length && !artists.length && !playlists.length) {
    el.innerHTML = emptyState('search', `No results found for “${S.query.trim()}”`, 'Check the spelling, or try fewer or different keywords.');
    S.page.list = null;
    return;
  }
  let topHtml = '';
  const exact = artists.find((a) => a.name.toLowerCase() === q) || artists[0];
  const top = exact && (exact.name.toLowerCase().startsWith(q) || !songs.length)
    ? { kind: 'artist', id: exact.key, title: exact.name, sub: 'Artist', artHtml: art(exact.artKey, exact.name, 'round') }
    : albums[0] && (albums[0].name.toLowerCase().startsWith(q) || !songs.length)
      ? { kind: 'album', id: albums[0].key, title: albums[0].name, sub: `Album • ${albums[0].artist}`, artHtml: art(albums[0].artKey, albums[0].name) }
      : songs[0] && { kind: 'album', id: songs[0].albumKey, song: songs[0], title: songs[0].title, sub: `Song • ${songs[0].artist}`, artHtml: art(songs[0].artKey, songs[0].album || songs[0].title) };
  if (top) {
    const playAttrs = top.song ? `data-action="play-row" data-index="0" data-id="${top.song.id}"` : `data-action="play-collection" data-kind="${top.kind}" data-id="${esc(top.id)}"`;
    topHtml = `<div class="top-result"><h2 class="section-title">Top result</h2>
      <div class="top-card" ${top.song ? (top.song.album ? `data-action="nav" data-href="#/album/${enc(top.song.albumKey)}"` : '') : `data-action="nav" data-href="${hrefFor(top.kind, top.id)}"`}>
        ${top.artHtml}<div class="top-title">${esc(top.title)}</div><div class="top-sub">${esc(top.sub)}</div>
        <button class="fab" ${playAttrs} aria-label="Play">${icon('play')}</button>
      </div></div>`;
  }
  const songIds = songs.slice(0, isMobile() ? 8 : 4).map((t) => t.id);
  S.page.list = { ids: songIds, context: { type: 'songs', name: `Search: ${S.query.trim()}` } };
  el.innerHTML = `<div class="results-top">${topHtml}${songIds.length ? `<div class="songs-result"><h2 class="section-title">Songs</h2>${tracklist(songIds, { noHead: true, showAlbum: false })}</div>` : ''}</div>
    ${shelf('Artists', artists.map(artistCard))}
    ${shelf('Albums', albums.map(albumCard))}
    ${shelf('Playlists', playlists.map(playlistCard))}`;
  markPlaying();
}

// ---------------------------------------------------------------- router
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: name || 'home', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

const view = $('#view');
const main = $('#main');
function render({ keepScroll = false } = {}) {
  const r = parseRoute();
  const fn = VIEWS[r.name] || VIEWS.home;
  const scroll = main.scrollTop;
  const out = fn(r.arg) || notFound();
  S.page = { ...out, route: r.name };
  view.innerHTML = out.html;
  view.dataset.route = r.name;
  $('#app').dataset.route = r.name;
  const color = out.color || '40,40,40';
  $('#app').style.setProperty('--page', color);
  $('#topbarTitle').textContent = out.title || '';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
  $$('[data-nav="home"] .i').forEach((el) => { el.outerHTML = icon(r.name === 'home' ? 'home' : 'home-o'); });
  main.scrollTop = keepScroll ? scroll : 0;
  onScroll();
  out.after?.();
  markPlaying();
  updatePlayState();
  renderSideLib();
}
function refresh() {
  if (S.page?.route === 'search' && $('#q')) { renderResults(); renderSideLib(); return; }
  render({ keepScroll: true });
}
window.addEventListener('hashchange', () => { closeLayer(); if (npOpen()) closeNP(); render(); });

function onScroll() {
  const y = main.scrollTop;
  const bar = $('#topbar');
  bar.style.setProperty('--alpha', Math.min(1, y / 180).toFixed(3));
  bar.classList.toggle('show-title', y > 260 && !!S.page?.title);
}
main.addEventListener('scroll', onScroll, { passive: true });

// ---------------------------------------------------------------- now playing UI
function markPlaying() {
  const cur = player.current;
  $$('.row').forEach((r) => r.classList.toggle('playing', r.dataset.id === cur && r.dataset.action !== 'queue-jump'));
  $$('.big-play, .fab').forEach((b) => {
    const ctx = player.context;
    const active = ctx && b.dataset.kind === ctx.type && (b.dataset.id || '') === (ctx.id || '');
    b.innerHTML = icon(active && player.playing ? 'pause' : 'play');
    b.classList.toggle('active', !!active && player.playing);
  });
}

function updateTrack() {
  const t = S.tracks.get(player.current);
  const title = t ? t.title : 'Nothing playing';
  const sub = t ? t.artist : (S.tracks.size ? 'Pick something to play' : 'Add some music to get started');
  $('#pTitle').textContent = title;
  $('#pArtist').textContent = sub;
  $('#npTitle').textContent = title;
  $('#npArtist').textContent = sub;
  const a = t ? art(t.artKey, t.album || t.title) : `<div class="art empty-art">${icon('note')}</div>`;
  $('#pArt').outerHTML = a.replace('class="art', 'id="pArt" class="art');
  $('#npArt').outerHTML = a.replace('class="art', 'id="npArt" class="art');
  $('#player').classList.toggle('idle', !t);
  const c = t?.color || '60,60,60';
  $('#np').style.setProperty('--c', c);
  $('#player').style.setProperty('--c', c);
  const ctx = player.context;
  $('#npFromType').textContent = ctx ? `Playing from ${ctx.type === 'songs' ? 'your library' : ctx.type === 'liked' ? 'playlist' : ctx.type}` : 'Now playing';
  $('#npFromName').textContent = ctx?.name || (t ? t.album : '');
  document.title = t && player.playing ? `${t.title} • ${t.artist}` : 'Encore';
  updateLikes();
  markPlaying();
  requestAnimationFrame(() => {
    for (const el of $$('.np-title, .p-title')) {
      el.classList.remove('marquee');
      el.style.removeProperty('--shift');
      const over = el.scrollWidth - el.clientWidth;
      if (over > 4) { el.classList.add('marquee'); el.style.setProperty('--shift', `-${over + 24}px`); }
    }
  });
}

function updateLikes() {
  const liked = S.likedSet.has(player.current);
  $$('[data-action="like-current"]').forEach((b) => { b.innerHTML = icon(liked ? 'heart-f' : 'heart'); b.classList.toggle('on', liked); });
  $$('.row').forEach((r) => {
    const on = S.likedSet.has(r.dataset.id);
    const b = r.querySelector('.row-like');
    if (b && b.classList.contains('on') !== on) { b.classList.toggle('on', on); b.innerHTML = icon(on ? 'heart-f' : 'heart'); }
  });
}

function updatePlayState() {
  const playing = player.playing;
  $$('.play-btn').forEach((b) => { b.innerHTML = icon(playing ? 'pause' : 'play'); b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); });
  document.body.classList.toggle('is-playing', playing);
  const t = S.tracks.get(player.current);
  document.title = t && playing ? `${t.title} • ${t.artist}` : 'Encore';
  markPlaying();
}

function updateModes() {
  $$('[data-action="shuffle"]').forEach((b) => b.classList.toggle('on', player.shuffle));
  $$('[data-action="repeat"]').forEach((b) => { b.classList.toggle('on', player.repeat !== 'off'); b.innerHTML = icon(player.repeat === 'one' ? 'repeat-one' : 'repeat'); });
}

let seeking = false;
function updateTime() {
  const d = player.loadedId ? audio.duration : S.tracks.get(player.current)?.duration || 0;
  const c = player.loadedId ? audio.currentTime : player.pendingSeek;
  const pct = isFinite(d) && d > 0 ? c / d : 0;
  if (!seeking) {
    $$('.seek').forEach((r) => { r.value = Math.round(pct * 1000); r.style.setProperty('--pct', `${pct * 100}%`); });
    $$('[data-time="cur"]').forEach((e) => { e.textContent = fmt(c); });
  }
  $$('[data-time="dur"]').forEach((e) => { e.textContent = fmt(d); });
  $$('[data-time="left"]').forEach((e) => { e.textContent = '-' + fmt(Math.max(0, d - c)); });
  $('#miniProgress').style.transform = `scaleX(${pct})`;
}

$$('.seek').forEach((r) => {
  r.addEventListener('input', () => {
    seeking = true;
    const d = audio.duration || S.tracks.get(player.current)?.duration || 0;
    const pct = r.value / 1000;
    $$('.seek').forEach((x) => { x.value = r.value; x.style.setProperty('--pct', `${pct * 100}%`); });
    $$('[data-time="cur"]').forEach((e) => { e.textContent = fmt(pct * d); });
  });
  r.addEventListener('change', () => {
    const f = r.value / 1000;
    if (player.loadedId) player.seek(f);
    else { player.pendingSeek = f * (S.tracks.get(player.current)?.duration || 0); }
    seeking = false;
    updateTime();
  });
});

const vol = $('#volume');
function setVolume(v, save = true) {
  audio.volume = v / 100;
  vol.value = v;
  vol.style.setProperty('--pct', `${v}%`);
  const b = $('[data-action="mute"]');
  b.innerHTML = icon(v == 0 ? 'volume-x' : v < 50 ? 'volume-low' : 'volume');
  if (save) store.set('volume', v);
}
vol.addEventListener('input', () => setVolume(+vol.value));
let lastVol = 80;

player.addEventListener('track', () => {
  updateTrack(); updateTime(); savePlayer();
  const t = S.tracks.get(player.current);
  if (t && player.loadedId === t.id) {
    t.plays = (t.plays || 0) + 1; t.lastPlayed = Date.now();
    db.put('tracks', t);
    noteRecent(player.context);
  }
});
player.addEventListener('state', updatePlayState);
player.addEventListener('time', updateTime);
player.addEventListener('mode', () => { updateModes(); savePlayer(); });
player.addEventListener('queue', () => { savePlayer(); if (S.page?.route === 'queue') refresh(); });
player.addEventListener('error', () => { toast('This song can’t be played in this browser'); });
setInterval(() => { if (player.playing) savePlayer(); }, 5000);
addEventListener('pagehide', savePlayer);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePlayer(); });

// ---------------------------------------------------------------- now playing sheet
const np = $('#np');
const npOpen = () => np.classList.contains('open');
function openNP() { if (!player.current) return; np.classList.add('open'); np.setAttribute('aria-hidden', 'false'); document.body.classList.add('np-open'); }
function closeNP() { np.classList.remove('open'); np.setAttribute('aria-hidden', 'true'); document.body.classList.remove('np-open'); }

(function swipeGestures() {
  const inner = $('#npInner');
  let sx = 0, sy = 0, dy = 0, active = false, onArt = false;
  inner.addEventListener('touchstart', (e) => {
    if (e.target.closest('input')) return;
    active = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dy = 0;
    onArt = !!e.target.closest('#npArtWrap');
    inner.style.transition = 'none';
  }, { passive: true });
  inner.addEventListener('touchmove', (e) => {
    if (!active) return;
    dy = e.touches[0].clientY - sy;
    const dx = e.touches[0].clientX - sx;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) inner.style.transform = `translateY(${dy}px)`;
    else if (onArt && Math.abs(dx) > Math.abs(dy)) $('#npArtWrap').style.transform = `translateX(${dx * 0.6}px)`;
  }, { passive: true });
  inner.addEventListener('touchend', (e) => {
    if (!active) return;
    active = false;
    const dx = e.changedTouches[0].clientX - sx;
    inner.style.transition = '';
    inner.style.transform = '';
    const artEl = $('#npArtWrap');
    artEl.style.transform = '';
    if (dy > 120) closeNP();
    else if (onArt && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? player.next() : player.prev());
  });
})();

// ---------------------------------------------------------------- menus, dialogs, toast
const layer = $('#layer');
let lastPoint = { x: innerWidth / 2, y: innerHeight / 2 };
function closeLayer() { layer.innerHTML = ''; layer.onclick = null; document.body.classList.remove('layer-open'); }

function openMenu({ title, sub, artHtml, items }) {
  const sheet = isMobile() || coarse();
  layer.innerHTML = `<div class="backdrop"></div><div class="menu ${sheet ? 'sheet' : 'pop'}" role="menu">
    ${sheet && title ? `<div class="menu-head">${artHtml || ''}<div><div class="menu-title">${esc(title)}</div>${sub ? `<div class="menu-sub">${esc(sub)}</div>` : ''}</div></div>` : ''}
    <div class="menu-items">${items.map((it, i) => it === '-' ? '<hr>' : `<button class="menu-item${it.danger ? ' danger' : ''}${it.on ? ' on' : ''}" data-mi="${i}" role="menuitem">${icon(it.icon)}<span>${esc(it.label)}</span>${it.more ? icon('chevron-right', 'more') : ''}</button>`).join('')}</div>
    ${sheet ? '<button class="menu-close" data-close>Close</button>' : ''}
  </div>`;
  document.body.classList.add('layer-open');
  const menu = $('.menu', layer);
  if (!sheet) {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const x = lastPoint.x + w > innerWidth - 12 ? lastPoint.x - w : lastPoint.x;
    const y = lastPoint.y + h > innerHeight - 12 ? Math.max(12, lastPoint.y - h) : lastPoint.y;
    menu.style.left = `${Math.max(12, x)}px`;
    menu.style.top = `${y}px`;
  }
  requestAnimationFrame(() => layer.classList.add('in'));
  layer.onclick = (e) => {
    const b = e.target.closest('[data-mi]');
    if (b) { const it = items[+b.dataset.mi]; closeLayer(); it.action(); return; }
    if (e.target.closest('.backdrop, [data-close]')) closeLayer();
  };
}

function trackMenu(id, extra = {}) {
  const t = S.tracks.get(id);
  if (!t) return;
  const liked = S.likedSet.has(id);
  const items = [
    { icon: liked ? 'heart-f' : 'heart', on: liked, label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', action: () => toggleLike(id) },
    { icon: 'plus-circle', label: 'Add to playlist', more: true, action: () => playlistPicker([id]) },
  ];
  const plId = S.page?.kind === 'playlist' ? S.page.id : null;
  if (plId && !extra.fromNP) items.push({ icon: 'x', label: 'Remove from this playlist', action: () => {
    const p = S.playlists.find((x) => x.id === plId);
    p.trackIds = p.trackIds.filter((x) => x !== id);
    savePlaylist(p); refresh(); renderSideLib(); toast(`Removed from ${p.name}`);
  } });
  if (extra.qi != null) items.push({ icon: 'x', label: 'Remove from queue', action: () => player.removeAt(extra.qi) });
  items.push(
    { icon: 'play-next', label: 'Play next', action: () => { player.playNext([id]); toast('Playing next'); } },
    { icon: 'list-add', label: 'Add to queue', action: () => { player.addToQueue([id]); toast('Added to queue'); } },
    '-',
  );
  if (t.album) items.push({ icon: 'disc', label: 'Go to album', action: () => { location.hash = `#/album/${enc(t.albumKey)}`; } });
  items.push({ icon: 'user', label: 'Go to artist', action: () => { location.hash = `#/artist/${enc(artistKeyOf(t.artist))}`; } });
  items.push('-', { icon: 'trash', danger: true, label: 'Delete from this device', action: async () => {
    if (await confirmDialog({ title: `Delete “${t.title}”?`, message: 'It will be removed from your library, playlists and this device.', confirm: 'Delete' })) { await deleteTracks([id]); toast('Song deleted'); }
  } });
  openMenu({ title: t.title, sub: t.artist, artHtml: art(t.artKey, t.album || t.title, 'sm'), items });
}

function playlistPicker(ids) {
  const items = [{ icon: 'plus', label: 'New playlist', action: () => newPlaylist(ids) }];
  S.playlists.forEach((p) => items.push({ icon: 'note', label: p.name, action: () => addToPlaylist(p, ids) }));
  openMenu({ title: 'Add to playlist', sub: plural(ids.length, 'song'), items });
}

function collectionMenu(kind, id) {
  const c = collection(kind, id);
  if (!c) return;
  const items = [
    { icon: 'plus-circle', label: 'Add to playlist', more: true, action: () => playlistPicker(c.ids) },
    { icon: 'play-next', label: 'Play next', action: () => { player.playNext(c.ids); toast('Playing next'); } },
    { icon: 'list-add', label: 'Add to queue', action: () => { player.addToQueue(c.ids); toast(`Added ${plural(c.ids.length, 'song')} to queue`); } },
  ];
  if (kind === 'playlist') {
    const p = S.playlists.find((x) => x.id === id);
    items.push('-', { icon: 'edit', label: 'Rename', action: () => renamePlaylist(p) }, { icon: 'trash', danger: true, label: 'Delete playlist', action: () => deletePlaylist(p) });
  }
  if (kind === 'album') items.push('-', { icon: 'trash', danger: true, label: 'Delete album from device', action: async () => {
    if (await confirmDialog({ title: `Delete “${c.name}”?`, message: `This removes ${plural(c.ids.length, 'song')} from this device.`, confirm: 'Delete' })) { await deleteTracks(c.ids); toast('Album deleted'); location.hash = '#/library'; }
  } });
  openMenu({ title: c.name, sub: plural(c.ids.length, 'song'), items });
}

function addMusicMenu() {
  const items = [{ icon: 'upload', label: 'Choose audio files', action: () => $('#fileInput').click() }];
  if (!coarse() && 'webkitdirectory' in $('#folderInput')) items.push({ icon: 'folder', label: 'Choose a folder', action: () => $('#folderInput').click() });
  items.push({ icon: 'sparkle', label: 'Add demo songs', action: loadDemo });
  openMenu({ title: 'Add music', sub: 'Songs are saved on this device', items });
}

function dialog(html, onSubmit) {
  return new Promise((resolve) => {
    layer.innerHTML = `<div class="backdrop"></div><form class="dialog">${html}</form>`;
    document.body.classList.add('layer-open');
    requestAnimationFrame(() => layer.classList.add('in'));
    const form = $('form', layer);
    const finish = (v) => { closeLayer(); resolve(v); };
    form.addEventListener('submit', (e) => { e.preventDefault(); finish(onSubmit(form)); });
    layer.onclick = (e) => { if (e.target.closest('.backdrop, [data-cancel]')) finish(null); };
    const input = $('input', form);
    if (input) { input.focus(); input.select(); } else $('button[type=submit]', form).focus();
  });
}
function promptDialog({ title, value = '', confirm = 'Save' }) {
  return dialog(`<h2>${esc(title)}</h2><input name="v" maxlength="100" value="${esc(value)}" required>
    <div class="dialog-actions"><button type="button" class="pill-btn ghost" data-cancel>Cancel</button><button type="submit" class="pill-btn primary">${esc(confirm)}</button></div>`,
  (f) => f.v.value.trim() || null);
}
function confirmDialog({ title, message, confirm = 'OK' }) {
  return dialog(`<h2>${esc(title)}</h2><p>${esc(message)}</p>
    <div class="dialog-actions"><button type="button" class="pill-btn ghost" data-cancel>Cancel</button><button type="submit" class="pill-btn danger">${esc(confirm)}</button></div>`,
  () => true);
}

const toastEl = $('#toast');
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(msg)}</span>`;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
function progressToast(msg, pct) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(msg)}</span><div class="toast-bar"><i style="transform:scaleX(${pct})"></i></div>`;
  toastEl.classList.add('show');
}

// ---------------------------------------------------------------- event delegation
document.addEventListener('click', (e) => {
  if (e.target.closest('#layer') || e.target.matches('input')) return;
  lastPoint = { x: e.clientX, y: e.clientY };
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const handler = ACTIONS[a];
  if (!handler) return;
  e.preventDefault();
  e.stopPropagation();
  handler(el, e);
});

const ACTIONS = {
  noop() {},
  nav(el) { location.hash = el.dataset.href; },
  back() { history.back(); },
  forward() { history.forward(); },
  toggle() { if (!player.toggle() && S.tracks.size) playCollection('songs'); },
  next() { player.next(); },
  prev() { player.prev(); },
  shuffle() { player.setShuffle(!player.shuffle); toast(player.shuffle ? 'Shuffle on' : 'Shuffle off'); },
  repeat() { player.cycleRepeat(); toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this song' }[player.repeat]); },
  mute() { const v = +vol.value; if (v > 0) { lastVol = v; setVolume(0); } else setVolume(lastVol || 80); },
  'like-current'() { toggleLike(player.current); },
  like(el) { toggleLike(el.dataset.id); },
  'open-np'() { openNP(); },
  'open-np-mobile'() { if (isMobile()) openNP(); },
  'close-np'() { closeNP(); },
  'np-queue'() { closeNP(); location.hash = '#/queue'; },
  'np-context'() { const c = player.context; if (c && c.type !== 'queue') { closeNP(); location.hash = hrefFor(c.type, c.id); } },
  'menu-current'() { if (player.current) trackMenu(player.current, { fromNP: true }); },
  'play-row'(el) {
    const list = S.page?.list;
    const id = el.dataset.id;
    if (list && list.ids.includes(id)) {
      const i = list.ids.indexOf(id);
      if (player.current === id && player.context?.type === list.context.type && player.context?.id === list.context.id) { player.toggle(); return; }
      player.playList(list.ids, i, list.context);
    } else player.playList([id], 0, { type: 'songs', name: 'Your library' });
  },
  'queue-jump'(el) { player.jump(+el.dataset.qi); },
  'track-menu'(el) { trackMenu(el.dataset.id, { index: el.closest('.row') ? +el.closest('.row').dataset.index : undefined, qi: el.dataset.qi != null ? +el.dataset.qi : undefined }); },
  'collection-menu'(el) { collectionMenu(el.dataset.kind, el.dataset.id); },
  'play-collection'(el) { playCollection(el.dataset.kind, el.dataset.id || undefined); },
  'new-playlist'() { newPlaylist(); },
  'add-music'() { addMusicMenu(); },
  'add-files'() { $('#fileInput').click(); },
  demo() { loadDemo(); },
  'lib-filter'(el) { S.libFilter = S.libFilter === el.dataset.filter ? 'all' : el.dataset.filter; store.set('libFilter', S.libFilter); renderSideLib(); if (S.page?.route === 'library') refresh(); },
  'clear-search'() { S.query = ''; const q = $('#q'); if (q) { q.value = ''; q.focus(); } renderResults(); },
};

// Long-press / right-click on rows opens the song menu.
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  e.preventDefault();
  lastPoint = { x: e.clientX, y: e.clientY };
  trackMenu(row.dataset.id, { index: +row.dataset.index, qi: row.dataset.qi != null ? +row.dataset.qi : undefined });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[role="link"]')) { e.target.click(); return; }
  if (e.key === 'Escape') { if (layer.innerHTML) closeLayer(); else if (npOpen()) closeNP(); return; }
  if (e.target.matches('input, textarea') || layer.innerHTML) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.code === 'Space') { e.preventDefault(); ACTIONS.toggle(); }
  else if (e.key === 'ArrowRight' && mod) { e.preventDefault(); player.next(); }
  else if (e.key === 'ArrowLeft' && mod) { e.preventDefault(); player.prev(); }
  else if (e.key === 'ArrowRight' && e.shiftKey) audio.currentTime += 10;
  else if (e.key === 'ArrowLeft' && e.shiftKey) audio.currentTime -= 10;
  else if (e.key === 'ArrowUp' && mod) { e.preventDefault(); setVolume(Math.min(100, +vol.value + 10)); }
  else if (e.key === 'ArrowDown' && mod) { e.preventDefault(); setVolume(Math.max(0, +vol.value - 10)); }
  else if (e.key === '/' || (mod && e.key === 'k')) { e.preventDefault(); location.hash = '#/search'; }
  else if (e.key.toLowerCase() === 's' && !mod) ACTIONS.shuffle();
  else if (e.key.toLowerCase() === 'l' && !mod) toggleLike(player.current);
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.query = e.target.value; renderResults(); }
});

$('#fileInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
$('#folderInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });

// Drag & drop (files and folders)
let dragDepth = 0;
const dropOverlay = $('#dropOverlay');
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropOverlay.classList.add('show'); });
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.remove('show'); } });
addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('show');
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return importFiles(e.dataTransfer.files);
  const files = [];
  const walk = async (entry) => {
    if (entry.isFile) files.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const c of batch) await walk(c); } while (batch.length);
    }
  };
  for (const en of entries) await walk(en);
  importFiles(files);
});

// ---------------------------------------------------------------- boot
async function boot() {
  hydrateIcons(document);
  setVolume(store.get('volume', 80), false);
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    toast('Storage is unavailable (private browsing?) — songs won’t be saved');
  }
  player.restore(store.get('player', null), exists);
  updateTrack(); updateModes(); updateTime(); updatePlayState();
  render();
  document.body.classList.add('ready');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
