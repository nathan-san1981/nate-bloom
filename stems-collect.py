#!/usr/bin/env python3
"""stems-collect — gather Prism results into ONE flat folder:
     <Song name> - vocals.<ext>      <Song name> - instrumental.<ext>

Tandem files each song's results in its own folder (Done/<Song name>/...). This finds every vocal/instrumental
stem under the folders you give it and links them into one folder with those names. Hard links take no extra
space and leave Tandem's own layout alone; across different drives it copies instead. Safe to re-run.

  stems-collect.py                                   default: ~/Tandem/Done -> ~/Tandem/All stems
  stems-collect.py --watch                           keep collecting every 60 s while a batch runs (Ctrl-C to stop)
  stems-collect.py SRC [SRC ...] --out DIR [--move]  other places; --move moves instead of linking
"""
import argparse
import os
import re
import shutil
import sys
import time
from pathlib import Path

AUDIO = {".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".aif", ".aiff"}
INSTR = re.compile(r"(instrumental|instrument|no[ _-]?vocals?|accompaniment|karaoke|music[ _-]?only|\binst\b)", re.I)
VOCAL = re.compile(r"vocals?|vox|acapella|a[ _-]cappella", re.I)


def kind(p: Path):
    n = p.stem
    if INSTR.search(n):
        return "instrumental"
    if VOCAL.search(n) and not re.search(r"backing", n, re.I):
        return "vocals"
    return None


def song_name(stem: Path, root: Path):
    """The song's name: its folder (Tandem/Prism make one per song), or the file name minus the stem word."""
    if stem.parent != root:
        return stem.parent.name
    n = re.sub(r"[ _.\-(\[]*(instrumental|instrument|no[ _-]?vocals?|accompaniment|vocals?)[)\]]*$", "", stem.stem, flags=re.I)
    return n.strip(" _-") or stem.stem


def place(src: Path, dst: Path, move: bool):
    if dst.exists():
        s, d = src.stat(), dst.stat()
        if (s.st_ino == d.st_ino and s.st_dev == d.st_dev) or s.st_size == d.st_size:
            return "same"
        stem, i = dst.stem, 2
        while dst.exists():
            dst = dst.with_name(f"{stem} ({i}){dst.suffix}")
            i += 1
    if move:
        shutil.move(str(src), str(dst))
        return "moved"
    try:
        os.link(src, dst)
        return "linked"
    except OSError:
        shutil.copy2(src, dst)
        return "copied"


def collect(roots, out: Path, move: bool, quiet=False):
    out.mkdir(parents=True, exist_ok=True)
    counts = {"linked": 0, "copied": 0, "moved": 0, "same": 0}
    songs = {}
    for root in roots:
        if not root.is_dir():
            continue
        for dp, dns, fns in os.walk(root):
            if Path(dp).resolve() == out.resolve():
                dns[:] = []
                continue
            dns[:] = [d for d in dns if not d.startswith(".")]
            for fn in fns:
                p = Path(dp) / fn
                if p.suffix.lower() not in AUDIO:
                    continue
                k = kind(p)
                if not k:
                    continue
                name = song_name(p, root)
                r = place(p, out / f"{name} - {k}{p.suffix.lower()}", move)
                counts[r] += 1
                songs.setdefault(name, set()).add(k)
    pairs = sum(1 for v in songs.values() if v == {"vocals", "instrumental"})
    if not quiet or counts["linked"] + counts["copied"] + counts["moved"]:
        new = counts["linked"] + counts["copied"] + counts["moved"]
        print(f"{time.strftime('%H:%M')}  {len(songs)} songs ({pairs} with both stems) in {out}  · new files: {new}"
              f" (linked {counts['linked']}, copied {counts['copied']}, moved {counts['moved']})", flush=True)
    return songs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", nargs="*", type=Path, help="folders to search (default ~/Tandem/Done)")
    ap.add_argument("--out", type=Path, default=Path.home() / "Tandem" / "All stems")
    ap.add_argument("--move", action="store_true", help="move the files instead of linking/copying them")
    ap.add_argument("--watch", action="store_true", help="repeat every 60 s until Ctrl-C")
    a = ap.parse_args()
    roots = a.src or [Path.home() / "Tandem" / "Done"]
    roots = [r.expanduser() for r in roots]
    collect(roots, a.out.expanduser(), a.move)
    while a.watch:
        try:
            time.sleep(60)
            collect(roots, a.out.expanduser(), a.move, quiet=True)
        except KeyboardInterrupt:
            print()
            break


if __name__ == "__main__":
    sys.exit(main())
