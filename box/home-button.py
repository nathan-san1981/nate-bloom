#!/usr/bin/env python3
"""Nate Bloom Box: an on-screen Home button over Kodi, Moonlight and RetroArch (box/home-button.py).
They run in a small labwc inside cage (outside.sh); this sits on labwc's overlay layer, above even a full-screen
game, bottom-left like the app's own Home button. Tapping it closes the program, the same as a short press of the
power button, and session.sh brings the home screen back.
Bottom-right: the phone controllers' QR code (pad-server.py), until a phone says "Everyone's in"."""
import json, os, subprocess, threading, time, urllib.request
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("GtkLayerShell", "0.1")
from gi.repository import Gtk, GtkLayerShell, GLib

OTHERS = ["moonlight-qt", "kodi.bin", "kodi", "retroarch"]
Z = max(1.0, min(4.0, float(os.environ.get("NB_HOME_SCALE") or 1)))   # (2 on a TV: outside.sh)
px = lambda v: "%dpx" % round(v * Z)
CSS = ("""
window { background: transparent; }
button { min-height: %s; padding: 0 %s 0 %s; border-radius: %s; border: 1px solid rgba(255,255,255,.22);
         background: rgba(20,21,26,.82); color: #fff; font: 600 %s Inter, "Noto Sans", sans-serif; box-shadow: none; }
button:hover, button:active { background: rgba(60,62,72,.95); }
""" % (px(44), px(16), px(12), px(14), px(16))).encode()


def home(*_):
    for name in OTHERS:
        subprocess.run(["pkill", "-x", name], capture_output=True)


win = Gtk.Window()
GtkLayerShell.init_for_window(win)
GtkLayerShell.set_layer(win, GtkLayerShell.Layer.OVERLAY)
GtkLayerShell.set_namespace(win, "nb-box-home")
for edge, m in ((GtkLayerShell.Edge.LEFT, 14), (GtkLayerShell.Edge.BOTTOM, 14)):
    GtkLayerShell.set_anchor(win, edge, True)
    GtkLayerShell.set_margin(win, edge, round(m * Z))
GtkLayerShell.set_keyboard_mode(win, GtkLayerShell.KeyboardMode.NONE)   # (never takes the keyboard from the game)
prov = Gtk.CssProvider(); prov.load_from_data(CSS)
Gtk.StyleContext.add_provider_for_screen(win.get_screen(), prov, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
scr = win.get_screen(); vis = scr.get_rgba_visual()
if vis: win.set_visual(vis)
win.set_app_paintable(True)
box = Gtk.Box(spacing=round(8 * Z))
ico = Gtk.Image.new_from_icon_name("go-home-symbolic", Gtk.IconSize.LARGE_TOOLBAR); ico.set_pixel_size(round(24 * Z))
box.pack_start(ico, False, False, 0)
box.pack_start(Gtk.Label(label="Home"), False, False, 0)
btn = Gtk.Button(); btn.add(box); btn.connect("clicked", home)
win.add(btn)
win.connect("destroy", Gtk.main_quit)
win.show_all()

# ---- the phone controllers' QR code, bottom-right (pad-server.py's /api/state, every 2 s)
qst = {"m": None, "players": [], "qr": False}
qwin = Gtk.Window()
GtkLayerShell.init_for_window(qwin)
GtkLayerShell.set_layer(qwin, GtkLayerShell.Layer.OVERLAY)
GtkLayerShell.set_namespace(qwin, "nb-box-qr")
for edge in (GtkLayerShell.Edge.RIGHT, GtkLayerShell.Edge.BOTTOM):
    GtkLayerShell.set_anchor(qwin, edge, True); GtkLayerShell.set_margin(qwin, edge, round(14 * Z))
GtkLayerShell.set_keyboard_mode(qwin, GtkLayerShell.KeyboardMode.NONE)
if vis: qwin.set_visual(vis)
qwin.set_app_paintable(True)
QW, QH = round(150 * Z), round(186 * Z)
area = Gtk.DrawingArea(); area.set_size_request(QW, QH); qwin.add(area)


def rr(cr, x, y, w, h, r):
    import math
    cr.new_sub_path(); cr.arc(x + w - r, y + r, r, -math.pi / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    cr.arc(x + r, y + h - r, r, math.pi / 2, math.pi); cr.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2); cr.close_path()


def draw(_w, cr):
    m = qst["m"]
    if not m: return
    rr(cr, 0, 0, QW, QH, 14 * Z); cr.set_source_rgba(0.08, 0.085, 0.1, 0.9); cr.fill()
    pad_, side = 10 * Z, QW - 20 * Z
    rr(cr, pad_, pad_, side, side, 10 * Z); cr.set_source_rgb(1, 1, 1); cr.fill()
    q = side - 12 * Z; cell = q / len(m); ox = oy = pad_ + 6 * Z
    cr.set_source_rgb(0, 0, 0)
    for y, row in enumerate(m):
        for x, v in enumerate(row):
            if v: cr.rectangle(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5)
    cr.fill()
    cr.select_font_face("Inter"); cr.set_font_size(13 * Z); cr.set_source_rgb(1, 1, 1)
    t = "Scan to play"; e = cr.text_extents(t); cr.move_to((QW - e.width) / 2 - e.x_bearing, pad_ + side + 22 * Z); cr.show_text(t)
    ps = qst["players"]
    if ps:
        n = len(ps); r = 5 * Z; gap = 6 * Z; w = n * 2 * r + (n - 1) * gap; x0 = (QW - w) / 2 + r
        for i, p in enumerate(ps):
            c = p.get("color", "#888").lstrip("#"); cr.set_source_rgb(int(c[0:2], 16) / 255, int(c[2:4], 16) / 255, int(c[4:6], 16) / 255)
            import math
            cr.arc(x0 + i * (2 * r + gap), QH - 12 * Z, r, 0, 2 * math.pi); cr.fill()


area.connect("draw", draw)


def apply(st):
    show = bool(st and st.get("qr") and st.get("matrix"))
    if st: qst.update(m=st.get("matrix"), players=st.get("players", []), qr=show)
    if show: qwin.show_all(); area.queue_draw()
    else: qwin.hide()
    return False


def poll():
    while True:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8810/api/state", timeout=2) as r:
                st = json.load(r)
        except Exception:
            st = None
        GLib.idle_add(apply, st)
        time.sleep(2)


threading.Thread(target=poll, daemon=True).start()
Gtk.main()
