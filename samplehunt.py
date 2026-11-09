#!/usr/bin/env python3
"""samplehunt — listen through a whole stems library and pull out the catchiest, most usable samples.

Input: one folder of "<Song> - vocals.<ext>" / "<Song> - instrumental.<ext>" pairs (what stems-collect makes).
Songs with no stems are analysed from the full mix.

For every song it finds the beat, bars, tempo and key, then scores every 2-, 4- and 8-bar stretch on:
  repetition   how often the stretch comes back in the song: hooks repeat (the strongest sign of "catchy")
  lift         loudness/energy against the rest of the song: choruses and drops lift
  vocal        how present and how melodic (sung, in tune) the vocal is there
  loop seam    whether the bar after the stretch matches its first bar: it loops cleanly
  drums        how much of the instrumental is percussion, and how sparse the arrangement is: breaks
Scores are compared across the WHOLE library, so the top of the list is the best of all 1,000 songs, not just
each song's own best moment. It then cuts the winners bar-exact from the full-quality stems:

  Samples/Vocal hooks/        4 bars of the vocal stem where the sung hook repeats
  Samples/Hooks (full mix)/   8 bars of the catchiest section, vocals + instrumental together
  Samples/Loops/              4 bars of instrumental that loop seamlessly
  Samples/Drum breaks/        2 bars where the instrumental is mostly drums
  Samples/index.html          audition page: play, sort and filter by type, key and tempo
  Samples/index.csv           every candidate with its scores

  samplehunt.py ~/Tandem/"All stems"                     -> ~/Tandem/Samples, 150 per type
  samplehunt.py DIR --out DIR --top 300 --jobs 12        more per type, set the worker count
  Analysis is cached per song: stop any time, re-run, and it carries on.
"""
import argparse
import csv
import hashlib
import html
import json
import os
import re
import subprocess
import sys
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

