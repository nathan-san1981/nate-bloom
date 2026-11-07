#!/usr/bin/env python3
"""Tandem teamwork test. Run on the laptop (plugged in, at the desk, nothing heavy open):

    python3 ~/Downloads/tandem-teamwork-test.py

Runs real work through Tandem and compares "the laptop alone" with "all three machines together":
  1. Video encode, high quality (CPU-heavy): a 4-minute 1080p clip
  2. Kdenlive render (CPU-heavy): a 3-minute project
  3. Stem separation (GPU): a batch of 4 songs from ~/Music
For each it measures the time, where the work ran, how busy the laptop itself was, and that the result is complete
(every frame present).   4. All hands: a 6-minute Kdenlive render, a 6-minute encode and the stems, all at once, with every
     machine's CPU use recorded
Takes about 30-40 minutes. Test files are deleted afterwards; a report is saved to
~/Tandem/teamwork-report.txt.

    python3 ~/Downloads/tandem-teamwork-test.py --max

Maximum load only (about 20-25 minutes): short laptop-alone baselines, then one big mixed batch at once
(a 6-minute Kdenlive render, a 6-minute best-quality encode and stems for 8 songs) to push all three machines
flat out. Reports the speed-up, how busy each machine was and an equivalent single-machine score.
"""
import json, os, shutil, subprocess, sys, threading, time, urllib.request, urllib.error
from pathlib import Path

PORT = int(os.environ.get("TANDEM_PORT", 8740))
HOME = Path(os.environ.get("TANDEM_HOME") or Path.home())
WORK = HOME / "Videos" / "tandem-teamwork-test"
REPORT = HOME / "Tandem" / "teamwork-report.txt"
QUICK = os.environ.get("QUICK") == "1"  # smaller test files (for checking the script itself)
MAX = "--max" in sys.argv
lines = []


def out(s=""):
    print(s, flush=True)
    lines.append(s)


