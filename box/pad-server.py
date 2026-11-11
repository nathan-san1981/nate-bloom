#!/usr/bin/env python3
"""Nate Bloom Box: phones as controllers (box/pad-server.py, nb-box-pad.service, port 8810).

Scan the QR code in the corner of the TV: the phone page (pad.html) is a TV remote, a game pad, a touchpad and a
keyboard. Every phone is a player: player 1, 2, 3, 4 each get their own virtual Xbox 360 pad on the box (uinput), so
RetroArch, Moonlight and the home screen see real controllers, one per phone, in the order the phones joined. The
remote, touchpad and typing go through one shared virtual keyboard and mouse.

The QR code shows in the corner (home screen: injected by the app; over games: home-button.py) until someone taps
"Everyone's in" on a phone; "Show QR code" brings it back. With no phone connected it always shows.

  GET /            the phone page            GET /api/state   {qr, url, players, matrix}  (the corner QR asks this)
  WS  /ws?id=&name=  the phone's controls (JSON messages, see handle())
"""
import asyncio, json, os, re, socket, subprocess, time
from http import HTTPStatus
from pathlib import Path

import evdev
from evdev import UInput, AbsInfo, ecodes as E
from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Response

PORT = int(os.environ.get("NB_PAD_PORT") or 8810)
HERE = Path(__file__).resolve().parent
RUN = Path(os.environ.get("NB_BOX_RUN") or "/run/nb-box")
OTHERS = ["moonlight-qt", "kodi.bin", "kodi", "retroarch"]   # (Home closes these, like the power button)
MAX_PLAYERS = 4
COLORS = ["#4f8cff", "#ff5a5f", "#3ccf7a", "#ffc23d"]

try:
    import qrcode
except ImportError:
    qrcode = None

# ---------- virtual devices
PAD_BTNS = {"a": E.BTN_SOUTH, "b": E.BTN_EAST, "x": E.BTN_NORTH, "y": E.BTN_WEST, "l": E.BTN_TL, "r": E.BTN_TR,
            "select": E.BTN_SELECT, "start": E.BTN_START, "menu": E.BTN_MODE, "l3": E.BTN_THUMBL, "r3": E.BTN_THUMBR}
STICK = AbsInfo(value=0, min=-32768, max=32767, fuzz=16, flat=128, resolution=0)
TRIG = AbsInfo(value=0, min=0, max=255, fuzz=0, flat=0, resolution=0)
HAT = AbsInfo(value=0, min=-1, max=1, fuzz=0, flat=0, resolution=0)
# the same buttons and axes, in the same order, as the kernel's Xbox 360 driver: every program's Xbox mapping fits
PAD_CAPS = {E.EV_KEY: [E.BTN_SOUTH, E.BTN_EAST, E.BTN_NORTH, E.BTN_WEST, E.BTN_TL, E.BTN_TR, E.BTN_SELECT, E.BTN_START,
                       E.BTN_MODE, E.BTN_THUMBL, E.BTN_THUMBR],
            E.EV_ABS: [(E.ABS_X, STICK), (E.ABS_Y, STICK), (E.ABS_Z, TRIG), (E.ABS_RX, STICK), (E.ABS_RY, STICK),
                       (E.ABS_RZ, TRIG), (E.ABS_HAT0X, HAT), (E.ABS_HAT0Y, HAT)]}
AXES = {"lx": E.ABS_X, "ly": E.ABS_Y, "rx": E.ABS_RX, "ry": E.ABS_RY}
TRIGS = {"l2": E.ABS_Z, "r2": E.ABS_RZ}

KEYS = {"up": E.KEY_UP, "down": E.KEY_DOWN, "left": E.KEY_LEFT, "right": E.KEY_RIGHT, "ok": E.KEY_ENTER,
        "enter": E.KEY_ENTER, "back": E.KEY_ESC, "esc": E.KEY_ESC, "backspace": E.KEY_BACKSPACE, "space": E.KEY_SPACE,
        "tab": E.KEY_TAB, "pageup": E.KEY_PAGEUP, "pagedown": E.KEY_PAGEDOWN, "context": E.KEY_C, "info": E.KEY_I,
        "playpause": E.KEY_SPACE, "stop": E.KEY_X, "ff": E.KEY_F, "rew": E.KEY_R}
