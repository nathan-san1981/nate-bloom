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
from websockets.exceptions import ConnectionClosed
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

# ---------- player slots
# Games see exactly four controllers, "Nate Bloom Pad 1".."4", always there, always in that order (made when the
# server starts). Every real controller (8BitDo, Xbox, PlayStation...) and every phone is routed into one of them, so
# who is player 1, 2, 3, 4 can change at any moment, even in the middle of a game: the game never notices. The real
# controllers themselves are hidden from games by a udev rule (99-nb-box-pads.rules: no ID_INPUT_JOYSTICK), so they
# are not counted twice. Change the order: "Player order" on a phone, hold Select on a controller for SELECT_HOLD s,
# or the Players screen; then each person presses A in turn (player 1 first).
SLOTS = 4
slot_pads = {}   # slot -> UInput
SELECT_HOLD = 1.5


def make_slots():
    for n in range(1, SLOTS + 1):
        if n not in slot_pads:
            slot_pads[n] = UInput(PAD_CAPS, name=f"Nate Bloom Pad {n}", vendor=0x045e, product=0x028e, version=0x110,
                                  bustype=E.BUS_USB)


class Source:
    """A real controller or a phone: whatever it presses goes to its slot's pad."""
    def __init__(self, sid, kind, name):
        self.id, self.kind, self.name = sid, kind, name
        self.slot = None
        self.keys = set(); self.axes = {}
        self.away = False

    def write(self, typ, code, val):
        pd = slot_pads.get(self.slot)
        if not pd: return
        pd.write(typ, code, val)
        if typ == E.EV_KEY: (self.keys.add if val else self.keys.discard)(code)
        elif typ == E.EV_ABS: self.axes[code] = val

    def syn(self):
        pd = slot_pads.get(self.slot)
        if pd: pd.syn()

    def release(self):
        pd = slot_pads.get(self.slot)
        if pd:
            for k in self.keys: pd.write(E.EV_KEY, k, 0)
            for a, v in self.axes.items():
                if v: pd.write(E.EV_ABS, a, 0)
            pd.syn()
        self.keys.clear(); self.axes.clear()


sources = {}     # id -> Source (connected, or a phone that left less than GRACE s ago)
remembered = {}  # id -> the slot it had (a controller switched off and on again, a phone reconnecting, keeps it)
gone_at = {}     # id -> when it went away (its old number is kept for it only REJOIN s)
REJOIN = 120     # a controller back within this (fell asleep mid-game, battery swap) gets its old number back;
                 # later it takes the lowest free one, so a lone controller is always player 1
order_t = 0.0    # when the order last changed (the TV shows it for a moment)
pick = None      # while choosing the order: {"order": [ids], "t": last press, "t0": started}


def free_slot(src):
    used = {s.slot for s in sources.values() if s is not src and s.slot}
    want = remembered.get(src.id)
    if want and want not in used and time.time() - gone_at.get(src.id, 0) < REJOIN: return want
    held = [remembered[k] for k, t in gone_at.items() if k != src.id and time.time() - t < REJOIN and k in remembered]
    for n in range(1, SLOTS + 1):
        if n not in used and n not in held:
            return n
    for n in range(1, SLOTS + 1):
        if n not in used: return n
    return None


def seat(src, slot):
    """Put src in slot (None: watching); whoever was there swaps to src's old slot."""
    global order_t
    if src.slot == slot: return
    other = next((s for s in sources.values() if s is not src and slot and s.slot == slot), None)
    old = src.slot
    src.release()
    if other: other.release(); other.slot = old; remembered[other.id] = old
    src.slot = slot
    if slot: remembered[src.id] = slot
    order_t = time.time()


def add_source(src):
    sources[src.id] = src
    seat(src, free_slot(src))


def remove_source(sid):
    src = sources.pop(sid, None)
    if src: src.release(); src.slot = None; gone_at[sid] = time.time()


GAMES = ("retroarch", "moonlight-qt", "kodi.bin")


