#!/usr/bin/env python3
"""samplehunt 2 — find the best material to sample across a whole stems library, and learn your taste.

Input: one folder of songs as stems-collect makes it:
    <Song>.mp3   <Song> - vocals.flac   <Song> - instrumental.flac      (2 stems)
    or  ... - vocals / - drums / - bass / - other                        (4 stems: cleaner riffs, bass, drums)

  samplehunt.py run   "/srv/tandem-pool/All stems" --out /srv/tandem-pool/Samples      analyse + rank + cut
  samplehunt.py serve /srv/tandem-pool/Samples                                          audition page with thumbs
  samplehunt.py run   ... --bpm 120 --key Am        also export copies stretched/shifted to your project

Every 2-, 4- and 8-bar stretch (on the bar), every vocal phrase and every hit is scored on what makes material good to
sample, compared across the whole library:
  hook       repeats in the song (hooks repeat) and lifts above the rest
  clean      exposed: one part stands alone (intros, breakdowns), little bleed from other parts
  rich       chord colour (more than plain triads) and melodic movement
  groove     steady tempo, punchy hits, loops that repeat seamlessly
  distinct   sounds unlike the rest of the library
  filters    no fade-outs, near-silence, clipping
Ratings from the audition page re-weight all of that per category (logistic regression held near the defaults) and boost
anything that sounds like what you liked. Analysis is cached per song: re-ranking takes a minute or two.

Filing (in --out):
  <Category>/NNN <Song> - <bpm>bpm <key> - <m>m<ss>s.wav   current top picks, best first (renumbered on re-rank)
  Liked/<Category>/...                                     everything you gave a thumbs-up, kept while it stays liked
  _Rate these/<Category>/...                               a dozen per category the learner wants your opinion on
  Matched <bpm> <key>/<Category>/...                       stretched/shifted copies when --bpm/--key is given
  index.html  index.csv  index.json  ratings.json          audition page, every pick with its scores, your ratings
"""
import argparse
import csv
import hashlib
import http.server
import json
import math
import os
import random
import re
import socketserver
import subprocess
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

for d in (Path(__file__).resolve().parent, Path("/usr/lib/tandem")):
    if (d / "tandem_tools.py").exists():
        sys.path.insert(0, str(d))
        break
try:
    import numpy as np
    from scipy.ndimage import median_filter
    import tandem_tools as tt
except ImportError as e:
    sys.exit(f"Needs numpy, scipy and Tandem's tandem_tools.py (install Tandem): {e}")