CHARS = {}   # character -> (keycode, shift)
for c in "abcdefghijklmnopqrstuvwxyz":
    CHARS[c] = (getattr(E, "KEY_" + c.upper()), False); CHARS[c.upper()] = (getattr(E, "KEY_" + c.upper()), True)
for c in "0123456789":
    CHARS[c] = (getattr(E, "KEY_" + c), False)
for c, (k, s) in {" ": ("SPACE", 0), "\n": ("ENTER", 0), "-": ("MINUS", 0), "_": ("MINUS", 1), "=": ("EQUAL", 0),
                  "+": ("EQUAL", 1), ".": ("DOT", 0), ">": ("DOT", 1), ",": ("COMMA", 0), "<": ("COMMA", 1),
                  "/": ("SLASH", 0), "?": ("SLASH", 1), ";": ("SEMICOLON", 0), ":": ("SEMICOLON", 1),
                  "'": ("APOSTROPHE", 0), '"': ("APOSTROPHE", 1), "!": ("1", 1), "@": ("2", 1), "#": ("3", 1),
                  "$": ("4", 1), "%": ("5", 1), "&": ("7", 1), "*": ("8", 1), "(": ("9", 1), ")": ("0", 1),
                  "[": ("LEFTBRACE", 0), "]": ("RIGHTBRACE", 0), "\\": ("BACKSLASH", 0)}.items():
    CHARS[c] = (getattr(E, "KEY_" + k), bool(s))
KB_CAPS = {E.EV_KEY: sorted(set(KEYS.values()) | {k for k, _ in CHARS.values()} | {E.KEY_LEFTSHIFT})}
MOUSE_CAPS = {E.EV_KEY: [E.BTN_LEFT, E.BTN_RIGHT, E.BTN_MIDDLE], E.EV_REL: [E.REL_X, E.REL_Y, E.REL_WHEEL, E.REL_HWHEEL]}

pads = {}        # player number -> UInput (made when that player first joins, kept so ports never shift)
kb = mouse = None


def pad(n):
    if n not in pads:
        pads[n] = UInput(PAD_CAPS, name=f"Nate Bloom Pad {n}", vendor=0x045e, product=0x028e, version=0x110,
                         bustype=E.BUS_USB)
    return pads[n]


def devices():
    global kb, mouse
    if kb is None:
        kb = UInput(KB_CAPS, name="Nate Bloom Remote", vendor=0x1d6b, product=0x0104, bustype=E.BUS_VIRTUAL)
    if mouse is None:
        mouse = UInput(MOUSE_CAPS, name="Nate Bloom Touchpad", vendor=0x1d6b, product=0x0105, bustype=E.BUS_VIRTUAL)


def key_tap(code, shift=False):
    if shift: kb.write(E.EV_KEY, E.KEY_LEFTSHIFT, 1)
    kb.write(E.EV_KEY, code, 1); kb.syn(); kb.write(E.EV_KEY, code, 0)
    if shift: kb.write(E.EV_KEY, E.KEY_LEFTSHIFT, 0)
    kb.syn()


# ---------- players
class Player:
    def __init__(self, cid, name, num, ws):
        self.cid, self.name, self.num, self.ws = cid, name, num, ws
        self.held = set()        # pad buttons down
        self.keys = set()        # keyboard keys down (remote, held for repeats)
        self.mbtn = set()

    def release(self):
        p = pads.get(self.num)
        if p:
            for b in PAD_BTNS.values(): p.write(E.EV_KEY, b, 0)
            for a in (E.ABS_X, E.ABS_Y, E.ABS_RX, E.ABS_RY, E.ABS_Z, E.ABS_RZ, E.ABS_HAT0X, E.ABS_HAT0Y): p.write(E.EV_ABS, a, 0)
            p.syn()
        for k in self.keys: kb.write(E.EV_KEY, k, 0)
        for b in self.mbtn: mouse.write(E.EV_KEY, b, 0)
        if kb: kb.syn()
        if mouse: mouse.syn()
        self.held.clear(); self.keys.clear(); self.mbtn.clear()


