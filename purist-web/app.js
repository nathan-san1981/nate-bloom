// Purist Web: library, two-track mixer, one-song stem view.
import { Loader, Player, Track, peaksOf, estimateBpm, encodeWav, parseKey, keyName, transposeKey, semisToMatch, dbToGain } from './engine.js';
import { loadLibrary, sortBy, fold, SOURCE_NAMES, SOURCE_ORDER } from './library.js';

const VERSION = '2.0.0';
const store = {
  get(k, d) { try { const v = localStorage.getItem('purist.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('purist.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

// ------------------------------------------------------------------ state
const S = {
  view: 'library', lib: null, libErr: '', libLoading: false,
  query: '', filter: 'all', sort: store.get('sort', 'title'), sel: null, open: null,
  base: store.get('base', '../music/'),
  xf: 0, curve: 'smooth', bMatch: true,
  sheet: null, dialog: null, toast: '', banner: null,
  song: { song: null, mode: 'original', loading: '' }
};
let ctx, guard, loader, M, P;
const T = { A: new Track('A'), B: new Track('B') };
const meta = { A: {}, B: {} };      // song, source, peaks, bpm, bpmEst, key, loading, err
const stemMeta = new Map();         // song view: track id -> { kind, peaks }
let wide = matchMedia('(min-width: 820px)').matches;
let meters = { l: 0, r: 0, limited: 0 };
let deferredInstall = null;

// ------------------------------------------------------------------ helpers
function h(tag, attrs, ...kids) {
  const el = document.createElementNS(tag === 'svg' || tag === 'path' || tag === 'rect' || tag === 'circle' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && (tag === 'input' || tag === 'select')) el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  if (tag === 'select' && attrs && attrs.value != null) el.value = attrs.value;
  return el;
}
const ICONS = {
  library: '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/><circle cx="18" cy="18" r="2.5"/><path d="M20.5 18V12"/>',
  mixer: '<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1" fill="currentColor"/><rect x="10" y="7" width="4" height="3" rx="1" fill="currentColor"/><rect x="16" y="11" width="4" height="3" rx="1" fill="currentColor"/>',
  song: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  export: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  back: '<rect x="5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none"/><path d="M19 5v14L9 12z" fill="currentColor" stroke="none"/>'
};
function icon(name, size = 20) {
  const s = h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  s.innerHTML = ICONS[name];
  return s;
}
function playIcon(playing, size = 20) {
  const s = h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' });
  s.innerHTML = playing ? '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>' : '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.6A1 1 0 0 0 7 4.5z"/>';
  return s;
}
const fmt = (s, ms = true) => {
  if (!isFinite(s) || s == null) return '—';
  const neg = s < 0; s = Math.abs(s);
  const m = Math.floor(s / 60), r = s - m * 60;
  const sec = ms ? r.toFixed(3).padStart(6, '0') : String(Math.floor(r)).padStart(2, '0');
  return (neg ? '−' : '') + m + ':' + sec;
};
const fmt1 = (s) => { if (!isFinite(s)) return '—'; const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };
const parseTime = (str) => {
  const t = String(str).trim().replace('−', '-');
  const m = t.match(/^(-)?(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? -1 : 1) * ((+m[2] || 0) * 60 + +m[3]);
};
const dbText = (db) => (db <= -40 ? '−40 dB' : (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db).toFixed(1) + ' dB');
function toast(msg) {
  S.toast = msg; renderToast();
  clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = ''; renderToast(); }, 2600);
}

// ------------------------------------------------------------------ audio setup
async function audio() {
  if (ctx) { if (ctx.state !== 'running') await ctx.resume().catch(() => {}); return; }
  ctx = new AudioContext({ latencyHint: 'playback' });
  await ctx.audioWorklet.addModule(new URL('./guard-worklet.js', import.meta.url));
  guard = new AudioWorkletNode(ctx, 'purist-guard', { outputChannelCount: [2] });
  guard.connect(ctx.destination);
  guard.port.onmessage = (e) => { meters = e.data; };
  loader = new Loader(ctx);
  M = new Player(ctx, guard); M.tracks = [T.A, T.B];
  M.onEnded = () => render();
  P = new Player(ctx, guard);
  P.onEnded = () => render();
  P.meters = true;
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
}

// ------------------------------------------------------------------ library
async function refreshLibrary() {
  S.libLoading = true; S.libErr = ''; render();
  try {
    S.lib = await loadLibrary(new URL(S.base, location.href).href);
    if (!S.sel && S.lib.songs.length) S.sel = S.lib.songs[0].id;
  } catch (e) {
    S.libErr = e.message || String(e);
  }
  S.libLoading = false; render();
}
const songById = (id) => S.lib && S.lib.songs.find((s) => s.id === id);
const bpmOf = (song) => song ? (song.bpm || 0) : 0;
function compatible(a, b) {
  if (!a || !b) return false;
  if (a.pc === b.pc && a.minor === b.minor) return true;
  const rel = a.minor ? (a.pc + 3) % 12 : (a.pc + 9) % 12;
  if (b.pc === rel && b.minor !== a.minor) return true;
  if (a.minor === b.minor && (b.pc === (a.pc + 7) % 12 || b.pc === (a.pc + 5) % 12)) return true;
  return false;
}
function visibleSongs() {
  if (!S.lib) return [];
  const q = fold(S.query).trim().split(/\s+/).filter(Boolean);
  const aBpm = meta.A.bpm, aKey = meta.A.key;
  let list = S.lib.songs.filter((s) => q.every((w) => s.search.includes(w)));
  if (S.filter === 'four') list = list.filter((s) => s.has4);
  if (S.filter === 'bpm' && aBpm) list = list.filter((s) => { const b = s.bpm; if (!b) return false; return [b, b * 2, b / 2].some((x) => Math.abs(x / aBpm - 1) <= 0.06); });
  if (S.filter === 'key' && aKey) list = list.filter((s) => compatible(aKey, parseKey(s.key)));
  return sortBy(list, S.sort);
}

// ------------------------------------------------------------------ mixer logic
function applySync() {
  const a = meta.A, b = meta.B;
  T.A.rate = 1; T.A.semis = 0;
  T.B.rate = S.bMatch && a.bpm && b.bpm ? a.bpm / b.bpm : 1;
  if (T.B.rate < 0.5 || T.B.rate > 2) T.B.rate = 1;
}
function applyXf() {
  const p = (S.xf + 1) / 2;
  if (S.curve === 'smooth') { T.A.extraGain = Math.cos(p * Math.PI / 2); T.B.extraGain = Math.sin(p * Math.PI / 2); }
  else { T.A.extraGain = Math.min(1, 2 * (1 - p)); T.B.extraGain = Math.min(1, 2 * p); }
  if (!T.B.buffer) T.A.extraGain = T.A.buffer ? Math.max(T.A.extraGain, 1) : T.A.extraGain;
  if (!T.A.buffer) T.B.extraGain = Math.max(T.B.extraGain, 1);
  if (M) M.levels();
}
const beatLen = (bpm) => (bpm ? 60 / bpm : 0);
function snapToBar(t, bpm, first) {
  if (!bpm) return Math.max(0, t);
  const bar = 4 * beatLen(bpm);
  return Math.max(0, first + Math.floor((t - first) / bar + 1e-6) * bar);
}

async function loadInto(id, song, kind, keepPlace) {
  await audio();
  const t = T[id], m = meta[id];
  const url = song.url(kind);
  if (!url) return;
  const wasPlaying = M.playing, pos = M.position;
  m.loading = 'Loading ' + SOURCE_NAMES[kind] + '…'; m.err = '';
  if (S.view === 'mixer' || !wide) render();
  try {
    const buf = await loader.get(url, (f, bytes, phase) => {
      m.loading = phase === 'decoding' ? 'Decoding…' : 'Loading ' + SOURCE_NAMES[kind] + (f ? ' · ' + Math.round(f * 100) + '%' : ' · ' + (bytes / 1048576).toFixed(1) + ' MB');
      const el = document.querySelector('[data-load="' + id + '"]');
      if (el) el.textContent = m.loading;
    });
    const sameSong = m.song && m.song.id === song.id;
    if (wasPlaying) await M.pause();
    t.buffer = buf; t.url = url; t.label = song.title + ' · ' + SOURCE_NAMES[kind];
    m.song = song; m.source = kind; m.peaks = peaksOf(buf); m.loading = '';
    if (!sameSong) {
      m.bpm = song.bpm || 0; m.bpmEst = false;
      if (!m.bpm) {
        // a vocal stem has little rhythm to go on: measure the instrumental (or the original) instead
        let ref = buf;
        const alt = kind === 'vocals' ? (song.files.instrumental ? 'instrumental' : song.files.original ? 'original' : '') : '';
        if (alt) { try { m.loading = 'Measuring the tempo…'; ref = await loader.get(song.url(alt)); } catch (e) { ref = buf; } }
        m.bpm = estimateBpm(ref); m.bpmEst = !!m.bpm; m.loading = '';
      }
      m.key = parseKey(song.key);
      m.first = song.firstDownbeat || 0;
      t.loop = { on: false, start: 0, end: 0 };
      t.mute = false; t.solo = false; t.pan = 0;
      const l = song.lufs && song.lufs[kind];
      t.volDb = isFinite(+l) && l ? Math.max(-12, Math.min(0, -16 - +l)) : 0;
      if (!keepPlace) {
        if (id === 'A') t.start = 0;
        else {
          applySync();
          const aFirst = meta.A.song ? meta.A.first : 0;
          t.start = meta.A.song && m.first ? aFirst - m.first / T.B.rate : 0;
        }
      }
      if (id === 'B' && meta.A.key && m.key) T.B.semis = 0;
    }
    applySync(); applyXf();
    if (wasPlaying) await M.play(pos); else M.levels();
    updateSession();
  } catch (e) {
    m.loading = ''; m.err = e.message || String(e);
  }
  render();
}

async function swapAB() {
  const wasPlaying = M.playing, pos = M.position;
  if (wasPlaying) await M.pause();
  for (const k of ['buffer', 'url', 'label', 'volDb', 'pan', 'mute', 'solo', 'start', 'loop']) { const x = T.A[k]; T.A[k] = T.B[k]; T.B[k] = x; }
  T.B.semis = 0;
  const mA = meta.A; meta.A = meta.B; meta.B = mA;
  T.A.start = 0;
  applySync(); applyXf();
  if (wasPlaying) await M.play(pos);
  render();
}

function trackPosNow(t) {
  const p = t.posAt(M ? M.position : 0);
  return p == null ? 0 : p;
}
async function setTrackLoop(id, on, bars, here) {
  const t = T[id], m = meta[id];
  if (!t.buffer) return;
  const len = m.bpm ? bars * 4 * beatLen(m.bpm) : bars * 2;
  if (on) {
    let st = t.loop.on && !here ? t.loop.start : snapToBar(trackPosNow(t), m.bpm, m.first || 0);
    if (st + len > t.duration) st = Math.max(0, t.duration - len);
    t.loop = { on: true, start: st, end: Math.min(t.duration, st + len), bars };
  } else t.loop = { ...t.loop, on: false };
  await M.refresh(); render();
}
async function setMixLoop(on, bars, here) {
  const a = meta.A;
  const len = a.bpm ? bars * 4 * beatLen(a.bpm) : bars * 2;
  const pos = M.position;
  if (on) {
    let st = M.loopMix.on && !here ? M.loopMix.start : snapToBar(pos, a.bpm, (T.A.start || 0) + (a.first || 0));
    M.loopMix = { on: true, start: st, end: st + len, bars };
    if (M.playing && (pos < st || pos >= st + len)) await M.play(st);
    else await M.refresh();
  } else M.loopMix = { ...M.loopMix, on: false };
  render();
}
async function nudge(id, secs) {
  T[id].start += secs;
  await M.refresh(); render();
}

// ------------------------------------------------------------------ song view logic
function stemKinds(song, mode) {
  if (!song) return [];
  if (mode === 'original') return song.files.original ? ['original'] : [];
  if (mode === 'vocals') return song.files.vocals ? ['vocals'] : [];
  if (mode === 'instrumental') return song.files.instrumental ? ['instrumental'] : [];
  if (song.has4) return ['vocals', 'drums', 'bass', 'other'].filter((k) => song.files[k]);
  return ['vocals', 'instrumental'].filter((k) => song.files[k]);
}
async function openSong(song, mode, autoplay) {
  await audio();
  const st = S.song;
  const same = st.song && st.song.id === song.id;
  const wasPlaying = P.playing, pos = same ? P.position : 0;
  if (M.playing && autoplay) { await M.pause(); }
  st.song = song; st.mode = mode;
  S.view = 'song'; S.open = null;
  const kinds = stemKinds(song, mode);
  st.loading = 'Loading…'; render();
  try {
    const bufs = [];
    for (const k of kinds) {
      bufs.push(await loader.get(song.url(k), (f, bytes, phase) => {
        st.loading = (phase === 'decoding' ? 'Decoding ' : 'Loading ') + SOURCE_NAMES[k] + (phase !== 'decoding' && f ? ' · ' + Math.round(f * 100) + '%' : '') + '…';
        const el = document.querySelector('[data-load="song"]'); if (el) el.textContent = st.loading;
      }));
    }
    if (P.playing) await P.pause();
    const old = new Map(P.tracks.map((t) => [t.id, t]));
    P.tracks = kinds.map((k, i) => {
      const t = (same && old.get(k)) || new Track(k);
      t.buffer = bufs[i]; t.url = song.url(k); t.label = SOURCE_NAMES[k];
      if (!same || !old.get(k)) { t.volDb = 0; t.pan = 0; t.mute = false; t.solo = false; }
      t.start = 0; t.loop = { on: false, start: 0, end: 0 };
      stemMeta.set(k, { kind: k, peaks: null });
      return t;
    });
    if (!same) P.loopMix = { on: false, start: 0, end: 0 };
    st.peaks = bufs.length ? peaksOf(bufs.length > 1 ? mixPeaksSource(bufs) : bufs[0]) : null;
    st.loading = '';
    P.levels();
    if (autoplay || wasPlaying) await P.play(pos);
    else P.pausedAt = pos;
    updateSession();
  } catch (e) { st.loading = ''; st.err = e.message || String(e); }
  render();
}
function mixPeaksSource(bufs) {
  // for a stem mix, draw the loudest stem (usually the instrumental bed)
  let best = bufs[0], bestE = 0;
  for (const b of bufs) { const d = b.getChannelData(0); let e = 0; for (let i = 0; i < d.length; i += 997) e += d[i] * d[i]; if (e > bestE) { bestE = e; best = b; } }
  return best;
}

// ------------------------------------------------------------------ transport helpers
const activePlayer = () => (S.view === 'song' ? P : M);
async function togglePlay(player) {
  await audio();
  player = player || activePlayer();
  if (player.playing) { await player.pause(); render(); return; }
  if (!player.tracks.some((t) => t.buffer)) { toast(player === M ? 'Load a song into A or B from the Library first' : 'Pick a song in the Library first'); return; }
  const other = player === M ? P : M;
  if (other.playing) await other.pause();
  await player.play();
  updateSession();
  render();
}
function updateSession() {
  if (!('mediaSession' in navigator)) return;
  const title = S.view === 'song' && S.song.song ? S.song.song.title + ' · ' + (S.song.mode === 'custom' ? 'Custom mix' : SOURCE_NAMES[S.song.mode])
    : [meta.A.song && meta.A.song.title, meta.B.song && meta.B.song.title].filter(Boolean).join(' × ') || 'Purist';
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Purist', album: S.view === 'song' ? 'Song' : 'Mixer' });
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  } catch (e) { /* not supported */ }
}

// ------------------------------------------------------------------ waveforms
function drawWave(canvas, peaks, color) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), hgt = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== hgt) canvas.height = hgt;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, hgt);
  if (!peaks) return;
  c.fillStyle = color;
  const mid = hgt / 2, bar = Math.max(1, Math.round(2 * dpr)), gap = Math.max(1, Math.round(dpr));
  const cols = Math.floor(w / (bar + gap));
  let max = 0.01; for (const p of peaks) if (p > max) max = p;
  for (let i = 0; i < cols; i++) {
    const s = Math.floor(i / cols * peaks.length), e = Math.max(s + 1, Math.floor((i + 1) / cols * peaks.length));
    let m = 0; for (let j = s; j < e; j++) if (peaks[j] > m) m = peaks[j];
    const a = Math.max(dpr * 0.6, (m / max) * (mid - 2 * dpr));
    c.fillRect(i * (bar + gap), mid - a, bar, a * 2);
  }
}
const pendingDraws = [];
function waveEl(peaks, color, opts) {
  const cv = h('canvas', { 'aria-hidden': 'true' });
  pendingDraws.push(() => drawWave(cv, peaks, color));
  const el = h('div', { class: 'wave', role: 'slider', 'aria-label': opts.label, 'aria-valuemin': 0, 'aria-valuemax': Math.round(opts.duration || 0), tabindex: 0 }, cv, opts.extra || []);
  if (opts.onSeek) {
    const go = (e) => { const r = el.getBoundingClientRect(); opts.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
    el.addEventListener('pointerdown', go);
  }
  return el;
}

// ------------------------------------------------------------------ views: shell
const VIEWS = [['library', 'Library'], ['mixer', 'Mixer'], ['song', 'Song'], ['settings', 'Settings']];
function nav() {
  const items = VIEWS.map(([v, label]) => h('button', {
    type: 'button', class: 'navbtn', 'aria-current': S.view === v ? 'page' : null,
    onClick: () => { S.view = v; S.sheet = null; render(); }
  }, icon(v === 'mixer' ? 'mixer' : v, 22), h('span', null, label)));
  if (wide) {
    return h('nav', { class: 'rail', 'aria-label': 'Sections' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, 'P'), items, h('div', { class: 'grow' }),
      h('div', { class: 'outchip', title: 'ChromeOS mixes everything at this rate' }, h('b', null, isChromeOS() ? 'ChromeOS' : 'Output'), h('span', { class: 'mono' }, ctx ? Math.round(ctx.sampleRate / 100) / 10 + ' kHz' : '—')));
  }
  return h('nav', { class: 'tabbar', 'aria-label': 'Sections' }, items);
}
const isChromeOS = () => /CrOS/.test(navigator.userAgent);

let root;
function render() {
  wide = matchMedia('(min-width: 820px)').matches;
  document.body.className = wide ? 'wide' : 'narrow';
  pendingDraws.length = 0;
  const view = S.view === 'library' ? viewLibrary() : S.view === 'mixer' ? viewMixer() : S.view === 'song' ? viewSong() : viewSettings();
  const parts = wide ? [nav(), view] : [view, miniPlayer(), nav()];
  root.replaceChildren(...parts.filter(Boolean));
  if (S.sheet) root.append(viewSheet(S.sheet));
  if (S.dialog) root.append(S.dialog());
  renderBanner(); renderToast();
  requestAnimationFrame(() => pendingDraws.forEach((f) => f()));
}
function renderToast() {
  let el = document.getElementById('toast');
  if (!S.toast) { if (el) el.remove(); return; }
  if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = S.toast;
}

// ------------------------------------------------------------------ views: library
function libStatus() {
  if (S.libLoading) return h('div', { class: 'empty' }, 'Reading the music folder on the Beelink…');
  if (S.libErr) return h('div', { class: 'empty' },
    h('div', { style: { color: 'var(--text)', fontWeight: 600, marginBottom: '6px' } }, 'Can’t reach the music folder'),
    h('div', null, S.libErr),
    h('div', { style: { marginTop: '6px' } }, 'Check that Tailscale says Connected, and that the folder address in Settings is right.'),
    h('div', { style: { marginTop: '12px' } }, h('button', { type: 'button', class: 'btn', onClick: refreshLibrary }, 'Try again')));
  if (S.lib && !S.lib.songs.length) return h('div', { class: 'empty' }, 'The music folder has no MP3 or FLAC files.');
  return null;
}
function filterPills() {
  const aBpm = meta.A.bpm, aKey = meta.A.key;
  const pill = (id, label, disabled) => h('button', { type: 'button', class: 'pill', 'aria-pressed': S.filter === id ? 'true' : 'false', disabled: disabled || null, onClick: () => { S.filter = S.filter === id && id !== 'all' ? 'all' : id; render(); } }, label);
  return h('div', { class: 'pills', role: 'group', 'aria-label': 'Filter' },
    pill('all', 'All'), pill('four', '4 stems'),
    pill('bpm', aBpm ? 'Near ' + Math.round(aBpm) + ' BPM' : 'Near A’s BPM', !aBpm),
    pill('key', aKey ? 'Fits ' + keyName(aKey) : 'Fits A’s key', !aKey));
}
function searchBox() {
  const inp = h('input', { type: 'search', placeholder: wide ? 'Search by title or artist' : 'Title or artist', value: S.query, autocomplete: 'off', spellcheck: 'false' });
  inp.addEventListener('input', () => { S.query = inp.value; renderListOnly(); });
  return h('label', { class: 'search' }, icon('search', 18), h('span', { class: 'sr' }, 'Search'), inp);
}
let listHost = null;
function renderListOnly() {
  if (!listHost) return render();
  listHost.replaceChildren(...(wide ? wideRows() : narrowRows()));
}
const stemText = (s) => (s.has4 ? '4 stems' : s.files.vocals && s.files.instrumental ? 'vocals + inst' : s.files.vocals || s.files.instrumental ? '1 stem' : 'original only');
function wideRows() {
  const rows = visibleSongs();
  if (!rows.length && S.lib) return [h('div', { class: 'empty', style: { margin: '16px' } }, S.query ? 'No songs match “' + S.query + '”.' : 'No songs match this filter.')];
  return rows.map((s) => h('button', { type: 'button', class: 'lrow', 'aria-current': S.sel === s.id ? 'true' : null, onClick: () => { S.sel = s.id; render(); }, onDblclick: () => openSong(s, 'original', true) },
    h('span', { class: 't' }, s.title), h('span', { class: 'ar' }, s.artist || '—'),
    h('span', { class: 'n' }, s.bpm ? (Math.round(s.bpm * 10) / 10) : '—'), h('span', { class: 'k' }, s.key ? keyName(parseKey(s.key)) || s.key : '—'),
    h('span', { class: 'n dim' }, s.duration ? fmt(s.duration, false) : ''), h('span', { class: 'st' + (s.has4 ? ' four' : '') }, stemText(s))));
}
function quickButtons(s, lead) {
  const q = (mode, label, sub) => h('button', { type: 'button', class: 'qbtn' + (lead === mode ? ' lead' : ''), disabled: stemKinds(s, mode).length ? null : true, onClick: () => openSong(s, mode, true) }, label, h('span', null, sub));
  return h('div', { class: 'quick', role: 'group', 'aria-label': 'Play ' + s.title },
    q('original', 'Original', 'the MP3'), q('vocals', 'Vocals only', 'vocals stem'),
    q('instrumental', 'Instrumental', 'instrumental stem'), q('custom', 'Custom mix', 'set each stem'));
}
const kinds = (s) => SOURCE_ORDER.filter((k) => s.files[k]);
function loadButtons(s, k, cls) {
  return [
    h('button', { type: 'button', class: 'ld A ' + (cls || ''), 'aria-label': 'Load ' + SOURCE_NAMES[k] + ' into track A', onClick: () => { loadInto('A', s, k); toast(SOURCE_NAMES[k] + ' of ' + s.title + ' → A'); } }, 'A'),
    h('button', { type: 'button', class: 'ld B ' + (cls || ''), 'aria-label': 'Load ' + SOURCE_NAMES[k] + ' into track B', onClick: () => { loadInto('B', s, k); toast(SOURCE_NAMES[k] + ' of ' + s.title + ' → B'); } }, 'B')
  ];
}
function detailPane() {
  const s = songById(S.sel);
  if (!s) return h('aside', { class: 'detail', 'aria-label': 'Selected song' }, h('div', { class: 'dim' }, 'Pick a song.'));
  const k = parseKey(s.key);
  return h('aside', { class: 'detail', 'aria-label': 'Selected song' },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      h('h2', null, s.title), h('div', { class: 'dim', style: { fontSize: '14px' } }, s.artist || '—'),
      h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '8px' } },
        s.bpm ? h('span', { class: 'chip' }, (Math.round(s.bpm * 10) / 10) + ' BPM') : null,
        k ? h('span', { class: 'chip' }, keyName(k)) : null,
        s.duration ? h('span', { class: 'chip' }, fmt(s.duration, false)) : null,
        h('span', { class: 'chip' }, stemText(s)))),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { class: 'label' }, 'Play this song'), quickButtons(s, 'original')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, h('div', { class: 'label' }, 'Load into the mixer'),
      kinds(s).map((kk) => h('div', { class: 'file' }, h('span', { class: 'nm' }, SOURCE_NAMES[kk]),
        h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--text3)' } }, (s.files[kk].match(/\.(\w+)$/) || ['', ''])[1].toLowerCase()), loadButtons(s, kk)))));
}
function narrowRows() {
  const rows = visibleSongs();
  if (!rows.length && S.lib) return [h('div', { class: 'empty' }, S.query ? 'No songs match “' + S.query + '”.' : 'No songs match this filter.')];
  return rows.slice(0, 400).map((s) => {
    const sub = [s.artist, s.bpm ? Math.round(s.bpm) : '', s.key ? keyName(parseKey(s.key)) : ''].filter(Boolean).join(' · ');
    const head = h('button', { type: 'button', class: 'mrow', style: S.open === s.id ? { background: 'none', padding: 0, minHeight: 0 } : null, 'aria-expanded': S.open === s.id ? 'true' : 'false', onClick: () => { S.open = S.open === s.id ? null : s.id; renderListOnly(); } },
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title', style: { fontWeight: S.open === s.id ? 600 : 500 } }, s.title), h('div', { class: 'sub' }, sub || '—')),
      s.has4 ? h('span', { class: 'stems4' }, '4 stems') : h('span', { class: 'dim', style: { fontSize: '11.5px' } }, stemText(s)));
    if (S.open !== s.id) return h('li', null, head);
    return h('li', { class: 'mopen' }, head, quickButtons(s, 'original'),
      h('div', { class: 'label' }, 'Load into the mixer'),
      h('div', { class: 'mfiles' }, kinds(s).map((k) => h('div', { class: 'mfile' }, h('span', null, SOURCE_NAMES[k]), h('div', { class: 'quick', style: { gap: '4px' } }, loadButtons(s, k))))));
  });
}
function viewLibrary() {
  const status = libStatus();
  const count = S.lib ? S.lib.songs.length.toLocaleString() + ' songs on the Beelink' : '';
  const head = h('header', { class: 'vhead' }, h('h1', null, 'Library'), h('span', { class: 'dim', style: { fontSize: wide ? '14px' : '13px' } }, count));
  if (wide) {
    listHost = h('div', { class: 'lbody' }, status ? [] : wideRows());
    const sort = h('select', { class: 'sel', value: S.sort, 'aria-label': 'Sort' }, ['title', 'artist', 'bpm', 'key'].map((v) => h('option', { value: v }, v[0].toUpperCase() + v.slice(1).replace('Bpm', 'BPM'))));
    sort.value = S.sort;
    sort.addEventListener('change', () => { S.sort = sort.value; store.set('sort', S.sort); renderListOnly(); });
    return h('main', { class: 'view', style: { flexDirection: 'row', gap: '18px' } },
      h('section', { 'aria-label': 'Songs', style: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' } },
        head, searchBox(),
        h('div', { class: 'row' }, filterPills(), h('div', { class: 'grow' }), h('label', { class: 'ctl' }, 'Sort', sort)),
        status || h('div', { class: 'list' },
          h('div', { class: 'lhead' }, h('span', null, 'Title'), h('span', null, 'Artist'), h('span', null, 'BPM'), h('span', null, 'Key'), h('span', null, 'Length'), h('span', null, 'Stems')),
          listHost,
          h('div', { class: 'lfoot' }, h('span', { class: 'dot' }), 'Streaming from the Beelink · nothing is copied to this ' + (isChromeOS() ? 'Pixelbook' : 'device') + (S.lib && S.lib.from === 'listing' ? ' · BPM and key arrive with library.json' : '')))),
      status ? null : detailPane());
  }
  listHost = h('ul', { class: 'mlist', 'aria-label': 'Songs' }, status ? [] : narrowRows());
  return h('main', { class: 'view' }, head, searchBox(), filterPills(), status || listHost);
}

// ------------------------------------------------------------------ views: mixer
function transportCard(player, opts) {
  const len = player.length;
  const playBtn = h('button', { type: 'button', class: 'play', 'aria-label': player.playing ? 'Pause' : 'Play', onClick: () => togglePlay(player) }, playIcon(player.playing, wide ? 20 : 22));
  const time = h('div', { class: 'time', 'data-time': opts.id }, fmt(player.position), ' ', h('small', null, '/ ' + fmt(len, wide)));
  const bars = h('div', { class: 'bars', 'data-bars': opts.id }, opts.barsText());
  const ov = h('div', { class: 'overview', role: 'slider', tabindex: 0, 'aria-label': 'Position in the mix', 'aria-valuemin': 0, 'aria-valuemax': Math.round(len) },
    opts.lanes(len),
    player.loopMix.on && len ? h('div', { class: 'mixloop', style: { left: (player.loopMix.start / len * 100) + '%', width: ((player.loopMix.end - player.loopMix.start) / len * 100) + '%' } }) : null,
    h('div', { class: 'ph', 'data-ph': opts.id + ':mix' }));
  ov.addEventListener('pointerdown', (e) => { const r = ov.getBoundingClientRect(); player.seek(len * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))).then(render); });
  const L = player.loopMix;
  const loopBtn = wide
    ? h('button', { type: 'button', class: 'btn ' + (L.on ? 'a-on' : 'off'), 'aria-pressed': L.on ? 'true' : 'false', disabled: len ? null : true, onClick: () => setMixLoop(!L.on, L.bars || 8) }, icon('loop', 16), L.on ? 'Loop mix ' + fmt1(L.start) + '–' + fmt1(L.end) : 'Loop mix: off')
    : h('button', { type: 'button', class: 'btn icon-btn ' + (L.on ? 'a-on' : 'off'), style: { borderRadius: '10px' }, 'aria-pressed': L.on ? 'true' : 'false', 'aria-label': 'Loop the mix', disabled: len ? null : true, onClick: () => setMixLoop(!L.on, L.bars || 8) }, icon('loop', 18));
  const loopChips = L.on ? h('div', { class: 'row', style: { gap: '6px' } },
    h('button', { type: 'button', class: 'btn sm', onClick: () => setMixLoop(true, L.bars || 8, true) }, 'Start here'),
    [4, 8, 16].map((n) => h('button', { type: 'button', class: 'btn sm' + (L.bars === n ? ' a-on' : ''), 'aria-pressed': L.bars === n ? 'true' : 'false', onClick: () => setMixLoop(true, n) }, n + ' bars'))) : null;
  if (wide) {
    return h('section', { class: 'card', 'aria-label': 'Transport', style: { padding: '12px 16px' } },
      h('div', { class: 'row', style: { gap: '16px' } }, playBtn,
        h('button', { type: 'button', class: 'btn icon-btn', style: { width: '40px', height: '40px', borderRadius: '20px' }, 'aria-label': 'Back to start', onClick: () => player.seek(L.on ? L.start : 0).then(render) }, icon('back', 16)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '176px', flex: 'none' } }, time, bars),
        h('div', { style: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' } }, ov,
          h('div', { class: 'row mono', style: { justifyContent: 'space-between', fontSize: '11px', color: 'var(--text3)' } }, h('span', null, '0:00'), h('span', null, opts.caption), h('span', null, fmt(len, false)))),
        loopBtn),
      loopChips);
  }
  return h('section', { class: 'card', 'aria-label': 'Transport' },
    h('div', { class: 'row' }, playBtn, h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } }, time, bars), loopBtn),
    ov, loopChips);
}
function mixBarsText() {
  const a = meta.A;
  if (!a.bpm || !T.A.buffer) return T.A.buffer ? 'BPM unknown' : 'Nothing loaded';
  const beat = Math.floor((M.position - T.A.start - (a.first || 0)) / beatLen(a.bpm) + 1e-6);
  if (beat < 0) return 'Bar — · ' + fmtBpm(a.bpm) + ' BPM';
  return 'Bar ' + (Math.floor(beat / 4) + 1) + ' · beat ' + ((beat % 4) + 1) + ' · ' + fmtBpm(a.bpm) + ' BPM';
}
const fmtBpm = (b) => (Math.round(b * 10) / 10).toString();
function mixLanes(len) {
  const out = [];
  for (const id of ['A', 'B']) {
    const t = T[id]; if (!t.buffer || !len) continue;
    const s = Math.max(0, t.start), e = Math.min(len, t.mixEnd);
    out.push(h('div', { class: 'lane ' + id, style: { left: (s / len * 100) + '%', width: (Math.max(0, e - s) / len * 100) + '%' } }));
  }
  return out;
}
function deckHeader(id) {
  const t = T[id], m = meta[id], s = m.song;
  const kA = meta.A.key, kB = transposeKey(m.key, t.semis);
  const sourceSel = h('select', { class: 'sel', 'aria-label': 'Track ' + id + ' source' }, kinds(s).map((k) => h('option', { value: k }, SOURCE_NAMES[k])));
  sourceSel.value = m.source;
  sourceSel.addEventListener('change', () => loadInto(id, s, sourceSel.value, true));
  const bpmChip = id === 'A'
    ? (m.bpm ? h('span', { class: 'chip', title: m.bpmEst ? 'Estimated here; library.json will give the exact tempo' : null }, (m.bpmEst ? '≈' : '') + fmtBpm(m.bpm) + ' BPM') : h('span', { class: 'chip' }, 'BPM —'))
    : (m.bpm ? h('span', { class: 'chip' }, (m.bpmEst ? '≈' : '') + fmtBpm(m.bpm) + (Math.abs(t.rate - 1) > 1e-4 ? ' → ' + fmtBpm(m.bpm * t.rate) : '') + ' BPM') : h('span', { class: 'chip' }, 'BPM —'));
  const keyChip = m.key ? h('span', { class: 'chip' }, keyName(m.key) + (id === 'B' && t.semis ? ' → ' + keyName(kB) : '')) : h('span', { class: 'chip' }, 'key —');
  const ms = [
    h('button', { type: 'button', class: 'btn sq' + (t.mute ? ' mute-on' : ''), 'aria-pressed': t.mute ? 'true' : 'false', 'aria-label': 'Mute track ' + id, onClick: () => { t.mute = !t.mute; M.levels(); render(); } }, 'M'),
    h('button', { type: 'button', class: 'btn sq' + (t.solo ? ' solo-on' : ''), 'aria-pressed': t.solo ? 'true' : 'false', 'aria-label': 'Solo track ' + id, onClick: () => { t.solo = !t.solo; M.levels(); render(); } }, 'S')
  ];
  return h('div', { class: 'row' },
    h('div', { class: 'badge ' + id }, id),
    h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, h('div', { class: 'title' }, s.title), h('div', { class: 'sub' }, [s.artist, fmt(t.duration, false)].filter(Boolean).join(' · '))),
    h('label', { class: 'ctl', style: { marginLeft: '10px' } }, 'Source', sourceSel),
    bpmChip, keyChip, id === 'A' ? h('span', { class: 'dim', style: { fontSize: '12px' } }, 'Sets the tempo') : null,
    h('div', { class: 'grow' }), ms);
}
function trackWave(id) {
  const t = T[id], m = meta[id];
  const dur = t.duration;
  const extra = [];
  if (t.loop.on && dur) {
    extra.push(h('div', { class: 'loopr', style: { left: (t.loop.start / dur * 100) + '%', width: ((t.loop.end - t.loop.start) / dur * 100) + '%' } }));
    if (wide) extra.push(h('div', { class: 'looptag', style: { left: 'calc(' + (t.loop.start / dur * 100) + '% + 6px)' } }, 'LOOP'));
  }
  extra.push(h('div', { class: 'ph', 'data-ph': 'M:' + id }));
  if (wide) extra.push(h('div', { class: 'range' }, '0:00 – ' + fmt(dur, false)));
  if (m.loading) extra.push(h('div', { class: 'msg', 'data-load': id }, m.loading));
  return waveEl(m.peaks, id === 'A' ? 'rgba(227,174,87,0.8)' : 'rgba(122,167,255,0.85)', {
    label: 'Track ' + id + ' position', duration: dur, extra,
    onSeek: (f) => { const tt = f * dur; M.seek(t.start + tt / t.rate).then(render); }
  });
}
function volCtl(t, id, compact) {
  const val = h('span', { class: 'val' }, dbText(t.volDb));
  const r = h('input', { type: 'range', min: -40, max: 6, step: 0.5, value: t.volDb, style: { width: compact ? 'auto' : '104px', flexGrow: compact ? 1 : 0, minWidth: 0 } });
  r.addEventListener('input', () => { t.volDb = +r.value; val.textContent = dbText(t.volDb); (t.id.length === 1 ? M : P).levels(); });
  return h('label', { class: 'ctl', style: compact ? { flexGrow: 1, minWidth: 0 } : null }, compact ? h('span', { class: 'sr' }, 'Track ' + id + ' volume') : 'Volume', r, val);
}
function panCtl(t, id, width) {
  const panText = (p) => (Math.abs(p) < 0.02 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100));
  const val = h('span', { class: 'val', style: { minWidth: '32px' } }, panText(t.pan));
  const r = h('input', { type: 'range', min: -1, max: 1, step: 0.01, value: t.pan, style: { width: width || '76px', flexGrow: width === 'auto' ? 1 : 0, minWidth: 0 } });
  r.addEventListener('input', () => { t.pan = Math.abs(+r.value) < 0.04 ? 0 : +r.value; val.textContent = panText(t.pan); (t.id.length === 1 ? M : P).levels(); });
  r.addEventListener('dblclick', () => { t.pan = 0; r.value = 0; val.textContent = 'C'; (t.id.length === 1 ? M : P).levels(); });
  return h('label', { class: 'ctl', style: width === 'auto' ? { flexGrow: 1 } : null }, 'Pan', r, val);
}
function startCtl(id) {
  const t = T[id], aBeat = beatLen(meta.A.bpm);
  const box = h('input', { type: 'text', class: 'startbox', value: fmt(t.start), 'aria-label': 'Track ' + id + ' starts at (mix time)', inputmode: 'decimal' });
  box.addEventListener('change', () => { const v = parseTime(box.value); if (v != null) { t.start = v; M.refresh().then(render); } else box.value = fmt(t.start); });
  const b = (label, d, aria) => h('button', { type: 'button', class: 'btn sm', 'aria-label': aria, disabled: d === 'beat' && !aBeat ? true : null, onClick: () => nudge(id, d === 'beat' ? aBeat : d === '-beat' ? -aBeat : d) }, label);
  return h('div', { class: 'ctl' }, 'Start',
    b('−1 beat', '-beat', 'Start one beat earlier'), b('−10', -0.010, 'Start 10 ms earlier'), b('−1', -0.001, 'Start 1 ms earlier'),
    box, b('+1', 0.001, 'Start 1 ms later'), b('+10', 0.010, 'Start 10 ms later'), b('+1 beat', 'beat', 'Start one beat later'));
}
function loopCtl(id) {
  const t = T[id], L = t.loop;
  const main = h('button', { type: 'button', class: 'btn ' + (L.on ? (id === 'A' ? 'a-on' : 'on') : 'off'), 'aria-pressed': L.on ? 'true' : 'false', onClick: () => setTrackLoop(id, !L.on, L.bars || 8) },
    L.on ? 'Loop ' + fmt1(L.start) + ' – ' + fmt1(L.end) + (L.bars ? ' · ' + L.bars + ' bars' : '') : 'Loop region: off');
  if (!L.on) return main;
  return h('div', { class: 'row', style: { gap: '6px' } },
    h('button', { type: 'button', class: 'btn sm', onClick: () => setTrackLoop(id, true, L.bars || 8, true) }, 'Start here'),
    [4, 8, 16].map((n) => h('button', { type: 'button', class: 'btn sm' + (L.bars === n ? (id === 'A' ? ' a-on' : ' on') : ''), 'aria-pressed': L.bars === n ? 'true' : 'false', onClick: () => setTrackLoop(id, true, n) }, String(n))),
    main);
}
function syncRow() {
  const a = meta.A, b = meta.B, t = T.B;
  const canMatch = a.bpm && b.bpm;
  const chk = h('input', { type: 'checkbox', checked: S.bMatch, disabled: canMatch ? null : true });
  chk.addEventListener('change', async () => { S.bMatch = chk.checked; applySync(); await M.refresh(); render(); });
  const pct = (t.rate - 1) * 100;
  const semi = async (d) => { t.semis = Math.max(-12, Math.min(12, t.semis + d)); await M.refresh(); render(); };
  const kNow = transposeKey(b.key, t.semis);
  const same = a.key && kNow && compatible(a.key, kNow);
  return h('div', { class: 'sync' },
    h('label', { class: 'check' }, chk, h('span', null, 'Match A’s tempo')),
    h('span', { class: 'mono' }, canMatch ? fmtBpm(b.bpm) + ' → ' + fmtBpm(b.bpm * t.rate) + ' BPM · ' + (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '% · pitch kept' : 'Needs a BPM for both tracks'),
    h('div', { class: 'row', style: { gap: '6px', marginLeft: '8px' } },
      h('span', { style: { color: 'var(--text)', fontWeight: 500 } }, 'Key'),
      h('button', { type: 'button', class: 'btn sm', style: { width: '30px', fontSize: '15px' }, 'aria-label': 'Down a semitone', onClick: () => semi(-1) }, '−'),
      h('span', { class: 'mono', style: { color: 'var(--text)', minWidth: '46px', textAlign: 'center' } }, (t.semis > 0 ? '+' : t.semis < 0 ? '−' : '') + Math.abs(t.semis) + ' st'),
      h('button', { type: 'button', class: 'btn sm', style: { width: '30px', fontSize: '15px' }, 'aria-label': 'Up a semitone', onClick: () => semi(1) }, '+'),
      h('span', null, kNow ? 'now ' + keyName(kNow) + (same ? (a.key.pc === kNow.pc && a.key.minor === kNow.minor ? ', same as A' : ', fits A') : '') : '')),
    h('div', { class: 'grow' }),
    h('button', { type: 'button', class: 'btn', disabled: a.key && b.key ? null : true, onClick: async () => { t.semis = semisToMatch(a.key, b.key); await M.refresh(); render(); } }, 'Match A’s key'));
}
function deckEmpty(id) {
  return h('section', { class: 'card ' + id, 'aria-label': 'Track ' + id },
    h('div', { class: 'row' }, h('div', { class: 'badge ' + id }, id),
      h('div', { class: 'grow dim' }, meta[id].loading ? h('span', { 'data-load': id }, meta[id].loading) : meta[id].err ? meta[id].err : 'Empty. Load a song, its vocals or its instrumental from the Library.'),
      h('button', { type: 'button', class: 'btn', onClick: () => { S.view = 'library'; render(); } }, 'Library')));
}
function deck(id) {
  const t = T[id], m = meta[id];
  if (!m.song) return deckEmpty(id);
  if (wide) {
    return h('section', { class: 'card ' + id, 'aria-label': 'Track ' + id },
      deckHeader(id), trackWave(id),
      m.err ? h('div', { style: { color: 'var(--warn)', fontSize: '12.5px' } }, m.err) : null,
      h('div', { class: 'row wrap', style: { gap: '18px', rowGap: '8px' } }, volCtl(t, id), panCtl(t, id, '72px'), startCtl(id), h('div', { class: 'grow' }), loopCtl(id)),
      id === 'B' ? syncRow() : null);
  }
  const sub = [SOURCE_NAMES[m.source], m.bpm ? (m.bpmEst ? '≈' : '') + Math.round(m.bpm) + ' BPM' : '', m.key ? keyName(m.key) : ''].filter(Boolean).join(' · ');
  const chips = id === 'B' ? h('div', { class: 'row wrap', style: { gap: '6px' } },
    Math.abs(t.rate - 1) > 1e-4 ? h('span', { class: 'chip b' }, '→ ' + fmtBpm(m.bpm * t.rate) + ' BPM (' + ((t.rate - 1) * 100 >= 0 ? '+' : '−') + Math.abs((t.rate - 1) * 100).toFixed(1) + '%)') : null,
    t.semis ? h('span', { class: 'chip b' }, (t.semis > 0 ? '+' : '−') + Math.abs(t.semis) + ' st → ' + keyName(transposeKey(m.key, t.semis))) : null,
    t.loop.on ? h('span', { class: 'chip b' }, 'loop ' + (t.loop.bars || '') + ' bars') : null) : null;
  return h('section', { class: 'card ' + id, 'aria-label': 'Track ' + id },
    h('div', { class: 'row', style: { gap: '10px' } }, h('div', { class: 'badge ' + id, style: { width: '28px', height: '28px', fontSize: '13px' } }, id),
      h('div', { class: 'grow', style: { minWidth: 0, display: 'flex', flexDirection: 'column' } }, h('div', { class: 'title' }, m.song.title), h('div', { class: 'sub' }, sub)),
      h('button', { type: 'button', class: 'btn icon-btn' + (id === 'B' ? ' on' : ''), style: { borderRadius: '10px' }, 'aria-label': 'Track ' + id + ' controls', onClick: () => { S.sheet = id; render(); } }, icon('sliders', 18))),
    chips && chips.childNodes.length ? chips : null,
    trackWave(id),
    h('div', { class: 'row', style: { gap: '8px' } }, volCtl(t, id, true),
      h('button', { type: 'button', class: 'btn sq' + (t.mute ? ' mute-on' : ''), 'aria-pressed': t.mute ? 'true' : 'false', 'aria-label': 'Mute track ' + id, onClick: () => { t.mute = !t.mute; M.levels(); render(); } }, 'M'),
      h('button', { type: 'button', class: 'btn sq' + (t.solo ? ' solo-on' : ''), 'aria-pressed': t.solo ? 'true' : 'false', 'aria-label': 'Solo track ' + id, onClick: () => { t.solo = !t.solo; M.levels(); render(); } }, 'S')));
}
function xfCard() {
  const r = h('input', { type: 'range', class: 'x', min: -1, max: 1, step: 0.01, value: S.xf, style: { width: '100%' }, 'aria-label': 'Crossfader' });
  const where = () => (Math.abs(S.xf) < 0.02 ? 'centre' : S.xf < 0 ? 'toward A' : 'toward B');
  const lab = h('span', { style: { color: 'var(--text)', fontWeight: 500 } }, 'Crossfader · ' + where());
  r.addEventListener('input', () => { S.xf = Math.abs(+r.value) < 0.03 ? 0 : +r.value; lab.textContent = 'Crossfader · ' + where(); applyXf(); });
  r.addEventListener('dblclick', () => { S.xf = 0; r.value = 0; lab.textContent = 'Crossfader · centre'; applyXf(); });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Crossfader curve' },
    ['smooth', 'sharp'].map((c) => h('button', { type: 'button', 'aria-pressed': S.curve === c ? 'true' : 'false', onClick: () => { S.curve = c; applyXf(); render(); } }, c === 'smooth' ? 'Smooth' : 'Sharp')));
  const nameOf = (id) => (meta[id].song ? SOURCE_NAMES[meta[id].source] + ', ' + meta[id].song.title : 'empty');
  if (wide) {
    return h('section', { class: 'card', 'aria-label': 'Crossfader', style: { padding: '12px 16px' } },
      h('div', { class: 'xf' }, h('div', { class: 'badge A sm' }, 'A'),
        h('div', { style: { flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text2)', minWidth: 0 } },
          h('span', { class: 'row', style: { justifyContent: 'space-between', gap: '8px' } }, h('span', { class: 'sub', style: { fontSize: '12px' } }, nameOf('A')), lab, h('span', { class: 'sub', style: { fontSize: '12px', textAlign: 'right' } }, nameOf('B'))), r),
        h('div', { class: 'badge B sm' }, 'B'), seg, outMeter()));
  }
  return h('section', { class: 'card', 'aria-label': 'Crossfader' },
    h('div', { class: 'row', style: { gap: '10px' } }, h('div', { class: 'badge A sm' }, 'A'), h('div', { class: 'grow', style: { display: 'flex' } }, r), h('div', { class: 'badge B sm' }, 'B')),
    h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)' } }, lab, seg));
}
function outMeter() {
  return h('div', { style: { flex: 'none', display: 'flex', flexDirection: 'column', gap: '4px', width: '150px', fontSize: '11px', color: 'var(--text2)' } },
    h('span', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', null, 'Output'), h('span', { class: 'mono', style: { color: 'var(--text)' }, 'data-peak': '1' }, 'peak —')),
    h('div', { class: 'meter' }, h('i', { 'data-meter': 'l' })), h('div', { class: 'meter' }, h('i', { 'data-meter': 'r' })));
}
function viewMixer() {
  const title = [meta.A.song && meta.A.song.title, meta.B.song && meta.B.song.title].filter(Boolean).join(' × ');
  const any = meta.A.song || meta.B.song;
  const head = wide
    ? h('header', { class: 'vhead' }, h('h1', null, 'Mixer'), h('span', { class: 'dim', style: { fontSize: '14px' } }, title),
      h('div', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn', disabled: any ? null : true, onClick: swapAB }, icon('swap', 16), 'Swap A and B'),
      h('button', { type: 'button', class: 'btn primary', disabled: any ? null : true, onClick: openExport }, icon('export', 16), 'Export WAV'))
    : h('header', { class: 'vhead', style: { flexWrap: 'nowrap', gap: '8px' } },
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('h1', null, 'Mixer'), h('div', { class: 'sub', style: { fontSize: '13px' } }, title || 'Load tracks from the Library')),
      h('button', { type: 'button', class: 'btn icon-btn', 'aria-label': 'Swap A and B', disabled: any ? null : true, onClick: swapAB }, icon('swap', 18)),
      h('button', { type: 'button', class: 'btn primary icon-btn', 'aria-label': 'Export WAV', disabled: any ? null : true, onClick: openExport }, icon('export', 18)));
  const caption = meta.A.song ? 'A: ' + meta.A.song.title + (meta.B.song ? ' · B enters at ' + fmt(T.B.start) : '') : '';
  return h('main', { class: 'view' }, head,
    transportCard(M, { id: 'M', barsText: mixBarsText, lanes: mixLanes, caption }),
    deck('A'), deck('B'), xfCard());
}

// ------------------------------------------------------------------ iPhone track sheet
function viewSheet(id) {
  const t = T[id], m = meta[id];
  const close = () => { S.sheet = null; render(); };
  if (!m.song) { S.sheet = null; return h('div'); }
  const kA = meta.A.key, kNow = transposeKey(m.key, t.semis);
  const src = h('div', { class: 'seg', role: 'group', 'aria-label': 'Source', style: { display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(3, kinds(m.song).length) + ', minmax(0, 1fr))', borderRadius: '10px' } },
    kinds(m.song).slice(0, 6).map((k) => h('button', { type: 'button', style: { height: '40px', fontSize: '13.5px' }, 'aria-pressed': m.source === k ? 'true' : 'false', onClick: () => loadInto(id, m.song, k, true) }, SOURCE_NAMES[k])));
  const aBeat = beatLen(meta.A.bpm);
  const nb = (label, d, aria) => h('button', { type: 'button', class: 'btn', 'aria-label': aria, disabled: (d === 'beat' || d === '-beat') && !aBeat ? true : null, onClick: () => nudge(id, d === 'beat' ? aBeat : d === '-beat' ? -aBeat : d) }, label);
  const L = t.loop;
  const loopChk = h('input', { type: 'checkbox', checked: L.on, style: { width: '20px', height: '20px' } });
  loopChk.addEventListener('change', () => setTrackLoop(id, loopChk.checked, L.bars || 8));
  let syncBox = null;
  if (id === 'B') {
    const chk = h('input', { type: 'checkbox', checked: S.bMatch, disabled: meta.A.bpm && m.bpm ? null : true, style: { width: '20px', height: '20px' } });
    chk.addEventListener('change', async () => { S.bMatch = chk.checked; applySync(); await M.refresh(); render(); });
    const semi = async (d) => { t.semis = Math.max(-12, Math.min(12, t.semis + d)); await M.refresh(); render(); };
    syncBox = h('div', { class: 'box' },
      h('label', { class: 'row', style: { gap: '10px' } }, chk, h('span', { class: 'grow', style: { fontSize: '14.5px', fontWeight: 500 } }, 'Match A’s tempo'),
        h('span', { class: 'mono dim', style: { fontSize: '12px' } }, meta.A.bpm && m.bpm ? Math.round(m.bpm) + ' → ' + Math.round(m.bpm * t.rate) + ' · ' + ((t.rate - 1) * 100 >= 0 ? '+' : '−') + Math.abs((t.rate - 1) * 100).toFixed(1) + '%' : 'needs BPMs')),
      h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'grow', style: { fontSize: '14.5px', fontWeight: 500 } }, 'Key'),
        h('button', { type: 'button', class: 'btn', style: { width: '44px', height: '40px', fontSize: '17px' }, 'aria-label': 'Down a semitone', onClick: () => semi(-1) }, '−'),
        h('span', { class: 'mono', style: { minWidth: '52px', textAlign: 'center', fontSize: '14px' } }, (t.semis > 0 ? '+' : t.semis < 0 ? '−' : '') + Math.abs(t.semis) + ' st'),
        h('button', { type: 'button', class: 'btn', style: { width: '44px', height: '40px', fontSize: '17px' }, 'aria-label': 'Up a semitone', onClick: () => semi(1) }, '+')),
      h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text2)' } },
        h('span', null, kNow ? 'Now ' + keyName(kNow) + (kA && compatible(kA, kNow) ? (kA.pc === kNow.pc && kA.minor === kNow.minor ? ', same as A' : ', fits A') : '') + ' · pitch kept' : 'Key not known yet'),
        h('button', { type: 'button', class: 'btn sm', disabled: kA && m.key ? null : true, onClick: async () => { t.semis = semisToMatch(kA, m.key); await M.refresh(); render(); } }, 'Match A’s key')));
  }
  const sheet = h('section', { class: 'sheet', role: 'dialog', 'aria-label': 'Track ' + id + ' controls' },
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    h('header', { class: 'row', style: { gap: '10px' } }, h('div', { class: 'badge ' + id }, id),
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title', style: { fontSize: '16px' } }, m.song.title),
        h('div', { class: 'sub' }, [m.song.artist, fmt(t.duration, false), m.bpm ? Math.round(m.bpm) + ' BPM' : '', m.key ? keyName(m.key) : ''].filter(Boolean).join(' · '))),
      h('button', { type: 'button', class: 'btn', style: { borderRadius: '20px', height: '40px', background: 'var(--text)', color: 'var(--s1)', border: 0, fontWeight: 600 }, onClick: close }, 'Done')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, h('div', { class: 'label' }, 'Source'), src),
    syncBox,
    h('div', { class: id, style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, volCtl(t, id, true), panCtl(t, id, 'auto')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'label' }, 'Starts at'), h('span', { class: 'mono', style: { fontSize: '15px' } }, fmt(t.start))),
      h('div', { class: 'grid6' }, nb('−beat', '-beat', 'One beat earlier'), nb('−10', -0.01, '10 ms earlier'), nb('−1', -0.001, '1 ms earlier'), nb('+1', 0.001, '1 ms later'), nb('+10', 0.01, '10 ms later'), nb('+beat', 'beat', 'One beat later')),
      h('div', { class: 'dim', style: { fontSize: '11.5px', textAlign: 'center' } }, 'milliseconds, or a whole beat at A’s tempo')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('label', { class: 'row', style: { gap: '10px' } }, loopChk, h('span', { class: 'grow', style: { fontSize: '14.5px', fontWeight: 500 } }, 'Loop a section of ' + id),
        h('span', { class: 'mono dim', style: { fontSize: '12px' } }, L.on ? fmt1(L.start) + ' – ' + fmt1(L.end) : '')),
      h('div', { class: 'grid4' },
        h('button', { type: 'button', class: 'btn', onClick: () => setTrackLoop(id, true, L.bars || 8, true) }, 'Start here'),
        [4, 8, 16].map((n) => h('button', { type: 'button', class: 'btn' + (L.on && L.bars === n ? ' on' : ''), 'aria-pressed': L.on && L.bars === n ? 'true' : 'false', onClick: () => setTrackLoop(id, true, n) }, n + ' bars')))),
    h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'btn' + (t.mute ? ' mute-on' : ''), style: { height: '46px' }, 'aria-pressed': t.mute ? 'true' : 'false', onClick: () => { t.mute = !t.mute; M.levels(); render(); } }, 'Mute ' + id),
      h('button', { type: 'button', class: 'btn' + (t.solo ? ' solo-on' : ''), style: { height: '46px' }, 'aria-pressed': t.solo ? 'true' : 'false', onClick: () => { t.solo = !t.solo; M.levels(); render(); } }, 'Solo ' + id)));
  const scrim = h('div', { class: 'scrim' }, sheet);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  return scrim;
}

