  // ---------- (162) data the site page no longer carries: fetched the first time it's needed ----------
  // The kits' sounds (snd/kit-<slug>.json), the Studio kit (snd/studio-kit.json) and the speech dictionary
  // (snd/sp-dict.b64) are files beside the page; the service worker keeps each one once it has been fetched, so
  // they work offline from the second time. The artifact (one file) still carries them inline.
  window.NB_SND = (() => { try { return /\/lite\/$/.test(location.pathname.replace(/[^/]*$/, "")) ? "../snd/" : "snd/"; } catch (e) { return "snd/"; } })();
  let nbStudioPr = null;
  function nbStudioFetch() {
    if (window.NB_STUDIO) return Promise.resolve(window.NB_STUDIO);
    if (!nbStudioPr) nbStudioPr = fetch(window.NB_SND + "studio-kit.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(j => { window.NB_STUDIO = j; return j; }).catch(e => { nbStudioPr = null; throw e; });
    return nbStudioPr;
  }
  window.__nbStudioFetch = nbStudioFetch;
  // the Studio kit warms up once the page has settled, so its first hit isn't late (the service worker keeps it)
  if (window.NB_STUDIO_LAZY && !window.NB_STUDIO) { const warm = () => { nbStudioFetch().catch(() => {}); }; if (typeof requestIdleCallback === "function") requestIdleCallback(warm, { timeout: 8000 }); else setTimeout(warm, 4000); }
