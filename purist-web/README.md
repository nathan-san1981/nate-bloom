# Purist Web

Hi-fi player and two-track mixer for the song folder on the Beelink. Runs in Chrome on the Pixelbook
(installable as an app) and in Safari on the iPhone (Add to Home Screen).

## How it's served

The Beelink serves this folder and the music from one HTTPS origin on the tailnet:

    https://beelink.tailcc6b31.ts.net/purist/   this folder
    https://beelink.tailcc6b31.ts.net/music/    the songs (directory listing on, Range requests)

The music folder defaults to `../music/` relative to the app; Settings can point it elsewhere.
HTTPS is required: browsers only run AudioWorklet and installable web apps on secure pages.

## Library

`music/library.json` if present (see the schema below), otherwise the directory listing, grouped by
name: `Artist - Title.mp3`, `Artist - Title - vocals.flac`, `- instrumental`, `- drums`, `- bass`,
`- other`. Without library.json the app estimates BPM when a track loads and shows no key.

    { "version": 1, "songs": [{ "id", "artist", "title",
      "files": { "original", "vocals", "instrumental", "drums", "bass", "other" },
      "sampleRate", "frames": { per file }, "bpm", "firstDownbeat", "key", "camelot",
      "lufs": { per file } }] }

## Audio

- `engine.js`: every track is scheduled on one AudioContext clock. Tracks at their own speed and
  pitch play the decoded samples untouched; a tempo-matched or key-shifted track goes through
  Signalsmith Stretch (MIT, `vendor/`), whose scheduling compensates its own latency.
- `guard-worklet.js`: output clip guard (gain exactly 1 below −0.3 dBFS) and meters.
- WAV export renders the same graph offline at the songs' own sample rate, 24-bit (TPDF dither)
  or 32-bit float.

## Files

`index.html`, `style.css`, `app.js` (UI), `engine.js`, `library.js`, `guard-worklet.js`, `sw.js`
(network-first app shell, never caches music), `manifest.webmanifest`, `icons/`, `vendor/`.