// ------------------------------------------------------------------ views: song
function viewSong() {
  const st = S.song, s = st.song;
  if (!s) return h('main', { class: 'view' }, h('header', { class: 'vhead' }, h('h1', null, 'Song')),
    h('div', { class: 'empty' }, 'Pick a song in the Library, then choose Original, Vocals only, Instrumental or Custom mix.',
      h('div', { style: { marginTop: '12px' } }, h('button', { type: 'button', class: 'btn', onClick: () => { S.view = 'library'; render(); } }, 'Library'))));
  const k = parseKey(s.key);
  const mode = (m, label, sub) => h('button', { type: 'button', class: 'qbtn', style: { height: wide ? '54px' : '48px', fontSize: wide ? '15px' : '14px' }, 'aria-pressed': st.mode === m ? 'true' : 'false', disabled: stemKinds(s, m).length ? null : true, onClick: () => openSong(s, m, P.playing) }, label, wide ? h('span', null, sub) : null);
  const head = h('header', { class: 'vhead' }, h('h1', null, s.title), h('span', { class: 'dim', style: { fontSize: '14px' } }, s.artist),
    s.bpm ? h('span', { class: 'chip' }, fmtBpm(s.bpm) + ' BPM') : null, k ? h('span', { class: 'chip' }, keyName(k)) : null,
    h('div', { class: 'grow' }),
    wide ? h('button', { type: 'button', class: 'btn', onClick: () => { const kk = st.mode === 'custom' || st.mode === 'original' ? 'original' : st.mode; loadInto('A', s, s.files[kk] ? kk : kinds(s)[0]); S.view = 'mixer'; render(); } }, 'Open in the mixer') : null);
  const modes = h('div', { role: 'group', 'aria-label': 'What to play', style: { display: 'grid', gridTemplateColumns: 'repeat(' + (wide ? 4 : 2) + ', minmax(0, 1fr))', gap: '8px' } },
    mode('original', 'Original', 'the MP3'), mode('vocals', 'Vocals only', 'vocals stem'), mode('instrumental', 'Instrumental', 'instrumental stem'), mode('custom', 'Custom mix', 'set each stem below'));
  const len = P.length;
  const extra = [h('div', { class: 'ph', 'data-ph': 'P:main' })];
  if (P.loopMix.on && len) extra.unshift(h('div', { class: 'loopr', style: { left: (P.loopMix.start / len * 100) + '%', width: ((P.loopMix.end - P.loopMix.start) / len * 100) + '%', background: 'rgba(236,238,242,0.12)', borderColor: 'var(--text)' } }));
  if (st.loading) extra.push(h('div', { class: 'msg', 'data-load': 'song' }, st.loading));
  const wave = waveEl(st.peaks, 'rgba(227,174,87,0.75)', { label: 'Song position', duration: len, extra, onSeek: (f) => P.seek(f * len).then(render) });
  wave.style.flexGrow = '1'; wave.style.minWidth = '0'; wave.style.height = wide ? '64px' : '44px';
  const L = P.loopMix;
  const loopBtn = h('button', { type: 'button', class: 'btn ' + (L.on ? 'a-on' : 'off'), 'aria-pressed': L.on ? 'true' : 'false', disabled: len ? null : true, onClick: () => songLoop(!L.on, L.bars || 8) }, L.on ? 'Loop ' + fmt1(L.start) + '–' + fmt1(L.end) : 'Loop: off');
  const transport = h('section', { class: 'card', 'aria-label': 'Transport', style: { padding: wide ? '12px 16px' : '12px' } },
    h('div', { class: 'row', style: { gap: wide ? '16px' : '12px', flexWrap: wide ? 'nowrap' : 'wrap' } },
      h('button', { type: 'button', class: 'play', 'aria-label': P.playing ? 'Pause' : 'Play', onClick: () => togglePlay(P) }, playIcon(P.playing)),
      h('div', { class: 'time', 'data-time': 'P', style: { minWidth: wide ? '176px' : 0 } }, fmt(P.position), ' ', h('small', null, '/ ' + fmt(len, wide))),
      wide ? wave : null, wide ? loopBtn : h('div', { class: 'grow' }), wide ? null : loopBtn),
    wide ? null : wave,
    L.on ? h('div', { class: 'row', style: { gap: '6px' } },
      h('button', { type: 'button', class: 'btn sm', onClick: () => songLoop(true, L.bars || 8, true) }, 'Start here'),
      [4, 8, 16].map((n) => h('button', { type: 'button', class: 'btn sm' + (L.bars === n ? ' a-on' : ''), onClick: () => songLoop(true, n) }, n + ' bars'))) : null);
  let strips = null;
  if (st.mode === 'custom') {
    strips = h('section', { class: 'strips', 'aria-label': 'Stems' }, P.tracks.map((t) => {
      const val = h('span', { class: 'mono', style: { fontSize: '13px', color: t.mute ? 'var(--text3)' : 'var(--text)' } }, t.mute ? 'muted' : dbText(t.volDb));
      const f = h('input', { type: 'range', class: 'fader', min: -40, max: 6, step: 0.5, value: t.volDb, 'aria-label': SOURCE_NAMES[t.id] + ' level' });
      f.addEventListener('input', () => { t.volDb = +f.value; if (!t.mute) val.textContent = dbText(t.volDb); P.levels(); });
      f.addEventListener('dblclick', () => { t.volDb = 0; f.value = 0; val.textContent = dbText(0); P.levels(); });
      const ms = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignSelf: wide ? 'stretch' : 'center', minWidth: wide ? 0 : '96px' } },
        h('button', { type: 'button', class: 'btn' + (t.mute ? ' mute-on' : ''), style: { height: '34px', padding: 0 }, 'aria-pressed': t.mute ? 'true' : 'false', 'aria-label': 'Mute ' + SOURCE_NAMES[t.id], onClick: () => { t.mute = !t.mute; P.levels(); render(); } }, 'M'),
        h('button', { type: 'button', class: 'btn' + (t.solo ? ' solo-on' : ''), style: { height: '34px', padding: 0 }, 'aria-pressed': t.solo ? 'true' : 'false', 'aria-label': 'Solo ' + SOURCE_NAMES[t.id], onClick: () => { t.solo = !t.solo; P.levels(); render(); } }, 'S'));
      if (!wide) {
        return h('div', { class: 'strip' }, h('div', { style: { width: '84px', flex: 'none' } }, h('div', { style: { fontSize: '14px', fontWeight: 600 } }, SOURCE_NAMES[t.id]), val), f, ms);
      }
      return h('div', { class: 'strip' },
        h('div', { class: 'row', style: { alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'baseline' } }, h('span', { style: { fontSize: '15px', fontWeight: 600 } }, SOURCE_NAMES[t.id]), val),
        h('div', { style: { flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: '14px' } }, f, h('div', { class: 'vmeter' }, h('i', { 'data-stem': t.id }))),
        h('div', { style: { alignSelf: 'stretch' } }, panCtl(t, t.id, 'auto')), ms);
    }));
  }
  const foot = st.mode === 'custom' ? h('div', { class: 'row', style: { fontSize: '12.5px', color: 'var(--text2)', flexWrap: 'wrap' } },
    h('span', null, (s.has4 ? 'All four stems' : 'Both stems') + ' at 0 dB is close to the original.' + (s.has4 ? '' : ' This song has two stems, so Custom shows Vocals and Instrumental.')),
    h('div', { class: 'grow' }),
    h('button', { type: 'button', class: 'btn sm', onClick: () => { for (const t of P.tracks) { t.volDb = 0; t.pan = 0; t.mute = false; t.solo = false; } P.levels(); render(); } }, 'Reset to 0 dB')) : null;
  return h('main', { class: 'view' }, head, modes, transport, strips, foot, st.err ? h('div', { style: { color: 'var(--warn)' } }, st.err) : null);
}
async function songLoop(on, bars, here) {
  const s = S.song.song, bpm = s ? s.bpm : 0;
  const len = bpm ? bars * 4 * beatLen(bpm) : bars * 2, pos = P.position;
  if (on) {
    const st = P.loopMix.on && !here ? P.loopMix.start : snapToBar(pos, bpm, s.firstDownbeat || 0);
    P.loopMix = { on: true, start: st, end: Math.min(P.length, st + len), bars };
    if (P.playing && (pos < st || pos >= st + len)) await P.play(st); else await P.refresh();
  } else P.loopMix = { ...P.loopMix, on: false };
  render();
}

