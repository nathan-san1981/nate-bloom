#!/usr/bin/env python3
"""Builds Nate Bloom's pages from src/:   python3 build.py [outdir]      (default outdir: ./dist)

  <outdir>/index.html              the site page (also the repo's index.html)
  <outdir>/lite/index.html         Nate Bloom Lite, + manifest.webmanifest, sw.js, sim.html
  <outdir>/pocket-synth.html       the Claude artifact

How it works (see src/README.md):
  1. The files in src/page/ are concatenated in filename order.
  2. Include directives are expanded, recursively:  <!--@include PATH-->   //@include PATH   /*@include PATH*/
     PATH is relative to src/. A directory includes every file in it, in filename order. A directive alone on its
     line replaces the whole line (the included file ends with its own line break); a directive inside a line
     replaces just itself (the one-line <script>...</script> data blocks).
  3. Variant blocks are resolved. Marker lines (own line; leading/trailing whitespace allowed):
       //@site-only  <!--@site-only-->  /*@site-only*/   ... //@end  <!--@end-->  /*@end*/   -> site and Lite only
       //@art-only   <!--@art-only-->   /*@art-only*/    ... //@end                           -> the artifact only
     Marker lines never reach the output. Blocks do not nest.
  4. Lite is derived from the site page by src/tools/make_lite.py. The artifact is written without a final line
     break (that is how the published file is).
Standard library only; text is handled as UTF-8 with line breaks left exactly as they are."""
import os, re, sys, time, shutil
sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
sys.path.insert(0, os.path.join(SRC, "tools"))
import make_lite  # noqa: E402

INCLUDE = re.compile(r"<!--@include\s+(\S+?)\s*-->|/\*@include\s+(\S+?)\s*\*/|//@include\s+(\S+)[^\n]*")
MARKER = re.compile(r"^\s*(?:<!--|//|/\*)@(site-only|art-only|end)(?:\s*(?:-->|\*/))?\s*$")
VARIANTS = ("site", "art")


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def listed(d):
    """Regular files in d, sorted by name (dotfiles and editor leftovers skipped)."""
    return [os.path.join(d, n) for n in sorted(os.listdir(d))
            if os.path.isfile(os.path.join(d, n)) and not n.startswith(".") and not n.endswith("~")]


def included(rel, depth):
    p = os.path.join(SRC, rel)
    if os.path.isdir(p):
        return "".join(expand(read(f), depth + 1, f) for f in listed(p))
    if not os.path.isfile(p):
        raise SystemExit(f"build: @include {rel}: no such file under src/")
    return expand(read(p), depth + 1, p)


def expand(text, depth=0, where="?"):
    if depth > 5:
        raise SystemExit(f"build: includes nested too deep at {where}")
    out, pos = [], 0
    for m in INCLUDE.finditer(text):
        rel = m.group(1) or m.group(2) or m.group(3)
        ls = text.rfind("\n", 0, m.start()) + 1
        le = text.find("\n", m.end())
        le = len(text) if le < 0 else le
        whole = text[ls:m.start()].strip() == "" and text[m.end():le].strip() == ""
        if whole:
            out.append(text[pos:ls]); out.append(included(rel, depth)); pos = min(le + 1, len(text))
        else:
            out.append(text[pos:m.start()]); out.append(included(rel, depth)); pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def variant(text, which):
    assert which in VARIANTS
    keep = which + "-only"
    out, state = [], None
    for n, line in enumerate(text.split("\n"), 1):
        m = MARKER.match(line)
        if m:
            kind = m.group(1)
            if kind == "end":
                if state is None: raise SystemExit(f"build: @end without a block, merged line {n}")
                state = None
            else:
                if state is not None: raise SystemExit(f"build: @{kind} inside an open @{state} block, merged line {n}")
                state = kind
            continue
        if state is None or state == keep:
            out.append(line)
    if state is not None:
        raise SystemExit(f"build: @{state} block never closed")
    return "\n".join(out)


def build(outdir):
    t0 = time.time()
    merged = "".join(expand(read(p), 0, p) for p in listed(os.path.join(SRC, "page")))
    site = variant(merged, "site")
    art = variant(merged, "art")
    if art.endswith("\n"):
        art = art[:-1]
    lite = make_lite.make_lite(site, read(os.path.join(SRC, "tools", "sim_head.js")))
    outputs = [
        ("index.html", site),
        ("pocket-synth.html", art),
        (os.path.join("lite", "index.html"), lite),
        (os.path.join("lite", "manifest.webmanifest"), make_lite.manifest_text()),
        (os.path.join("lite", "sw.js"), make_lite.sw_text()),
    ]
    for rel, text in outputs:
        write(os.path.join(outdir, rel), text)
    os.makedirs(os.path.join(outdir, "lite"), exist_ok=True)
    shutil.copyfile(os.path.join(SRC, "lite", "sim.html"), os.path.join(outdir, "lite", "sim.html"))
    for rel in [r for r, _ in outputs] + [os.path.join("lite", "sim.html")]:
        print(f"{os.path.getsize(os.path.join(outdir, rel)):>10,d}  {os.path.join(outdir, rel)}")
    print(f"built in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    build(os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "dist"))