VERSION = 2
AUDIO = {".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".aif", ".aiff"}
KINDS = ("vocals", "instrumental", "drums", "bass", "other")
SR, HOP, FPS, NFFT = tt.SR, tt.HOP, tt.FPS, tt.NFFT
PCS = tt.PCS

FEATS = ["rep", "lift", "voc", "vtonal", "vmove", "otonal", "omove", "rich", "seam", "drums", "bass", "other",
         "sparse", "expose", "punch", "steady", "distinct", "quiet", "clip"]
CATS = {
    "Vocal hooks":         dict(bars=4, src="vocals",  w=dict(rep=1.2, voc=1.0, vtonal=0.9, vmove=0.5, lift=0.4, distinct=0.3, quiet=-1.0, clip=-0.6)),
    "Vocal chops":         dict(bars=0, src="vocals",  w=dict(vtonal=1.0, voc=0.8, vmove=0.6, rep=0.5, distinct=0.5, clip=-0.6)),
    "Synth & lead riffs":  dict(bars=4, src="other",   w=dict(rep=1.1, otonal=1.0, omove=0.8, other=0.7, voc=-0.9, lift=0.3, distinct=0.5, quiet=-1.0)),
    "Chord loops":         dict(bars=4, src="harmony", w=dict(seam=1.1, rich=1.1, rep=0.6, steady=0.4, voc=-1.0, distinct=0.4, quiet=-1.0, clip=-0.6)),
    "Bass lines":          dict(bars=4, src="bass",    w=dict(bass=1.2, seam=0.9, rep=0.7, omove=0.3, voc=-0.6, steady=0.4, quiet=-1.0)),
    "Drum breaks":         dict(bars=2, src="drums",   w=dict(drums=1.2, sparse=0.8, expose=0.6, punch=0.7, seam=0.6, steady=0.5, voc=-1.0, quiet=-1.0)),
    "Intros & breakdowns": dict(bars=8, src="mix",     w=dict(expose=1.1, sparse=1.0, rich=0.6, distinct=0.6, seam=0.4, lift=-0.4, quiet=-1.2, clip=-0.6)),
    "Hooks (full mix)":    dict(bars=8, src="mix",     w=dict(rep=1.3, lift=1.0, rich=0.4, vtonal=0.4, distinct=0.3, quiet=-1.0, clip=-0.6)),
    "One-shots":           dict(bars=0, src="hits",    w=dict(punch=1.0, expose=1.0, distinct=0.6, clip=-0.8)),
}


# ----------------------------------------------------------------------------- library
def find_songs(folder: Path):
    songs = {}
    for p in sorted(folder.iterdir()):
        if not p.is_file() or p.suffix.lower() not in AUDIO or p.name.startswith("."):
            continue
        m = re.match(r"^(.*) - (" + "|".join(KINDS) + r")$", p.stem, re.I)
        if m:
            songs.setdefault(m.group(1), {})[m.group(2).lower()] = str(p)
        else:
            songs.setdefault(p.stem, {})["mix"] = str(p)
    return songs


def frame_rms(y, n):
    idx = np.arange(n) * HOP
    sq = np.concatenate([[0.0], np.cumsum(y.astype(np.float64) ** 2)])
    a = np.minimum(idx, len(y))
    e = np.minimum(idx + NFFT, len(y))
    return np.sqrt((sq[e] - sq[a]) / np.maximum(e - a, 1))


def per_beat(x, beats, n):
    bt = np.concatenate([beats, [n]])
    return np.array([x[a:b].mean(axis=0) if b > a else x[min(a, n - 1)] for a, b in zip(bt[:-1], bt[1:])])


def logbands(S, nb, lo=40):
    f = np.arange(S.shape[1]) * SR / NFFT
    e = np.geomspace(lo, SR / 2, nb + 1)
    return np.stack([S[:, (f >= a) & (f < b)].sum(axis=1) for a, b in zip(e[:-1], e[1:])], axis=1), e


def chroma_info(y, beat_times, bpm):
    """Per beat: pitch clarity (one pitch class dominates) and how many different notes lead (melodic movement)."""
    C, chop = tt.chroma_frames(y)
    t = np.arange(len(C)) * chop
    peak = C.max(axis=1) / (C.mean(axis=1) + 1e-9)
    loud = C.sum(axis=1)
    ref = np.median(loud[loud > 0]) if (loud > 0).any() else 1.0
    dom = np.where(loud > 0.1 * ref, C.argmax(axis=1), -1)
    edges = np.append(beat_times, beat_times[-1] + 60 / bpm)
    tonal, move = [], []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (t >= a) & (t < b)
        tonal.append(float(peak[m].mean()) if m.any() else 1.0)
        d = dom[m]
        d = d[d >= 0]
        move.append(len(set(d.tolist())) if len(d) else 0)
    return np.array(tonal), np.array(move, dtype=float)


def analyse(name, files):
    """All per-window / per-phrase / per-hit features for one song."""
    st = {k: tt.load(files[k]) for k in KINDS if k in files}
    if not st:
        st["mix"] = tt.load(files["mix"])
    n = min(len(v) for v in st.values())
    st = {k: v[:n] for k, v in st.items()}
    mix = st.pop("mix") if "mix" in st else sum(st.values())
    dur = len(mix) / SR
    if dur < 30:
        return {"song": name, "skip": "under 30 s"}
    S = tt.stft_mag(mix)
    nfr = len(S)
    env = tt.onset_envelope(S)
    bpm, tconf = tt.estimate_tempo(env)
    if not bpm:
        return {"song": name, "skip": "no steady beat"}
    beats = tt.track_beats(env, bpm)
    bt = beats / FPS
    if len(bt) > 8:
        slope = np.polyfit(np.arange(len(bt)), bt, 1)[0]
        if 0.3 < slope < 1.0:
            bpm = 60.0 / slope
    if len(beats) < 40:
        return {"song": name, "skip": "too few beats"}
    C, chop = tt.chroma_frames(mix)
    k, mode, _, kconf = tt.detect_key(C.mean(axis=0))
    key = f"{k}{'m' if mode == 'minor' else ''}"
    chords, Bch = tt.chords_per_beat(C, chop, bt)
    phase = tt.bar_phase(chords)
    nb = len(beats)

    bands20, _ = logbands(S, 20)
    timb = per_beat(np.log1p(bands20), beats, nfr)
    Bn = Bch / (np.linalg.norm(Bch, axis=1, keepdims=True) + 1e-9)
    tn = (timb - timb.mean(axis=0)) / (timb.std(axis=0) + 1e-9)
    F = np.concatenate([Bn * 2.0, tn * 0.5], axis=1)
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
    b12, _ = logbands(S, 12)
    fpb = np.concatenate([per_beat(np.log1p(b12), beats, nfr), Bn], axis=1)

    def e(y):
        return frame_rms(y, nfr) ** 2
    e_mix = e(mix)
    e_voc = e(st["vocals"]) if "vocals" in st else np.zeros(nfr)
    ins = st.get("instrumental")
    if ins is None and any(x in st for x in ("drums", "bass", "other")):
        ins = sum(st[x] for x in ("drums", "bass", "other") if x in st)
    if ins is None:
        ins = mix
    Si = tt.stft_mag(ins)[:nfr]
    Bi, edg = logbands(Si, 96)
    Hh = median_filter(Bi, size=(17, 1))
    Pp = median_filter(Bi, size=(1, 9))
    mask_p = Pp ** 2 / (Hh ** 2 + Pp ** 2 + 1e-12)
    centers = np.sqrt(edg[:-1] * edg[1:])
    has4 = all(x in st for x in ("drums", "bass", "other"))
    if has4:
        e_dr, e_ba, e_ot = e(st["drums"]), e(st["bass"]), e(st["other"])
    else:
        P2, H2 = (Bi * mask_p) ** 2, (Bi * (1 - mask_p)) ** 2
        e_dr = P2.sum(axis=1)
        e_ba = H2[:, centers < 220].sum(axis=1)
        e_ot = H2[:, centers >= 220].sum(axis=1)
        sc = (e_mix - e_voc).clip(min=0).sum() / (e_dr + e_ba + e_ot).sum()  # same scale as the stems
        e_dr, e_ba, e_ot = e_dr * sc, e_ba * sc, e_ot * sc
    tot = e_voc + e_dr + e_ba + e_ot + 1e-12
    sh = {nm: per_beat(x / tot, beats, nfr) for nm, x in (("voc", e_voc), ("drums", e_dr), ("bass", e_ba), ("other", e_ot))}
    active = per_beat((Bi > 0.05 * Bi.max(axis=0, keepdims=True)).mean(axis=1), beats, len(Bi))
    e_db = 20 * np.log10(per_beat(np.sqrt(e_mix), beats, nfr) + 1e-6)
    med = float(np.median(e_db))
    starts = np.clip((beats * HOP).astype(int), 0, len(mix) - 1)
    pk = np.maximum.reduceat(np.abs(mix), starts)
    clipb = (pk > 0.985).astype(float)
    envb = np.array([env[a:b].max() if b > a else 0 for a, b in zip(beats, np.append(beats[1:], nfr))])
    punchb = envb / (np.median(envb) + 1e-9)
    vt, vm = chroma_info(st["vocals"], bt, bpm) if "vocals" in st else (np.ones(nb), np.zeros(nb))
    ot, om = chroma_info(st["other"] if "other" in st else ins, bt, bpm)
    rich_b = np.array([(b > 0.45 * b.max()).sum() if b.max() > 0 else 0 for b in Bch], dtype=float)
    ibi = np.diff(bt)

    wins = []
    for bars in sorted({c["bars"] for c in CATS.values() if c["bars"]}):
        L = bars * 4
        cand = [b for b in range(phase, nb, 4) if b + L + 4 <= nb and bt[b] > 3 and bt[b + L] < dur - 6]
        if len(cand) < 3:
            continue
        flat = np.stack([F[b:b + L] for b in cand]).reshape(len(cand), -1) / math.sqrt(L)
        sim = flat @ flat.T
        for i, b in enumerate(cand):
            far = [j for j, c in enumerate(cand) if abs(c - b) >= L]
            top = np.sort(sim[i, far])[::-1][:3] if far else np.array([0.0])
            s = slice(b, b + L)
            shares = np.array([sh[x][s].mean() for x in ("voc", "drums", "bass", "other")])
            changes = sum(1 for j in range(b + 1, b + L) if chords[j] != chords[j - 1])
            vact = sh["voc"][s] > 0.15
            wins.append({
                "bars": bars, "t": round(float(bt[b]), 3), "len": round(float(bt[b + L] - bt[b]), 3),
                "rep": float(top.mean()),
                "lift": float(e_db[s].mean() - med),
                "voc": float(shares[0]), "drums": float(shares[1]), "bass": float(shares[2]), "other": float(shares[3]),
                "vtonal": float(np.mean(vt[s] * vact)), "vmove": float(np.mean(vm[s] * vact)),
                "otonal": float(ot[s].mean()), "omove": float(om[s].mean()),
                "rich": float(np.clip(rich_b[s].mean() - 3, 0, 4) + 0.3 * changes / bars),
                "seam": float(np.mean(np.sum(F[b:b + 4] * F[b + L:b + L + 4], axis=1))),
                "sparse": float(1.0 - active[s].mean()),
                "expose": float(shares.max()),
                "punch": float(np.percentile(punchb[s], 75)),
                "steady": float(-np.std(ibi[b:b + L - 1]) / (np.mean(ibi[b:b + L - 1]) + 1e-9)),
                "quiet": float(np.mean(e_db[s] < med - 20)),
                "clip": float(clipb[s].mean()),
                "fp": [round(float(x), 3) for x in fpb[s].mean(axis=0)],
            })

    # vocal chops: phrases between breaths, so no word is cut in half
    chops = []
    if "vocals" in st:
        rv = frame_rms(st["vocals"], nfr)
        thr = max(0.06 * np.percentile(rv, 99), 1e-4)
        act = np.convolve((rv > thr).astype(float), np.ones(5) / 5, mode="same") > 0.5
        edges = np.flatnonzero(np.diff(np.concatenate([[0], act.astype(int), [0]])))
        Cv, chv = tt.chroma_frames(st["vocals"])
        tv = np.arange(len(Cv)) * chv
        chroma = []
        for a, b in zip(edges[::2], edges[1::2]):
            t0, t1 = a / FPS, b / FPS
            if not (0.6 <= t1 - t0 <= 4.0) or t0 < 2 or t1 > dur - 3:
                continue
            m = (tv >= t0) & (tv < t1)
            if not m.any():
                continue
            pkv = Cv[m].max(axis=1) / (Cv[m].mean(axis=1) + 1e-9)
            ib = min(int(np.searchsorted(bt, t0)), nb - 1)
            chops.append({"t": round(max(0.0, t0 - 0.03), 3), "len": round(t1 - t0 + 0.12, 3),
                          "vtonal": float(pkv.mean()), "vmove": float(len(set(Cv[m].argmax(axis=1).tolist()))),
                          "voc": float(rv[a:b].mean() / (np.sqrt(e_mix[a:b]).mean() + 1e-9)),
                          "clip": float(clipb[ib]), "fp": [round(float(x), 3) for x in fpb[ib]]})
            chroma.append(Cv[m].mean(axis=0))
        if chops:  # a phrase that comes back (the same melody again) counts as a hook
            M = np.stack(chroma)
            M /= np.linalg.norm(M, axis=1, keepdims=True) + 1e-9
            S2 = M @ M.T
            for i, c in enumerate(chops):
                c["rep"] = float((S2[i] > 0.95).sum() - 1)

    # one-shots: clean hits (drums, stabs) with room after them
    hits = []
    src_h = st["drums"] if has4 else ins
    Sh = tt.stft_mag(st["drums"])[:nfr] if has4 else Si
    envh = tt.onset_envelope(Sh)
    thr = np.percentile(envh, 97)
    peaks = [i for i in range(2, len(envh) - 2) if envh[i] > thr and envh[i] == envh[i - 2:i + 3].max()]
    rh = frame_rms(src_h, nfr)
    for j, p in enumerate(peaks):
        nxt = peaks[j + 1] if j + 1 < len(peaks) else len(envh)
        gap = (nxt - p) / FPS
        if gap < 0.18 or p / FPS < 2 or p / FPS > dur - 3:
            continue
        L = min(gap - 0.02, 1.2)
        pre = rh[max(0, p - 6):max(1, p - 2)].mean()
        body = rh[p:p + 4].mean()
        tail = rh[min(p + int(L * FPS) - 3, nfr - 1)]
        ib = min(int(np.searchsorted(beats, p)), nb - 1)
        cent = float((Bi[p] * centers).sum() / (Bi[p].sum() + 1e-9))
        typ = "kick" if cent < 300 else ("snare-clap" if cent < 2500 else "hat-cymbal") if mask_p[p].mean() > 0.45 else "stab"
        hits.append({"t": round(max(0.0, p / FPS - 0.01), 3), "len": round(L, 3),
                     "punch": float(envh[p] / (np.median(envh) + 1e-9)),
                     "expose": float(1 - (pre + tail) / (2 * body + 1e-9)),
                     "voc": float(sh["voc"][ib]), "clip": float(clipb[ib]), "type": typ,
                     "fp": [round(float(x), 3) for x in fpb[ib]]})
    hits.sort(key=lambda h: -(h["punch"] * max(h["expose"], 0)))

    return {"song": name, "files": files, "bpm": round(float(bpm), 1), "key": key, "dur": round(dur, 1),
            "stems": 4 if has4 else (2 if "vocals" in st else 0), "wins": wins, "chops": chops, "hits": hits[:40]}


def cache_key(files):
    h = hashlib.sha1(f"v{VERSION}".encode())
    for k in sorted(files):
        s = os.stat(files[k])
        h.update(f"{k}{files[k]}{s.st_size}{int(s.st_mtime)}".encode())
    return h.hexdigest()[:16]


def job(args):
    name, files, cdir = args
    cp = Path(cdir) / f"{cache_key(files)}.json"
    if cp.exists():
        try:
            return json.loads(cp.read_text())
        except ValueError:
            pass
    try:
        r = analyse(name, files)
    except Exception as e:  # one bad file never stops the run
        r = {"song": name, "skip": f"error: {type(e).__name__}: {e}"}
    cp.write_text(json.dumps(r))
    return r


# ----------------------------------------------------------------------------- ranking + learning
def cand_id(cat, song, t):
    return f"{cat}|{song}|{t:.2f}"


def gather(good):
    out = {c: [] for c in CATS}
    for r in good:
        for w in r["wins"]:
            for c, cfg in CATS.items():
                if cfg["bars"] == w["bars"] and not (cfg["src"] == "vocals" and r["stems"] == 0):
                    out[c].append((r, w))
        out["Vocal chops"] += [(r, ch) for ch in r.get("chops", [])]
        out["One-shots"] += [(r, h) for h in r.get("hits", [])]
    return out


def fit(Xz, y, w0, lam=2.0, iters=800, lr=0.05):
    """Logistic regression on z-scored features, pulled toward the default weights so a few ratings can't swing it."""
    w, b = w0.copy(), 0.0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-np.clip(Xz @ w + b, -30, 30)))
        w -= lr * (Xz.T @ (p - y) / len(y) + lam * (w - w0) / len(y))
        b -= lr * float((p - y).mean())
    return w, b


