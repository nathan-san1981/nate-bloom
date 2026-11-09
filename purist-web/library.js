// The song list: library.json when the Beelink has one, otherwise built from the folder listing.
const STEMS = ['vocals', 'instrumental', 'drums', 'bass', 'other'];
const AUDIO = /\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i;

export const SOURCE_NAMES = { original: 'Original', vocals: 'Vocals', instrumental: 'Instrumental', drums: 'Drums', bass: 'Bass', other: 'Other' };
export const SOURCE_ORDER = ['original', 'vocals', 'instrumental', 'drums', 'bass', 'other'];

function splitName(base) {
  const i = base.indexOf(' - ');
  return i > 0 ? { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() } : { artist: '', title: base.trim() };
}
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
export const fold = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w ]+/g, ' ');

function finish(song, base) {
  song.has4 = !!(song.files.drums && song.files.bass && song.files.other);
  song.search = fold(song.artist + ' ' + song.title);
  song.url = (k) => song.files[k] ? base + song.files[k].split('/').map(encodeURIComponent).join('/') : '';
  return song;
}

/** Group "Artist - Title.mp3" and "Artist - Title - vocals.flac" (etc.) into one entry per song. */
export function fromListing(names, base) {
  const songs = new Map();
  for (const raw of names) {
    const name = raw.replace(/^.*\//, '');
    if (!AUDIO.test(name)) continue;
    const stem = name.replace(AUDIO, '');
    let key = stem, kind = 'original';
    const m = stem.match(/^(.*?)\s+-\s+(vocals|instrumental|drums|bass|other)$/i);
    if (m) { key = m[1]; kind = m[2].toLowerCase(); }
    let s = songs.get(key);
    if (!s) { s = { id: slug(key), ...splitName(key), files: {}, bpm: 0, key: '', firstDownbeat: 0, lufs: {} }; songs.set(key, s); }
    // prefer the mp3 as the original if there are several
    if (kind === 'original' && s.files.original && !/\.mp3$/i.test(name)) continue;
    s.files[kind] = raw;
  }
  return [...songs.values()].filter((s) => Object.keys(s.files).length).map((s) => finish(s, base));
}

export function fromJson(j, base) {
  return (j.songs || []).filter((s) => s && s.files).map((s) => {
    const split = splitName(s.title && s.artist ? s.artist + ' - ' + s.title : (s.title || s.id || ''));
    return finish({
      id: s.id || slug((s.artist || '') + ' ' + (s.title || '')),
      artist: s.artist || split.artist, title: s.title || split.title,
      files: Object.fromEntries(Object.entries(s.files).filter(([k, v]) => v && (k === 'original' || STEMS.includes(k)))),
      bpm: +s.bpm || 0, key: s.key || '', camelot: s.camelot || '', firstDownbeat: +s.firstDownbeat || 0,
      lufs: s.lufs || {}, frames: s.frames || {}, duration: +s.duration || 0
    }, base);
  });
}

/** Names linked from an HTML directory listing (python http.server, Caddy, tailscale serve, nginx). */
export function parseListing(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (!h || h.startsWith('?') || h.startsWith('#') || h.endsWith('/') || /^[a-z]+:/i.test(h)) continue;
    try { out.push(decodeURIComponent(h.split('?')[0])); } catch (e) { out.push(h); }
  }
  return out;
}

export async function loadLibrary(base) {
  if (!base.endsWith('/')) base += '/';
  let json = null;
  try {
    const r = await fetch(base + 'library.json', { cache: 'no-cache' });
    if (r.ok) json = await r.json();
  } catch (e) { json = null; }
  if (json) {
    const songs = fromJson(json, base);
    if (songs.length) return { songs: sortBy(songs, 'title'), from: 'library.json', base };
  }
  const r = await fetch(base, { cache: 'no-cache' });
  if (!r.ok) throw new Error('The Beelink answered ' + r.status + ' for the music folder');
  const songs = fromListing(parseListing(await r.text()), base);
  return { songs: sortBy(songs, 'title'), from: 'listing', base };
}

const article = (s) => fold(s).replace(/^(the|a|an) /, '');
export function sortBy(songs, how) {
  const cmp = {
    title: (a, b) => article(a.title).localeCompare(article(b.title)) || article(a.artist).localeCompare(article(b.artist)),
    artist: (a, b) => article(a.artist).localeCompare(article(b.artist)) || article(a.title).localeCompare(article(b.title)),
    bpm: (a, b) => (a.bpm || 999) - (b.bpm || 999) || article(a.title).localeCompare(article(b.title)),
    key: (a, b) => (a.camelot || a.key || '~').localeCompare(b.camelot || b.key || '~') || article(a.title).localeCompare(article(b.title))
  }[how] || (() => 0);
  return songs.slice().sort(cmp);
}