// ------------------------------------------------------------------ mini player (iPhone)
function miniPlayer() {
  if (S.view === 'mixer' || S.view === 'song' || S.sheet) return null;
  const songActive = S.song.song && (P && (P.playing || P.position > 0)) && !(M && M.playing);
  const mixActive = meta.A.song || meta.B.song;
  if (!songActive && !mixActive) return null;
  const player = songActive ? P : M;
  const title = songActive ? S.song.song.title + ' · ' + (S.song.mode === 'custom' ? 'Custom mix' : SOURCE_NAMES[S.song.mode]) : [meta.A.song && meta.A.song.title, meta.B.song && meta.B.song.title].filter(Boolean).join(' × ');
  const el = h('div', { class: 'mini' },
    h('button', { type: 'button', class: 'grow', style: { minWidth: 0, background: 'none', border: 0, textAlign: 'left', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '10px' }, onClick: () => { S.view = songActive ? 'song' : 'mixer'; render(); } },
      songActive ? null : h('div', { class: 'row', style: { gap: '3px', flex: 'none' } }, h('span', { class: 'badge A', style: { width: '18px', height: '18px', fontSize: '10px' } }, 'A'), h('span', { class: 'badge B', style: { width: '18px', height: '18px', fontSize: '10px' } }, 'B')),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'title', style: { fontSize: '13.5px' } }, title), h('div', { class: 'mono dim', style: { fontSize: '11.5px' }, 'data-time': songActive ? 'Pmini' : 'Mmini' }, fmt(player.position, false) + ' / ' + fmt(player.length, false)))),
    h('button', { type: 'button', class: 'play', style: { width: '40px', height: '40px' }, 'aria-label': player.playing ? 'Pause' : 'Play', onClick: () => togglePlay(player) }, playIcon(player.playing, 16)));
  return el;
}