def rank(good, ratings, top, per_song):
    cands = gather(good)
    rows, learned = {}, {}
    for cat, cfg in CATS.items():
        items = cands[cat]
        if not items:
            continue
        X = np.array([[it.get(f, 0.0) for f in FEATS] for _, it in items], dtype=float)
        fp = np.array([it["fp"] for _, it in items], dtype=float)
        fpz = (fp - fp.mean(axis=0)) / (fp.std(axis=0) + 1e-9)
        X[:, FEATS.index("distinct")] = np.linalg.norm(fpz, axis=1) / math.sqrt(fpz.shape[1])
        Xz = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-9)
        w0 = np.array([cfg["w"].get(f, 0.0) for f in FEATS])
        score = Xz @ w0
        ids = [cand_id(cat, r["song"], it["t"]) for r, it in items]
        rated = [(i, ratings[x]) for i, x in enumerate(ids) if x in ratings]
        note = "defaults"
        if len(rated) >= 6 and len({v for _, v in rated}) == 2:
            ii = np.array([i for i, _ in rated])
            y = np.array([1.0 if v > 0 else 0.0 for _, v in rated])
            w, b = fit(Xz[ii], y, w0)
            score = Xz @ w + b
            fpn = fpz / (np.linalg.norm(fpz, axis=1, keepdims=True) + 1e-9)
            likes, dis = ii[y == 1], ii[y == 0]
            boost = np.sort(fpn @ fpn[likes].T, axis=1)[:, -min(3, len(likes)):].mean(axis=1)
            boost -= np.sort(fpn @ fpn[dis].T, axis=1)[:, -min(3, len(dis)):].mean(axis=1)
            score = score + 1.5 * boost
            note = f"learned from {len(rated)} ratings"
            learned[cat] = {"ratings": len(rated), "weights": {f: round(float(v), 2) for f, v in zip(FEATS, w) if abs(v) > 0.05}}
        elif rated:
            note = f"defaults ({len(rated)} rated; learning starts at 6 with both 👍 and 👎)"
        for i, v in rated:  # what you rated stays where you put it
            score[i] = 1e6 if v > 0 else -1e6
        order = np.argsort(-score)
        taken, per = [], {}
        for i in order:
            r, it = items[i]
            if score[i] <= -1e5:
                break
            if per.get(r["song"], 0) >= per_song and score[i] < 1e5:
                continue
            if score[i] < 1e5 and any(t[0]["song"] == r["song"] and abs(t[1]["t"] - it["t"]) < max(it["len"], 0.5) for t in taken):
                continue
            taken.append((r, it, float(score[i]), ids[i]))
            per[r["song"]] = per.get(r["song"], 0) + 1
            if sum(1 for t in taken if t[2] < 1e5) >= top:  # liked clips ride along on top of the count
                break
        pool = [i for i in order[top:top * 6] if ids[i] not in ratings]
        random.Random(len(ratings)).shuffle(pool)
        seen, learn = set(), []
        for i in pool:
            r, it = items[i]
            if r["song"] not in seen:
                seen.add(r["song"])
                learn.append((r, it, float(score[i]), ids[i]))
                if len(learn) >= 12:
                    break
        rows[cat] = (taken, learn, note)
    return rows, learned


