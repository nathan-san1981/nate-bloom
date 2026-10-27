// Nate Bloom for Android: runs before the page's own scripts.
// Gives the page Web MIDI (through Android's MIDI service), file saving to Downloads, and tells it it's in the app.
(() => {
  if (window.NB_NATIVE) return;
  const B = window.NBNativeBridge, M = window.NBMidiBridge;
  if (!B) return;
  const NB = window.NB_NATIVE = {
    platform: "android",
    version: (() => { try { return B.version(); } catch (e) { return ""; } })(),
    background: true,          // the app keeps playing when it's in the background
    visible: true,
    setPlaying(on) { try { B.setPlaying(!!on); } catch (e) {} },
    toast(msg) { try { B.toast(String(msg)); } catch (e) {} },
    foreground(on) { NB.visible = !!on; try { window.dispatchEvent(new CustomEvent("nb-native-foreground", { detail: !!on })); } catch (e) {} return true; },
    // Android Back: close the sheet that's open; false when there's nothing to close
    back() {
      const open = [...document.querySelectorAll('[role="dialog"], .sheet, .editor, .dj, #browser, #mixer')]
        .filter(el => !el.hidden && el.offsetParent !== null && el.getClientRects().length);
      for (let i = open.length - 1; i >= 0; i--) {
        const btn = [...open[i].querySelectorAll("button")].find(b => b.offsetParent !== null && /^(done|close|cancel|✕|×)$/i.test(b.textContent.trim()));
        if (btn) { btn.click(); return true; }
      }
      return false;
    },
  };

  // ---------- files: what the app shares or downloads goes to Downloads/Nate Bloom ----------
  async function saveBlob(blob, name) {
    const id = B.fileBegin(name || "Nate Bloom file", blob.type || "application/octet-stream");
    if (id < 0) throw new Error("Couldn't save " + name);
    const u8 = new Uint8Array(await blob.arrayBuffer()), CH = 786432;
    for (let i = 0; i < u8.length; i += CH) {
      const part = u8.subarray(i, i + CH); let s = "";
      for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
      if (!B.fileChunk(id, btoa(s))) throw new Error("Couldn't write " + name);
    }
    const where = B.fileEnd(id);
    if (!where) throw new Error("Couldn't save " + name);
    return where;
  }
  NB.saveBlob = saveBlob;
  navigator.canShare = d => !!(d && d.files && d.files.length);
  navigator.share = async d => {
    if (!d || !d.files || !d.files.length) throw new DOMException("Only files can be shared here", "NotSupportedError");
    for (const f of d.files) await saveBlob(f, f.name);
  };
  const click0 = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") && /^(blob|data):/.test(this.href)) {
      const name = this.getAttribute("download") || "Nate Bloom file";
      fetch(this.href).then(r => r.blob()).then(b => saveBlob(b, name)).catch(e => { console.error("save failed", e); NB.toast("Couldn't save " + name); });
      return;
    }
    return click0.apply(this, arguments);
  };

  // ---------- Web MIDI, backed by Android's MIDI service ----------
  if (M) {
    const on = EventTarget.prototype.addEventListener;
    const fire = (target, type, extra) => { const e = new Event(type); Object.assign(e, extra || {}); target.dispatchEvent(e); };
    let access = null;
    const ports = new Map();
    class NBPort extends EventTarget {
      constructor(p) {
        super();
        this.id = p.id; this.name = p.name; this.manufacturer = p.manufacturer || ""; this.type = p.type; this.version = "";
        this.state = "connected"; this.connection = "closed"; this.onstatechange = null;
        on.call(this, "statechange", e => { if (typeof this.onstatechange === "function") this.onstatechange(e); });
      }
      open() { if (this.connection !== "open") { M.open(this.id); this.connection = "open"; } return Promise.resolve(this); }
      close() { M.close(this.id); this.connection = "closed"; return Promise.resolve(this); }
    }
    class NBInput extends NBPort {
      constructor(p) { super(p); this._h = null; on.call(this, "midimessage", e => { if (typeof this._h === "function") this._h.call(this, e); }); }
      get onmidimessage() { return this._h; }
      set onmidimessage(f) { this._h = f; if (f) this.open(); }
      addEventListener(type, f, o) { on.call(this, type, f, o); if (type === "midimessage") this.open(); }
    }
    class NBOutput extends NBPort {
      send(data, ts) {
        if (this.connection !== "open") this.open();
        const d = ts ? Math.max(0, ts - performance.now()) : 0;
        M.send(this.id, Array.from(data, x => x & 255).join(","), d);
      }
      clear() {}
    }
    class NBAccess extends EventTarget {
      constructor() {
        super();
        this.inputs = new Map(); this.outputs = new Map(); this.sysexEnabled = true; this.onstatechange = null;
        on.call(this, "statechange", e => { if (typeof this.onstatechange === "function") this.onstatechange(e); });
      }
    }
    const refresh = () => {
      let list = [];
      try { list = JSON.parse(M.list() || "[]"); } catch (e) {}
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let port = ports.get(p.id), changed = false;
        if (!port) { port = p.type === "input" ? new NBInput(p) : new NBOutput(p); ports.set(p.id, port); changed = true; }
        else if (port.state !== "connected") { port.state = "connected"; changed = true; }
        (p.type === "input" ? access.inputs : access.outputs).set(p.id, port);
        if (changed) { fire(port, "statechange", { port }); fire(access, "statechange", { port }); }
      }
      for (const [id, port] of ports) {
        if (!seen.has(id) && port.state === "connected") {
          port.state = "disconnected"; port.connection = "closed";
          access.inputs.delete(id); access.outputs.delete(id);
          fire(port, "statechange", { port }); fire(access, "statechange", { port });
        }
      }
    };
    navigator.requestMIDIAccess = function () {
      if (!access) { access = new NBAccess(); refresh(); }
      return Promise.resolve(access);
    };
    window.__nbMidiIn = (id, msgs) => {
      const p = ports.get(id); if (!p) return;
      for (const m of msgs) fire(p, "midimessage", { data: new Uint8Array(m), receivedTime: performance.now() });
    };
    window.__nbMidiState = () => { if (access) refresh(); };
  }
  console.log("NB_NATIVE ready " + NB.version + " midi=" + !!M);
})();
