    // ======================================================================
    // Live's recorder (142). ● Rec records everything you hear, for as long as a set lasts (up to an hour), without
    // weighing on the screen: a recorder on the audio thread hands over 16-bit pieces, and every 10 seconds they go into
    // the browser's own storage, so a long take doesn't fill the memory and a crash or a reload doesn't lose it. Each
    // take saves as a WAV, or as an MP3 made in the background a piece at a time. (● Loop stays for Beat Pads.)
    // ======================================================================
    const REC_SRC = `class NBRec extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.n = 16384; this.b = new Int16Array(this.n * 2); this.w = 0;
    this.port.onmessage = e => { if (e.data === "start") { this.on = true; this.w = 0; } else if (e.data === "stop") { this.send(); this.on = false; this.port.postMessage({ done: true }); } }; }
  send() { if (!this.w) return; const o = this.b.slice(0, this.w * 2); this.port.postMessage({ pcm: o }, [o.buffer]); this.w = 0; }
  process(inputs) { const i = inputs[0];
    if (this.on && i && i[0]) { const l = i[0], r = i[1] || i[0], b = this.b;
      for (let k = 0; k < l.length; k++) { let x = l[k], y = r[k]; x = x < -1 ? -1 : x > 1 ? 1 : x; y = y < -1 ? -1 : y > 1 ? 1 : y; b[this.w * 2] = x * 32767; b[this.w * 2 + 1] = y * 32767; if (++this.w >= this.n) this.send(); } }
    return true; }
}
registerProcessor("nb-rec", NBRec);`;
    const RC8 = { on: false, node: null, kind: "", mute: null, meta: null, chunks: [], cf: 0, parts: [], timer: 0, stopWait: null, mem: {}, idbOk: true, maxSec: 3600 };
    // ---- the browser's storage for takes (IndexedDB: kept across reloads) ----
    let rdbP = null;
    const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    function rdb() {
      return rdbP || (rdbP = new Promise((res, rej) => { const q = indexedDB.open("nightbloom-recordings", 1);
        q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains("recs")) d.createObjectStore("recs", { keyPath: "id" }); if (!d.objectStoreNames.contains("parts")) d.createObjectStore("parts", { keyPath: ["id", "i"] }); };
        q.onsuccess = () => res(q.result); q.onerror = () => { rdbP = null; rej(q.error); }; }));
    }
    const rPut = async (st, v) => { const d = await rdb(); return rq(d.transaction(st, "readwrite").objectStore(st).put(v)); };
    const rAll = async () => { const d = await rdb(); return rq(d.transaction("recs").objectStore("recs").getAll()); };
    const rParts = async id => { const d = await rdb(); return (await rq(d.transaction("parts").objectStore("parts").getAll(IDBKeyRange.bound([id, 0], [id, 1e9])))).sort((a, b) => a.i - b.i).map(p => p.blob); };
    async function rDel(id) { const d = await rdb(), t = d.transaction(["recs", "parts"], "readwrite"); t.objectStore("recs").delete(id); t.objectStore("parts").delete(IDBKeyRange.bound([id, 0], [id, 1e9])); await new Promise(r => { t.oncomplete = r; t.onerror = r; t.onabort = r; }); }
    // ---- recording ----
    async function recNode() {
      if (RC8.node && RC8.node.context === ctx) return RC8.node;
      RC8.node = null;
      if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        for (const url of [() => URL.createObjectURL(new Blob([REC_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(REC_SRC)]) {
          try { await ctx.audioWorklet.addModule(url()); const n = new AudioWorkletNode(ctx, "nb-rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit" });
            n.port.onmessage = e => { if (e.data.pcm) recPiece(e.data.pcm); else if (e.data.done && RC8.stopWait) RC8.stopWait(); }; RC8.node = n; RC8.kind = "worklet"; return n; } catch (e) {}
        }
      }
      // (no audio worklets: the main thread does it)
      const sp = ctx.createScriptProcessor(4096, 2, 1);
      sp.onaudioprocess = ev => { if (!RC8.on) return; const ib = ev.inputBuffer, l = ib.getChannelData(0), r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l, o = new Int16Array(l.length * 2);
        for (let k = 0; k < l.length; k++) { const x = Math.max(-1, Math.min(1, l[k])), y = Math.max(-1, Math.min(1, r[k])); o[2 * k] = x * 32767; o[2 * k + 1] = y * 32767; } recPiece(o); };
      sp.port = { postMessage: m => { if (m === "stop" && RC8.stopWait) setTimeout(RC8.stopWait, 0); } };
      RC8.node = sp; RC8.kind = "main thread"; return sp;
    }
    function recPiece(pcm) {
      if (!RC8.meta) return;
      RC8.chunks.push(pcm); RC8.cf += pcm.length / 2;
      if (RC8.cf >= RC8.meta.rate * 10) recFlush();
      if ((RC8.meta.frames + RC8.cf) / RC8.meta.rate >= RC8.maxSec && RC8.on) recStop();
    }
    function recFlush() {
      const m = RC8.meta; if (!m || !RC8.chunks.length) return;
      const blob = new Blob(RC8.chunks), i = m.parts; RC8.chunks = []; m.frames += RC8.cf; RC8.cf = 0; m.parts++;
      (RC8.mem[m.id] = RC8.mem[m.id] || []).push(blob);
      if (RC8.idbOk) rPut("parts", { id: m.id, i, blob }).then(() => rPut("recs", Object.assign({}, m))).catch(() => { RC8.idbOk = false; add139("rec", "storage full or blocked: this take is kept until the page closes"); });
    }
    const stamp = () => { const d = new Date(), p = x => String(x).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + "." + p(d.getMinutes()); };
    async function recStart() {
      start(); if (RC8.on || !ctx || !analyser) return;
      const n = await recNode(); if (!n || RC8.on) return;
      RC8.meta = { id: "rec-" + Date.now(), name: "Nate Bloom live " + stamp(), rate: ctx.sampleRate, frames: 0, parts: 0, made: Date.now(), done: false };
      RC8.chunks = []; RC8.cf = 0; RC8.idbOk = true; RC8.on = true;
      try { await rPut("recs", Object.assign({}, RC8.meta)); } catch (e) { RC8.idbOk = false; }
      RC8.mute = ctx.createGain(); RC8.mute.gain.value = 0;
      analyser.connect(n); n.connect(RC8.mute).connect(ctx.destination); n.port.postMessage("start");
      RC8.t0 = ctx.currentTime; clearInterval(RC8.timer); RC8.timer = setInterval(recPaint, 250); recPaint();
      add139("rec", "started · " + RC8.kind + (RC8.idbOk ? "" : " · not stored (memory only)"));
    }
    async function recStop() {
      if (!RC8.on) return; RC8.on = false; clearInterval(RC8.timer);
      await new Promise(res => { RC8.stopWait = res; try { RC8.node.port.postMessage("stop"); } catch (e) { res(); } setTimeout(res, 1500); });
      RC8.stopWait = null;
      try { analyser.disconnect(RC8.node); RC8.node.disconnect(); RC8.mute.disconnect(); } catch (e) {}
      recFlush(); const m = RC8.meta; RC8.meta = null; recPaint();
      if (!m || m.frames < m.rate * 0.3) { if (m) { delete RC8.mem[m.id]; try { await rDel(m.id); } catch (e) {} } mlHud("Recording", "too short to keep", null); return; }
      m.done = true; if (RC8.idbOk) { try { await rPut("recs", Object.assign({}, m)); } catch (e) {} } else RC8.memMeta = Object.assign(RC8.memMeta || {}, { [m.id]: m });
      add139("rec", "stopped · " + fmtLen(m.frames / m.rate) + " · " + (RC8.idbOk ? "stored" : "memory only"));
      openTakes(m.id);
    }
    function recToggle() { if (RC8.on) recStop(); else recStart(); }
    const fmtLen = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const mbOf = frames => (44 + frames * 4) / 1048576;
    // ---- the button ----
    const recB = mkBtn("lvTake", "lv-take", '<i aria-hidden="true"></i><span>Rec</span>', "Record everything you hear · save it as a WAV or an MP3");
    $id("lvGo").after(recB); recB.dataset.kc = "R";
    const takesB = mkBtn("lvTakes", "lv-takes", "▾", "Your recordings: save them as WAV or MP3"); recB.after(takesB); takesB.hidden = true;
    recB.addEventListener("click", recToggle);
    takesB.addEventListener("click", () => { start(); if (!pick.hidden && pick.querySelector(".lr-wrap")) closePick(); else openTakes(); });
    function recPaint() {
      const on = RC8.on, s = on && ctx ? ctx.currentTime - RC8.t0 : 0;
      recB.classList.toggle("on", on); lv.classList.toggle("recording", on);
      nbT(recB.querySelector("span"), on ? fmtLen(s) : "Rec");
      nbA(recB, "aria-label", on ? "Stop recording (" + fmtLen(s) + ")" : "Record everything you hear");
      if (on && s > RC8.maxSec - 300 && !RC8.warned) { RC8.warned = true; noteMsg("Recording: 5 minutes left of the hour (it stops by itself at 60:00)"); }
      if (!on) RC8.warned = false;
    }
    // Rec is the audio recorder now; ● Loop (Beat Pads) shows only when ▶ plays the pads
    { const pt = lvPaintTop; lvPaintTop = function () { const r = pt.apply(this, arguments); lv.classList.toggle("play-bp", LV.play === "bp"); return r; }; }
    // ---- your recordings ----
    async function takesList() {
      let list = []; try { list = await rAll(); } catch (e) {}
      Object.values(RC8.memMeta || {}).forEach(m => { if (!list.some(x => x.id === m.id)) list.push(m); });
      return list.filter(m => m.frames > 0 && (m.done || !RC8.meta || m.id !== RC8.meta.id)).sort((a, b) => b.made - a.made);
    }
    async function paintTakesBtn() { const n = (await takesList()).length; takesB.hidden = !n; nbT(takesB, n ? "▾ " + n : "▾"); }
    async function openTakes(fresh) {
      const list = await takesList(); paintTakesBtn();
      const row = m => `<div class="lr-row${m.id === fresh ? " fresh" : ""}" data-id="${esc3(m.id)}"><div class="lr-n"><b>${esc3(m.name)}</b><small>${fmtLen(m.frames / m.rate)} · ${mbOf(m.frames).toFixed(1)} MB as WAV${m.done ? "" : " · recovered after the page closed"}</small></div>
        <button class="btn primary" data-a="wav">WAV</button><button class="btn" data-a="mp3">MP3</button><button class="btn" data-a="del" aria-label="Delete">✕</button><div class="lr-st"></div></div>`;
      popAt(recB, 470, `<div class="lv-pkh"><div><strong>Recordings</strong><small>Kept on this ${matchMedia("(pointer: coarse)").matches ? "tablet" : "computer"} until you delete them · WAV for the full sound, MP3 (320 kbps) to send</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl lr-wrap">${list.length ? list.map(row).join("") : '<p class="lv-note">Nothing recorded yet: tap ● Rec (or R) and play.</p>'}</div>`);
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".lr-row").forEach(r => r.addEventListener("click", async e => {
        const b = e.target.closest("button[data-a]"); if (!b) return; const m = list.find(x => x.id === r.dataset.id); if (!m) return; const st = r.querySelector(".lr-st");
        if (b.dataset.a === "del") { if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Sure?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = "✕"; } }, 2500); return; }
          delete RC8.mem[m.id]; if (RC8.memMeta) delete RC8.memMeta[m.id]; try { await rDel(m.id); } catch (x) {} openTakes(); return; }
        b.disabled = true;
        try {
          const parts = RC8.mem[m.id] || await rParts(m.id);
          if (b.dataset.a === "wav") { st.textContent = "Saving the WAV…"; const msg = await saveAudio(m.name + ".wav", new Blob([wavHead(m.frames, m.rate), ...parts], { type: "audio/wav" }), "audio/wav"); st.textContent = msg || ""; }
          else { st.textContent = "Making the MP3… 0%"; const blob = await mp3Parts(parts, m.rate, 320, p => { st.textContent = "Making the MP3… " + Math.round(p * 100) + "%"; }); st.textContent = "Saving the MP3…"; const msg = await saveAudio(m.name + ".mp3", blob, "audio/mpeg"); st.textContent = msg || ""; }
        } catch (x) { st.textContent = "Couldn't save it (" + (x && x.message || x) + ")"; }
        b.disabled = false;
      }));
    }
    function wavHead(frames, rate) {
      const v = new DataView(new ArrayBuffer(44)), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }, n = frames * 4;
      w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n, true);
      return v.buffer;
    }
    // the MP3: a worker reads the stored pieces one at a time and encodes them (the screen stays free)
    function mp3Parts(parts, rate, kbps, onP) {
      const src = (document.getElementById("lameSrc") || {}).textContent || "";
      const code = src + `\nonmessage = async e => { try { const { parts, rate, kbps, total } = e.data, enc = new lamejs.Mp3Encoder(2, rate, kbps), out = []; let done = 0;
  const keep = d => { if (d.length) out.push(new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.length))); };
  for (const b of parts) { const a = new Int16Array(await b.arrayBuffer()), n = a.length >> 1, L = new Int16Array(n), R = new Int16Array(n); for (let i = 0; i < n; i++) { L[i] = a[2 * i]; R[i] = a[2 * i + 1]; }
    for (let i = 0; i < n; i += 1152) keep(enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152))); done += n; postMessage({ p: done / total }); }
  keep(enc.flush()); postMessage({ blob: new Blob(out, { type: "audio/mpeg" }) }); } catch (err) { postMessage({ err: String(err && err.message || err) }); } };`;
      return new Promise((res, rej) => {
        let w; try { w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" }))); } catch (e) { rej(new Error("this browser can't make MP3s in the background")); return; }
        w.onmessage = e => { if (e.data.p != null) { if (onP) onP(e.data.p); } else { w.terminate(); if (e.data.err) rej(new Error(e.data.err)); else res(e.data.blob); } };
        w.onerror = e => { w.terminate(); rej(new Error(e.message || "the MP3 maker stopped")); };
        w.postMessage({ parts, rate, kbps, total: Math.max(1, parts.reduce((s, b) => s + b.size / 4, 0)) });
      });
    }
    async function saveAudio(fname, blob, mime) {
      let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
      if (dl) {
        const zname = fname.replace(/\.\w+$/, "") + ".zip";
        try { await dl.save({ filename: zname, data: zipOne(fname, new Uint8Array(await blob.arrayBuffer())) }); return "Saved " + zname + " (the " + fname.split(".").pop().toUpperCase() + " is inside)"; }
        catch (e) { if (e && e.code === "declined") return ""; return e && e.code === "too_large" ? "Too large to save here: use the site or the app" : "Couldn't save here: try again"; }
      }
      const file = new File([blob], fname, { type: mime });
      try { if (nbShareFiles(file)) { await navigator.share({ files: [file], title: fname }); return "Shared " + fname; } } catch (e) { if (e && e.name === "AbortError") return ""; }
      const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
      return "Saved " + fname;
    }
    paintTakesBtn();
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ liveRecorder: { recording: RC8.on, kind: RC8.kind, stored: RC8.idbOk } }));
    window.__live8 = { RC8, recStart, recStop, recToggle, openTakes, takesList, rParts, wavHead, mp3Parts };
