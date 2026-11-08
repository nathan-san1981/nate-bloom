#!/usr/bin/env python3
"""Nate Bloom Box, Listen: librespot (Spotify Connect) runs this on each player event; it keeps what's playing in
$NB_LISTEN_FILE (/run/nb-box/listen.json) for the Listen page. librespot 0.5+ passes NAME, ARTISTS and ALBUM;
older ones only the event, so the page then shows "Playing" without the song."""
import json, os, time
f = os.environ.get("NB_LISTEN_FILE") or "/run/nb-box/listen.json"
ev = os.environ.get("PLAYER_EVENT", "")
try:
    cur = json.load(open(f))
except Exception:
    cur = {}
if ev in ("track_changed", "playing", "started", "changed", "paused", "stopped", "session_disconnected", "session_connected"):
    if ev == "track_changed" or os.environ.get("NAME"):
        cur.update(name=os.environ.get("NAME", cur.get("name", "")), artists=", ".join(a for a in os.environ.get("ARTISTS", "").split("\n") if a) or cur.get("artists", ""),
                   album=os.environ.get("ALBUM", cur.get("album", "")))
    cur["state"] = {"playing": "playing", "started": "playing", "changed": "playing", "track_changed": cur.get("state", "playing"),
                    "paused": "paused", "stopped": "stopped", "session_disconnected": "idle", "session_connected": "connected"}[ev]
    cur["source"] = "Spotify"
    cur["t"] = time.time()
    tmp = f + ".part"
    with open(tmp, "w") as o:
        json.dump(cur, o)
    os.replace(tmp, f)