AUDIO = {".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".aif", ".aiff"}
SR, HOP, FPS = tt.SR, tt.HOP, tt.FPS
CATS = {  # name, bars, source stem, weights over library-wide z-scores
    "Vocal hooks": dict(bars=4, src="vocals", w={"rep": 1.3, "voc": 1.0, "tonal": 0.8, "lift": 0.4}),
    "Hooks (full mix)": dict(bars=8, src="mix", w={"rep": 1.4, "lift": 1.0, "voc": 0.3}),
    "Loops": dict(bars=4, src="instrumental", w={"seam": 1.3, "rep": 0.8, "lift": 0.4, "voc": -0.7}),
    "Drum breaks": dict(bars=2, src="instrumental", w={"perc": 1.3, "voc": -1.0, "sparse": 0.7, "seam": 0.6}),
}
FEATS = ["rep", "lift", "voc", "tonal", "seam", "perc", "sparse"]


def find_songs(folder: Path):
    songs = {}
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() not in AUDIO or not p.is_file():
            continue
        m = re.match(r"^(.*) - (vocals|instrumental)$", p.stem, re.I)
        if m:
            songs.setdefault(m.group(1), {})[m.group(2).lower()] = str(p)
        else:
            songs.setdefault(p.stem, {})["mix"] = str(p)
    return songs


def per_beat(x, beats, n):
    bt = np.concatenate([beats, [n]])
    return np.array([x[a:b].mean(axis=0) if b > a else x[min(a, n - 1)] for a, b in zip(bt[:-1], bt[1:])])


def frame_rms(y):
    n = 1 + max(0, len(y) - tt.NFFT) // HOP
    idx = np.arange(n) * HOP
    sq = np.concatenate([[0.0], np.cumsum(y.astype(np.float64) ** 2)])
    e = np.minimum(idx + tt.NFFT, len(y))
    return np.sqrt((sq[e] - sq[idx]) / np.maximum(e - idx, 1))


def analyse(name, files):
    voc = tt.load(files["vocals"]) if "vocals" in files else None
    ins = tt.load(files["instrumental"]) if "instrumental" in files else None
    if voc is not None and ins is not None:
        n = min(len(voc), len(ins)); voc, ins = voc[:n], ins[:n]; mix = voc + ins
    else:
        mix = tt.load(files.get("mix") or files.get("instrumental") or files.get("vocals"))
    dur = len(mix) / SR
    if dur < 30:
        return {"song": name, "skip": "under 30 s"}
    S = tt.stft_mag(mix)
    env = tt.onset_envelope(S)
    bpm, tconf = tt.estimate_tempo(env)
    if not bpm:
        return {"song": name, "skip": "no tempo"}
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
    nfr = len(S)
    # beat-synchronous features: harmony + timbre (as Song X-ray), energies
    freqs = np.arange(S.shape[1]) * SR / tt.NFFT
    edges = np.geomspace(40, SR / 2, 21)
    bands = np.log1p(np.stack([S[:, (freqs >= a) & (freqs < b)].sum(axis=1) for a, b in zip(edges[:-1], edges[1:])], axis=1))
    timb = per_beat(bands, beats, nfr)
    Bn = Bch / (np.linalg.norm(Bch, axis=1, keepdims=True) + 1e-9)
    tn = (timb - timb.mean(axis=0)) / (timb.std(axis=0) + 1e-9)
    F = np.concatenate([Bn * 2.0, tn * 0.5], axis=1)
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
    e_mix = per_beat(frame_rms(mix)[:nfr], beats, nfr)
    e_db = 20 * np.log10(e_mix + 1e-6)
    if voc is not None:
        e_voc = per_beat(frame_rms(voc)[:nfr], beats, nfr)
        e_ins = per_beat(frame_rms(ins)[:nfr], beats, nfr)
        vshare = e_voc ** 2 / (e_voc ** 2 + e_ins ** 2 + 1e-12)
        Cv, chv = tt.chroma_frames(voc)
        tv = np.arange(len(Cv)) * chv
        peak = Cv.max(axis=1) / (Cv.mean(axis=1) + 1e-9)          # sung notes: one pitch class dominates
        vtonal = np.array([peak[(tv >= a) & (tv < b)].mean() if ((tv >= a) & (tv < b)).any() else 1.0
                           for a, b in zip(bt, np.append(bt[1:], bt[-1] + 60 / bpm))])
        Si = tt.stft_mag(ins)
    else:
        vshare = np.zeros(len(beats)); vtonal = np.ones(len(beats)); Si = S
    # percussive share of the instrumental: median filtering across time (harmonic) vs across frequency (percussive)
    fi = np.arange(Si.shape[1]) * SR / tt.NFFT
    e2 = np.geomspace(40, SR / 2, 97)
    Bi = np.stack([Si[:, (fi >= a) & (fi < b)].sum(axis=1) for a, b in zip(e2[:-1], e2[1:])], axis=1)
    Hh = median_filter(Bi, size=(17, 1)); Pp = median_filter(Bi, size=(1, 9))
    pshare = per_beat((Pp ** 2 / (Hh ** 2 + Pp ** 2 + 1e-12)).mean(axis=1), beats, len(Bi))
    active = per_beat((Bi > 0.05 * Bi.max(axis=0, keepdims=True)).mean(axis=1), beats, len(Bi))
    nb = len(beats)
    med = float(np.median(e_db))
    starts = list(range(phase, nb, 4))
    wins = []
    for bars in sorted({c["bars"] for c in CATS.values()}):
        L = bars * 4
        cand = [b for b in starts if b + L + 4 <= nb and bt[b] > 4 and bt[b + L] < dur - 4]
        if len(cand) < 3:
            continue
        seqs = np.stack([F[b:b + L] for b in cand])                     # windows x L x d
        flat = seqs.reshape(len(cand), -1) / np.sqrt(L)
        sim = flat @ flat.T                                              # mean beat-by-beat cosine
        for i, b in enumerate(cand):
            far = [j for j, c in enumerate(cand) if abs(c - b) >= L]     # other places, not overlapping
            top = np.sort(sim[i, far])[::-1][:3] if far else np.array([0.0])
            sl = slice(b, b + L)
            wins.append({
                "bars": bars, "beat": b, "t": round(float(bt[b]), 3), "len": round(float(bt[b + L] - bt[b]), 3),
                "rep": float(top.mean()),
                "lift": float(e_db[sl].mean() - med),
                "voc": float(vshare[sl].mean()),
                "tonal": float(np.mean(vtonal[sl] * (vshare[sl] > 0.2))),
                "seam": float(np.mean(np.sum(F[b:b + 4] * F[b + L:b + L + 4], axis=1))),
                "perc": float(pshare[sl].mean()),
                "sparse": float(1.0 - active[sl].mean()),
            })
    return {"song": name, "files": files, "bpm": round(float(bpm), 1), "key": key, "dur": round(dur, 1), "wins": wins}


def cache_key(files):
    h = hashlib.sha1()
    for k in sorted(files):
        st = os.stat(files[k]); h.update(f"{k}{files[k]}{st.st_size}{int(st.st_mtime)}".encode())
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
        r = {"song": name, "skip": f"error: {e}"}
    cp.write_text(json.dumps(r))
    return r


def safe(s):
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip()[:120]


def cut(src_files, src, start, length, out: Path):
    fade = 0.006
    af = f"afade=t=in:d={fade},afade=t=out:st={max(0.0, length - fade):.3f}:d={fade}"
    if src == "mix" and "vocals" in src_files and "instrumental" in src_files:
        cmd = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", src_files["vocals"],
               "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", src_files["instrumental"],
               "-filter_complex", f"amix=inputs=2:normalize=0,{af}", "-ar", "44100", "-c:a", "pcm_s16le", str(out)]
    else:
        f = src_files.get(src) or src_files.get("mix") or src_files.get("instrumental") or src_files.get("vocals")
        cmd = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", f,
               "-af", af, "-ar", "44100", "-c:a", "pcm_s16le", str(out)]
    return subprocess.run(cmd).returncode == 0


