#!/usr/bin/env python3
"""Nate Bloom Box: the Pi 5's power button as a Home button (nb-box-power.service, as root).
Press = back to the home screen from anything (Moonlight and Kodi are closed; the app is asked for its home screen).
Hold 2 seconds = shut down. (logind is told to ignore the button: install.sh, logind.conf.d/nb-box.conf.)
When the box is off, the button turns it on as usual: that's the Pi's firmware, not this."""
import os, subprocess, time
try:
    import evdev
    from evdev import ecodes
except ImportError:
    raise SystemExit("python3-evdev is missing")

RUN = "/run/nb-box"
HOLD = 2.0
OTHERS = ["moonlight-qt", "kodi.bin", "kodi"]


def button():
    for p in evdev.list_devices():
        try:
            d = evdev.InputDevice(p)
        except OSError:
            continue
        n = d.name.lower()
        if n == "pwr_button" or (ecodes.KEY_POWER in d.capabilities().get(ecodes.EV_KEY, []) and any(w in n for w in ("button", "pwr", "power"))):
            return d
    return None


def home():
    for name in OTHERS:
        if subprocess.run(["pkill", "-x", name], capture_output=True).returncode == 0:
            return   # (session.sh brings the app back on the home screen when they close)
    os.makedirs(RUN, exist_ok=True)
    open(os.path.join(RUN, "home"), "w").close()


while True:
    d = button()
    if not d:
        time.sleep(5)
        continue
    down = None
    try:
        for ev in d.read_loop():
            if ev.type != ecodes.EV_KEY or ev.code != ecodes.KEY_POWER:
                continue
            if ev.value == 1:
                down = time.monotonic()
            elif ev.value == 0 and down is not None:
                held, down = time.monotonic() - down, None
                if held >= HOLD:
                    subprocess.run(["systemctl", "poweroff"])
                else:
                    home()
            elif ev.value == 2 and down is not None and time.monotonic() - down >= HOLD:
                subprocess.run(["systemctl", "poweroff"])
    except OSError:
        time.sleep(2)
