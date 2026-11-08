// Nate Bloom Box, Listen: the box as a YouTube / YouTube Music cast target.
// Run by main.js with ELECTRON_RUN_AS_NODE=1 (Electron's own Node), detached with Spotify and AirPlay, so it outlives
// the app while Moonlight has the screen. yt-cast-receiver answers the phone's Cast button (DIAL + YouTube's lounge
// API); the box fetches and plays the audio itself with mpv + yt-dlp, so the phone is only the remote.
//   NB_LISTEN_FILE   now-playing JSON shared with Spotify/AirPlay (/run/nb-box/listen.json)
//   NB_YTCAST_FILE   this receiver's own state: TV code, connected phones (/run/nb-box/ytcast.json)
//   NB_YTCAST_NAME   name in the Cast menu
//   NB_YTDLP         yt-dlp binary (kept up to date here, once a day)
"use strict";
const fs = require("fs"), path = require("path"), net = require("net"), os = require("os");
const { spawn, execFile } = require("child_process");
const YCR = require("yt-cast-receiver");
const YouTubeCastReceiver = YCR.default || YCR.YouTubeCastReceiver || YCR;
const { Player, Constants } = YCR;

const RUN = process.env.NB_BOX_RUN || "/run/nb-box";
const NOW = process.env.NB_LISTEN_FILE || path.join(RUN, "listen.json");
const STATE = process.env.NB_YTCAST_FILE || path.join(RUN, "ytcast.json");
const NAME = process.env.NB_YTCAST_NAME || "Nate Bloom Box";
const YTDLP = process.env.NB_YTDLP || "/opt/nb-box/ytdlp/yt-dlp";
const SOCK = path.join(RUN, "ytcast-mpv.sock");

const writeJson = (f, o) => { try { fs.writeFileSync(f + ".part", JSON.stringify(o)); fs.renameSync(f + ".part", f); } catch (e) {} };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return {}; } };
const state = { code: null, phones: [] };
const saveState = () => writeJson(STATE, state);

// what's playing, in the same file Spotify and AirPlay use; idle/stopped only overwrite our own entry
let meta = {};
function now(st) {
  const cur = readJson(NOW);
  if ((st === "idle" || st === "stopped") && cur.source && !/^YouTube/.test(cur.source)) return;
  writeJson(NOW, { name: meta.name || "", artists: meta.artists || "", album: meta.album || "", state: st, source: meta.source || "YouTube", t: Date.now() / 1000 });
}

/* ---- mpv over its JSON IPC socket ---- */
let mpv = null, conn = null, reqId = 0;
const pending = new Map(), handlers = [];
function startMpv() {
  if (mpv) return Promise.resolve();
  try { fs.rmSync(SOCK); } catch (e) {}
  mpv = spawn("mpv", ["--idle=yes", "--no-video", "--no-terminal", "--input-ipc-server=" + SOCK, "--audio-client-name=nb-ytcast",
    "--ytdl=yes", "--ytdl-format=bestaudio/best", "--script-opts=ytdl_hook-ytdl_path=" + YTDLP, "--volume=60", "--cache=yes",
    "--demuxer-max-bytes=20MiB"], { stdio: "ignore" });
  mpv.on("exit", () => { mpv = null; conn = null; for (const [, p] of pending) p.reject(new Error("mpv exited")); pending.clear(); });
  mpv.on("error", () => { mpv = null; });
  return new Promise((res, rej) => {
    let n = 0;
    const tryConnect = () => {
      const c = net.connect(SOCK);
      c.on("connect", () => {
        conn = c; let buf = "";
        c.on("data", d => {
          buf += d; let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line) continue;
            let m; try { m = JSON.parse(line); } catch (e) { continue; }
            if (m.request_id && pending.has(m.request_id)) { const p = pending.get(m.request_id); pending.delete(m.request_id); m.error === "success" ? p.resolve(m.data) : p.reject(new Error(m.error)); }
            else if (m.event) handlers.forEach(h => { try { h(m); } catch (e) {} });
          }
        });
        c.on("close", () => { conn = null; });
        res();
      });
      c.on("error", () => { if (++n > 50) rej(new Error("mpv socket")); else setTimeout(tryConnect, 100); });
    };
    setTimeout(tryConnect, 100);
  });
}
function cmd(...command) {
  if (!conn) return Promise.reject(new Error("mpv not running"));
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    conn.write(JSON.stringify({ command, request_id: id }) + "\n");
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout")); } }, 15000);
  });
}
const get = p => cmd("get_property", p).catch(() => null);
const set = (p, v) => cmd("set_property", p, v).then(() => true, () => false);

/* ---- title and artist: yt-dlp, alongside mpv's own load ---- */
function meta4(url) {
  return new Promise(res => {
    execFile(YTDLP, ["--no-warnings", "--skip-download", "--no-playlist", "--print", "%(track,title)s\t%(artist,creator,uploader)s\t%(album|)s", url],
      { timeout: 20000 }, (err, out) => {
        if (err || !out) return res(null);
        const [name, artists, album] = String(out).trim().split("\t");
        res({ name, artists: (artists || "").replace(/ - Topic$/, ""), album: album === "NA" ? "" : album || "" });
      });
  });
}

