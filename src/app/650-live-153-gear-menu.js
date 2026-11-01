    // ======================================================================
    // 153: Gear in the ☰ menu, and the tablet's own view of what's plugged in. Gear (the MiniLab, the K.O. II, who
    // keeps time, the sound buffer, dropouts, the Pixelbook) was only reachable from Live; a Gear tile in the ☰ menu
    // opens the same panel on the main screen, centred, with a dimmed backdrop (a tap outside, ✕, Back or Esc closes
    // it). In the Android app (1.0.8 or later) Gear and the report also carry what Android itself sees: every USB
    // device on the hub and whether it offers sound or MIDI, which outputs Android has and where media goes, the
    // media volume, Android's MIDI devices, and whether Purist is installed and which version. From those it says
    // what's wrong: a device on the bus that Android isn't using (another app holds it), no devices at all (the hub
    // or its cable), a low volume, a Purist older than 1.4.4.
    // ======================================================================
    const GEAR = { standalone: false, rerender: false };
    const gearBack = document.createElement("div"); gearBack.className = "lv-pick-back"; gearBack.hidden = true; document.body.appendChild(gearBack);
    gearBack.addEventListener("pointerdown", e => { e.preventDefault(); closePick(); });
    function gearPark() {   // Gear's popup in front of the main screen (the popup lives in Live, which is hidden)
      if (pick.parentNode !== document.body) document.body.appendChild(pick);
      pick.classList.add("standalone"); gearBack.hidden = false;
    }
    function gearUnpark() {
      GEAR.standalone = false; gearBack.hidden = true; pick.classList.remove("standalone");
      if (pick.parentNode !== lv) lv.appendChild(pick);
    }
    { const cp = closePick; closePick = function () { const r = cp.apply(this, arguments); if (GEAR.standalone && !GEAR.rerender) gearUnpark(); return r; }; }
    { const pa = popAt; popAt = function () {
        GEAR.rerender = true; let r; try { r = pa.apply(this, arguments); } finally { GEAR.rerender = false; }
        if (GEAR.standalone) { if (lv.hidden) gearPark(); else gearUnpark(); }
        return r; }; }
    function openGearAnywhere() {
      start();
      if (!lv.hidden) { openGear(); return; }
      GEAR.standalone = true; openGear(); gearPark();
    }
    const gearBtn = document.createElement("button"); gearBtn.id = "gearBtn"; gearBtn.type = "button"; gearBtn.style.display = "none"; gearBtn.textContent = "Gear";
    document.body.appendChild(gearBtn); gearBtn.addEventListener("click", openGearAnywhere);
    // ---- what Android sees (the app's NBNativeBridge.diag, 1.0.8+) ----
    function tabletDiag() {
      if (!window.NBNativeBridge) return null;
      if (!NBNativeBridge.diag) return { old: true };
      try { const d = JSON.parse(NBNativeBridge.diag()); return d && typeof d === "object" ? d : { err: "unreadable" }; } catch (e) { return { err: String(e && e.message || e) }; }
    }
    const nameBit = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const sameGear = (a, b) => { const x = nameBit(a), y = nameBit(b); if (!x || !y) return false; if (x === y || x.includes(y) || y.includes(x)) return true; const wx = x.split(" ").filter(w => w.length > 2), wy = y.split(" ").filter(w => w.length > 2); return wx.some(w => wy.includes(w)); };
    const verLess = (a, b) => { const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x < y; } return false; };
    function tabletNotes(d) {   // what the tablet's view says is wrong, in plain words
      const out = [];
      if (!d || d.old || d.err) return out;
      const usb = d.usb || [], outs = d.outputs || [], midi = d.midi || [];
      if (!usb.length) out.push(["warn", "No USB devices reach the tablet. Check the hub's cable to the tablet and the hub's power."]);
      usb.forEach(u => {
        if (u.midi && !midi.some(m => sameGear(m.name, u.name) || sameGear(m.product, u.name))) out.push(["bad", "Android isn't using the MIDI of " + u.name + ": another app may be holding it" + (d.purist && d.purist !== "not installed" ? " (Purist?)" : "") + ". Unplug it, close that app, plug it back in."]);
        if (u.out && !outs.some(o => /usb/i.test(o.type) && (sameGear(o.name, u.name) || outs.filter(x => /usb/i.test(x.type)).length === 1))) out.push(["bad", "Android isn't using the sound of " + u.name + ": another app may be holding it" + (d.purist && d.purist !== "not installed" ? " (Purist?)" : "") + "."]);
      });
      if (d.purist && d.purist !== "not installed" && verLess(d.purist, "1.4.4")) out.push(["bad", "Purist " + d.purist + " is installed. That version can take over USB devices, MIDI included: install Purist 1.4.4 or delete it."]);
      if (d.volume && d.volume.max && d.volume.music <= d.volume.max * 0.2) out.push(["warn", "The media volume is low: " + d.volume.music + " of " + d.volume.max + ". Press volume up with the headphones in."]);
      if (d.media && d.media.length && d.media.every(m => /speaker/i.test(m))) out.push(["warn", "Android is sending sound to the tablet's own speaker, not the headphones."]);
      return out;
    }
    function tabletHTML() {
      const d = tabletDiag(); if (!d) return "";
      if (d.old) return `<div class="lv-pkg">This tablet</div><p class="lv-note">Update the Android app (1.0.8 or later) and Gear shows what Android sees: USB devices, where the sound goes, the volume, Purist.</p>`;
      if (d.err) return `<div class="lv-pkg">This tablet</div><p class="lv-note">Couldn't read the tablet's view (${esc3(d.err)}).</p>`;
      const li = (cls, t) => `<div class="lv-gr lv-tr"><span class="lv-st${cls ? " " + cls : ""}"></span><span>${esc3(t)}</span></div>`;
      const usb = (d.usb || []).map(u => u.name + " (" + [u.out ? "sound out" : "", u.in ? "sound in" : "", u.midi ? "MIDI" : ""].filter(Boolean).join(", ") + (u.audio || u.midi ? "" : "no sound or MIDI") + ")");
      const where = d.media && d.media.length ? d.media.join(", ") : (d.outputs || []).length ? "one of: " + d.outputs.map(o => o.name).join(", ") : "nothing Android can name";
      return `<div class="lv-pkg">This tablet (what Android sees)</div>
        ${li(usb.length ? "on" : "warn", usb.length ? "On USB: " + usb.join(" · ") : "No USB devices")}
        ${li(/speaker/i.test(where) ? "warn" : "on", "Sound goes to " + where + (d.volume && d.volume.max ? " · media volume " + d.volume.music + " of " + d.volume.max : ""))}
        ${li((d.midi || []).length ? "on" : "", "MIDI devices: " + ((d.midi || []).length ? d.midi.map(m => m.name).join(", ") : "none"))}
        ${d.purist ? li(d.purist === "not installed" ? "" : verLess(d.purist, "1.4.4") ? "bad" : "on", "Purist: " + (d.purist === "not installed" ? "not installed" : d.purist)) : ""}
        ${tabletNotes(d).map(([c, t]) => `<p class="lv-note${c === "bad" ? " bad" : ""}"><b>${esc3(t)}</b></p>`).join("")}`;
    }
    { const gs = gearSnd; gearSnd = function () { return gs.apply(this, arguments) + tabletHTML(); }; }
    if (window.__live12) window.__live12.gearSnd = gearSnd;
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => { const d = tabletDiag(); return { tablet: d, tabletNotes: tabletNotes(d).map(x => x[1]) }; });
    window.__live18 = { GEAR, openGearAnywhere, tabletDiag, tabletNotes, tabletHTML, sameGear, verLess };