def report(out: Path, rows):
    data = json.dumps([{k: r[k] for k in ("cat", "rank", "song", "bpm", "key", "start", "bars", "score", "file")} for r in rows])
    page = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Sample hunt</title><style>
body{font:14px system-ui,sans-serif;margin:0;background:#0f1320;color:#e8ecf5}header{padding:16px 18px;background:#171d2e;position:sticky;top:0;z-index:1}
h1{margin:0 0 8px;font-size:20px}select,input{background:#0f1320;color:#e8ecf5;border:1px solid #334;border-radius:8px;padding:6px 8px;margin:2px}
.row{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:10px 18px;border-bottom:1px solid #222a3d}
.n{color:#8fb3ff;font-weight:700}.meta{color:#9aa4bd;font-size:12px}.tag{display:inline-block;background:#26314d;border-radius:6px;padding:1px 7px;margin-right:4px;font-size:12px}
audio{height:34px;width:220px}@media(max-width:600px){.row{grid-template-columns:34px 1fr}audio{grid-column:1/3;width:100%}}
</style><header><h1>Sample hunt</h1>
<select id=cat><option value="">All types</option></select><select id=key><option value="">Any key</option></select>
<input id=bmin type=number placeholder="BPM from" style=width:90px><input id=bmax type=number placeholder="to" style=width:70px>
<input id=q placeholder="Search song" style=width:150px><span id=count class=meta></span></header><div id=list></div>
<script>const D=__DATA__;const $=i=>document.getElementById(i);
[...new Set(D.map(d=>d.cat))].forEach(c=>$('cat').add(new Option(c,c)));
[...new Set(D.map(d=>d.key))].sort().forEach(k=>$('key').add(new Option(k,k)));
function draw(){const c=$('cat').value,k=$('key').value,a=+$('bmin').value||0,b=+$('bmax').value||999,q=$('q').value.toLowerCase();
const r=D.filter(d=>(!c||d.cat==c)&&(!k||d.key==k)&&d.bpm>=a&&d.bpm<=b&&(!q||d.song.toLowerCase().includes(q)));
$('count').textContent=' '+r.length+' samples';
$('list').innerHTML=r.slice(0,600).map(d=>`<div class=row><div class=n>${d.rank}</div><div><b>${d.song.replace(/</g,'&lt;')}</b><div class=meta>
<span class=tag>${d.cat}</span><span class=tag>${d.bpm} BPM</span><span class=tag>${d.key}</span>${d.bars} bars at ${d.start} · score ${d.score}</div></div>
<audio controls preload=none src="${encodeURI(d.file)}"></audio></div>`).join('');}
['cat','key','bmin','bmax','q'].forEach(i=>$(i).oninput=draw);draw();</script>"""
    (out / "index.html").write_text(page.replace("__DATA__", data))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--out", type=Path, default=Path.home() / "Tandem" / "Samples")
    ap.add_argument("--top", type=int, default=150, help="samples cut per type (default 150)")
    ap.add_argument("--per-song", type=int, default=2, help="most samples of one type from one song (default 2)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--no-cut", action="store_true", help="score only: write index.csv, cut no audio")
    a = ap.parse_args()
    folder, out = a.folder.expanduser(), a.out.expanduser()
    songs = find_songs(folder)
    if not songs:
        sys.exit(f"No audio in {folder}")
    cdir = out / ".cache"; cdir.mkdir(parents=True, exist_ok=True)
    print(f"{len(songs)} songs · {a.jobs} workers · results in {out}", flush=True)
    res, t0, done = [], time.time(), 0
    with ProcessPoolExecutor(a.jobs) as ex:
        futs = [ex.submit(job, (n, f, str(cdir))) for n, f in songs.items()]
        for fu in as_completed(futs):
            res.append(fu.result()); done += 1
            if done % 10 == 0 or done == len(futs):
                el = time.time() - t0
                print(f"  analysed {done}/{len(futs)}  ·  {el / 60:.1f} min, about {el / done * (len(futs) - done) / 60:.0f} min left", flush=True)
    good = [r for r in res if not r.get("skip")]
    skipped = [r for r in res if r.get("skip")]
    # library-wide z-scores per feature and window length
    allw = [(r, w) for r in good for w in r["wins"]]
    stats = {}
    for bars in {c["bars"] for c in CATS.values()}:
        for f in FEATS:
            v = np.array([w[f] for _, w in allw if w["bars"] == bars])
            stats[(bars, f)] = (float(v.mean()), float(v.std()) + 1e-9) if len(v) else (0.0, 1.0)
    rows = []
    for cat, cfg in CATS.items():
        cands = []
        for r, w in allw:
            if w["bars"] != cfg["bars"]:
                continue
            if cfg["src"] == "vocals" and "vocals" not in r["files"]:
                continue
            s = sum(wt * (w[f] - stats[(cfg["bars"], f)][0]) / stats[(cfg["bars"], f)][1] for f, wt in cfg["w"].items())
            cands.append((s, r, w))
        cands.sort(key=lambda x: -x[0])
        taken, per = [], {}
        for s, r, w in cands:
            if per.get(r["song"], 0) >= a.per_song:
                continue
            if any(t[1]["song"] == r["song"] and abs(t[2]["t"] - w["t"]) < w["len"] for t in taken):
                continue
            taken.append((s, r, w)); per[r["song"]] = per.get(r["song"], 0) + 1
            if len(taken) >= a.top:
                break
        (out / cat).mkdir(parents=True, exist_ok=True)
        for i, (s, r, w) in enumerate(taken, 1):
            m, sec = divmod(int(w["t"]), 60)
            fn = f"{i:03d} {safe(r['song'])} - {r['bpm']:g}bpm {r['key']} - {m}m{sec:02d}s.wav"
            rows.append({"cat": cat, "rank": i, "song": r["song"], "bpm": r["bpm"], "key": r["key"], "start": f"{m}:{sec:02d}",
                         "bars": w["bars"], "score": round(s, 2), "file": f"{cat}/{fn}", "src": cfg["src"], "t": w["t"],
                         "len": w["len"], "files": r["files"], **{f: round(w[f], 3) for f in FEATS}})
    print(f"Scored {len(allw)} candidate stretches in {len(good)} songs" + (f" ({len(skipped)} skipped)" if skipped else ""), flush=True)
    if not a.no_cut:
        for i, r in enumerate(rows, 1):
            dst = out / r["file"]
            if not dst.exists():
                cut(r["files"], r["src"], r["t"], r["len"], dst)
            if i % 50 == 0 or i == len(rows):
                print(f"  cut {i}/{len(rows)}", flush=True)
    with open(out / "index.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["type", "rank", "song", "bpm", "key", "start", "bars", "score"] + FEATS + ["file"])
        for r in rows:
            wr.writerow([r["cat"], r["rank"], r["song"], r["bpm"], r["key"], r["start"], r["bars"], r["score"]] + [r[f] for f in FEATS] + [r["file"]])
    if skipped:
        (out / "skipped.txt").write_text("".join(f"{r['song']}: {r['skip']}\n" for r in skipped))
    report(out, rows)
    print(f"Done: {out}/index.html", flush=True)


if __name__ == "__main__":
    main()
