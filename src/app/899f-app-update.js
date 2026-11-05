  // ======================================================================
  // 232 (Linux app): the pages update themselves, the app's own parts (the plugin store, the Bitwig bridge, the native
  // engine) only with a new package. When GitHub has a newer one, a button in the status strip says so; one tap
  // downloads its .deb to Downloads/Nate Bloom and opens it in Mint's package installer (Install Package, then reopen).
  // ======================================================================
  {
    const N = window.NB_NATIVE;
    if (N && /^(linux|windows)$/.test(N.platform) && N.shellLatest) {
      async function check() {
        let r = null; try { r = await N.shellLatest(); } catch (e) { return; }
        if (!r || !r.newer || !r.hasDeb) return;
        const lg = document.getElementById("shLog"); if (!lg || document.getElementById("shUpd")) return;
        const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.id = "shUpd"; b.textContent = "App " + r.latest + " ↓";
        b.title = "A newer version of the app is out (" + r.latest + ", you have " + r.current + "). Tap to download it and open the installer.";
        b.addEventListener("click", async () => {
          b.disabled = true; b.textContent = "Downloading…";
          let x = null; try { x = await N.shellInstall(); } catch (e) { x = { ok: false, error: String(e) }; }
          const t = document.getElementById("uiToast");
          if (x && x.ok) { b.textContent = "Installer open"; if (t) { t.textContent = (N.platform === "windows" ? "The installer is running: let it finish, and Nate Bloom opens again." : "The installer is open: Install Package, then close and reopen Nate Bloom.") + " Your sounds and settings stay."; t.hidden = false; setTimeout(() => { t.hidden = true; }, 7000); } }
          else { b.disabled = false; b.textContent = "App " + r.latest + " ↓"; if (t) { t.textContent = "Couldn't get it: " + (x && x.error || "no answer") + ". It's also on the releases page."; t.hidden = false; setTimeout(() => { t.hidden = true; }, 6000); } }
          try { window.__nbAdd && window.__nbAdd("app", "update " + r.current + " → " + r.latest + ": " + (x && x.ok ? "installer opened" : (x && x.error))); } catch (e) {}
        });
        lg.before(b);
        try { window.__nbAdd && window.__nbAdd("app", "a newer app is out: " + r.latest + " (this is " + r.current + ")"); } catch (e) {}
      }
      setTimeout(check, 8000); setInterval(check, 6 * 3600 * 1000);
    }
  }
