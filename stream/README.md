# Game streaming: GPU box → iPhone and the Nate Bloom Box

Sunshine (NVENC) on the headless GPU box; Moonlight on the iPhone and on the Pi 5 box. Every client reaches the
GPU box over **Tailscale**: the box sits on the private desk network behind the Beelink, which the home Wi-Fi can't see.

| Step | Where | Command | Reboot / physical |
| --- | --- | --- | --- |
| 1 | GPU box | `bash gpu-box-setup.sh --check` (distro, driver, display, Tailscale; changes nothing) | — |
| 2 | GPU box | plug a **4K HDMI dummy plug** into the GTX 1660 Ti | **physical** (recommended; without it a virtual monitor is used, slower capture) |
| 3 | GPU box | `bash gpu-box-setup.sh` | **reboot** after the first run, then run it again to confirm |
| 4 | Pi box | `bash box/stream-setup.sh` (add `--boot-into-stream` to start straight into Steam) | — |
| 5 | iPhone | Moonlight → + → `gpu-box` → PIN → `gpu-box-pin <PIN> iphone` on the GPU box | — |

Pairing from the terminal: Moonlight shows a PIN; on the GPU box run `gpu-box-pin <PIN> <name>`.

Choices made: X11 (not Wayland) with LightDM autologin; KMS capture + NVENC (P1 preset) with a dummy plug, X11 capture
on a virtual monitor without one; the screen follows each client (1280×720 for the Pi, 1920×1080 for the phone);
apps: Desktop and Steam Big Picture. Full guide and settings: see the Claude doc "GPU box game streaming".