// ------------------------------------------------------------------ export
function openExport() {
  const len = M.length;
  const loopOn = M.loopMix.on;
  let range = loopOn ? 'loop' : 'all', bits = store.get('bits', 24);
  const rate = (T.A.buffer || T.B.buffer).sampleRate;
  let busy = false, done = null;
  S.dialog = () => {
    const bar = h('i', { 'data-export': '1' });
    const name = 'Purist mix - ' + [meta.A.song && meta.A.song.title, meta.B.song && meta.B.song.title].filter(Boolean).join(' x ').replace(/[\\/:*?"<>|]/g, '') + '.wav';
    const radio = (group, v, label, cur, set) => {
      const i = h('input', { type: 'radio', name: group, checked: cur === v });
      i.addEventListener('change', () => { set(v); });
      return h('label', { class: 'check' }, i, h('span', null, label));
    };
    const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-label': 'Export the mix' },
      h('h2', null, 'Export the mix as WAV'),
      h('div', { class: 'dim', style: { fontSize: '13px' } }, 'Rendered at ' + (rate / 1000) + ' kHz, the songs’ own rate, so ChromeOS’s resampling never touches it.'),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'What'),
        radio('r', 'all', 'The whole mix · ' + fmt(len, false), range, (v) => { range = v; }),
        loopOn ? radio('r', 'loop', 'The looped section · ' + fmt1(M.loopMix.start) + '–' + fmt1(M.loopMix.end), range, (v) => { range = v; }) : null),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Format'),
        radio('b', 24, '24-bit (any app opens it)', bits, (v) => { bits = v; store.set('bits', v); }),
        radio('b', 32, '32-bit float (no rounding at all)', bits, (v) => { bits = v; store.set('bits', v); })),
      h('div', { class: 'progress' }, bar),
      done ? h('a', { class: 'btn primary', href: done.url, download: done.name }, 'Save ' + done.name) : null,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { type: 'button', class: 'btn', onClick: () => { if (done) URL.revokeObjectURL(done.url); S.dialog = null; render(); } }, done ? 'Close' : 'Cancel'),
        done ? null : h('button', { type: 'button', class: 'btn primary', disabled: busy ? true : null, onClick: async () => {
          busy = true; render();
          const from = range === 'loop' ? M.loopMix.start : 0, to = range === 'loop' ? M.loopMix.end : Math.min(len, 30 * 60);
          try {
            const out = await M.render(from, to, rate, (f) => { const b = document.querySelector('[data-export]'); if (b) b.style.width = Math.round(f * 100) + '%'; });
            const blob = encodeWav(out, bits);
            done = { url: URL.createObjectURL(blob), name };
            busy = false; render();
            const a = h('a', { href: done.url, download: name }); document.body.append(a); a.click(); a.remove();
          } catch (e) { busy = false; toast('Export failed: ' + (e.message || e)); render(); }
        } }, busy ? 'Rendering…' : 'Export')));
    const sc = h('div', { class: 'scrim dialog-scrim' }, dlg);
    return sc;
  };
  render();
}

