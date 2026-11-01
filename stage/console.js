/* Nate Bloom Stage: the console (stage 3 of the rebuild). Three panels on the tablet's state document, sent over the
   link as patches: the Director (the set list, the song that plays, what comes next, the notes large), the Mixer
   (every channel with a mouse: level, mute, solo), and the Library (every sound the tablet has, searched by name, sent
   to the tablet to play alone or to layer). Each change is an intent the tablet applies or refuses; the tablet wins
   every conflict, and if the link drops nothing here changes anything there.
   166: the song watcher (C.onSong: who wants to know when the song changes), and rehearsal on the Director: a count-in
   (a bar of the headphone click, then ▶), a run-through timer that remembers each song's last length, the "Next:" cue. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const A = () => window.__stageAPI;
  const C = { doc: null, lib: null, pending: new Map(), seq: 0, rtt: [], favs: [], q: "", cat: "all", view: "", drag: null, dragT: 0, lastDoc: 0 };
  window.__console = C;
  C.paintStatus = () => paintStatus();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const setT = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const sec = k => (C.doc && C.doc[k]) || null;
  // ---------- intents: ask, wait for the answer, measure the trip ----------
  function intent(path, extra) {
    const a = A(); if (!a || !a.up()) { if (a) a.toast("Not linked to the tablet"); return Promise.resolve({ ok: false, msg: "not linked" }); }
    // (no "base" unless the caller gives one: the console commands, it doesn't edit a copy, so a change the tablet made
    //  a moment ago is no reason to refuse the next slider move)
    const id = "i" + (++C.seq), it = Object.assign({ id, path }, extra || {}), at = performance.now();
    return new Promise(res => {
      const t = setTimeout(() => { C.pending.delete(id); res({ ok: false, msg: "no answer from the tablet" }); a.toast("No answer from the tablet"); paintStatus(); }, 4000);
      C.pending.set(id, { res, t, at }); a.send("intent", it);
    });
  }
  C.intent = intent;
  C.onAck = d => {
    const p = C.pending.get(d.id); if (!p) return false;
    clearTimeout(p.t); C.pending.delete(d.id);
    C.rtt.push(performance.now() - p.at); if (C.rtt.length > 20) C.rtt.shift();
    p.res(d); if (!d.ok && d.msg) A().toast(d.msg); paintStatus(); return true;
  };
  C.onDoc = d => {
    if (!C.doc) C.doc = { secs: {} };
    Object.assign(C.doc, d.patch || {}); C.doc.ver = d.ver; if (d.secs) C.doc.secs = d.secs; C.lastDoc = performance.now();
    paint(Object.keys(d.patch || {}));
    if (d.patch && d.patch.setlist) songWatch();
  };
  C.onData = d => {
    if (d && d.kind === "library") { C.lib = d; C.favs = d.favs || []; libPaint(); return true; }
    if (d && d.kind === "favs") { C.favs = d.favs || []; if (C.view === "vLib") libPaint(); return true; }
    return false;
  };
  C.onView = v => { C.view = v; if (v === "vDir" || v === "vMix" || v === "vLib") paint(["setlist", "transport", "stack", "mixer", "perms", "fx", "jam", "rig"]); if (v === "vLib" && !C.lib) A().send("pull", { kind: "library" }); };
  C.onUp = () => { const a = A(); C.upAt = performance.now(); a.send("pull", { kind: "doc" }); if (C.view === "vLib" || !C.lib) a.send("pull", { kind: "library" }); setTimeout(paintStatus, 4500); };
  const rtt = () => C.rtt.length ? Math.round(C.rtt.reduce((s, x) => s + x, 0) / C.rtt.length) : null;
  const NEED = 158;   // the first tablet build that sends the document
  const tabBuild = () => { try { const X = window.__stage; return (C.doc && C.doc.rig && C.doc.rig.build) || (X && X.st && X.st.b) || 0; } catch (e) { return 0; } };
  // linked for a while, the tablet talks (st), but no document: its page is older than this one
  const oldTablet = () => { const a = A(), X = window.__stage; return !!(a && a.up() && !C.doc && X && X.st && X.stAt && performance.now() - X.stAt < 15000 && performance.now() - C.upAt > 4000); };
  C.upAt = 0;
  function paintStatus() {
    const a = A(), p = sec("perms") || {}, r = rtt(), b = tabBuild();
    const txt = (a && a.up() ? "linked" : "not linked") + (r != null ? " · a change takes " + r + " ms" : "") + (C.doc ? " · state v" + C.doc.ver : "") + (b ? " · tablet build " + b : "")
      + (oldTablet() ? " · the tablet's page is older than this one: reload Nate Bloom there" : "");
    ["dStatus", "xStatus", "lStatus"].forEach(id => setT($(id), txt));
    const e = $("xEmpty"); if (e && !e.hidden) setT(e, !(a && a.up()) ? "Not linked to the tablet." : oldTablet() ? "The tablet runs an older Nate Bloom (build " + (b || "before " + NEED) + "): it doesn't send its channels yet. Reload Nate Bloom on the tablet (close and reopen the app, or ☰ → Reload) and this fills in." : C.doc ? "The tablet sent no channels (state v" + C.doc.ver + ")." : "Waiting for the tablet's channels…");
    setT($("xPerm"), "levels: " + permWord(p.levels)); setT($("dPerm"), "scenes: " + permWord(p.scenes)); setT($("lPerm"), "sounds: " + permWord(p.sound));
  }
  const permWord = v => ({ always: "any time", "between-songs": "only between songs", ask: "the tablet asks first", never: "never" })[v] || "any time";
  function paint(ch) {
    if (!C.doc) return; const s = new Set(ch || []);
    if (C.view === "vDir" && (s.has("setlist") || s.has("transport") || s.has("stack") || s.has("fx") || s.has("jam") || s.has("rig"))) dirPaint();
    if (C.view === "vMix" && s.has("mixer")) mixPaint();
    if (C.view === "vLib" && (s.has("stack") || s.has("perms"))) libHead();
    if (s.has("perms") || s.has("rig")) paintStatus();
  }
  // ---------- the Director ----------
  function dirPaint() {
    const sl = sec("setlist") || { songs: [], cur: -1 }, t = sec("transport") || {}, st = sec("stack") || { layers: [] }, fx = sec("fx") || {};
    const rows = $("dList"); const html = (sl.songs || []).map((S, i) => `<button type="button" class="c-row${i === sl.cur ? " cur" : ""}" data-i="${i}"><span class="num">${i + 1}</span><span class="nm"><b>${esc(S.name)}</b><small>${S.bpm ? Math.round(S.bpm) + " bpm" : ""}${S.vis ? " · " + esc(visName(S.vis)) : ""}${songDur(S.name) ? " · last run " + songDur(S.name) : ""}${i === sl.cur ? (sl.pending ? " · switching on the next bar" : " · playing now") : ""}</small></span><span class="go">${i === sl.cur ? "now" : "Go ›"}</span></button>`).join("") || '<p class="note">No songs on the tablet yet. Set the tablet up the way the first song should sound, then + Add song.</p>';
    if (rows.__html !== html) { rows.__html = html; rows.innerHTML = html; }
    const cur = sl.cur >= 0 ? sl.songs[sl.cur] : null, nx = sl.cur >= 0 && sl.cur + 1 < (sl.songs || []).length ? sl.songs[sl.cur + 1] : null;
    setT($("dNow"), cur ? cur.name : (sl.songs || []).length ? "No song chosen" : "No set list");
    setT($("dNowSub"), cur ? Math.round(cur.bpm || t.tempo || 0) + " bpm" + (sl.pending ? " · switching on the next bar" : "") : t.tempo ? Math.round(t.tempo) + " bpm" : "");
    setT($("dNext"), nx ? "Next: " + nx.name : cur ? "Last song" : "");
    const notesOf = () => { try { const X = window.__stage; const S = X && X.setlist && X.setlist.songs ? X.setlist.songs[sl.cur] : null; return S && S.notes ? S.notes : ""; } catch (e) { return ""; } };
    const notes = notesOf(); setT($("dNotes"), notes || (cur ? "No notes for this song yet: write them in Editor → Set list." : "")); $("dNotes").classList.toggle("empty", !notes);
    setT($("dStack"), (st.layers || []).map(l => l.name + (l.arp ? " (arp)" : "")).join(" · ") || "nothing on the keys");
    setT($("dFx"), fx.on === false ? "FX off" : "FX on");
    const on = Object.keys(t.playing || {}).filter(k => t.playing[k]);
    setT($("dPlaying"), on.length ? "playing: " + on.map(k => ({ seq: "Seq", rc: "Rhythm", bp: "Pads" })[k] || k).join(", ") : "stopped");
    $("dPrev").disabled = !(sl.songs || []).length; $("dNext2").disabled = !(sl.songs || []).length || sl.cur + 1 >= (sl.songs || []).length; $("dSave").disabled = !cur;
  }
  function dirChord() {
    try { const X = window.__stage, b = X && X.band; if (b && b.chord && b.on) { const q = b.chord.q || ""; return NN[((b.chord.root % 12) + 12) % 12] + (q === "min" ? "m" : q === "maj" ? "" : q); } } catch (e) {}
    return "";
  }
  function dirTick() {
    rehTick();
    if (C.view !== "vDir") return;
    const X = window.__stage; let txt = "";
    try {
      const g = X && X.grid, a = A();
      if (g && g.src && g.perf0 != null && g.sd && a) { const now = a.tabNow(); const bar = 16 * g.sd * 1000; const into = ((now - g.perf0) % bar + bar) % bar; const left = (bar - into) / 1000; txt = "next bar in " + left.toFixed(1) + " s"; }
    } catch (e) {}
    setT($("dBar"), txt); const ch = dirChord(); setT($("dChord"), ch); $("dChord").hidden = !ch;
    rehPaint();
  }
  setInterval(dirTick, 100);
  // ---------- (166) the song watcher: the current song from the document, and who wants to know when it changes ----------
  const SW = { sig: null, at: 0, cur: null, subs: [] };
  C.onSong = f => { SW.subs.push(f); if (SW.cur) { try { f(SW.cur, null, true); } catch (e) {} } };
  C.songNow = () => SW.cur;
  C.songAt = () => SW.at;
  function songWatch() {
    const sl = sec("setlist"); if (!sl) return;
    const i = sl.cur == null ? -1 : sl.cur, S = i >= 0 && sl.songs ? sl.songs[i] : null, name = sl.name || (S && S.name) || "";
    let vis = sl.vis || (S && S.vis) || "";
    if (!vis) { try { const X = window.__stage, L = X && X.setlist && X.setlist.songs ? X.setlist.songs.find(x => x.i === i) : null; if (L && L.vis) vis = L.vis; } catch (e) {} }
    const sig = i + ":" + name;
    if (sig === SW.sig) {   // the same song; its visual edited while it plays counts as a change for the visuals only (not the timer)
      if (SW.cur && (vis || "") !== (SW.cur.vis || "")) { SW.cur.vis = vis; SW.subs.forEach(f => { try { f(SW.cur, SW.cur, false, true); } catch (e) { console.error(e); } }); if (C.view === "vDir") dirPaint(); }
      return;
    }
    const prev = SW.cur, prevAt = SW.at, now = performance.now();
    SW.cur = name ? { i, name, vis, bpm: S && S.bpm } : null; SW.at = now; SW.sig = sig;
    if (prev && prev.name && prevAt && now - prevAt >= 2000) rehRemember(prev.name, now - prevAt);   // the run-through just finished
    REH.cueOn = null; REH.at = SW.cur ? now : 0;
    SW.subs.forEach(f => { try { f(SW.cur, prev, false); } catch (e) { console.error(e); } });
    if (C.view === "vDir") dirPaint();
  }
  setInterval(songWatch, 250);
  // ---------- (166) rehearsal: a count-in, a run-through timer per song, and the "Next:" cue ----------
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const REH = { dur: ls.get("stage-songdur", {}), at: 0, count: null, cueOn: null, cueSent: "", cueName: "" };   // cueOn: null = by itself (last 30 s), true = shown by hand, false = hidden by hand, until the next song
  const fmtMs = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const visName = id => { try { const m = NBVisuals.modes.find(x => x.id === id); return m ? m.name : id; } catch (e) { return id; } };
  function songDur(name) { const d = REH.dur[name]; return d ? fmtMs(d) : null; }
  C.songDur = songDur;
  function rehRemember(name, ms) { if (!name || !(ms > 0)) return; REH.dur[name] = Math.round(ms); ls.set("stage-songdur", REH.dur); }
  C.durations = list => { (list || []).forEach(x => rehRemember(x.name, x.ms)); if (C.view === "vDir") dirPaint(); };   // from a Capture's markers
  function countIn() {
    const a = A(), X = window.__stage; if (!a || !a.up()) { if (a) a.toast("Not linked to the tablet"); return; }
    if (REH.count) return;
    const S4 = window.__stage4; if (!S4 || !S4.click) { a.toast("The click isn't loaded: reload the page"); return; }
    const t = sec("transport") || {}, bpm = t.tempo || (X && X.st && X.st.bpm) || 120, beat = 60 / bpm;
    const ac = a.audio(); if (!ac) return;
    const lead = 0.1, t0 = ac.currentTime + lead;
    for (let n = 0; n < 4; n++) S4.click(t0 + n * beat, n === 0);
    REH.count = { bpm, t0: performance.now() + lead * 1000, beatMs: beat * 1000 };
    // ▶ lands on the downbeat after the bar: the command leaves half a round trip early; if the tablet already plays, it stays as it is
    const rtt = (X && X.L && X.L.rtt) || 0, wait = lead * 1000 + 4 * beat * 1000 - rtt / 2;
    setTimeout(() => {
      REH.count = null; const s = X && X.st, playing = !!(s && s.on && s.on[s.play]);
      if (!playing) { a.cmd({ do: "play" }); a.toast("▶ after the count-in"); } else a.toast("The tablet already plays: count-in only");
      rehPaint();
    }, Math.max(0, wait));
    a.toast("Count-in: one bar at " + Math.round(bpm) + " bpm, then ▶");
    rehPaint();
  }
  function rehNext() { const sl = sec("setlist"); if (!sl || !(sl.cur >= 0) || !sl.songs) return null; const nx = sl.songs[sl.cur + 1]; return nx ? nx.name : null; }
  function rehTick() {   // the cue: on demand, or in the last 30 s of a song whose length is known
    const cur = SW.cur, nx = cur ? rehNext() : null; let on = false;
    if (nx) { if (REH.cueOn != null) on = REH.cueOn; else { const d = REH.dur[cur.name]; if (d && REH.at && performance.now() - REH.at >= d - 30000) on = true; } }
    const name = on ? nx : "";
    if (name !== REH.cueSent) { REH.cueSent = name; if (window.__audRelay) __audRelay("cue", { name }); }
    REH.cueName = name;
  }
  C.cueNow = () => REH.cueName;
  function rehPaint() {
    const tm = $("rTimer"); if (!tm) return;
    const cur = SW.cur, ms = cur && REH.at ? performance.now() - REH.at : 0;
    setT(tm, cur ? fmtMs(ms) : "–:––");
    const d = cur ? REH.dur[cur.name] : null; setT($("rTimerSub"), cur ? (d ? "last run " + fmtMs(d) : "first run") : "no song");
    const cb = $("rCount"); if (REH.count) { const n = Math.min(4, Math.max(1, Math.floor((performance.now() - REH.count.t0) / REH.count.beatMs) + 1)); setT(cb, "Count-in · " + n); cb.setAttribute("aria-pressed", "true"); } else { setT(cb, "Count-in"); cb.setAttribute("aria-pressed", "false"); }
    $("rCue").setAttribute("aria-pressed", String(!!REH.cueName)); $("rCue").disabled = !rehNext();
    const c = $("dCue"); setT(c, REH.cueName ? "Next: " + REH.cueName : ""); c.hidden = !REH.cueName;
  }
  C.REH = REH; C.countIn = countIn;
  // ---------- the Mixer ----------
  const chanRow = (c, i) => `<div class="mx-row${c.muted ? " muted" : ""}${c.solo ? " solo" : ""}" data-i="${i}">
      <div class="mx-name"><b>${esc(c.name.replace(/ volume$/, ""))}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</div>
      <button type="button" class="mx-btn mx-m" aria-pressed="${!!c.muted}" title="Mute">M</button><button type="button" class="mx-btn mx-s" aria-pressed="${!!c.solo}" title="Solo">S</button>
      <input type="range" class="mx-slider" min="0" max="100" step="1" value="${c.pos}" aria-label="${esc(c.name)} level">
      <output class="mx-db">${esc(c.text)}</output></div>`;
  function mixPaint() {
    const mx = sec("mixer") || []; const box = $("xRows");
    const groups = []; mx.forEach((c, i) => { let g = groups.find(x => x.g === c.group); if (!g) { g = { g: c.group, rows: [] }; groups.push(g); } g.rows.push([c, i]); });
    const sig = JSON.stringify(mx.map(c => [c.name, c.group, c.muted, c.solo]));
    if (box.__sig !== sig) { box.__sig = sig; box.innerHTML = groups.map(g => `<div class="lab mx-g">${esc(g.g)}</div>` + g.rows.map(([c, i]) => chanRow(c, i)).join("")).join(""); }
    mx.forEach((c, i) => { const r = box.querySelector(`.mx-row[data-i="${i}"]`); if (!r) return; const sl = r.querySelector(".mx-slider"); if (!(C.drag && C.drag.i === i) && +sl.value !== c.pos) sl.value = c.pos; setT(r.querySelector(".mx-db"), c.text); });
    $("xEmpty").hidden = mx.length > 0;
  }
  $("xRows").addEventListener("input", e => {
    const sl = e.target.closest(".mx-slider"); if (!sl) return; const i = +sl.closest(".mx-row").dataset.i;
    C.drag = { i, v: +sl.value }; if (!C.dragT) C.dragT = setTimeout(() => { C.dragT = 0; const d = C.drag; if (d) intent("mixer.pos", { index: d.i, value: d.v }); }, 60);
  });
  $("xRows").addEventListener("change", e => { const sl = e.target.closest(".mx-slider"); if (!sl) return; const i = +sl.closest(".mx-row").dataset.i; clearTimeout(C.dragT); C.dragT = 0; C.drag = null; intent("mixer.pos", { index: i, value: +sl.value }); });
  $("xRows").addEventListener("click", e => {
    const b = e.target.closest(".mx-btn"); if (!b) return; const i = +b.closest(".mx-row").dataset.i, on = b.getAttribute("aria-pressed") !== "true";
    intent(b.classList.contains("mx-m") ? "mixer.mute" : "mixer.solo", { index: i, value: on });
  });
  // ---------- the Library ----------
  function libHead() {
    const st = sec("stack") || { layers: [] }, p = sec("perms") || {};
    const box = $("lStack"); const html = (st.layers || []).map((l, i) => `<span class="chip">${esc(l.name)}${l.arp ? " · arp" : ""}<button type="button" class="chip-x" data-n="${esc(l.name)}" title="Stop this layer">✕</button></span>`).join("") || '<span class="note">nothing on the keys</span>';
    if (box.__html !== html) { box.__html = html; box.innerHTML = html; }
    setT($("lPerm"), "sounds: " + permWord(p.sound));
  }
  $("lStack").addEventListener("click", e => { const b = e.target.closest(".chip-x"); if (b) intent("stack.drop", { value: b.dataset.n }); });
  function libRows() {
    if (!C.lib) return [];
    const q = C.q.trim().toLowerCase(), toks = q.split(/\s+/).filter(Boolean);
    let list = C.lib.list;
    if (C.cat === "fav") list = list.filter(e => C.favs.includes(e.id)); else if (C.cat !== "all") list = list.filter(e => e.cat === C.cat);   // (the tablet's ★, the same list as in its Sounds)
    if (toks.length) list = list.filter(e => { const h = (e.name + " " + e.sub + " " + e.cat).toLowerCase(); return toks.every(t => h.includes(t)); });
    return list.slice(0, 300);
  }
  function libPaint() {
    const chips = $("lCats"); if (C.lib && chips.__n !== C.lib.cats.length) {
      chips.__n = C.lib.cats.length;
      chips.innerHTML = `<button type="button" class="chip" data-c="all">All</button>` + C.lib.cats.map(c => `<button type="button" class="chip" data-c="${esc(c.id)}">${esc(c.label)}</button>`).join("");
    }
    chips.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === C.cat)));
    const rows = libRows(), catName = id => { const c = C.lib && C.lib.cats.find(x => x.id === id); return c ? c.label : id; };
    const html = rows.map(e => `<div class="c-row lib" data-id="${esc(e.id)}"><span class="nm"><b>${esc(e.name)}</b><small>${esc(e.sub)}${e.sub ? " · " : ""}${esc(catName(e.cat))}</small></span><button type="button" class="btn sm" data-a="alone">Play alone</button><button type="button" class="btn sm" data-a="add">+ Layer</button><button type="button" class="star${C.favs.includes(e.id) ? " on" : ""}" data-a="fav" aria-label="Favourite">${C.favs.includes(e.id) ? "★" : "☆"}</button></div>`).join("")
      || (C.lib ? (C.cat === "fav" && !C.q.trim() ? '<p class="note">No favourites yet: ☆ on any sound keeps it here, on the tablet too.</p>' : '<p class="note">Nothing matches.</p>') : '<p class="note">Asking the tablet for its sounds…</p>');
    const box = $("lRows"); if (box.__html !== html) { box.__html = html; box.innerHTML = html; }
    setT($("lCount"), C.lib ? rows.length + " of " + C.lib.list.length : "");
    libHead();
  }
  $("lCats").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; C.cat = b.dataset.c; libPaint(); });
  $("lFind").addEventListener("input", e => { C.q = e.target.value; libPaint(); });
  $("lRows").addEventListener("click", e => {
    const b = e.target.closest("button[data-a]"); if (!b) return; const row = b.closest(".c-row"), id = row.dataset.id, a = b.dataset.a;
    if (a === "fav") { intent("library.fav", { value: id, on: !C.favs.includes(id) }); return; }
    intent(a === "add" ? "stack.add" : "stack.replace", { value: id }).then(r => { if (r.ok) A().toast(r.msg); });
  });
  // ---------- the Director's buttons ----------
  $("dList").addEventListener("click", e => { const r = e.target.closest(".c-row"); if (!r) return; intent("setlist.go", { index: +r.dataset.i }).then(x => { if (x.ok) A().toast(x.msg); }); });
  $("dPrev").addEventListener("click", () => intent("setlist.prev"));
  $("dNext2").addEventListener("click", () => intent("setlist.next"));
  $("dSave").addEventListener("click", () => intent("setlist.save").then(r => { if (r.ok) A().toast(r.msg); }));
  $("dAdd").addEventListener("click", () => { const r = $("dAddRow"); r.hidden = !r.hidden; if (!r.hidden) { $("dAddName").value = "Song " + ((((sec("setlist") || {}).songs || []).length) + 1); $("dAddName").focus(); $("dAddName").select(); } });
  $("dAddNo").addEventListener("click", () => { $("dAddRow").hidden = true; });
  $("dAddGo").addEventListener("click", () => { const n = $("dAddName").value.trim(); $("dAddRow").hidden = true; intent("setlist.add", { value: n }).then(r => { if (r.ok) A().toast(r.msg); }); });
  $("dAddName").addEventListener("keydown", e => { if (e.key === "Enter") $("dAddGo").click(); if (e.key === "Escape") $("dAddNo").click(); });
  $("rCount").addEventListener("click", countIn);
  $("rCue").addEventListener("click", () => { REH.cueOn = !REH.cueName; rehTick(); rehPaint(); });   // showing → hide it (for this song); hidden → show it
  window.addEventListener("keydown", e => {
    if (C.view !== "vDir" || e.target.closest("input, textarea")) return;
    if (e.key === "PageDown" || e.key === "ArrowRight") { e.preventDefault(); intent("setlist.next"); }
    else if (e.key === "PageUp" || e.key === "ArrowLeft") { e.preventDefault(); intent("setlist.prev"); }
  });
  setInterval(paintStatus, 2000);
})();
