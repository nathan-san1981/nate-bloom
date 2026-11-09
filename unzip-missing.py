#!/usr/bin/env python3
"""unzip-missing — finish an interrupted unzip into a Tandem inbox without re-adding songs Tandem already took.

For every song in the zips: skip it if it's already in the inbox at full size, or if Tandem already moved it to
Done (any folder there with that file name). Otherwise (missing, or cut short by a dropped connection) extract it.
  unzip-missing.py INBOX_DIR DONE_DIR ZIP [ZIP ...]
"""
import os
import sys
import zipfile
from pathlib import Path

inbox, done, zips = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
taken = {}
for dp, _, fns in os.walk(done):
    for fn in fns:
        taken[fn] = os.path.getsize(os.path.join(dp, fn))
new = fixed = ok = 0
for z in zips:
    with zipfile.ZipFile(z) as zf:
        for m in zf.infolist():
            if m.is_dir():
                continue
            name = Path(m.filename).name
            dst = inbox / m.filename
            if taken.get(name) == m.file_size:
                ok += 1
                continue
            if dst.exists() and dst.stat().st_size == m.file_size:
                ok += 1
                continue
            part = dst.exists()
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name("." + dst.name + ".part")  # dot-file: Tandem ignores it until it's renamed
            with zf.open(m) as src, open(tmp, "wb") as out:
                while True:
                    b = src.read(1 << 20)
                    if not b:
                        break
                    out.write(b)
            os.replace(tmp, dst)
            fixed += part
            new += not part
print(f"already there or done: {ok} · extracted: {new} · re-extracted (were cut short): {fixed}")
