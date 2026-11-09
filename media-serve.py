#!/usr/bin/env python3
"""media-serve — a small always-on web server for the stems library, with seeking (HTTP Range) support.

Python's built-in http.server sends whole files only, so browsers and players can't jump ahead in a track.
This one answers Range requests, so the seek bar works everywhere (browser, Purist, VLC...).

  media-serve.py "/srv/tandem-pool/All stems" --port 8000
  media-serve.py --install "/srv/tandem-pool/All stems"     run it as a user service: starts at boot, restarts itself
"""
import argparse
import html
import http.server
import os
import re
import socketserver
import subprocess
import sys
import urllib.parse
from pathlib import Path


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def copy_range(self, f, start, length):
        f.seek(start)
        left = length
        while left > 0:
            b = f.read(min(1 << 16, left))
            if not b:
                break
            try:
                self.wfile.write(b)
            except (BrokenPipeError, ConnectionResetError):
                return  # the player skipped or stopped: normal
            left -= len(b)

    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return self.listing(path)
        if not os.path.isfile(path):
            return self.send_error(404, "Not found (refresh the list: the file may have just been converted to FLAC)")
        size = os.path.getsize(path)
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            end = min(end, size - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as f:
            self.copy_range(f, start, end - start + 1)

    def listing(self, path):
        names = sorted(os.listdir(path), key=str.lower)
        rel = urllib.parse.unquote(self.path.split("?")[0])
        rows = []
        for n in names:
            if n.startswith("."):
                continue
            full = os.path.join(path, n)
            href = urllib.parse.quote(n + ("/" if os.path.isdir(full) else ""))
            rows.append(f'<li><a href="{href}">{html.escape(n)}{"/" if os.path.isdir(full) else ""}</a></li>')
        body = (f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                f"<title>{html.escape(rel)}</title><style>body{{font:15px system-ui;margin:16px}}li{{margin:6px 0}}"
                f"input{{font-size:15px;padding:6px;width:100%;max-width:420px}}</style>"
                f"<h2>{html.escape(rel)}</h2><input placeholder='Filter' oninput=\"for(const l of document.querySelectorAll('li'))"
                f"l.style.display=l.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none'\">"
                f"<ul>{''.join(rows)}</ul>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def install(folder, port):
    unit = Path.home() / ".config/systemd/user/media-serve.service"
    unit.parent.mkdir(parents=True, exist_ok=True)
    unit.write_text(f"""[Unit]
Description=Stems library web server (with seeking)
After=network-online.target

[Service]
ExecStart={sys.executable} {Path(__file__).resolve()} "{folder}" --port {port}
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=default.target
""")
    user = os.environ.get("USER") or ""
    subprocess.run(["loginctl", "enable-linger", user])  # keep running with nobody logged in
    subprocess.run(["systemctl", "--user", "daemon-reload"])
    subprocess.run(["systemctl", "--user", "enable", "--now", "media-serve.service"])
    subprocess.run(["systemctl", "--user", "restart", "media-serve.service"])
    print(f"Installed: serving {folder} on port {port}, at boot and after any crash.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--install", action="store_true", help="run as a user service (starts at boot)")
    a = ap.parse_args()
    folder = str(Path(a.folder).expanduser().resolve())
    if a.install:
        return install(folder, a.port)
    os.chdir(folder)
    srv = Server(("0.0.0.0", a.port), Handler)
    print(f"Serving {folder} on port {a.port} (with seeking). Ctrl-C stops.", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