def in_game():
    try:
        return subprocess.run(["pgrep", "-x", "|".join(GAMES)], capture_output=True, timeout=3).returncode == 0
    except Exception:
        return True   # unsure: leave the numbers alone


def close_gaps():
    """Outside a game, players are always 1, 2, 3... with no holes (someone who left for good gives up their
    number). Never during a game: numbers changing under people mid-game is worse than a hole."""
    global order_t
    if pick or in_game(): return False
    if any(time.time() - t < REJOIN for k, t in gone_at.items() if k not in sources): return False
    seated = sorted((s for s in sources.values() if s.slot), key=lambda s: s.slot)
    if [s.slot for s in seated] == list(range(1, len(seated) + 1)): return False
    for s in seated: s.release()
    for i, s in enumerate(seated):
        s.slot = i + 1; remembered[s.id] = s.slot
    order_t = time.time()
    print("closed gaps:", ", ".join(f"{s.slot}={s.name}" for s in seated), flush=True)
    return True


def pick_start():
    global pick, order_t
    for s in sources.values(): s.release()
    pick = {"order": [], "t": time.time(), "t0": time.time()}; order_t = time.time()
    print("choosing the player order", flush=True)


def pick_press(src, start=False):
    """A button pressed while choosing: the next player number is this controller's (Start from someone already
    chosen: done, the rest keep their places after them)."""
    if src.id in pick["order"]:
        if start: pick_finish()
        return
    pick["order"].append(src.id); pick["t"] = time.time()
    here = [s for s in sources.values() if not s.away]
    if len(pick["order"]) >= min(SLOTS, len(here)): pick_finish()


def pick_finish():
    global pick, order_t
    if not pick: return
    chosen = [sources[i] for i in pick["order"] if i in sources]
    rest = sorted((s for s in sources.values() if s not in chosen), key=lambda s: (s.slot or 99, s.kind == "phone"))
    for s in sources.values(): s.release(); s.slot = None
    for i, s in enumerate(chosen + rest):
        s.slot = i + 1 if i < SLOTS else None
        if s.slot: remembered[s.id] = s.slot
    pick = None; order_t = time.time()
    print("player order:", ", ".join(f"{s.slot}={s.name}" for s in chosen + rest), flush=True)


async def pick_ticker():
    """Choosing ends by itself 10 s after the last press (or 30 s with none)."""
    while True:
        await asyncio.sleep(0.5)
        if pick and (time.time() - pick["t"] > (10 if pick["order"] else 30)):
            pick_finish(); await broadcast()


GRACE = 60       # (a phone that drops off Wi-Fi and comes back within this keeps its player number)
left_at = {}     # phone source id -> when it left
kb = mouse = None


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

    @property
    def src(self):
        return sources.get("phone:" + self.cid)

    def release(self):
        if self.src: self.src.release()
        for k in self.keys: kb.write(E.EV_KEY, k, 0)
        for b in self.mbtn: mouse.write(E.EV_KEY, b, 0)
        if kb: kb.syn()
        if mouse: mouse.syn()
        self.held.clear(); self.keys.clear(); self.mbtn.clear()


players = {}     # player number -> Player (connected)
last_slot = {}   # client id -> player number it had (so a phone that reconnects gets its number back)
qr_on = True
qr_t = 0.0       # when a phone last asked to see the QR code (over games it shows for a while, then fades)
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


def controllers():
    """Players 1-4 in order (None: an empty place), then anyone watching. Phones show their name; real controllers
    their own name. dev = the pad games see for that player (the Players screen matches it to the browser's gamepads)."""
    out = [None] * SLOTS
    extra = []
    for s in sources.values():
        c = {"kind": s.kind, "name": s.name, "id": s.id, "away": s.away, "slot": s.slot, "port": s.slot,
             "color": COLORS[(s.slot - 1) % 4] if s.slot else "#74777e", "dev": f"Nate Bloom Pad {s.slot}" if s.slot else ""}
        if s.away: c["name"] = "Phone (reconnecting…)"
        if s.slot: out[s.slot - 1] = c
        else: extra.append(c)
    return out + extra


