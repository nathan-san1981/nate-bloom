    // ======================================================================
    // 151: one key for every effect. ` (the key left of 1, under Esc) switches all the effects off or back on from any
    // screen: the Effects (Drive, Wobble, Echo, Space) and FX Lab, the same switch as FX: On. A note says which way
    // it went. It isn't a note on any screen's keys, so nothing plays; while you type in a box it types as usual.
    // ======================================================================
    function fxKeyToggle() {
      start();
      const off = state.fx.on !== false;
      setFxOn(!off);
      if (!lv.hidden) {
        try { if (!$id("lvFxp").hidden) lvPaintFx(); lvPaintTop(); } catch (e) {}
        mlHud("Effects", off ? "off" : "on", null, off ? "` turns them back on" : "");
      } else noteMsg(off ? "Effects off · ` turns them back on" : "Effects on");
      return !off;
    }
    window.addEventListener("keydown", e => {
      if (e.code !== "Backquote" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && t.closest && t.closest("input:not([type=range]), textarea, select, [contenteditable]")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) fxKeyToggle();
    }, true);
    window.__live16 = { fxKeyToggle };
