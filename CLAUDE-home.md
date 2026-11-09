# Nathan's home setup — context for Claude Code

Nathan works terminal-first (SSH from iPhone/ShellFish, Pixelbook, ThinkPad). Ask before anything destructive
(deleting, formatting, restarting services mid-job). Never delete original audio. Write for a capable reader, no filler.

## Machines
| Machine | Role | Desk net (cable) | Home Wi-Fi | Tailscale |
|---|---|---|---|---|
| ThinkPad P14s Gen 5 (Ryzen 7 PRO 8840HS, 32 GB) | workstation, Tandem desktop app | 10.77.0.52 | 192.168.4.186 | 100.66.13.117 |
| Beelink SER5 Pro (Ryzen 7 PRO 5850U, 64 GB, 500 GB NVMe) | server: Tandem worker, shared pool, Immich, files | 10.77.0.10 | 192.168.4.185 | 100.116.65.1 |
| GPU box (i7-9700F, 16 GB, GTX 1660 Ti 6 GB, driver 595) | headless GPU worker (Prism stems, NVENC), Sunshine | 10.77.0.51 | none | 100.65.30.77 |
- Linux Mint everywhere. GPU box has no Wi-Fi: internet goes through the Beelink over the desk cable.
- Desk network 10.77.0.0/24 is private (EdgeRouter X, being replaced by a TP-Link TL-SG105 switch). Never link it to the home router.
- GPU box: sleep is masked (freeze investigation after suspend/resume); Ethernet pause frames off; health log every 30 s in ~/logs/health.log.
- At home, Tailscale on the Pixelbook spikes; use LAN addresses there.

## Tandem (Nathan's own app, built with Claude in claude.ai)
- Splits heavy work (video encodes, Kdenlive renders, Prism stem separation, Song X-ray, builds) across the three machines.
- Installed from a .deb: code in /usr/lib/tandem (tandem.py, tandem_tools.py, tandem_video.py), command `tandem`.
- Version 1.4.1 (Nov 8 2026). Releases come from GitHub branch `tandem-dist` of nathan-san1981/nate-bloom
  (raw.githubusercontent.com/nathan-san1981/nate-bloom/tandem-dist/<file>); `bash tandem-update.sh` on the ThinkPad updates all three.
- Servers run it as the system service `tandem-worker` (`systemctl status tandem-worker`, `journalctl -u tandem-worker`).
  The ThinkPad runs it as a desktop app (`tandem agent` in the background, window at http://127.0.0.1:8740).
- Config ~/.config/tandem/, data and logs ~/.local/share/tandem/ (agent.log), results ~/Tandem/Done.
- Local API on port 8740: GET /api/ping, /api/state; POSTs need header `X-Tandem-UI: 1`
  (e.g. POST /api/jobs {"type":"stems","paths":[...],"opts":{"stems":"4"}}, POST /api/job/<id>/cancel, POST /api/settings {"play_mode":true}).
- Shared pool: /srv/tandem-pool on the Beelink's drive, NFS-mounted on the others. Inboxes: /srv/tandem-pool/Inbox/<job label>/
  (drop a folder = one batch); pool results in /srv/tandem-pool/Done; failed files parked in Inbox/<label>/Not done.
- 1.4.1 scheduling: GPU jobs reserve 2 CPU cores only while running; a server under 50% measured CPU may take one job past its
  slots; straggler pieces get a second copy at 1.0× typical time; learned speeds skip crowded/raced jobs.
- Teamwork benchmark: ~/Downloads/tandem-teamwork-test.py --max (results ~/Tandem/*.txt). 1.4.0 runs: 16:02 and 11:59.

## The 80s stems batch (running Nov 8–10 2026)
- ~1,000 songs in /srv/tandem-pool/Inbox/Separate stems/80s Hits → Prism, 2 stems, Best quality, mostly on the GPU box.
- Results: /srv/tandem-pool/Done/80s Hits/<...>/<Song>/<Song> - Vocals.wav / - Instrumental.wav (+ the original moved beside them).
- Cron every 10 min on the Beelink: ~/stems-flac.py (32-bit WAV → verified 24-bit FLAC, skips peaks > 0 dBFS) then
  ~/stems-collect.py (hard-links originals and stems into /srv/tandem-pool/All stems as "<Song>.mp3", "<Song> - vocals.flac",
  "<Song> - instrumental.flac"). Logs ~/stems-flac.log, ~/stems-collect.log.
- `~/stems-status` = progress, finish estimate, failures, machines, GPU health, disk.
- Library web server with seeking: ~/media-serve.py as user service `media-serve` on port 8000 (serves All stems).
- Next: ~/samplehunt.py run "/srv/tandem-pool/All stems" --out /srv/tandem-pool/Samples (scores 2/4/8-bar stretches, chops, hits
  across the library; 9 categories), `serve` (audition page with 👍/👎, port 8765, learning re-rank), `restem` (queue best ~200 songs
  for 4-stem splits in Tandem). Analysis cache in Samples/.cache.
- Open issue: Nathan says some vocals "sound off" — find out whether it's separation artifacts, clipping, sample rate or playback.

## Other services on the Beelink
- Immich photo server: /srv/immich (docker compose), port 2283. Separate accounts for Nathan and his wife (photos must never mix).
- cloud-setup.sh (Nextcloud + Vaultwarden over Tailscale HTTPS) published on tandem-dist; may or may not be installed yet.
- Disk: ~180 GB free on the 500 GB NVMe; a second drive is planned. USB drive not set up yet.

## GPU box game streaming (scripts published, not yet run)
- stream-host-setup.sh (Sunshine, NVENC, KMS, autologin Cinnamon/X11, HDMI dummy plug on the 1660 Ti), stream-pi-setup.sh (Pi 5 Moonlight).