def order_state():
    names = lambda ids: [sources[i].name for i in ids if i in sources]
    return {"picking": bool(pick), "next": len(pick["order"]) + 1 if pick else None, "chosen": names(pick["order"]) if pick else [],
            "age": round(time.time() - order_t, 1) if order_t else None,
            "here": sum(1 for s in sources.values() if not s.away)}


def state():
    cs = controllers()
    return {"idle": round(time.time() - last_act, 1), "qr": bool(qr_on or not players), "url": url(), "n": state_n, "controllers": cs,
            "qr_age": round(time.time() - qr_t, 1) if qr_t else None, "order": order_state(),
            "players": [{"num": p.num, "name": p.name, "color": COLORS[(p.src.slot - 1) % 4] if p.src and p.src.slot else "#74777e"}
                        for p in sorted(players.values(), key=lambda p: p.num)]}


async def broadcast():
    global state_n
    state_n += 1
    s = state()
    for p in list(players.values()):
        try:
            await p.ws.send(json.dumps({"t": "state", **s, "you": p.src.slot if p.src else None}))
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
    subprocess.run(["python3", "/usr/local/lib/nb-box/balance.py"], capture_output=True)   # (wpctl sets both sides the same: the headphone balance back)


# ---------- messages from a phone
last_act = time.time()   # (the last button pressed anywhere: a phone or a real controller; the TV app's screensaver)


def handle(p, m):
    global last_act
    last_act = time.time()
    t = m.get("t")
    if t in ("b", "hat", "stick"):   # the Pad tab: this phone is a controller from its first press
        src = sources.get("phone:" + p.cid)
        if not src:
            src = Source("phone:" + p.cid, "phone", p.name); add_source(src); m["_new"] = True
        if pick:
            if t == "b" and m.get("v") and m.get("b") in ("a", "b", "x", "y", "start"): pick_press(src, m["b"] == "start")
            return "state"
    if t == "b":       # pad button {b, v}
        code = PAD_BTNS.get(m.get("b"))
        if code is not None:
            src.write(E.EV_KEY, code, 1 if m.get("v") else 0); src.syn()
        elif m.get("b") in TRIGS:
            src.write(E.EV_ABS, TRIGS[m["b"]], 255 if m.get("v") else 0); src.syn()
    elif t == "hat":   # d-pad {x, y} in -1..1
        src.write(E.EV_ABS, E.ABS_HAT0X, max(-1, min(1, int(m.get("x", 0)))))
        src.write(E.EV_ABS, E.ABS_HAT0Y, max(-1, min(1, int(m.get("y", 0))))); src.syn()
    elif t == "stick":  # {s: "l"|"r", x, y} in -1..1
        sd = "r" if m.get("s") == "r" else "l"
        src.write(E.EV_ABS, AXES[sd + "x"], int(max(-1, min(1, float(m.get("x", 0)))) * 32767))
        src.write(E.EV_ABS, AXES[sd + "y"], int(max(-1, min(1, float(m.get("y", 0)))) * 32767)); src.syn()
    elif t == "pick":   # "Player order": everyone presses A in turn (again: done)
        pick_finish() if pick else pick_start()
        return "state"
    elif t == "seat":   # {slot}: this phone becomes that player (whoever was there takes its place)
        src = sources.get("phone:" + p.cid)
        if not src: src = Source("phone:" + p.cid, "phone", p.name); sources[src.id] = src
        n = m.get("slot"); seat(src, n if n in range(1, SLOTS + 1) else None)
        return "state"
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
    elif t == "open" and m.get("app") in ("players", "retro", "home"):
        for name in OTHERS:   # (leave a game first; the app opens the screen when it comes back)
            subprocess.run(["pkill", "-x", name], capture_output=True)
        try: (RUN / "open").write_text(m["app"])
        except OSError: pass
    elif t == "vol":
        volume(int(m.get("d", 1)))
    elif t == "qr":
        global qr_on, qr_t
        qr_on = bool(m.get("on"))
        if qr_on: qr_t = time.time()   # ("Show QR": over a game it comes back for a while)
        return "state"
    elif t == "name":
        p.name = str(m.get("name", ""))[:20] or p.name
        if p.src: p.src.name = p.name
        return "state"
    if m.get("_new"): return "state"


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
    devices()   # (no game pad yet: a phone becomes a controller only when its Pad tab is used, so a phone used as
                # a remote never takes a player number from the 8BitDos)
    p = Player(cid, name or f"Player {num}", num, ws)
    players[num] = p; last_slot[cid] = num
    if p.src: p.src.away = False; p.src.name = p.name; left_at.pop(p.src.id, None)
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
    except ConnectionClosed:
        pass   # (a phone that went to sleep or left Wi-Fi without saying goodbye)
    finally:
        if players.get(num) is p:
            p.release(); players.pop(num, None)
            if p.src and not any(x.cid == cid for x in players.values()):
                p.src.away = True; left_at[p.src.id] = time.time()
            await broadcast()