# ----------------------------------------------------------------------------- cutting
def safe(s):
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip()[:110]


def src_args(files, src, start, length):
    """ffmpeg inputs + filter for the part a category is cut from: the stem when there, else a filtered instrumental."""
    ss = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}"]
    ins = files.get("instrumental")
    if src in ("vocals", "drums", "bass", "other") and src in files:
        return ss + ["-i", files[src]], None
    if src == "harmony" and "bass" in files and "other" in files:
        return ss + ["-i", files["bass"]] + ss + ["-i", files["other"]], "amix=inputs=2:normalize=0"
    if src == "mix":
        parts = [k for k in ("vocals", "drums", "bass", "other") if k in files]
        if len(parts) >= 3:
            a = []
            for k in parts:
                a += ss + ["-i", files[k]]
            return a, f"amix=inputs={len(parts)}:normalize=0"
        if "mix" in files:
            return ss + ["-i", files["mix"]], None
        if ins and "vocals" in files:
            return ss + ["-i", files["vocals"]] + ss + ["-i", ins], "amix=inputs=2:normalize=0"
    if src == "hits" and "drums" in files:
        return ss + ["-i", files["drums"]], None
    base = ins or files.get("mix") or next(iter(files.values()))
    return ss + ["-i", base], {"bass": "lowpass=f=220,lowpass=f=220", "other": "highpass=f=220"}.get(src)


