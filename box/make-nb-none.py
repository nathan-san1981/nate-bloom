#!/usr/bin/env python3
"""Writes the invisible cursor theme nb-none into DIR (default /usr/share/icons/nb-none): one transparent 1x1 Xcursor
image, linked under every cursor name, so nothing shows a pointer."""
import os, struct, sys
d = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/icons/nb-none"
os.makedirs(os.path.join(d, "cursors"), exist_ok=True)
img = struct.pack("<IIIIIIIII", 36, 0xfffd0002, 1, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
cur = b"Xcur" + struct.pack("<III", 16, 0x10000, 1) + struct.pack("<III", 0xfffd0002, 1, 16 + 12) + img
open(os.path.join(d, "cursors", "left_ptr"), "wb").write(cur)
names = """default arrow top_left_arrow pointer hand hand1 hand2 pointing_hand text xterm ibeam wait watch progress
left_ptr_watch half-busy crosshair cross move fleur grab grabbing openhand closedhand all-scroll not-allowed no-drop
forbidden help question_arrow whats_this context-menu cell copy alias dnd-move dnd-copy dnd-link dnd-none
col-resize row-resize n-resize s-resize e-resize w-resize ne-resize nw-resize se-resize sw-resize ew-resize ns-resize
nesw-resize nwse-resize sb_h_double_arrow sb_v_double_arrow size_hor size_ver size_bdiag size_fdiag size_all
top_side bottom_side left_side right_side top_left_corner top_right_corner bottom_left_corner bottom_right_corner
vertical-text zoom-in zoom-out pirate X_cursor right_ptr center_ptr link split_h split_v up-arrow""".split()
for n in names:
    p = os.path.join(d, "cursors", n)
    if os.path.lexists(p): os.remove(p)
    os.symlink("left_ptr", p)
open(os.path.join(d, "index.theme"), "w").write("[Icon Theme]\nName=nb-none\nComment=No pointer (Nate Bloom Box touch screen)\n")
print("wrote", d)