// ------------------------------------------------------------------ settings
function viewSettings() {
  const inp = h('input', { type: 'text', value: S.base, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Music folder address' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return h('main', { class: 'view' }, h('header', { class: 'vhead' }, h('h1', null, 'Settings')),
    h('div', { class: 'settings' },
      h('section', { class: 'card' }, h('div', { class: 'label' }, 'Music folder'),
        h('label', { class: 'field' }, 'Where the songs are, relative to this app or a full https:// address', inp),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onClick: () => { S.base = inp.value.trim() || '../music/'; store.set('base', S.base); refreshLibrary(); toast('Reading the music folder…'); } }, 'Save and reload'),
          h('button', { type: 'button', class: 'btn', onClick: refreshLibrary }, 'Reload the library')),
        h('dl', { class: 'kv' },
          h('dt', null, 'Songs'), h('dd', null, S.lib ? String(S.lib.songs.length) : S.libErr ? 'not reachable' : '…'),
          h('dt', null, 'BPM and key from'), h('dd', null, S.lib ? (S.lib.from === 'library.json' ? 'library.json' : 'not yet (folder listing); BPM is estimated per track') : '—'),
          h('dt', null, 'Address'), h('dd', { style: { wordBreak: 'break-all' } }, S.lib ? S.lib.base : new URL(S.base, location.href).href))),
      h('section', { class: 'card' }, h('div', { class: 'label' }, 'Output'),
        h('dl', { class: 'kv' },
          h('dt', null, 'Mixing rate'), h('dd', null, ctx ? ctx.sampleRate + ' Hz' : 'starts with the first sound'),
          h('dt', null, 'Processing'), h('dd', null, '32-bit float, one rate conversion per file'),
          h('dt', null, 'Clip guard'), h('dd', null, 'only acts above −0.3 dBFS'),
          h('dt', null, 'Output delay'), h('dd', null, ctx && ctx.outputLatency ? Math.round((ctx.baseLatency + ctx.outputLatency) * 1000) + ' ms' : ctx ? Math.round(ctx.baseLatency * 1000) + ' ms' : '—')),
        isChromeOS() ? h('div', { class: 'dim', style: { fontSize: '12.5px' } }, 'ChromeOS mixes all sound at its own rate before the headphone jack or a USB DAC, so playback here can’t be bit-perfect. WAV exports skip that step.') : null),
      h('section', { class: 'card' }, h('div', { class: 'label' }, 'App'),
        h('dl', { class: 'kv' }, h('dt', null, 'Version'), h('dd', null, VERSION), h('dt', null, 'Installed'), h('dd', null, standalone ? 'yes' : 'no, running in the browser')),
        !standalone && deferredInstall ? h('div', null, h('button', { type: 'button', class: 'btn primary', onClick: doInstall }, 'Install Purist')) : null,
        !standalone && isiOS() ? h('div', { class: 'dim', style: { fontSize: '13px' } }, 'To install: tap Share, then Add to Home Screen.') : null)));
}

