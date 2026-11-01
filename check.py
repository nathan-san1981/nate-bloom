#!/usr/bin/env python3
"""Builds into a temporary directory and compares every output, byte for byte, with the published files.
  python3 check.py [--keep]        (--keep leaves the temporary build directory in place and prints its path)
Prints OK / DIFF and the size per file; exits 1 on any difference."""
import os, sys, tempfile, shutil, filecmp
sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import build  # noqa: E402

SITE_DIR = "/home/claude/night-bloom-site"
REFS = [
    ("index.html", os.path.join(SITE_DIR, "index.html")),
    ("pocket-synth.html", "/home/claude/pocket-synth/pocket-synth.html"),
    ("lite/index.html", os.path.join(SITE_DIR, "lite", "index.html")),
    ("lite/manifest.webmanifest", os.path.join(SITE_DIR, "lite", "manifest.webmanifest")),
    ("lite/sw.js", os.path.join(SITE_DIR, "lite", "sw.js")),
    ("lite/sim.html", os.path.join(SITE_DIR, "lite", "sim.html")),
]


def first_difference(a, b):
    """(byte offset, line number) of the first differing byte, or None."""
    with open(a, "rb") as fa, open(b, "rb") as fb:
        da, db = fa.read(), fb.read()
    n = min(len(da), len(db))
    for i in range(n):
        if da[i] != db[i]:
            return i, da.count(b"\n", 0, i) + 1
    return (n, da.count(b"\n", 0, n) + 1) if len(da) != len(db) else None


def main():
    keep = "--keep" in sys.argv
    out = tempfile.mkdtemp(prefix="nate-bloom-check-")
    build.build(out)
    print()
    bad = 0
    for rel, ref in REFS:
        built = os.path.join(out, rel)
        if not os.path.exists(built):
            print(f"MISSING  {rel}"); bad += 1; continue
        if not os.path.exists(ref):
            print(f"NOREF    {rel}  (reference {ref} not found)"); bad += 1; continue
        size = os.path.getsize(built)
        if filecmp.cmp(built, ref, shallow=False):
            print(f"OK    {rel:28s} {size:>10,d} bytes")
        else:
            off, line = first_difference(built, ref)
            print(f"DIFF  {rel:28s} built {size:,d} bytes, reference {os.path.getsize(ref):,d} bytes; first difference at byte {off:,d} (line {line})")
            bad += 1
    if keep:
        print(f"\nbuild kept in {out}")
    else:
        shutil.rmtree(out, ignore_errors=True)
    print("\nall identical" if not bad else f"\n{bad} file(s) differ")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