HOLD = 0.8   # seconds the Home / Guide button is held to leave a game
readers = {}   # device path -> task
DPAD = {E.BTN_DPAD_UP: (E.ABS_HAT0Y, -1), E.BTN_DPAD_DOWN: (E.ABS_HAT0Y, 1), E.BTN_DPAD_LEFT: (E.ABS_HAT0X, -1),
        E.BTN_DPAD_RIGHT: (E.ABS_HAT0X, 1)}
FACE = (E.BTN_SOUTH, E.BTN_EAST, E.BTN_NORTH, E.BTN_WEST)


def hidden(path):
    """True when the udev rule hides this controller from games (else forwarding it would make it count twice)."""
    try:
        out = subprocess.run(["udevadm", "info", "-q", "property", "-n", path], capture_output=True, text=True, timeout=3).stdout
        return "NB_REAL_PAD=1" in out
    except Exception:
        return False


async def read_real(path):
    """A real controller: its presses go to its player's pad. Also: Home held HOLD s = back to the home screen (a short
    press still reaches the game: RetroArch's menu); Select held SELECT_HOLD s = choose the player order."""
    global last_act
    src = None
    try:
        dev = evdev.InputDevice(path)
        sid = "pad:" + (dev.uniq or dev.phys or path)
        src = Source(sid, "pad", dev.name)
        add_source(src); asyncio.create_task(broadcast())
        print(f"controller: {dev.name} ({sid}) is player {src.slot}", flush=True)
        ai = {code: info for code, info in dev.capabilities(absinfo=True).get(E.EV_ABS, [])}
        fwd = hidden(path); checked = time.time()
        if not fwd: print(f"  {dev.name} is not hidden from games (udev rule missing): not forwarded", flush=True)
        hat = {E.ABS_HAT0X: 0, E.ABS_HAT0Y: 0}
        down = {"home": None, "select": None}
        async def held(which, t0, secs, fn):
            await asyncio.sleep(secs)
            if down[which] == t0: fn()
        async for e in dev.async_read_loop():
            if not fwd and time.time() - checked > 3:
                fwd = hidden(path); checked = time.time()
            if e.type == E.EV_KEY:
                if e.value == 1: last_act = time.time()
                if e.code == E.BTN_MODE:
                    down["home"] = time.time() if e.value == 1 else None
                    if e.value == 1:
                        asyncio.create_task(held("home", down["home"], HOLD, lambda: (print(f"{dev.name}: Home held, going home", flush=True), go_home())))
                if e.code == E.BTN_SELECT:
                    down["select"] = time.time() if e.value == 1 else None
                    if e.value == 1 and not pick:
                        def sel():
                            pick_start(); asyncio.create_task(broadcast())
                        asyncio.create_task(held("select", down["select"], SELECT_HOLD, sel))
                if pick:
                    if e.value == 1 and (e.code in FACE or e.code == E.BTN_START):
                        pick_press(src, e.code == E.BTN_START); asyncio.create_task(broadcast())
                    continue
                if not fwd: continue
                if e.code in DPAD:
                    ax, d = DPAD[e.code]
                    hat[ax] = d if e.value else (0 if hat[ax] == d else hat[ax]); src.write(E.EV_ABS, ax, hat[ax])
                elif e.code == E.BTN_TL2: src.write(E.EV_ABS, E.ABS_Z, 255 if e.value else 0)
                elif e.code == E.BTN_TR2: src.write(E.EV_ABS, E.ABS_RZ, 255 if e.value else 0)
                elif e.code in PAD_CAPS[E.EV_KEY] and e.value in (0, 1): src.write(E.EV_KEY, e.code, e.value)
            elif e.type == E.EV_ABS:
                if e.code in (E.ABS_HAT0X, E.ABS_HAT0Y) and e.value: last_act = time.time()
                if pick or not fwd: continue
                i = ai.get(e.code)
                if e.code in (E.ABS_HAT0X, E.ABS_HAT0Y): src.write(E.EV_ABS, e.code, (e.value > 0) - (e.value < 0))
                elif i and e.code in (E.ABS_X, E.ABS_Y, E.ABS_RX, E.ABS_RY) and i.max > i.min:
                    src.write(E.EV_ABS, e.code, int(((e.value - i.min) / (i.max - i.min) * 2 - 1) * 32767))
                elif i and e.code in (E.ABS_Z, E.ABS_RZ, E.ABS_BRAKE, E.ABS_GAS) and i.max > i.min:
                    code = E.ABS_Z if e.code in (E.ABS_Z, E.ABS_BRAKE) else E.ABS_RZ
                    src.write(E.EV_ABS, code, int((e.value - i.min) / (i.max - i.min) * 255))
            elif e.type == E.EV_SYN and e.code == E.SYN_REPORT and not pick and fwd:
                src.syn()
    except (OSError, asyncio.CancelledError):
        pass
    finally:
        readers.pop(path, None)
        if src:
            remove_source(src.id); print(f"controller gone: {src.name}", flush=True)
            if pick and src.id in pick["order"]: pick["order"].remove(src.id)
            asyncio.create_task(broadcast())