def cut(files, src, start, length, out: Path, tempo=1.0, semis=0, rb=False):
    fade = 0.003 if src == "hits" else 0.006
    a, flt = src_args(files, src, start, length)
    chain = [flt] if flt else []
    if tempo != 1.0 or semis:
        chain.append(f"rubberband=tempo={tempo:.5f}:pitch={2 ** (semis / 12):.5f}" if rb
                     else f"atempo={min(max(tempo, 0.5), 2.0):.5f}")
    newlen = length / tempo
    chain += [f"afade=t=in:d={fade}", f"afade=t=out:st={max(0.0, newlen - fade * 3):.3f}:d={fade * 3}"]
    graph = ",".join(chain)
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-y"] + a
    cmd += ["-filter_complex", graph] if graph.startswith("amix") else ["-af", graph]
    cmd += ["-ar", "44100", "-c:a", "pcm_s16le", str(out)]
    return subprocess.run(cmd).returncode == 0


def key_shift(sample_key, target_key):
    def root(k):
        m = k.endswith("m")
        r = PCS.index(k[:-1] if m else k)
        return (r + 3) % 12 if m else r  # minor -> its relative major, so Am and C don't move
    try:
        d = (root(target_key) - root(sample_key)) % 12
    except ValueError:
        return 0
    return d - 12 if d > 6 else d


def has_rubberband():
    r = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
    return " rubberband " in r.stdout


def link_or_copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return
    try:
        os.link(src, dst)
    except OSError:
        import shutil
        shutil.copy2(src, dst)


