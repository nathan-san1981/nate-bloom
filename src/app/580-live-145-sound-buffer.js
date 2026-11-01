    // ======================================================================
    // 145: the sound buffer, in Live's CPU panel. Fast is the tablet's quickest audio path (about 4 ms of slack: any
    // hiccup longer than that is a dropout); Steady asks for the bigger buffer Lite uses, which on Android means its
    // slower output path: far fewer dropouts, more delay from a key to its sound. It takes effect after a reload.
    // ======================================================================
    const bufWant = () => lsGet("nightbloom-buffer", "fast") === "steady" ? "steady" : "fast";
    const bufNow = () => (ctx && ctx.__nbBuf) || "fast";
    const bufMs = () => num(() => Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000), null);
    function bufHTML() {
      if (window.NB_LITE || !ctx) return "";
      const want = bufWant(), now = bufNow(), ms = bufMs();
      return `<div class="lv-pkg">Sound buffer</div><div class="seg lc-buf" role="group" aria-label="Sound buffer">
          <button data-b="fast" aria-pressed="${want === "fast"}">Fast<small>quickest response</small></button><button data-b="steady" aria-pressed="${want === "steady"}">Steady<small>fewer dropouts</small></button></div>
        <p class="lv-note">Now ${now === "steady" ? "Steady" : "Fast"}${ms != null ? ": " + ms + " ms from a key to its sound" : ""}. Fast leaves the sound about 4 ms of slack, so any hiccup longer than that is a dropout. Steady gives it much more, as Lite does, but Android then uses its slower output path, so a key can sound noticeably late (up to about a quarter of a second). That's fine for the DJ and for loops, but hard for playing the keys.${want !== now ? ' <button class="btn" id="lcReload">Reload now to switch</button>' : ""}</p>`;
    }
    { const pc = paintCpu; paintCpu = function () {
        const r = pc.apply(this, arguments);
        pick.querySelectorAll(".lc-buf button").forEach(b => b.addEventListener("click", () => { lsSet("nightbloom-buffer", b.dataset.b); add139("live", "sound buffer → " + b.dataset.b + " (after a reload)"); paintCpu(); }));
        const rl = pick.querySelector("#lcReload"); if (rl) rl.addEventListener("click", () => { add139("live", "reload for the sound buffer"); location.reload(); });
        return r; }; }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ soundBuffer: { now: bufNow(), chosen: bufWant(), keyToSoundMs: bufMs() } }));
    window.__live11 = { bufHTML, bufWant, bufNow };
