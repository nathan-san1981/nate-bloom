#!/usr/bin/env python3
"""Tandem diagnostics for the last test run: what each machine ran, when, how many at once, and why it waited.
Run on the laptop:   python3 tandem-diag.py [minutes back, default 60]"""
import json, subprocess, sys, time, urllib.request

SINCE = time.time() - 60 * float(sys.argv[1] if len(sys.argv) > 1 else 60)


def local_state():
    with urllib.request.urlopen("http://localhost:8740/api/state", timeout=20) as r:
        return json.loads(r.read())


def remote_state(host):
    try:
        out = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host,
                              "curl -s -m 20 localhost:8740/api/state; echo; "
                              "cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1; "
                              "sensors 2>/dev/null | grep -iE 'tctl|package id 0' | head -2"],
                             capture_output=True, text=True, timeout=60).stdout
        js, _, rest = out.partition("\n")
        return json.loads(js), rest.strip()
    except Exception as e:
        print(f"{host}: couldn't read ({e})")
        return None, ""


def hm(t):
    return time.strftime("%H:%M:%S", time.localtime(t)) if t else "--:--:--"


def timeline(name, st):
    jobs = [j for j in st["jobs"] if (j.get("created") or 0) >= SINCE]
    print(f"\n===== {name}: {len(jobs)} jobs since {hm(SINCE)} =====")
    s = st.get("settings") or {}
    print(f"cores {st['stats'].get('ncpu')}  slots setting {s.get('server_slots')}  temp now {st['stats'].get('temp')}  "
          f"gpu now {st['stats'].get('gpu')}")
    spans = []
    for j in sorted(jobs, key=lambda j: j.get("started") or j["created"]):
        o = j.get("opts") or {}
        a, b = j.get("started"), j.get("finished")
        wait = (a - j["created"]) if a else None
        run = (b - a) if a and b else None
        where = j.get("loc") or ""
        if where == "server":
            where = "→" + str(j.get("peer", ""))[:6]
        print(f"  {hm(j['created'])} start {hm(a)} end {hm(b)}  wait {wait and round(wait) or '-':>5}s  "
              f"run {run and round(run) or '-':>5}s  {j['type']:7} {j['state']:9} {where:8} gpu={j.get('gpu')} "
              f"{(j.get('name') or '')[:40]}  {('mode=' + o['mode']) if o.get('mode') else ''}")
        if a and b and j.get("origin") == "peer" or (a and b and j.get("loc") == "local"):
            spans.append((a, b))
    if spans:
        t0, t1 = min(a for a, _ in spans), max(b for _, b in spans)
        pts = sorted([(a, 1) for a, _ in spans] + [(b, -1) for _, b in spans])
        cur = peak = 0
        busy = 0.0
        last = t0
        for t, d in pts:
            if cur > 0:
                busy += t - last
            cur += d
            peak = max(peak, cur)
            last = t
        print(f"  ran here: {len(spans)} jobs between {hm(t0)} and {hm(t1)}, at most {peak} at once, "
              f"something running {100 * busy / max(1, t1 - t0):.0f}% of that time")
    ev = [e for e in st.get("events", []) if e.get("t", 0) >= SINCE]
    if ev:
        print("  events:")
        for e in sorted(ev, key=lambda e: e["t"])[-25:]:
            print(f"    {hm(e['t'])} {e['msg'][:110]}")


st = local_state()
peers = {p["id"]: p["name"] for p in st["peers"]}
print("peer ids:", ", ".join(f"{k[:6]}={v}" for k, v in peers.items()))
timeline(st["name"], st)
for host in ("beelink", "gpubox"):
    rs, temps = remote_state(host)
    if rs:
        timeline(host, rs)
        if temps:
            print("  temperature sensors:", " | ".join(temps.split("\n")))