// ------------------------------------------------------------------ install banner
const isiOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function standaloneNow() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
async function doInstall() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (e) { /* closed */ }
  deferredInstall = null; S.banner = null; store.set('bannerDone', true); render();
}
function renderBanner() {
  let el = document.getElementById('banner');
  const want = !standaloneNow() && !store.get('bannerDone', false) && (deferredInstall || isiOS());
  if (!want) { if (el) el.remove(); return; }
  if (el) return;
  const close = () => { store.set('bannerDone', true); renderBanner(); };
  el = h('div', { id: 'banner', class: 'banner', role: 'region', 'aria-label': 'Install Purist' },
    h('div', { class: 'logo', style: { margin: 0, width: '32px', height: '32px', fontSize: '15px', flex: 'none' }, 'aria-hidden': 'true' }, 'P'),
    h('div', { class: 'grow' }, deferredInstall ? 'Install Purist on this ' + (isChromeOS() ? 'Pixelbook' : 'device') + ': its own window and an icon in the launcher.' : 'Install Purist: tap Share, then Add to Home Screen.'),
    deferredInstall ? h('button', { type: 'button', class: 'btn primary', onClick: doInstall }, 'Install') : null,
    h('button', { type: 'button', class: 'btn', onClick: close }, deferredInstall ? 'Not now' : 'OK'));
  document.body.append(el);
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; renderBanner(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; store.set('bannerDone', true); renderBanner(); });