/* ---- the player yt-cast-receiver drives ---- */
const S = Constants.PLAYER_STATUSES;
class BoxPlayer extends Player {
  constructor() { super(); this.vol = { level: 60, muted: false }; this.token = 0; }
  async doPlay(video, position) {
    await startMpv();
    const music = video.client && Constants.CLIENTS && video.client === Constants.CLIENTS.YTMUSIC;
    const url = (music ? "https://music.youtube.com/watch?v=" : "https://www.youtube.com/watch?v=") + video.id;
    const tok = ++this.token;
    try { fs.writeFileSync(path.join(RUN, "radio-stop"), ""); } catch (e) {}   // (one music source at a time: the radio gives way)
    meta = { source: music ? "YouTube Music" : "YouTube" };
    now("playing");
    meta4(url).then(m => { if (m && tok === this.token) { Object.assign(meta, m); now(this.paused ? "paused" : "playing"); } });
    const loaded = new Promise(res => {
      const h = m => {
        if (m.event === "file-loaded") { done(true); }
        else if (m.event === "end-file" && (m.reason === "error" || m.file_error)) done(false);
      };
      const done = ok => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); res(ok); };
      handlers.push(h); setTimeout(() => done(false), 30000);
    });
    // (no start= option: loadfile's argument order changed in mpv 0.38, so seek once it's loaded instead)
    try { await cmd("loadfile", url, "replace"); } catch (e) { return false; }
    await set("pause", false); this.paused = false;
    const ok = await loaded;
    if (ok && position > 1) await cmd("seek", position, "absolute").catch(() => {});
    if (!ok && tok === this.token) now("stopped");
    return ok;
  }
  async doPause() { this.paused = true; const ok = await set("pause", true); now("paused"); return ok; }
  async doResume() { this.paused = false; const ok = await set("pause", false); now("playing"); return ok; }
  async doStop() { this.token++; this.paused = false; try { await cmd("stop"); } catch (e) {} now("stopped"); return true; }
  async doSeek(position) { return cmd("seek", position, "absolute").then(() => true, () => false); }
  async doSetVolume(v) { this.vol = { level: v.level, muted: !!v.muted }; if (!conn) return true; await set("volume", v.level); await set("mute", !!v.muted); return true; }
  async doGetVolume() { return this.vol; }
  async doGetPosition() { return (await get("time-pos")) || 0; }
  async doGetDuration() { return (await get("duration")) || 0; }
}
const player = new BoxPlayer();
if (process.env.NB_YTCAST_TEST) global.__nbYtPlayer = player;   // (tests drive the player directly)

// the end of a song: the receiver doesn't notice by itself, so move on to the next one in the phone's queue
handlers.push(async m => {
  if (m.event === "end-file" && m.reason === "eof") {
    try { await player.pause(); await player.next(); } catch (e) {}
  }
});

/* ---- the receiver ---- */
const receiver = new YouTubeCastReceiver(player, {
  device: { name: NAME, screenName: NAME, brand: "Nate Bloom", model: "Box" },
  dial: { port: 8099 },
  logLevel: Constants.LOG_LEVELS.WARN,
});
receiver.on("senderConnect", s => { state.phones = receiver.getConnectedSenders().map(x => x.name || "phone"); saveState(); });
receiver.on("senderDisconnect", () => {
  state.phones = receiver.getConnectedSenders().map(x => x.name || "phone"); saveState();
  if (!state.phones.length) now("idle");
});
receiver.on("error", () => {});

// the TV code, for "Link with TV code" when the Cast button doesn't list the box (refreshes every five minutes)
function codes() {
  try {
    const svc = receiver.getPairingCodeRequestService();
    svc.on("response", c => { state.code = String(c).replace(/(\d{3})(?=\d)/g, "$1 "); saveState(); });
    svc.on("error", () => { state.code = null; saveState(); setTimeout(() => { try { svc.start(); } catch (e) {} }, 60000); });
    svc.start();
  } catch (e) {}
}

// yt-dlp goes stale when YouTube changes things: update it at most once a day (it lives in a folder the box user owns)
function freshen() {
  const stamp = path.join(path.dirname(YTDLP), ".updated");
  let last = 0; try { last = fs.statSync(stamp).mtimeMs; } catch (e) {}
  if (Date.now() - last < 864e5) return;
  execFile(YTDLP, ["-U"], { timeout: 120000 }, () => { try { fs.writeFileSync(stamp, ""); } catch (e) {} });
}

// the app asks for a stop (the radio or Spotify starting) by creating ytcast-stop
setInterval(() => { const f = path.join(RUN, "ytcast-stop"); if (!fs.existsSync(f)) return; try { fs.rmSync(f); } catch (e) {} player.stop().catch(() => {}); }, 1000);
(async () => {
  saveState();
  try { await receiver.start(); } catch (e) { process.exit(1); }
  codes(); freshen(); setInterval(freshen, 6 * 36e5);
})();
const quit = async () => { try { await receiver.stop(); } catch (e) {} try { mpv && mpv.kill(); } catch (e) {} try { fs.rmSync(STATE); } catch (e) {} process.exit(0); };
process.on("SIGTERM", quit); process.on("SIGINT", quit);
