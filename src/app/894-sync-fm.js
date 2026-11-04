  // ======================================================================
  // (204) Sync Lead and FM Glass, in the Linux app. Sync Lead: on the native engine, one slave saw that really sweeps
  // down to its resting ratio, hard-synced to the master with every step band-limited where it lands, and Cross:
  // the master modulating the slave's frequency, the Jupiter-8's cross-mod. FM Glass: six operators and all 32
  // algorithms on the native engine since 185, so it's no longer beta.
  // ======================================================================
  if (window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && !window.NB_LITE) {
    if (ENGINES.sync && !ENGINES.sync.knobs.some(k => k[0] === "cross")) {
      ENGINES.sync.knobs.push(["cross", "Cross", 0]);
      if (state.params.sync && state.params.sync.cross == null) {
        let saved = null; try { saved = JSON.parse(localStorage.getItem("nightbloom") || "null"); } catch (e) {}
        const v = saved && saved.params && saved.params.sync && saved.params.sync.cross;
        state.params.sync.cross = typeof v === "number" ? v : 0;
      }
    }
    if (ENGINES.fm) ENGINES.fm.after = String(ENGINES.fm.after || "").replace(/\s*·\s*beta\b/i, "");
    try { document.querySelectorAll('.tab[data-engine="fm"]').forEach(t => { t.parentElement.classList.remove("betaonly"); t.querySelectorAll("small, em").forEach(x => { x.textContent = x.textContent.replace(/\s*·?\s*beta\b/i, ""); }); }); } catch (e) {}
    CLASSIC_PRESETS.push(
      ["Sync Lead · Jupiter", "sync", { sync: { sync: 0.45, sweep: 0.6, bite: 0.7, attack: 0.02, release: 0.35, cross: 0.35 } }, { sub: "sync sweep with cross-mod · Jupiter-8", oct: 0, fx: { drive: 0.1, wobble: 0, echo: 0.3, space: 0.3 } }],
      ["Sync Screamer", "sync", { sync: { sync: 0.8, sweep: 0.9, bite: 0.8, attack: 0, release: 0.3, cross: 0.6 } }, { sub: "wide sweep, hard cross-mod", oct: 0, fx: { drive: 0.25, wobble: 0, echo: 0.25, space: 0.25 } }]
    );
  }
