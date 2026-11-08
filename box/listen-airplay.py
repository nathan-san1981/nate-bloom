#!/usr/bin/env python3
"""Nate Bloom Box, Listen: what's playing over AirPlay (YouTube, YouTube Music, Apple Music, podcasts...).
shairport-sync writes its metadata to a pipe (/run/nb-box/airplay-meta, set in the config the app writes); this keeps
$NB_LISTEN_FILE (/run/nb-box/listen.json) up to date for the Listen page and the now-playing chip, as listen-event.py
does for Spotify. Started and stopped by the app together with shairport-sync."""
import base64, json, os, re, sys, time

PIPE = sys.argv[1] if len(sys.argv) > 1 else "/run/nb-box/airplay-meta"
OUT = os.environ.get("NB_LISTEN_FILE") or "/run/nb-box/listen.json"
ITEM = re.compile(rb"<item><type>([0-9a-f]{8})</type><code>([0-9a-f]{8})</code><length>(\d+)</length>(?:\s*<data encoding=\"base64\">\s*([A-Za-z0-9+/=\s]*?)</data>)?</item>")
cur = {"source": "AirPlay"}


def tag(h):
    return bytes.fromhex(h.decode()).decode("latin-1")


def save():
    cur["t"] = time.time()
    tmp = OUT + ".part"
    with open(tmp, "w") as f:
        json.dump(cur, f)
    os.replace(tmp, OUT)


STATE = {"pbeg": "playing", "prsm": "playing", "pend": "stopped", "pfls": "paused", "pcen": None}
while True:
    if not os.path.exists(PIPE):
        time.sleep(1)
        continue
    try:
        with open(PIPE, "rb") as p:
            buf = b""
            while True:
                chunk = p.read(4096)
                if not chunk:
                    break
                buf += chunk
                pos = 0
                for m in ITEM.finditer(buf):
                    pos = m.end()
                    t, c = tag(m.group(1)), tag(m.group(2))
                    data = base64.b64decode(m.group(4)).decode("utf-8", "replace") if m.group(4) else ""
                    changed = False
                    if t == "core" and c in ("minm", "asar", "asal"):
                        key = {"minm": "name", "asar": "artists", "asal": "album"}[c]
                        if cur.get(key) != data:
                            cur[key] = data
                            changed = True
                    elif t == "ssnc" and c in STATE and STATE[c]:
                        cur["state"] = STATE[c]
                        cur["source"] = "AirPlay"
                        changed = True
                    elif t == "ssnc" and c == "pend":
                        cur.update(state="stopped")
                        changed = True
                    if changed:
                        cur["source"] = "AirPlay"
                        cur.setdefault("state", "playing")
                        save()
                buf = buf[pos:][-65536:]
    except OSError:
        time.sleep(1)