def scan_real():
    for path in evdev.list_devices():
        if path in readers: continue
        try:
            d = evdev.InputDevice(path)
            keys = d.capabilities().get(E.EV_KEY, [])
            ok = not d.name.startswith("Nate Bloom") and E.BTN_SOUTH in keys and (E.BTN_START in keys or E.BTN_MODE in keys)
            d.close()
        except OSError:
            continue
        if ok:
            readers[path] = asyncio.create_task(read_real(path))


async def watch_controllers():
    """New controllers (plugged in, paired, switched on) get the next free player number; phones that left more than
    GRACE s ago give theirs up."""
    last = None
    while True:
        scan_real()
        for sid, t in list(left_at.items()):
            if time.time() - t > GRACE:
                left_at.pop(sid, None); remove_source(sid)
        close_gaps()
        cur = json.dumps(controllers())
        if cur != last and last is not None:
            await broadcast()
        last = cur
        await asyncio.sleep(2)


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
    if path == "/api/pick":   # (the Players screen's "Change order")
        pick_finish() if pick else pick_start()
        return respond(HTTPStatus.OK, json.dumps(order_state()), "application/json")
    if path == "/api/ping":
        return respond(HTTPStatus.OK, "ok", "text/plain")
    return respond(HTTPStatus.NOT_FOUND, "not found", "text/plain")


async def main():
    devices(); make_slots()
    asyncio.create_task(watch_controllers()); asyncio.create_task(pick_ticker())
    async with serve(ws_handler, "0.0.0.0", PORT, process_request=http, ping_interval=10, ping_timeout=10,
                     compression=None) as srv:
        for s in srv.sockets:
            try: s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            except OSError: pass
        print(f"Nate Bloom pads: {url()}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
