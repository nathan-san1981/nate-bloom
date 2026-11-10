#!/usr/bin/env python3
"""Nate Bloom Box: an on-screen Home button over Kodi, Moonlight and RetroArch (box/home-button.py).
They run in a small labwc inside cage (outside.sh); this sits on labwc's overlay layer, above even a full-screen
game, bottom-left like the app's own Home button. Tapping it closes the program, the same as a short press of the
power button, and session.sh brings the home screen back."""
import subprocess
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("GtkLayerShell", "0.1")
from gi.repository import Gtk, GtkLayerShell

OTHERS = ["moonlight-qt", "kodi.bin", "kodi", "retroarch"]
CSS = b"""
window { background: transparent; }
button { min-height: 44px; padding: 0 16px 0 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.22);
         background: rgba(20,21,26,.82); color: #fff; font: 600 16px Inter, "Noto Sans", sans-serif; box-shadow: none; }
button:hover, button:active { background: rgba(60,62,72,.95); }
"""


def home(*_):
    for name in OTHERS:
        subprocess.run(["pkill", "-x", name], capture_output=True)


win = Gtk.Window()
GtkLayerShell.init_for_window(win)
GtkLayerShell.set_layer(win, GtkLayerShell.Layer.OVERLAY)
GtkLayerShell.set_namespace(win, "nb-box-home")
for edge, m in ((GtkLayerShell.Edge.LEFT, 14), (GtkLayerShell.Edge.BOTTOM, 14)):
    GtkLayerShell.set_anchor(win, edge, True)
    GtkLayerShell.set_margin(win, edge, m)
GtkLayerShell.set_keyboard_mode(win, GtkLayerShell.KeyboardMode.NONE)   # (never takes the keyboard from the game)
prov = Gtk.CssProvider(); prov.load_from_data(CSS)
Gtk.StyleContext.add_provider_for_screen(win.get_screen(), prov, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
scr = win.get_screen(); vis = scr.get_rgba_visual()
if vis: win.set_visual(vis)
win.set_app_paintable(True)
box = Gtk.Box(spacing=8)
box.pack_start(Gtk.Image.new_from_icon_name("go-home-symbolic", Gtk.IconSize.LARGE_TOOLBAR), False, False, 0)
box.pack_start(Gtk.Label(label="Home"), False, False, 0)
btn = Gtk.Button(); btn.add(box); btn.connect("clicked", home)
win.add(btn)
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()