players = {}     # player number -> Player (connected)
last_slot = {}   # client id -> player number it had (so a phone that reconnects gets its number back)
qr_on = True
state_n = 0


def take_slot(cid):
    want = last_slot.get(cid)
    if want and want not in players:
        return want
    for n in range(1, MAX_PLAYERS + 1):
        if n not in players and n not in last_slot.values():
            return n
    for n in range(1, MAX_PLAYERS + 1):   # all numbers were used once: reuse a free one
        if n not in players:
            return n
    return None


_ip = (0, "")
def lan_ip():
    global _ip
    if time.time() - _ip[0] < 30 and _ip[1]:
        return _ip[1]
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("192.0.2.1", 9)); ip = s.getsockname()[0]; s.close()
    except OSError:
        pass
    _ip = (time.time(), ip)
    return ip


def url():
    return f"http://{lan_ip()}:{PORT}/"


_qr = ("", None)
def matrix():
    global _qr
    u = url()
    if _qr[0] != u and qrcode:
        q = qrcode.QRCode(border=0, error_correction=qrcode.constants.ERROR_CORRECT_M); q.add_data(u); q.make(fit=True)
        _qr = (u, [[1 if c else 0 for c in row] for row in q.get_matrix()])
    return _qr[1]


def karaoke():
    try:
        m = re.search(r"^KARAOKE=(\S+)", Path("/etc/nb-box.conf").read_text(), re.M)
        return m.group(1).rstrip("/") + "/mic" if m else ""
    except OSError:
        return ""


def state():
    return {"qr": bool(qr_on or not players), "url": url(), "n": state_n,
            "players": [{"num": p.num, "name": p.name, "color": COLORS[(p.num - 1) % 4]} for p in sorted(players.values(), key=lambda p: p.num)]}


async def broadcast():
    global state_n
    state_n += 1
    s = state()
    for p in list(players.values()):
        try:
            await p.ws.send(json.dumps({"t": "state", **s, "you": p.num}))
        except Exception:
            pass


def go_home():
    for name in OTHERS:
        if subprocess.run(["pkill", "-x", name], capture_output=True).returncode == 0:
            return   # (session.sh brings the app back on the home screen when they close)
    try:
        (RUN / "home").touch()
    except OSError:
        pass


def volume(d):
    arg = "5%+" if d > 0 else "5%-"
    subprocess.run(["wpctl", "set-volume", "-l", "1.0", "@DEFAULT_AUDIO_SINK@", arg], capture_output=True)


# ---------- messages from a phone
def handle(p, m):
    t = m.get("t")
    if t == "b":       # pad button {b, v}
        code = PAD_BTNS.get(m.get("b")); pd = pad(p.num)
        if code is not None:
            pd.write(E.EV_KEY, code, 1 if m.get("v") else 0); pd.syn()
        elif m.get("b") in TRIGS:
            pd.write(E.EV_ABS, TRIGS[m["b"]], 255 if m.get("v") else 0); pd.syn()
    elif t == "hat":   # d-pad {x, y} in -1..1
        pd = pad(p.num)
        pd.write(E.EV_ABS, E.ABS_HAT0X, max(-1, min(1, int(m.get("x", 0)))))
        pd.write(E.EV_ABS, E.ABS_HAT0Y, max(-1, min(1, int(m.get("y", 0))))); pd.syn()
    elif t == "stick":  # {s: "l"|"r", x, y} in -1..1
        pd = pad(p.num); s = "r" if m.get("s") == "r" else "l"
        pd.write(E.EV_ABS, AXES[s + "x"], int(max(-1, min(1, float(m.get("x", 0)))) * 32767))
        pd.write(E.EV_ABS, AXES[s + "y"], int(max(-1, min(1, float(m.get("y", 0)))) * 32767)); pd.syn()
    elif t == "k":     # remote key {k, v}: 1 down, 0 up, missing = tap
        code = KEYS.get(m.get("k"))
        if code is None: return
        if "v" not in m: key_tap(code)
        else:
            kb.write(E.EV_KEY, code, 1 if m["v"] else 0); kb.syn()
            (p.keys.add if m["v"] else p.keys.discard)(code)
    elif t == "type":  # {s: text}
        for ch in str(m.get("s", ""))[:500]:
            if ch in CHARS: key_tap(*CHARS[ch])
    elif t == "move":  # touchpad {dx, dy, w}
        mouse.write(E.EV_REL, E.REL_X, int(m.get("dx", 0))); mouse.write(E.EV_REL, E.REL_Y, int(m.get("dy", 0)))
        if m.get("w"): mouse.write(E.EV_REL, E.REL_WHEEL, int(m["w"]))
        mouse.syn()
    elif t == "click":  # {btn: "left"|"right", v?}
        code = E.BTN_RIGHT if m.get("btn") == "right" else E.BTN_LEFT
        if "v" in m:
            mouse.write(E.EV_KEY, code, 1 if m["v"] else 0); mouse.syn()
            (p.mbtn.add if m["v"] else p.mbtn.discard)(code)
        else:
            mouse.write(E.EV_KEY, code, 1); mouse.syn(); mouse.write(E.EV_KEY, code, 0); mouse.syn()
    elif t == "home":
        go_home()
    elif t == "vol":
        volume(int(m.get("d", 1)))
    elif t == "qr":
        global qr_on
        qr_on = bool(m.get("on"))
        return "state"
    elif t == "name":
        p.name = str(m.get("name", ""))[:20] or p.name
        return "state"


