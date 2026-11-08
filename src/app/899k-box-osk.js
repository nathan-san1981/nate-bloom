//@site-only
  // ======================================================================
  // (box) On-screen keyboard for the Nate Bloom Box (?box=1): the box has no computer keyboard, so every text field
  // (sound search, a favorite's or set list's name, a file name) gets this one, the same as Keys' on the box. It steps
  // aside for 10 minutes once a real (Bluetooth) keyboard types. Off the box none of this exists.
  // ======================================================================
  {
    let boxOn = false; try { boxOn = new URLSearchParams(location.search).get("box") === "1"; } catch (e) {}
    if (boxOn) {
      const st = document.createElement("style");
      st.textContent = `.nbosk{position:fixed;left:0;right:0;bottom:0;z-index:3000;background:#17181c;border-top:1px solid #2b2d33;padding:8px 8px 10px;display:none;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.nbosk.on{display:block}.nbosk .r{display:flex;gap:6px;justify-content:center;margin-top:6px}.nbosk .r:first-child{margin-top:0}
.nbosk button{flex:0 0 auto;width:min(69px,7.2vw);height:min(44px,8.1vh);border:0;border-radius:9px;background:#2c2e35;color:#f2f2f4;font:600 19px/1 Inter,system-ui,sans-serif;cursor:pointer}
.nbosk button:active{background:#4a4d57}.nbosk .w{width:min(112px,11.7vw);font-size:15px}.nbosk .sp{width:min(390px,40.6vw)}
.nbosk .ok{background:#8b6cff;width:min(134px,14vw);font-size:16px}.nbosk .sh.on{background:#f2f2f4;color:#17181c}
body.nbosk-up{--nbosk-h:0px}`;
      document.head.appendChild(st);
      const rows = [["1","2","3","4","5","6","7","8","9","0"], ["q","w","e","r","t","y","u","i","o","p"], ["a","s","d","f","g","h","j","k","l","'"], ["⇧","z","x","c","v","b","n","m","-","⌫"], ["space","Done"]];
      const el = document.createElement("div"); el.className = "nbosk"; el.setAttribute("aria-label", "On-screen keyboard");
      el.innerHTML = rows.map(r => `<div class="r">${r.map(k => `<button type="button" data-k="${k}" class="${k === "⇧" ? "w sh" : k === "⌫" ? "w" : k === "space" ? "sp" : k === "Done" ? "ok" : ""}">${k === "space" ? "" : k}</button>`).join("")}</div>`).join("");
      const FIELD = 'input[type=text],input[type=search],input[type=url],input[type=email],input[type=password],input:not([type]),textarea';
      let target = null, shift = false, realKeys = 0;
      const paint = () => { el.querySelector(".sh").classList.toggle("on", shift); el.querySelectorAll("button[data-k]").forEach(b => { const k = b.dataset.k; if (k.length === 1 && /[a-z]/.test(k)) b.textContent = shift ? k.toUpperCase() : k; }); };
      const autoShift = () => { shift = !!target && target.type !== "search" && !/search|filter|find/i.test(target.placeholder || "") && (target.value.length === 0 || / $/.test(target.value.slice(0, target.selectionStart || 0))); paint(); };
      const show = inp => {
        target = inp; if (Date.now() - realKeys < 600000) return;
        if (!el.isConnected) document.body.appendChild(el);
        el.classList.add("on"); document.body.classList.add("nbosk-up");
        try { const n = inp.value.length; inp.setSelectionRange(n, n); } catch (e) {}
        autoShift();
        // the field stays visible above the keyboard
        setTimeout(() => { try { const r = inp.getBoundingClientRect(), top = innerHeight - el.offsetHeight; if (r.bottom > top - 8) inp.scrollIntoView({ block: "center" }); } catch (e) {} }, 30);
      };
      const hide = () => { el.classList.remove("on"); document.body.classList.remove("nbosk-up"); if (target) target.blur(); target = null; };
      const put = txt => { const t = target; if (!t) return; const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a;
        const max = t.maxLength > 0 ? t.maxLength : 1e9; if (txt && t.value.length - (b - a) + txt.length > max) return;
        t.setRangeText(txt, a, b, "end"); t.dispatchEvent(new Event("input", { bubbles: true })); };
      el.addEventListener("pointerdown", e => {
        e.preventDefault();
        const b = e.target.closest("button[data-k]"); if (!b || !target) return;
        const k = b.dataset.k;
        if (k === "Done") { const t = target; t.dispatchEvent(new Event("change", { bubbles: true })); return hide(); }
        if (k === "⇧") { shift = !shift; return paint(); }
        if (k === "⌫") { const t = target, a = t.selectionStart ?? t.value.length, z = t.selectionEnd ?? a;
          if (a === z && a > 0) t.setRangeText("", a - 1, a, "end"); else if (a !== z) t.setRangeText("", a, z, "end");
          t.dispatchEvent(new Event("input", { bubbles: true })); return autoShift(); }
        put(k === "space" ? " " : shift ? k.toUpperCase() : k); autoShift();
      });
      document.addEventListener("keydown", e => { if (!e.isTrusted || e.key === "Unidentified") return; realKeys = Date.now(); if (el.classList.contains("on")) { el.classList.remove("on"); document.body.classList.remove("nbosk-up"); } }, true);
      document.addEventListener("focusin", e => { const t = e.target; if (t && t.matches && t.matches(FIELD) && !t.readOnly && !t.disabled) { t.setAttribute("inputmode", "none"); show(t); } });
      document.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (target && (!a || !a.matches || !a.matches(FIELD))) hide(); }, 0));
      new MutationObserver(() => { if (target && !target.isConnected) hide(); }).observe(document.body, { childList: true, subtree: true });
      window.__nbosk = { hide, el };
    }
  }
//@end
