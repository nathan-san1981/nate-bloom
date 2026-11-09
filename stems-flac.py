#!/usr/bin/env python3
"""stems-flac — shrink finished Prism stems: 32-bit WAV -> 24-bit FLAC (lossless to the ear, about half the size).

For each vocal/instrumental WAV under the folders given:
  - skips files changed in the last 3 minutes (still arriving)
  - skips any stem whose peak is above 0 dBFS (FLAC can't hold that without clipping): it stays WAV, reported
  - encodes FLAC, checks it decodes cleanly at the same length, then deletes the WAV
  - also removes that WAV's hard link in the flat folder (stems-collect re-links the FLAC on its next run),
    so the old file really frees its space
One run at a time (safe from cron). Low priority, so Tandem's own work comes first.

  stems-flac.py /srv/tandem-pool/Done --flat "/srv/tandem-pool/All stems"
"""
import argparse
import fcntl
import os
import re
import subprocess
import sys
import time
from pathlib import Path

INSTR = re.compile(r"(instrumental|instrument|no[ _-]?vocals?|accompaniment|karaoke|music[ _-]?only|\binst\b)", re.I)
VOCAL = re.compile(r"vocals?|vox|acapella|a[ _-]cappella", re.I)


def kind(p: Path):
    """Which stem a file is, or None. The original song (named like its folder) is never a stem."""
    n = p.stem
    if n.lower() == p.parent.name.lower():
        return None
    m = re.search(r"[ _\-(\[](drums|bass|other|piano|guitar)[)\]]*$", n, re.I)
    if m:
        return m.group(1).lower()
    if INSTR.search(n):
        return "instrumental"
    if VOCAL.search(n) and not re.search(r"backing", n, re.I):
        return "vocals"
    return None


def song_name(p, root):
    if p.parent != root:
        return p.parent.name
    n = re.sub(r"[ _.\-(\[]*(instrumental|instrument|no[ _-]?vocals?|accompaniment|vocals?|drums|bass|other|piano|guitar)[)\]]*$", "", p.stem, flags=re.I)
    return n.strip(" _-") or p.stem


def probe_dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration",
                        "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip().split("\n")[0])
    except ValueError:
        return None


def peak_db(p):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(p), "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"max_volume:\s*(-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else None


def convert(wav: Path, root: Path, flat: Path | None):
    flac = wav.with_suffix(".flac")
    tmp = wav.with_name(wav.stem + ".flac.part")
    pk = peak_db(wav)
    if pk is None:
        return "unreadable"
    if pk > 0.0:
        return "kept (peak above 0 dB)"
    st = wav.stat()
    cmd = ["nice", "-n", "19", "ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(wav), "-map", "0:a:0",
           "-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24", "-compression_level", "5", "-f", "flac", str(tmp)]
    if subprocess.run(cmd).returncode != 0:
        tmp.unlink(missing_ok=True)
        return "encode failed"
    ok = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(tmp), "-f", "null", "-"], capture_output=True, text=True)
    d1, d2 = probe_dur(wav), probe_dur(tmp)
    if ok.returncode != 0 or ok.stderr.strip() or d1 is None or d2 is None or abs(d1 - d2) > 0.02:
        tmp.unlink(missing_ok=True)
        return "check failed (WAV kept)"
    os.utime(tmp, (st.st_atime, st.st_mtime))
    os.replace(tmp, flac)
    if flat:  # the flat folder's hard link to this WAV
        k = kind(wav)
        link = flat / f"{song_name(wav, root)} - {k}.wav"
        try:
            ls = link.stat()
            if ls.st_ino == st.st_ino and ls.st_dev == st.st_dev:
                link.unlink()
        except FileNotFoundError:
            pass
    wav.unlink()
    return "converted"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", nargs="+", type=Path)
    ap.add_argument("--flat", type=Path, help="the stems-collect output folder, to drop stale WAV links")
    ap.add_argument("--min-age", type=int, default=180, help="seconds a file must sit unchanged (default 180)")
    a = ap.parse_args()
    lockf = open(Path.home() / ".stems-flac.lock", "w")
    try:
        fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return 0  # the previous run is still going
    flat = a.flat.expanduser() if a.flat else None
    counts, before = {}, 0
    t0 = time.time()
    for root in (r.expanduser() for r in a.src):
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if not d.startswith(".")]
            for fn in fns:
                p = Path(dp) / fn
                if p.suffix.lower() != ".wav" or not kind(p):
                    continue
                try:
                    st = p.stat()
                except FileNotFoundError:
                    continue
                if time.time() - st.st_mtime < a.min_age or time.time() - st.st_ctime < a.min_age:
                    continue
                if flat and flat in p.parents:
                    continue
                size = st.st_size
                r = convert(p, root, flat)
                counts[r] = counts.get(r, 0) + 1
                if r == "converted":
                    before += size - p.with_suffix(".flac").stat().st_size
    if counts:
        parts = ", ".join(f"{k}: {v}" for k, v in sorted(counts.items()))
        print(f"{time.strftime('%Y-%m-%d %H:%M')}  {parts}  · freed {before / 2**30:.1f} GB in {(time.time() - t0) / 60:.1f} min", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