// ------------------------------------------------------------------ live updates
function frame() {
  requestAnimationFrame(frame);
  if (!M) return;
  const set = (sel, fn) => { for (const el of document.querySelectorAll(sel)) fn(el); };
  const mlen = M.length, mpos = M.position;
  set('[data-ph="M:mix"]', (el) => { el.style.left = mlen ? Math.min(100, mpos / mlen * 100) + '%' : '0'; });
  for (const id of ['A', 'B']) {
    const t = T[id], p = t.posAt(mpos);
    set('[data-ph="M:' + id + '"]', (el) => { el.style.display = p == null ? 'none' : ''; if (p != null && t.duration) el.style.left = (p / t.duration * 100) + '%'; });
  }
  set('[data-time="M"]', (el) => { el.firstChild.textContent = fmt(mpos); });
  set('[data-bars="M"]', (el) => { el.textContent = mixBarsText(); });
  set('[data-time="Mmini"]', (el) => { el.textContent = fmt(mpos, false) + ' / ' + fmt(mlen, false); });
  const plen = P.length, ppos = P.position;
  set('[data-ph="P:main"]', (el) => { el.style.left = plen ? Math.min(100, ppos / plen * 100) + '%' : '0'; });
  set('[data-time="P"]', (el) => { el.firstChild.textContent = fmt(ppos); });
  set('[data-time="Pmini"]', (el) => { el.textContent = fmt(ppos, false) + ' / ' + fmt(plen, false); });
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -96);
  const w = (x) => Math.max(0, Math.min(100, (db(x) + 48) / 48 * 100));
  set('[data-stem]', (el) => { const p = P.peak(el.dataset.stem); el.style.height = w(p) + '%'; el.style.background = p > 0.89 ? 'var(--warn)' : 'var(--good)'; });
  set('[data-meter="l"]', (el) => { el.style.width = w(meters.l) + '%'; el.classList.toggle('hot', meters.l > 0.89); });
  set('[data-meter="r"]', (el) => { el.style.width = w(meters.r) + '%'; el.classList.toggle('hot', meters.r > 0.89); });
  set('[data-peak]', (el) => { const p = Math.max(meters.l, meters.r); el.textContent = p > 0.0001 ? 'peak ' + db(p).toFixed(1).replace('-', '−') + ' dB' + (meters.limited ? ' · guarded' : '') : 'peak —'; });
}

// ------------------------------------------------------------------ start
function start() {
  root = document.getElementById('app');
  matchMedia('(min-width: 820px)').addEventListener('change', () => render());
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => requestAnimationFrame(() => pendingDraws.forEach((f) => f())), 120); });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    e.preventDefault(); togglePlay();
  });
  document.addEventListener('pointerdown', () => { audio(); }, { once: true });
  render();
  refreshLibrary();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {});
  // the meters/time need the engine; it starts on the first tap (browsers require one for sound)
  audio().catch(() => {});
}
window.Purist = { S, T, meta, get M() { return M; }, get P() { return P; }, loadInto, openSong, togglePlay, swapAB, setTrackLoop, setMixLoop, applySync, render, get ctx() { return ctx; } };
start();
