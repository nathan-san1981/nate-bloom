#!/usr/bin/env python3
"""Which src part holds a piece of text, and on which line of that part.
  python3 src/tools/where.py [-i] TEXT...        (several words are joined with spaces; -i ignores case)
Prints  part:line:column  and the line (a window around the match on very long lines). Exits 1 when nothing matches."""
import os, sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"__pycache__"}
WIN = 70


def files():
    for d, dirs, names in os.walk(SRC):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for n in sorted(names):
            if not n.startswith(".") and not n.endswith((".pyc", "~")):
                yield os.path.join(d, n)


def main():
    args = sys.argv[1:]
    fold = False
    if args and args[0] == "-i":
        fold = True; args = args[1:]
    if not args:
        print(__doc__); sys.exit(2)
    needle = " ".join(args)
    key = needle.lower() if fold else needle
    hits = 0
    for p in files():
        try:
            with open(p, encoding="utf-8", newline="") as f:
                text = f.read()
        except (UnicodeDecodeError, OSError):
            continue
        hay = text.lower() if fold else text
        if key not in hay:
            continue
        rel = os.path.relpath(p, SRC)
        orig_lines = text.split("\n") if fold else None
        for ln, line in enumerate(hay.split("\n"), 1):
            col = line.find(key)
            while col >= 0:
                orig = orig_lines[ln - 1] if fold else line
                if len(orig) > 2 * WIN + len(needle):
                    lo, hi = max(0, col - WIN), min(len(orig), col + len(needle) + WIN)
                    shown = ("…" if lo else "") + orig[lo:hi] + ("…" if hi < len(orig) else "")
                else:
                    shown = orig
                print(f"{rel}:{ln}:{col + 1}  {shown}")
                hits += 1
                col = line.find(key, col + 1)
    if not hits:
        print(f"not found in src/: {needle!r}")
        sys.exit(1)
    print(f"{hits} match{'es' if hits != 1 else ''}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