async def ws_handler(ws):
    q = ws.request.path.split("?", 1)[1] if "?" in ws.request.path else ""
    args = dict(kv.split("=", 1) for kv in q.split("&") if "=" in kv)
    from urllib.parse import unquote
    cid = re.sub(r"[^A-Za-z0-9_-]", "", unquote(args.get("id", "")))[:40] or os.urandom(6).hex()
    name = unquote(args.get("name", ""))[:20]
    for old in [x for x in players.values() if x.cid == cid]:   # (the same phone opened the page again)
        old.release(); players.pop(old.num, None)
        try: await old.ws.close()
        except Exception: pass
    num = take_slot(cid)
    if num is None:
        await ws.send(json.dumps({"t": "full"})); await ws.close(); return
    devices(); pad(num)
    p = Player(cid, name or f"Player {num}", num, ws)
    players[num] = p; last_slot[cid] = num
    await ws.send(json.dumps({"t": "hello", "you": num, "color": COLORS[(num - 1) % 4], "karaoke": karaoke()}))
    await broadcast()
    try:
        async for raw in ws:
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            try:
                if handle(p, m) == "state":
                    await broadcast()
            except Exception as e:
                print("message failed:", m.get("t"), e, flush=True)
    finally:
        if players.get(num) is p:
            p.release(); players.pop(num, None)
            await broadcast()


def respond(status, body, ctype):
    b = body if isinstance(body, bytes) else body.encode()
    return Response(status.value, status.phrase, Headers([
        ("Content-Type", ctype), ("Content-Length", str(len(b))), ("Cache-Control", "no-store"),
        ("Access-Control-Allow-Origin", "*")]), b)


def http(conn, req):
    path = req.path.split("?", 1)[0]
    if path == "/ws":
        return None
    if path in ("/", "/pad", "/index.html"):
        return respond(HTTPStatus.OK, (HERE / "pad.html").read_bytes(), "text/html; charset=utf-8")
    if path == "/api/state":
        return respond(HTTPStatus.OK, json.dumps({**state(), "matrix": matrix()}), "application/json")
    if path == "/api/ping":
        return respond(HTTPStatus.OK, "ok", "text/plain")
    return respond(HTTPStatus.NOT_FOUND, "not found", "text/plain")


async def main():
    devices()
    pad(1)   # (player 1's pad exists from the start: games started before any phone joined still see it)
    async with serve(ws_handler, "0.0.0.0", PORT, process_request=http, ping_interval=10, ping_timeout=10,
                     compression=None) as srv:
        for s in srv.sockets:
            try: s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            except OSError: pass
        print(f"Nate Bloom pads: {url()}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
