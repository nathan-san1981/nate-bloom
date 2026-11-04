    // ======================================================================
    // 145: the sound buffer, in Live's CPU panel. Fast is the tablet's quickest audio path (about 4 ms of slack: any
    // hiccup longer than that is a dropout); Steady asks for the bigger buffer Lite uses, which on Android means its
    // slower output path: far fewer dropouts, more delay from a key to its sound. It takes effect after a reload.
    // ======================================================================
    // (194) the Linux app adds Lowest: its low-latency output, chosen for the next start (the app restarts to apply it)
    const LL = (() => { try { return window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && window.NB_NATIVE.lowLatency || null; } catch (e) { return null; } })();
    let llNext = LL ? (LL.frames > 0) : false;
    if (LL) { try { LL.get().then(r => { llNext = !!(r && r.next > 0); }).catch(() => {}); } catch (e) {} }
    const bufWant = () => LL && llNext ? "lowest" : lsGet("nightbloom-buffer", "fast") === "steady" ? "steady" : "fast";
    const bufNow = () => (ctx && ctx.__nbBuf) || "fast";
    const bufMs = () => num(() => Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000), null);
    function bufHTML() {
      if (window.NB_LITE || !ctx) return "";
      const want = bufWant(), now = bufNow(), ms = bufMs();
      return `<div class="lv-pkg">Sound buffer</div><div class="seg lc-buf" role="group" aria-label="Sound buffer">
          ${LL ? `<button data-b="lowest" aria-pressed="${want === "lowest"}">Lowest<small>about 16 ms</small></button>` : ""}<button data-b="fast" aria-pressed="${want === "fast"}">Fast<small>quickest response</small></button><button data-b="steady" aria-pressed="${want === "steady"}">Steady<small>fewer dropouts</small></button></div>
        <p class="lv-note">Now ${now === "lowest" ? "Lowest" : now === "steady" ? "Steady" : "Fast"}${ms != null ? ": " + ms + " ms from a key to its sound" : ""}. Fast leaves the sound about 4 ms of slack, so any hiccup longer than that is a dropout. Steady gives it much more, as Lite does, but Android then uses its slower output path, so a key can sound noticeably late (up to about a quarter of a second). That's fine for the DJ and for loops, but hard for playing the keys.${LL ? " Lowest is the Linux app's own low-latency output: the quickest from a key (or the Minilogue through Nate Bloom) to your ears. If the sound drops out on it, pick Steady." : ""}${want !== now ? ' <button class="btn" id="lcReload">' + (LL ? "Restart the app to switch" : "Reload now to switch") + '</button>' : ""}</p>`;
    }
    { const pc = paintCpu; paintCpu = function () {
        const r = pc.apply(this, arguments);
        pick.querySelectorAll(".lc-buf button").forEach(b => b.addEventListener("click", () => { lsSet("nightbloom-buffer", b.dataset.b); add139("live", "sound buffer → " + b.dataset.b + " (after a reload)"); paintCpu(); }));
        const rl = pick.querySelector("#lcReload"); if (rl) rl.addEventListener("click", () => { add139("live", "reload for the sound buffer"); location.reload(); });
        return r; }; }
    // (194) Lowest on/off goes to the app (it applies at the next start); Restart restarts the app instead of reloading the page
    if (LL) {
      document.addEventListener("click", e => {
        const b = e.target.closest && e.target.closest(".lc-buf button");
        if (b) { const on = b.dataset.b === "lowest"; llNext = on; if (on) { try { localStorage.setItem("nightbloom-buffer", JSON.stringify("fast")); } catch (er) {} } try { LL.set(on); } catch (er) {} return; }
        const r = e.target.closest && e.target.closest("#lcReload");
        if (r) { e.stopImmediatePropagation(); e.preventDefault(); try { add139("live", "restart for the sound buffer"); } catch (er) {} try { LL.restart(); } catch (er) { location.reload(); } }
      }, true);
    }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ soundBuffer: { now: bufNow(), chosen: bufWant(), keyToSoundMs: bufMs(), lowLatencyFrames: LL ? LL.frames : null } }));
    window.__live11 = { bufHTML, bufWant, bufNow };
