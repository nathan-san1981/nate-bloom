#!/usr/bin/env python3
"""Headphone balance for the Nate Bloom Box: left/right on the output itself, so it applies to everything (Nate Bloom,
Keys, Karaoke, Listen, games).

  balance.py          apply the saved balance to the output playing now (after a volume change, at start)
  balance.py -0.15    save and apply: below 0 leans left (the right side quieter), above 0 leans right
  balance.py get      print the saved balance

Kept in ~/.config/nb-box/balance. PipeWire has no balance of its own, and a volume change from wpctl sets both
sides the same again, so whatever changes the volume runs this afterwards (the phone remote's volume, pad-server.py).
The louder side keeps the volume; the other is turned down (at most 0.6, about -8 dB).
"""
import json, os, re, subprocess, sys

F = os.path.expanduser("~/.config/nb-box/balance")


def saved():
    try:
        return max(-0.6, min(0.6, float(open(F).read().strip())))
    except (OSError, ValueError):
        return 0.0


def sink():
    out = subprocess.run(["wpctl", "inspect", "@DEFAULT_AUDIO_SINK@"], capture_output=True, text=True).stdout
    m = re.search(r"^id (\d+)", out, re.M)
    return int(m.group(1)) if m else None


def apply(b):
    sid = sink()
    if sid is None:
        return False
    d = json.loads(subprocess.run(["pw-dump", str(sid)], capture_output=True, text=True).stdout or "[]")
    vols = None
    for o in d:
        if o.get("id") == sid:
            for p in (o.get("info", {}).get("params", {}).get("Props") or []):
                if isinstance(p, dict) and isinstance(p.get("channelVolumes"), list):
                    vols = p["channelVolumes"]
    if not vols or len(vols) != 2:
        return False
    ref = max(vols)
    want = [ref * (1 - max(0.0, b)), ref * (1 + min(0.0, b))]
    if all(abs(a - w) < 1e-4 for a, w in zip(vols, want)):
        return True
    subprocess.run(["pw-cli", "s", str(sid), "Props", "{ channelVolumes: [ %.6f, %.6f ] }" % tuple(want)], capture_output=True)
    return True


if __name__ == "__main__":
    a = sys.argv[1:] 
    if a and a[0] == "get":
        print(saved()); sys.exit(0)
    if a:
        b = max(-0.6, min(0.6, float(a[0])))
        os.makedirs(os.path.dirname(F), exist_ok=True)
        open(F, "w").write("%.2f\n" % b)
    else:
        b = saved()
    if b or a:
        sys.exit(0 if apply(b) else 1)