# ----------------------------------------------------------------------------- run
def run(a):
    folder, out = Path(a.folder).expanduser(), Path(a.out).expanduser()
    songs = find_songs(folder)
    if not songs:
        sys.exit(f"No songs in {folder}")
    cdir = out / ".cache"
    cdir.mkdir(parents=True, exist_ok=True)
    (out / ".args.json").write_text(json.dumps({"folder": str(folder), "out": str(out), "top": a.top, "per_song": a.per_song,
                                                "bpm": a.bpm, "key": a.key, "jobs": a.jobs}))
    print(f"{len(songs)} songs · {a.jobs} workers · results in {out}", flush=True)
    res, t0, done = [], time.time(), 0
    with ProcessPoolExecutor(a.jobs) as ex:
        futs = [ex.submit(job, (nm, f, str(cdir))) for nm, f in songs.items()]
        for fu in as_completed(futs):
            res.append(fu.result())
            done += 1
            if done % 10 == 0 or done == len(futs):
                el = time.time() - t0
                print(f"  analysed {done}/{len(futs)} · {el / 60:.1f} min, about {el / done * (len(futs) - done) / 60:.0f} min left", flush=True)
    good = [r for r in res if not r.get("skip")]
    skipped = [r for r in res if r.get("skip")]
    ratings = load_ratings(out)
    rows, learned = rank(good, ratings, a.top, a.per_song)
    rb = has_rubberband() if (a.bpm or a.key) else False
    if (a.bpm or a.key) and not rb:
        print("  note: this ffmpeg has no rubberband filter: tempo matching uses atempo, key shifting is skipped", flush=True)
    keep, index = set(), []
    for cat, (taken, learn, note) in rows.items():
        cfg = CATS[cat]
        for grp, lst, sub in (("pick", taken, cat), ("learn", learn, f"_Rate these/{cat}")):
            for i, (r, it, sc, cid) in enumerate(lst, 1):
                m, s = divmod(int(it["t"]), 60)
                extra = f" {it['type']}" if it.get("type") else ""
                base = f"{safe(r['song'])} -{extra} {r['bpm']:g}bpm {r['key']} - {m}m{s:02d}s.wav"
                rel = f"{sub}/{i:03d} {base}" if grp == "pick" else f"{sub}/{base}"
                (out / sub).mkdir(parents=True, exist_ok=True)
                keep.add(rel)
                if not (out / rel).exists():
                    old = [p for p in (out / sub).glob(f"[0-9][0-9][0-9] {glob_escape(base)}")]
                    if old:  # same clip, new rank: rename instead of cutting again
                        os.replace(old[0], out / rel)
                    else:
                        cut(r["files"], cfg["src"], it["t"], it["len"], out / rel)
                v = ratings.get(cid, 0)
                row = {"id": cid, "group": grp, "cat": cat, "rank": i if grp == "pick" else 0, "song": r["song"],
                       "bpm": r["bpm"], "key": r["key"], "start": f"{m}:{s:02d}", "len": round(it["len"], 2),
                       "bars": it.get("bars", 0), "type": it.get("type", ""), "rating": v, "file": rel,
                       "score": round(sc, 2) if abs(sc) < 1e5 else ("liked" if sc > 0 else "disliked"),
                       **{f: round(it.get(f, 0.0), 3) for f in FEATS if f in it}}
                if v > 0:  # thumbs-up clips also live in Liked/, without the rank number
                    lrel = f"Liked/{cat}/{base}"
                    link_or_copy(out / rel, out / lrel)
                    keep.add(lrel)
                    row["liked"] = lrel
                if grp == "pick" and (a.bpm or a.key):
                    tempo = (a.bpm / r["bpm"]) if (a.bpm and it.get("bars")) else 1.0
                    if tempo > 1.9 or tempo < 0.52:  # half/double time is the closer match
                        tempo = tempo / 2 if tempo > 1.9 else tempo * 2
                    semis = key_shift(r["key"], a.key) if (a.key and rb and cfg["src"] not in ("drums", "hits")) else 0
                    label = " ".join(x for x in (f"{a.bpm:g}bpm" if a.bpm else "", a.key or "") if x)
                    mrel = f"Matched {label}/{cat}/{i:03d} {base}"
                    (out / mrel).parent.mkdir(parents=True, exist_ok=True)
                    keep.add(mrel)
                    if not (out / mrel).exists():
                        cut(r["files"], cfg["src"], it["t"], it["len"], out / mrel, tempo=tempo, semis=semis, rb=rb)
                    row["matched"] = mrel
                index.append(row)
        print(f"  {cat}: {len(taken)} picks ({note})", flush=True)
    for p in out.rglob("*.wav"):  # clips that dropped off the lists (or were un-liked)
        rel = str(p.relative_to(out))
        if rel not in keep and not rel.startswith("."):
            p.unlink()
    for d in sorted((x for x in out.rglob("*") if x.is_dir() and not x.name.startswith(".")), key=lambda x: -len(x.parts)):
        if not any(d.iterdir()):
            d.rmdir()
    with open(out / "index.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        cols = ["group", "cat", "rank", "song", "bpm", "key", "start", "len", "bars", "type", "score", "rating"] + FEATS + ["file"]
        wr.writerow(cols)
        for r in index:
            wr.writerow([r.get(c, "") for c in cols])
    (out / "index.json").write_text(json.dumps({"made": time.strftime("%Y-%m-%d %H:%M"), "songs": len(good),
                                                "learned": learned, "rows": index}))
    (out / "skipped.txt").write_text("".join(f"{r['song']}: {r['skip']}\n" for r in skipped))
    write_page(out)
    print(f"Done: {len(good)} songs" + (f", {len(skipped)} skipped (see skipped.txt)" if skipped else "") +
          f". Audition: samplehunt.py serve {out}", flush=True)


def glob_escape(s):
    return re.sub(r"([*?\[])", r"[\1]", s)


# ----------------------------------------------------------------------------- audition page + ratings
def load_ratings(out):
    try:
        return {k: int(v) for k, v in json.loads((out / "ratings.json").read_text()).items()}
    except (OSError, ValueError):
        return {}


PAGE = r"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Sample hunt</title><style>
:root{--bg:#0e1220;--card:#161c2e;--line:#232b42;--ink:#e9edf7;--mut:#97a2bd;--acc:#7aa2ff;--good:#3ecf8e;--bad:#ff6b6b}
body{font:14px system-ui,sans-serif;margin:0;background:var(--bg);color:var(--ink)}
header{padding:14px 16px 10px;background:var(--card);position:sticky;top:0;z-index:2;border-bottom:1px solid var(--line)}
h1{margin:0 0 8px;font-size:19px}h1 small{color:var(--mut);font-weight:400;font-size:12px;margin-left:8px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.tab{background:#202842;border:0;color:var(--ink);padding:6px 10px;border-radius:999px;cursor:pointer;font-size:13px}
.tab.on{background:var(--acc);color:#0b1020;font-weight:600}
select,input,button.act{background:var(--bg);color:var(--ink);border:1px solid #334;border-radius:8px;padding:6px 8px;margin:2px;font-size:13px}
button.act{cursor:pointer;background:#24305a}.row{display:grid;grid-template-columns:40px 1fr auto auto;gap:10px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--line)}
.n{color:var(--acc);font-weight:700;text-align:right}.meta{color:var(--mut);font-size:12px;margin-top:2px}
.tag{display:inline-block;background:#232d4b;border-radius:6px;padding:1px 7px;margin:2px 4px 0 0;font-size:11.5px}
audio{height:32px;width:210px}.th{display:flex;gap:4px}.th button{border:1px solid #334;background:transparent;color:var(--ink);border-radius:8px;width:38px;height:32px;font-size:16px;cursor:pointer}
.th .up.on{background:var(--good);border-color:var(--good)}.th .dn.on{background:var(--bad);border-color:var(--bad)}
.note{padding:10px 16px;color:var(--mut)}@media(max-width:640px){.row{grid-template-columns:30px 1fr auto}audio{grid-column:1/4;width:100%}}
</style><header><h1>Sample hunt<small id=made></small></h1><div class=tabs id=tabs></div>
<select id=grp><option value=pick>Top picks</option><option value=learn>Help it learn (rate these)</option><option value=liked>Liked</option></select>
<select id=key><option value="">Any key</option></select>
<input id=bmin type=number placeholder="BPM from" style=width:88px><input id=bmax type=number placeholder="to" style=width:64px>
<input id=q placeholder="Search song" style=width:140px><label class=meta><input type=checkbox id=mt> matched copies</label>
<button class=act id=rr>Update picks with my ratings</button><span id=st class=meta></span></header>
<div class=note id=nt></div><div id=list></div>
<script>
let D=[],R={},J={},cat='',busy=false;const $=i=>document.getElementById(i);
async function load(){J=await (await fetch('index.json?'+Date.now())).json();D=J.rows;R=await (await fetch('ratings')).json();
$('made').textContent='made '+J.made+' · '+J.songs+' songs';const cats=[...new Set(D.map(d=>d.cat))];if(!cat)cat=cats[0];
$('tabs').innerHTML=cats.map(c=>`<button class="tab${c==cat?' on':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
$('tabs').querySelectorAll('.tab').forEach(b=>b.onclick=()=>{cat=b.dataset.c;$('tabs').querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x==b));draw()});
const ks=[...new Set(D.map(d=>d.key))].sort();$('key').innerHTML='<option value="">Any key</option>'+ks.map(k=>`<option>${k}</option>`).join('');draw()}
function draw(){const g=$('grp').value,k=$('key').value,a=+$('bmin').value||0,b=+$('bmax').value||999,q=$('q').value.toLowerCase(),mt=$('mt').checked;
const L=J.learned&&J.learned[cat];$('nt').textContent=L?`${cat}: picks learned from ${L.ratings} of your ratings.`:'Rate with 👍 / 👎, then "Update picks with my ratings". About 30–50 ratings per type make a clear difference.';
const r=D.filter(d=>d.cat==cat&&(g=='liked'?(R[d.id]||0)>0:d.group==g)&&(!k||d.key==k)&&d.bpm>=a&&d.bpm<=b&&(!q||d.song.toLowerCase().includes(q)));
const nr=Object.keys(R).filter(x=>x.startsWith(cat+'|')).length;$('st').textContent=` ${r.length} shown · ${nr} rated in ${cat}`;
$('list').innerHTML=r.map((d,ix)=>{const v=R[d.id]||0,f=(mt&&d.matched)?d.matched:d.file;return `<div class=row><div class=n>${d.rank||'·'}</div><div><b>${esc(d.song)}</b><div class=meta>
<span class=tag>${d.bpm} BPM</span><span class=tag>${d.key}</span>${d.type?`<span class=tag>${d.type}</span>`:''}<span class=tag>${d.bars?d.bars+' bars':d.len+' s'} at ${d.start}</span></div></div>
<audio controls preload=none src="${encodeURI(f)}"></audio><div class=th data-id="${encodeURIComponent(d.id)}"><button class="up${v>0?' on':''}">👍</button><button class="dn${v<0?' on':''}">👎</button></div></div>`}).join('');
$('list').querySelectorAll('.th').forEach(t=>{t.querySelector('.up').onclick=()=>rate(t,1);t.querySelector('.dn').onclick=()=>rate(t,-1)})}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function rate(t,v){const id=decodeURIComponent(t.dataset.id);const nv=(R[id]||0)==v?0:v;await fetch('rate',{method:'POST',body:JSON.stringify({id,v:nv})});
if(nv)R[id]=nv;else delete R[id];t.querySelector('.up').classList.toggle('on',nv>0);t.querySelector('.dn').classList.toggle('on',nv<0);
const nr=Object.keys(R).filter(x=>x.startsWith(cat+'|')).length;$('st').textContent=` ${nr} rated in ${cat}`}
$('rr').onclick=async()=>{if(busy)return;busy=true;$('st').textContent=' updating… (a minute or two)';await fetch('rerank',{method:'POST'});
const t=setInterval(async()=>{const s=await (await fetch('status')).json();if(!s.running){clearInterval(t);busy=false;await load();$('st').textContent=' updated'}},4000)};
['grp','key','bmin','bmax','q','mt'].forEach(i=>$(i).oninput=draw);load();
</script>"""


def write_page(out):
    (out / "index.html").write_text(PAGE)


def serve(a):
    out = Path(a.folder).expanduser()
    if not (out / "index.json").exists():
        sys.exit(f"No results in {out}: run 'samplehunt.py run' first")
    write_page(out)
    lock, state = threading.Lock(), {"proc": None}

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *x, **k):
            super().__init__(*x, directory=str(out), **k)

        def log_message(self, *x):
            pass

        def _json(self, obj, code=200):
            b = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            if self.path.startswith("/ratings"):
                return self._json(load_ratings(out))
            if self.path.startswith("/status"):
                p = state["proc"]
                return self._json({"running": bool(p and p.poll() is None)})
            if self.path.startswith("/."):
                return self._json({"error": "not found"}, 404)
            return super().do_GET()

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b"{}"
            if self.path == "/rate":
                d = json.loads(body or b"{}")
                with lock:
                    r = load_ratings(out)
                    if d.get("v"):
                        r[d["id"]] = int(d["v"])
                    else:
                        r.pop(d.get("id"), None)
                    tmp = out / ".ratings.tmp"
                    tmp.write_text(json.dumps(r, indent=0))
                    os.replace(tmp, out / "ratings.json")
                return self._json({"ok": True, "count": len(r)})
            if self.path == "/rerank":
                p = state["proc"]
                if not (p and p.poll() is None):
                    g = json.loads((out / ".args.json").read_text())
                    cmd = [sys.executable, str(Path(__file__).resolve()), "run", g["folder"], "--out", g["out"],
                           "--top", str(g["top"]), "--per-song", str(g["per_song"]), "--jobs", str(g.get("jobs") or 4)]
                    if g.get("bpm"):
                        cmd += ["--bpm", str(g["bpm"])]
                    if g.get("key"):
                        cmd += ["--key", g["key"]]
                    state["proc"] = subprocess.Popen(["nice", "-n", "19"] + cmd, stdout=open(out / ".rerank.log", "w"),
                                                     stderr=subprocess.STDOUT)
                return self._json({"ok": True})
            return self._json({"error": "unknown"}, 404)

    class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    srv = TS(("0.0.0.0", a.port), H)
    host = subprocess.run(["hostname"], capture_output=True, text=True).stdout.strip()
    print(f"Audition page: http://{host}:{a.port}/  (from another device use this computer's Tailscale or home address) · Ctrl-C stops", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    r = sub.add_parser("run", help="analyse, rank and cut")
    r.add_argument("folder")
    r.add_argument("--out", default=str(Path.home() / "Tandem" / "Samples"))
    r.add_argument("--top", type=int, default=120, help="picks per category (default 120)")
    r.add_argument("--per-song", type=int, default=2, help="most picks of one category from one song (default 2)")
    r.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    r.add_argument("--bpm", type=float, help="also export picks stretched to this tempo")
    r.add_argument("--key", help="also export picks shifted to this key, e.g. Am or F#")
    s = sub.add_parser("serve", help="audition page with thumbs up/down")
    s.add_argument("folder")
    s.add_argument("--port", type=int, default=8765)
    argv = sys.argv[1:]
    if argv and argv[0] not in ("run", "serve", "-h", "--help"):
        argv = ["run"] + argv  # old style: samplehunt.py FOLDER ...
    a = ap.parse_args(argv)
    if a.cmd == "serve":
        serve(a)
    elif a.cmd == "run":
        run(a)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