def api(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"http://localhost:{PORT}{path}", data=data, method="POST" if data else "GET",
                               headers={"Content-Type": "application/json", "X-Tandem-UI": "1"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read())


def state():
    return api("/api/state")


class CpuMeter:
    """Average CPU use of this laptop while a test runs (all cores, 0-100%)."""
    def __init__(self):
        self.samples, self.stop = [], threading.Event()

    @staticmethod
    def _read():
        f = open("/proc/stat").readline().split()[1:]
        v = list(map(int, f))
        idle = v[3] + v[4]
        return idle, sum(v)

    def run(self):
        a = self._read()
        while not self.stop.wait(1):
            b = self._read()
            dt = b[1] - a[1]
            if dt:
                self.samples.append(100 * (1 - (b[0] - a[0]) / dt))
            a = b

    def __enter__(self):
        self.t = threading.Thread(target=self.run, daemon=True)
        self.t.start()
        return self

    def __exit__(self, *e):
        self.stop.set()
        self.t.join()

    @property
    def avg(self):
        return sum(self.samples) / len(self.samples) if self.samples else 0.0


class ClusterMeter:
    """Average CPU use of every machine while a test runs: the laptop from /proc/stat, the workers from the
    status they report to Tandem."""
    def __init__(self):
        self.samples, self.gpu, self.stop = {}, {}, threading.Event()
        self.track = {}  # job id -> {"type", "name", "where", "first", "last", "paused", "waiting"}
        self.t0 = time.time()

    def run(self):
        while not self.stop.wait(2):
            try:
                st = state()
            except Exception:
                continue
            self.samples.setdefault(st["name"], []).append(st["stats"].get("cpu", 0))
            for p in st["peers"]:
                if p["online"] and p.get("stats"):
                    self.samples.setdefault(p["name"], []).append(p["stats"].get("cpu", 0))
                    if p["stats"].get("gpu") is not None:
                        self.gpu.setdefault(p["name"], []).append(p["stats"]["gpu"])
                elif not p["online"]:
                    self.samples.setdefault(p["name"], []).append(0.0)
            names = {p["id"]: p["name"] for p in st["peers"]}
            t = time.time()
            for j in st["jobs"]:
                if (j.get("created") or 0) < self.t0 - 5:
                    continue
                r = self.track.setdefault(j["id"], {"type": j["type"], "name": j.get("name", ""), "where": None,
                                                    "first": None, "last": None, "paused": 0, "waiting": 0,
                                                    "msg": ""})
                if j["state"] in ("running", "paused") and j.get("loc") in ("local", "server"):
                    w = st["name"] if j["loc"] == "local" else names.get(j.get("peer"), "?")
                    r["where"] = r["where"] or w
                    r["first"] = r["first"] or t
                    r["last"] = t
                    if j["state"] == "paused" or (j.get("msg") or "").lower().startswith("paused"):
                        r["paused"] += 2
                elif j["state"] == "queued":
                    r["waiting"] += 2
                    r["msg"] = j.get("msg") or r["msg"]

    def __enter__(self):
        self.t = threading.Thread(target=self.run, daemon=True)
        self.t.start()
        return self

    def __exit__(self, *e):
        self.stop.set()
        self.t.join()

    def avg(self):
        return {k: sum(v) / len(v) for k, v in self.samples.items() if v}

    def summary(self):
        """Per machine: jobs run, share of the time something was running, most at once, time paused."""
        out = {}
        runs = [r for r in self.track.values() if r["where"] and r["first"]]
        if not runs:
            return out, []
        t0, t1 = min(r["first"] for r in runs), max(r["last"] for r in runs)
        for w in sorted({r["where"] for r in runs}):
            mine = [r for r in runs if r["where"] == w]
            steps = int((t1 - t0) / 2) + 1
            conc = [sum(1 for r in mine if r["first"] <= t0 + 2 * i <= r["last"]) for i in range(steps)]
            out[w] = {"jobs": len(mine), "busy": 100 * sum(1 for c in conc if c) / max(1, steps),
                      "peak": max(conc), "avg": sum(conc) / max(1, steps), "paused": sum(r["paused"] for r in mine),
                      "types": sorted({r["type"] for r in mine})}
        slow = sorted(runs, key=lambda r: r["last"] - r["first"], reverse=True)[:5]
        return out, slow

    def gpu_avg(self):
        return {k: sum(v) / len(v) for k, v in self.gpu.items() if v}


def frames(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_read_packets", "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip()
    return int(r) if r.isdigit() else -1


def run_job(paths, jtype, where, opts=None, label=""):
    """Submit through Tandem, wait for every job (and its pieces) to finish; return timing and where it ran."""
    r = api("/api/jobs", {"paths": [str(p) for p in paths], "type": jtype, "where": where, "opts": opts or {}})
    ids = set(r["jobs"])
    t0 = time.time()
    seen_where, last_print = {}, 0
    with CpuMeter() as cpu:
        while True:
            st = state()
            names = {p["id"]: p["name"] for p in st["peers"]}
            mine = [j for j in st["jobs"] if j["id"] in ids or j.get("parent") in ids]
            for j in mine:
                if j.get("loc") == "local" and j["state"] in ("running", "paused"):
                    seen_where.setdefault(j["id"], st["name"])
                elif j.get("loc") == "server" and j.get("peer") in names and j["state"] in ("running", "sending", "downloading"):
                    seen_where.setdefault(j["id"], names[j["peer"]])
            tops = [j for j in mine if j["id"] in ids]
            failed = [j for j in tops if j["state"] in ("failed", "cancelled")]
            if failed:
                raise RuntimeError(f"{label}: {failed[0]['name']} failed: {failed[0].get('msg', '')[-300:]}")
            if tops and all(j["state"] == "done" for j in tops):
                break
            if time.time() - last_print > 10:
                last_print = time.time()
                prog = sum((j.get("progress") or 0) for j in tops) / max(1, len(tops))
                msg = tops[0].get("msg", "") if len(tops) == 1 else f"{sum(j['state'] == 'done' for j in tops)}/{len(tops)} done"
                print(f"   … {int(time.time() - t0)} s, {int(prog * 100)}%  {msg[:70]}", flush=True)
            time.sleep(1)
    secs = time.time() - t0
    counts = {}
    for w in seen_where.values():
        counts[w] = counts.get(w, 0) + 1
    return {"secs": secs, "where": counts, "cpu": cpu.avg, "jobs": [j for j in state()["jobs"] if j["id"] in ids]}


def fmt_t(s):
    return f"{int(s // 60)} min {int(s % 60):02d} s" if s >= 60 else f"{s:.0f} s"


def where_txt(w):
    return ", ".join(f"{k} ×{v}" if v > 1 else k for k, v in sorted(w.items(), key=lambda x: -x[1])) or "?"


def make_clip(path, seconds):
    """1080p test footage with film-like grain, so it's as hard to compress as real camera video."""
    if path.exists():
        return
    out(f"   making a {f'{seconds // 60}-minute' if seconds >= 60 else f'{seconds}-second'} test clip…")
    size = "1280x720" if QUICK else "1920x1080"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30",
                    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000", "-t", str(seconds),
                    "-vf", "noise=alls=18:allf=t+u", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-g", "60", "-c:a", "aac", "-b:a", "160k", str(path)], check=True)


def make_project(path, clip, seconds):
    total = 30 * seconds
    path.write_text(f"""<?xml version='1.0' encoding='utf-8'?>
<mlt LC_NUMERIC="C" root="{clip.parent}" version="7.24.0">
 <profile description="HD 1080p 30 fps" width="1920" height="1080" progressive="1" sample_aspect_num="1" sample_aspect_den="1"
   display_aspect_num="16" display_aspect_den="9" frame_rate_num="30" frame_rate_den="1" colorspace="709"/>
 <producer id="clip" in="0" out="{total - 1}">
  <property name="resource">{clip}</property><property name="mlt_service">avformat</property>
 </producer>
 <playlist id="v1">
  <entry producer="clip" in="0" out="{total - 1}">
   <filter><property name="mlt_service">brightness</property><property name="level">1.08</property></filter>
  </entry>
 </playlist>
 <playlist id="a1"><entry producer="clip" in="0" out="{total - 1}"/></playlist>
 <tractor id="main" in="0" out="{total - 1}"><track producer="v1"/><track producer="a1" hide="video"/></tractor>
</mlt>
""")


DONE = HOME / "Tandem" / "Done"


def done_snapshot():
    return set(DONE.iterdir()) if DONE.is_dir() else set()


def cleanup_results(res, before):
    """Remove only what this test added to ~/Tandem/Done, and its entries from Tandem's job list."""
    for p in done_snapshot() - before:
        shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
    for j in res["jobs"]:
        try:
            api(f"/api/job/{j['id']}/remove", {})
        except Exception:
            pass


def main():
    import fcntl
    global _lock
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    _lock = open(REPORT.parent / ".teamwork-test.lock", "w")
    try:
        fcntl.flock(_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("A teamwork test is already running. Check it with: tail -3 ~/Tandem/max-run.txt")
    try:
        st = state()
    except Exception:
        sys.exit("Tandem isn't running on this computer. Open it from the menu, then run this again.")
    peers = [p for p in st["peers"] if p["online"]]
    asleep = [p["name"] for p in st["peers"] if not p["online"] and p.get("asleep")]
    out(f"Tandem teamwork test — {time.strftime('%a %b %-d %Y, %-I:%M %p')}")
    out(f"This computer: {st['name']}, workers online: {', '.join(p['name'] for p in peers) or 'none'}"
        + (f"; asleep: {', '.join(asleep)} (Tandem wakes it when the work needs it — that's part of the test)" if asleep else ""))
    if st["guard"]["priority"]:
        out(f"Note: {', '.join(st['guard']['priority'])} is open, so nothing runs on the laptop during the test.")
    WORK.mkdir(parents=True, exist_ok=True)
    secs = 40 if QUICK else 240
    clip = WORK / "teamwork-clip.mp4"
    if not MAX:
        make_clip(clip, secs)
    results = {}

    exts = {".mp3", ".flac", ".wav", ".m4a", ".ogg"}
    pool_songs = sorted((p for p in (HOME / "Music").rglob("*") if p.suffix.lower() in exts and p.stat().st_size > 1_000_000
                         and "Takes" not in p.parts), key=lambda p: p.stat().st_size)
    n_songs = 8 if MAX else 4
    third = len(pool_songs) // 3
    songs = pool_songs[third: third + n_songs] if len(pool_songs) >= n_songs else pool_songs
    has_prism = any((p.get("caps") or {}).get("prism") for p in st["peers"])
    base = {}  # seconds of work per second of video (or per song) on the laptop alone
    if MAX:
        out("\nBaselines: the same kinds of work on the laptop alone, short versions")
        bsecs = 20 if QUICK else 60
        bclip = WORK / "baseline-clip.mp4"
        make_clip(bclip, bsecs)
        out(f"   a. {bsecs} s best-quality encode, laptop alone…")
        snap = done_snapshot()
        a = run_job([bclip], "mp4", "local", {"quality": "best"}, "baseline encode")
        cleanup_results(a, snap)
        base["encode"] = a["secs"] / bsecs
        bproj = WORK / "baseline.kdenlive"
        make_project(bproj, bclip, bsecs)
        try:
            out(f"   b. {bsecs} s Kdenlive render, laptop alone…")
            a = run_job([bproj], "krender", "local", {"quality": "good"}, "baseline render")
            (WORK / "baseline.mp4").unlink(missing_ok=True)
            cleanup_results(a, done_snapshot())
            base["render"] = a["secs"] / bsecs
        except (RuntimeError, urllib.error.HTTPError) as e:
            out(f"   render baseline skipped: {e}")
        if songs and st["caps"].get("prism"):
            out("   c. stems for 1 song, laptop alone…")
            snap = done_snapshot()
            try:
                a = run_job(songs[:1], "stems", "local", {"stems": "4", "quality": "best"}, "baseline stems")
                cleanup_results(a, snap)
                base["stems"] = a["secs"]
            except RuntimeError as e:
                out(f"   stems baseline skipped: {e}")
    if not MAX:
        # ---- 1. video encode
        out("\n1) Video encode, high quality (Make MP4, best)")
        out("   a. laptop alone…")
        snap = done_snapshot()
        a = run_job([clip], "mp4", "local", {"quality": "best"}, "encode, laptop alone")
        f_a = frames(Path(a["jobs"][0]["result"]) / "teamwork-clip.mp4")
        cleanup_results(a, snap)
        out("   b. all machines together…")
        snap = done_snapshot()
        b = run_job([clip], "mp4", "auto", {"quality": "best"}, "encode, together")
        f_b = frames(Path(b["jobs"][0]["result"]) / "teamwork-clip.mp4")
        cleanup_results(b, snap)
        results["encode"] = (a, b, f_a, f_b, 30 * secs)

        # ---- 2. Kdenlive render
        out("\n2) Kdenlive render (Render Kdenlive project)")
        kd_secs = 30 if QUICK else 180
        proj = WORK / "teamwork.kdenlive"
        make_project(proj, clip, kd_secs)
        outfile = WORK / "teamwork.mp4"
        try:
            out("   a. laptop alone…")
            a = run_job([proj], "krender", "local", {"quality": "good"}, "render, laptop alone")
            f_a = frames(outfile)
            outfile.unlink(missing_ok=True)
            cleanup_results(a, done_snapshot())
            out("   b. all machines together…")
            b = run_job([proj], "krender", "auto", {"quality": "good"}, "render, together")
            f_b = frames(outfile)
            outfile.unlink(missing_ok=True)
            cleanup_results(b, done_snapshot())
            results["render"] = (a, b, f_a, f_b, 30 * kd_secs)
        except (RuntimeError, urllib.error.HTTPError) as e:
            msg = e.read().decode() if isinstance(e, urllib.error.HTTPError) else str(e)
            out(f"   skipped: {msg[:200]}")

        # ---- 3. stems
        out("\n3) Stem separation, 4 songs (Separate stems, 4 stems)")
        if not any((p.get("caps") or {}).get("prism") for p in st["peers"]):
            out("   skipped: no worker has Prism")
        elif not songs:
            out("   skipped: no songs found in ~/Music")
        else:
            out("   songs: " + ", ".join(s.stem[:30] for s in songs))
            try:
                snap = done_snapshot()
                s = run_job(songs, "stems", "auto", {"stems": "4", "quality": "best"}, "stems")
                results["stems"] = s
                cleanup_results(s, snap)
            except RuntimeError as e:
                out(f"   failed: {e}")

    # ---- 4. all hands: a mixed load big enough to need all three machines at once
    out("\n4) All hands: a Kdenlive render, a video encode and stems, all at once")
    big = 60 if QUICK else 360
    clip2 = WORK / "teamwork-long.mp4"
    make_clip(clip2, big)
    proj2 = WORK / "allhands.kdenlive"
    make_project(proj2, clip2, big)
    snap = done_snapshot()
    batch = [(proj2, "krender", {"quality": "good"}), (clip2, "mp4", {"quality": "best"})]
    ids, t0 = [], time.time()
    with ClusterMeter() as cm:
        for path, jt, o in batch:
            ids += api("/api/jobs", {"paths": [str(path)], "type": jt, "where": "auto", "opts": o})["jobs"]
        if songs and has_prism:
            ids += api("/api/jobs", {"paths": [str(x) for x in songs], "type": "stems", "where": "auto",
                                     "opts": {"stems": "4", "quality": "best"}})["jobs"]
        seen, last = {}, 0
        while True:
            stt = state()
            names = {p["id"]: p["name"] for p in stt["peers"]}
            mine = [j for j in stt["jobs"] if j["id"] in ids or j.get("parent") in ids]
            for j in mine:
                if j.get("loc") == "local" and j["state"] in ("running", "paused"):
                    seen.setdefault(j["id"], stt["name"])
                elif j.get("loc") == "server" and j.get("peer") in names and j["state"] in ("running", "sending", "downloading"):
                    seen.setdefault(j["id"], names[j["peer"]])
            tops = [j for j in mine if j["id"] in ids]
            bad = [j for j in tops if j["state"] in ("failed", "cancelled")]
            if bad:
                out(f"   failed: {bad[0]['name']}: {bad[0].get('msg', '')[-200:]}")
                break
            if tops and all(j["state"] == "done" for j in tops):
                break
            if time.time() - last > 15:
                last = time.time()
                busy = ", ".join(f"{k} {v[-1]:.0f}%" for k, v in cm.samples.items() if v)
                print(f"   … {int(time.time() - t0)} s, {sum(j['state'] == 'done' for j in tops)}/{len(tops)} jobs done · CPU now: {busy}", flush=True)
            time.sleep(1)
    allhands = {"secs": time.time() - t0, "where": {}, "cpu": cm.avg(), "gpu": cm.gpu_avg(), "jobs": len(ids),
                "summary": cm.summary(), "track": cm.track}
    for w in seen.values():
        allhands["where"][w] = allhands["where"].get(w, 0) + 1
    f_r = frames(WORK / "allhands.mp4")
    allhands["frames_ok"] = f_r == 30 * big
    cleanup_results({"jobs": [{"id": i} for i in ids]}, snap)
    (WORK / "allhands.mp4").unlink(missing_ok=True)

    # ---- report
    out("\n" + "=" * 72)
    out("RESULTS")
    out("=" * 72)
    for key, title in (("encode", "Video encode, 4 min 1080p, best quality"), ("render", "Kdenlive render, 3 min 1080p")):
        if key not in results:
            continue
        a, b, f_a, f_b, expect = results[key]
        sp = a["secs"] / b["secs"] if b["secs"] else 0
        out(f"\n{title}")
        out(f"  laptop alone       {fmt_t(a['secs']):>12}   laptop busy {a['cpu']:3.0f}%   frames {f_a}/{expect} {'✓' if f_a == expect else '✗'}")
        out(f"  all together       {fmt_t(b['secs']):>12}   laptop busy {b['cpu']:3.0f}%   frames {f_b}/{expect} {'✓' if f_b == expect else '✗'}")
        out(f"  where it ran       {where_txt(b['where'])}")
        out(f"  → {sp:.1f}× {'faster' if sp >= 1 else 'the speed'} together; the laptop's own load went from {a['cpu']:.0f}% to {b['cpu']:.0f}%")
    if "stems" in results:
        s = results["stems"]
        out(f"\nStem separation, {len(songs)} songs, 4 stems, best")
        out(f"  total              {fmt_t(s['secs']):>12}   ({fmt_t(s['secs'] / max(1, len(songs)))} per song)   laptop busy {s['cpu']:3.0f}%")
        out(f"  where it ran       {where_txt(s['where'])}")
    if MAX:
        out("\nBaselines (laptop alone): " + ", ".join(
            f"{k} {v:.2f} s per {'song' if k == 'stems' else 'second of video'}" for k, v in base.items()))
    if True:
        ah = allhands
        out(f"\nAll hands: {big // 60}-min Kdenlive render + {big // 60}-min best-quality encode"
            + (f" + stems for {len(songs)} songs" if songs else "") + ", all at once")
        out(f"  finished in        {fmt_t(ah['secs']):>12}   render frames {'✓' if ah['frames_ok'] else '✗'}")
        out("  CPU use, average   " + "   ".join(f"{k} {v:.0f}%" for k, v in sorted(ah["cpu"].items())))
        if ah["gpu"]:
            out("  graphics card, avg " + "   ".join(f"{k} {v:.0f}%" for k, v in sorted(ah["gpu"].items())))
        out(f"  pieces per machine {where_txt(ah['where'])}")
        per, slow = ah["summary"]
        if per:
            out("  per machine        (busy = share of the run with at least one job going there)")
            for w, d in per.items():
                out(f"    {w:9} {d['jobs']:3} jobs  busy {d['busy']:3.0f}%  avg {d['avg']:.1f} at once, peak {d['peak']}"
                    f"  paused {d['paused']} s  ({', '.join(d['types'])})")
            out("  longest jobs")
            for r in slow:
                out(f"    {int(r['last'] - r['first']):5} s  {r['type']:7} on {r['where']:9} {r['name'][:40]}")
            waits = sorted((r for r in ah["track"].values() if r["waiting"] >= 30), key=lambda r: -r["waiting"])[:3]
            for r in waits:
                out(f"    waited {r['waiting']} s before starting: {r['name'][:40]} ({r['msg'][:60]})")
        try:
            (REPORT.parent / "teamwork-timeline.json").write_text(json.dumps(ah["track"], indent=1))
        except OSError:
            pass
        est, parts = 0, []
        if MAX:
            for k, mult, lab in (("encode", big, "encode"), ("render", big, "render"),
                                 ("stems", len(songs) if songs and has_prism else 0, "stems")):
                if k in base and mult:
                    est += base[k] * mult
                    parts.append(lab)
            src = "scaled from the baselines"
        else:
            if "encode" in results:
                est += results["encode"][0]["secs"] * (big / secs); parts.append("encode")
            if "render" in results:
                est += results["render"][0]["secs"] * (big / kd_secs); parts.append("render")
            src = "scaled from tests 1 and 2"
        if est:
            missing = [x for x in ("encode", "render", "stems") if x not in parts and (x != "stems" or (songs and has_prism))]
            out(f"  laptop alone would need about {fmt_t(est)} ({src}"
                + (f"; {', '.join(missing)} not included" if missing else "") + f") → {est / ah['secs']:.1f}× faster with all three")
            out(f"  that's like one computer scoring about {27000 * est / ah['secs']:,.0f} on PassMark CPU Mark"
                " (laptop ≈ 27,000; see the Market comparison in the Tandem doc)")
    wakes = [e["msg"] for e in state()["events"] if "Waking" in e["msg"] or "wake" in e["msg"].lower()]
    if wakes:
        out("\nWake-ups during the test")
        for w in wakes[:5]:
            out(f"  · {w}")
    out("\nNotes")
    out("  · 'laptop busy' is the laptop's average CPU use during the test (all cores). Low means it stayed free for you.")
    out("  · 'All together' lets the laptop help too, because nothing is open on it. Open Kdenlive or Bitwig and the")
    out("    laptop sits out, so the same job then runs only on the Beelink and the GPU box.")
    out("  · Times include sending files over the desk cable and joining the pieces.")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n")
    out(f"\nReport saved to {REPORT}")
    shutil.rmtree(WORK, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped. Jobs already queued keep running in Tandem; cancel them there if you like.")
