# Nate Bloom Box

Nate Bloom as a standalone instrument: a Raspberry Pi 5 with the 5" Touch Display 2 in the Waveshare
PI5-CASE-TD2-5inch, a controller (MiniLab 3, KeyLab Essential 61 mk3, the Yamaha, any class-compliant USB MIDI
keyboard) and headphones through a USB-A-to-3.5 mm adapter. Power on and it opens straight into Play.

What runs: the Nate Bloom Linux app built for ARM64 (`.github/workflows/pi.yml`, release `pi-latest`), started full
screen by `cage` with `--box`. It's the same app as on the ThinkPad — native synth engine on its own threads, fast
pads, offline, updates itself. If the ARM64 package isn't available the installer falls back to the website in a
Chromium kiosk.

## Parts

| Part | Notes |
| --- | --- |
| CanaKit Raspberry Pi 5 Essentials kit, 4 GB | Pi 5, Active Cooler, 45 W USB-C supply, 32 GB card (its case isn't used) |
| Raspberry Pi Touch Display 2, 5" | DSI ribbon (22-to-15 pin for the Pi 5) and GPIO power leads are in its box |
| Waveshare PI5-CASE-TD2-5inch | the back cover; the screen is the front. File the USB openings if they don't line up |
| ¼"-20 to M4 adapter | case base → the UBeesize ball head |
| USB-A to 3.5 mm headphone adapter | a USB sound card; into any USB-A port (the Pi 5 has no headphone jack) |

## Put it together

1. Active Cooler onto the Pi (clips into the two holes, fan cable into the FAN header).
2. Screen face down on a cloth. Ribbon: the wide end into the screen, the narrow end into the Pi's **CAM/DISP 1**
   connector (if it only reaches port 0, run the installer with `--dsi0`). Contacts face the board on both ends.
3. The power lead from the screen to the Pi's GPIO header, exactly as the leaflet in the screen's box shows (red is
   5 V, black is ground; the wrong pins can damage the screen, so check before powering on).
4. Pi onto the screen's standoffs with the M2.5 screws, then the Waveshare cover over it (silicone power-button cap
   first), black M2.5 screws.
5. Adapter into the case's M4 hole, then onto the tripod.

## Set up the card (once, about 15 minutes)

1. **Raspberry Pi Imager** on the ThinkPad → Raspberry Pi 5 → **Raspberry Pi OS Lite (64-bit)**. In the settings:
   a user name and password, your Wi-Fi, **SSH on**, hostname `natebloom-box`.
2. Card into the Pi, power on, wait two minutes (the screen shows a text console, possibly sideways — fine).
3. From the ThinkPad or ShellFish on the iPhone: `ssh <user>@natebloom-box.local`, then:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/nathan-san1981/nate-bloom/main/box/install.sh | bash
   ```

   It installs everything, tunes the system, and reboots into Nate Bloom.
   Options go after `bash -s --`, e.g. `… | bash -s -- --dsi0 --rotate 270`.

## Using it

- Plug in the controller and the headphone cable before or after power-on; both are picked up when plugged in.
- The MiniLab's big knob turns through sounds, pads play the drums, knobs and faders follow the screen.
  Shift + turn changes knob pages, click stars the sound, Shift + click samples the last 2 bars onto a pad.
- **Sample** (Play): grab 1–8 bars of what you just played, or record the mic, onto pads S1–S4.
- **DJ** (top bar in Play) opens the two decks; **▶ Play** goes back. Plug in a USB stick and tap a deck's
  **Load… → Song file…**: the stick's songs are listed by folder. Big knob picks, click loads, Shift + click closes.
  The stick is mounted read-only — nothing on it is changed — and can be pulled at any time.
- **Box…** (top bar in Play): text size, turning the screen if it's upside down, Wi-Fi, app update, restart, reboot,
  and **hold to shut down**. Pulling the power is safe too (logs live in memory), but shut down when you can.
- The chips next to Box… show the temperature, **⚡ low power** if the supply or battery can't keep up (use the 45 W
  supply or a 27 W+ PD battery), and which headphone output is in use.

## What the installer changes

- Packages: `cage`, `wlr-randr`, `exfatprogs`, `ntfs-3g`, PipeWire + WirePlumber, `rtkit`, the ARM64 Nate Bloom package (or Chromium).
- `/boot/firmware/config.txt`: one marked `nb-box` block (Touch Display 2 overlay, `usb_max_current_enable=1` so the
  Pi powers the controller and the cable at full current, no splash) and HDMI audio off (`vc4-kms-v3d,noaudio`) so the
  USB cable is the only sound output. The original is kept as `config.txt.before-nb-box`.
- Sound: PipeWire fixed at 48 kHz with 256-frame buffers, a USB output always preferred and never suspended,
  real-time limits for the `audio` group.
- Steadiness: CPU governor `performance`, the journal in memory, Wi-Fi power saving off, printing/modem/apt timers off;
  on the kernel command line `usbcore.autosuspend=-1` (the headphone adapter and controller never doze) and
  `threadirqs`. The native synth engine gets three threads (`NB_ENG_THREADS=3` in `session.sh`).
- Start-up: `nb-box.service` runs `cage` on tty1 as your user; `nb-box-helper` (allowed by `/etc/sudoers.d/nb-box`,
  nothing else) does the few root jobs Box… needs.
- USB sticks: a udev rule starts `nb-box-usb@.service`, which mounts the stick read-only under `/media/nb-usb`
  (FAT, exFAT, NTFS, ext4).

## If something's off

| What | Do |
| --- | --- |
| Screen upside down | Box… → Screen → the other button, or `sudo nb-box-helper rotate-270` over SSH |
| Black screen | `journalctl -u nb-box -b` over SSH; check the ribbon is in DISP 1 (or reinstall with `--dsi0`) |
| No sound | is the chip showing your cable? `wpctl status` over SSH lists outputs; try another USB port |
| Clicks or dropouts | ⚡ low power showing? Use the 45 W supply. Otherwise Settings › App › sound buffer: Steady |
| App closes right after starting (screen flashes back) | rerun the installer with `--4k-kernel` (the Pi 5's default kernel uses 16 KB memory pages) |
| Want the desktop back | `sudo systemctl disable nb-box && sudo systemctl enable getty@tty1 && sudo reboot` |
