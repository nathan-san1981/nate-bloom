# (175) Across both screens on X11 (Mint Cinnamon, GNOME, Xfce, MATE): Cinnamon and GNOME keep an ordinary window on one
# screen when a program sizes it across two, so the app goes fullscreen over the screens instead, which the desktop allows
# through _NET_WM_FULLSCREEN_MONITORS. This sends that hint for the window id given (on) or clears it (off), and says
# what it found: the window manager, whether it supports the hint, and the screens X knows. "bare"/"framed" take the
# window's title bar off and put it back (_MOTIF_WM_HINTS): a window without one isn't held to a single screen, the
# fallback for a desktop that doesn't take the hint. Run by main.js through python3 -c (Mint always has python3 and
# libX11). usage: xspan.py XID on|off|bare|framed
import ctypes as C, sys, json
xid = int(sys.argv[1]); mode = sys.argv[2]; on = mode == "on"
out = {"ok": False}
def done(**k):
    out.update(k); print(json.dumps(out)); sys.exit(0)
try:
    X = C.CDLL("libX11.so.6")
except OSError:
    done(why="no libX11")
V, UL, I = C.c_void_p, C.c_ulong, C.c_int
X.XOpenDisplay.restype = V; X.XOpenDisplay.argtypes = [C.c_char_p]
X.XDefaultRootWindow.restype = UL; X.XDefaultRootWindow.argtypes = [V]
X.XInternAtom.restype = UL; X.XInternAtom.argtypes = [V, C.c_char_p, I]
X.XFlush.argtypes = [V]; X.XCloseDisplay.argtypes = [V]; X.XFree.argtypes = [V]
X.XGetWindowProperty.argtypes = [V, UL, UL, C.c_long, C.c_long, I, UL, C.POINTER(UL), C.POINTER(I), C.POINTER(UL), C.POINTER(UL), C.POINTER(V)]
# an X error (a stale window id, say) is noted, not fatal: Xlib's own handler would end the helper
ERRS = []
EH = C.CFUNCTYPE(I, V, V)(lambda dpy, ev: (ERRS.append(1), 0)[1])
X.XSetErrorHandler.argtypes = [V]; X.XSetErrorHandler(C.cast(EH, V))
X.XSync.argtypes = [V, I]
d = X.XOpenDisplay(None)
if not d:
    done(why="no X display")
root = X.XDefaultRootWindow(d)
def prop(win, name, typ):
    at, fm, n, rest, data = UL(), I(), UL(), UL(), V()
    if X.XGetWindowProperty(d, win, X.XInternAtom(d, name, 0), 0, 4096, 0, typ, C.byref(at), C.byref(fm), C.byref(n), C.byref(rest), C.byref(data)) != 0 or not data:
        return None
    if fm.value == 32:
        a = C.cast(data, C.POINTER(UL)); r = [a[i] for i in range(n.value)]
    else:
        r = C.string_at(data, n.value).decode("utf-8", "replace")
    X.XFree(data); return r
FSM = X.XInternAtom(d, b"_NET_WM_FULLSCREEN_MONITORS", 0)
sup = prop(root, b"_NET_SUPPORTED", 4) or []
wm = ""
chk = prop(root, b"_NET_SUPPORTING_WM_CHECK", 33)
if chk:
    wm = prop(chk[0], b"_NET_WM_NAME", X.XInternAtom(d, b"UTF8_STRING", 0)) or ""
out.update(wm=wm, fsm=FSM in sup)
class XSI(C.Structure):
    _fields_ = [("n", I), ("x", C.c_short), ("y", C.c_short), ("w", C.c_short), ("h", C.c_short)]
mons = []
try:
    Xi = C.CDLL("libXinerama.so.1")
    Xi.XineramaQueryScreens.restype = C.POINTER(XSI); Xi.XineramaQueryScreens.argtypes = [V, C.POINTER(I)]
    k = I(0); p = Xi.XineramaQueryScreens(d, C.byref(k))
    for i in range(k.value):
        mons.append([p[i].n, p[i].x, p[i].y, p[i].w, p[i].h])
    if p:
        X.XFree(C.cast(p, V))
except OSError:
    pass
out.update(mons=mons)
if mode in ("bare", "framed"):
    X.XChangeProperty.argtypes = [V, UL, UL, UL, I, I, V, I]
    mwm = X.XInternAtom(d, b"_MOTIF_WM_HINTS", 0)
    h = (C.c_long * 5)(2, 0, 0 if mode == "bare" else 1, 0, 0)   # flags: decorations; decorations off or on
    X.XChangeProperty(d, xid, mwm, mwm, 32, 0, C.cast(h, V), 5)
    X.XSync(d, 0); X.XCloseDisplay(d)
    done(ok=True, sent=mode, xerrors=len(ERRS))
if on:
    if len(mons) < 2:
        done(why="X sees %d screen(s)" % len(mons))
    v = [max(mons, key=lambda m: m[2])[0], min(mons, key=lambda m: m[2] + m[4])[0], min(mons, key=lambda m: m[1])[0], max(mons, key=lambda m: m[1] + m[3])[0]]
else:
    v = [32767] * 4
class CM(C.Structure):
    _fields_ = [("type", I), ("serial", UL), ("send_event", I), ("display", V), ("window", UL), ("message_type", UL), ("format", I), ("l", C.c_long * 5)]
class EV(C.Union):
    _fields_ = [("xclient", CM), ("pad", C.c_long * 24)]
X.XSendEvent.argtypes = [V, UL, I, C.c_long, C.POINTER(EV)]
e = EV(); c = e.xclient
c.type = 33; c.send_event = 1; c.display = d; c.window = xid; c.message_type = FSM; c.format = 32
for i in range(4):
    c.l[i] = v[i]
c.l[4] = 1
X.XSendEvent(d, root, 0, (1 << 20) | (1 << 19), C.byref(e))
X.XSync(d, 0); X.XCloseDisplay(d)
done(ok=True, sent=v, xerrors=len(ERRS))
