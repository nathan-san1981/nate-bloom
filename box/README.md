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

## The home screen

At power-on the box opens a main screen in the CarPlay style: the clock and what's playing on the left, pages of big
app icons on the right (eight to a page; swipe, or turn a controller's big knob, or a gamepad's bumpers to turn the
page). Tap an icon, or d-pad and A, or arrows and Enter. Settings is the last icon as well as the gear.

| Tile | What it is |
| --- | --- |
| **Nate Bloom** | the synth, drums, sampling and DJ (everything below). **⌂ Home** in Play's top bar comes back here. |
| **Keys** | piano lessons, with the MiniLab, KeyLab or the Yamaha. Settings › Raspberry Pi box › Home screen comes back. |
| **Listen** | the box becomes a speaker for your phone: pick **Nate Bloom Box** in Spotify or AirPlay (same Wi-Fi). It plays through whatever the box's sound goes to (the headphone adapter, the FiiO KA11 or Bluetooth headphones). YouTube and YouTube Music: tap the Cast icon and pick Nate Bloom Box. The box fetches and plays the music itself, so the phone is just the remote: lock it or walk away and the queue keeps going. If the box isn't in the Cast list, the Listen screen shows a TV code for YouTube › Settings › Watch on TV › Link with TV code. Stops when you leave the screen, unless **Keep playing** is on (below). |
| **Radio** | internet radio on the touch screen, no phone needed: favorites, search by name, by style, or the US list (stations from radio-browser.info). Plays as a Listen source, so Keep playing, the chip and the level fader work the same. |
| **Sheets** | sheet music and chord charts: PDFs from `~/Sheets` on the box (over SSH or a shared folder; subfolders are fine) or a USB stick. Page turns: tap the right or left half, arrow keys, the big knob, the controller's pads (pad 1 back, pad 2 forward), the sustain pedal (forward), or a gamepad's bumpers. It remembers the page you were on. |
| **Stream** | Moonlight: games from the GPU box (Sunshine) streamed over Wi-Fi, played with the Xbox controller. Set up with `bash box/stream-setup.sh` (Tailscale, 720p60 HEVC, pairing); `--boot-into-stream` starts straight into Steam at power-on. The GPU box side: `stream/`. |
| **Media** | Kodi for movies, music and photos from a USB stick or the network. Controller-driven; Power › Exit comes back. |
| **Retro** | games in RetroArch without rebooting: systems on the left (the ones with a core installed: NES, SNES, Game Boy, GBA, Genesis, DS, PlayStation, N64), games from `~/ROMs/<system>` on the box or `roms/<system>` on a stick. Xbox controller; the Guide button or Select + Start quits a game, the power button comes home. Save states are automatic. Music keeps playing under 8/16-bit and PlayStation games; N64 and PSP stop it. |
| **Games** | retro games from a Batocera USB stick (below), for anything RetroArch here can't run. Shows **No stick** until one is plugged in. |

- **The power button is Home:** press it from anything (Moonlight and Kodi included) to come back here; **hold it
  2 seconds to shut down**. When the box is off, a press turns it on.
- **Settings** (⚙ top right): Bluetooth pairing, what opens at power-on (home screen, Nate Bloom, Keys or Listen),
  the idle screen, restart, reboot, hold to shut down.
- **Idle screen** (off until you switch it on in Settings): after 2, 5, 10 or 20 minutes untouched, the screen shows
  a clock, the weather for the place you set (city or ZIP, °F or °C) and what's playing. Any touch, key, knob, pad
  or controller input brings the page back, and that input does nothing else. It covers the app's own pages (Nate
  Bloom, Keys, Listen, Radio, Sheets, Retro's picker, the home screen), not Moonlight, Kodi or a running game.

### Two things at once

One app on the screen, plus one music source under it: that's what the Pi 5 does well, and what the box allows.
Nate Bloom's sound engine comes first; the music player runs beside it at normal priority and is light (tens of MB).
Two screen apps never run together, and only one music source plays at a time (starting the radio or casting
YouTube replaces what was playing).

| On the screen | Music under it (Keep playing on) |
| --- | --- |
| Nate Bloom, Keys, Sheets, Radio, the home screen | yes |
| Stream (Moonlight) | yes; volume on the phone |
| Retro: NES, SNES, Game Boy, GBA, Genesis, DS, PlayStation | yes |
| Retro: N64, PSP | no (they want the whole Pi) |
| Media (Kodi), Games (Batocera) | no (their own sound; Batocera is its own OS) |

Compressed swap (zram, half of RAM) is the safety net: a memory spike slows things instead of ending them.

### Jam along: your phone's music under Nate Bloom or Keys

Turn on **Keep playing** on the Listen screen and the music carries on in Nate Bloom, Keys, the home screen and game
streams. While it plays:

- A green chip in the top bar shows the song. Tap it for the backing-track level, Mute and Stop. While that panel is
  open, the level fader (MiniLab fader 4, KeyLab fader 9) sets the backing track instead of Nate Bloom's master.
- The Listen tile on the home screen shows what's playing (tap it for the same panel), and the app you were last in
  is marked **Resume**.
- In a game stream, set the volume on the phone.
- Media and Games always stop it (Kodi and Batocera take over the sound). Keep playing is off until you turn it on.

### Typing without a keyboard

Text fields in Nate Bloom and Keys (sound names, profile names, Wi-Fi passwords) bring up an on-screen keyboard. Start
typing on a real keyboard and it steps aside.

### Bluetooth: keyboard, Xbox controller, headphones

Settings › **Find devices** with the device in pairing mode, then **Pair**. It reconnects by itself after that. If the keyboard needs a code, it appears on the screen: type it on the keyboard, then Enter.
- **A keyboard** types wherever there's a text field and plays notes in Nate Bloom. Keys' on-screen keyboard steps
  aside once you type on a real one. Touch and the controller still do everything; the keyboard is a nicety.
- **Xbox controller:** the Xbox One S and later models (Bluetooth, model 1708 and newer) pair here. The original 2013
  Xbox One controller has no Bluetooth: plug it in with a micro-USB cable instead. Wired always works with no setup.
- **Headphones or a speaker:** they become the sound output. Fine for Listen, Media and Stream; for playing Nate Bloom
  or Keys, use the wired adapter (Bluetooth adds a delay you can hear).

### Games: the Batocera stick

Batocera is its own system (200+ consoles: everything through PS1 runs perfectly, N64/Dreamcast/PSP well, GameCube
and many PS2 games playably). It lives on a USB stick so Nate Bloom's card is never touched. The installer sets the
box to start from USB first, then the card, so:
- **stick in** at power-on, or picking **Games** on the home screen = games;
- **stick out** = Nate Bloom as usual. (A USB stick of songs isn't bootable: the box skips it in a few seconds.)

Make the stick once (32 GB or more; ROMs go on it too):
1. Download Batocera for the **Raspberry Pi 5** from batocera.org/download (a `.img.gz`).
2. Plug the stick into the box and, over SSH: `bash box/make-game-stick.sh ~/batocera-*.img.gz /dev/sda`
   (the script only writes to a USB drive, asks you to type `yes`, sets up the 5" screen and turns the picture to
   landscape). If the picture comes up upside down, run it again with `--rotate 270`.
3. Copy games onto the stick's SHARE partition (or over the network, from Batocera's own menu).
Quit from Batocera's menu (Quit › Shut down), take the stick out, and the next power-on is Nate Bloom.

## Using Nate Bloom

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

- Packages: `cage`, `wlr-randr`, `exfatprogs`, `ntfs-3g`, PipeWire + WirePlumber, `rtkit`, BlueZ, `python3-evdev`, the ARM64 Nate Bloom package (or Chromium).
  For the home screen: `shairport-sync` and raspotify's `librespot`, `mpv` and the standalone `yt-dlp` in `/opt/nb-box/ytdlp` (Listen; their own services are switched off, the
  app runs them only while Listen is open), `moonlight-qt` from Moonlight's package repository (Stream), `kodi` (Media).
  Skip any with `--no-listen`, `--no-stream`, `--no-media`.
- `mpv` and the standalone `yt-dlp` in `/opt/nb-box/ytdlp` (YouTube casting, Radio), `poppler-utils` (Sheets), `retroarch` and
  Debian's `libretro-*` cores (Retro; `~/.config/retroarch/retroarch.cfg` gets fullscreen, auto save states and the
  quit combo), `zram-tools` (`/etc/default/zramswap`: zstd, 50 %). Folders `~/Sheets` and `~/ROMs/<system>`.
- The home screen, Listen, Radio, Sheets, Retro and Keys in `/opt/nb-box/apps`; `session.sh` runs Moonlight, Kodi or RetroArch when asked and comes
  back to the home screen; `/run/nb-box` passes those requests and the power button's "home".
- The power button: logind ignores it (`/etc/systemd/logind.conf.d/nb-box.conf`) and `nb-box-power.service` makes a
  press go home and a 2-second hold shut down.
- Boot order: USB first, then the card (`BOOT_ORDER=0xf614` in the Pi's EEPROM), for the Batocera stick. Keep the old
  order with `--no-games-boot`.
- `/boot/firmware/config.txt`: one marked `nb-box` block (Touch Display 2 overlay, `usb_max_current_enable=1` so the
  Pi powers the controller and the cable at full current, no splash) and HDMI audio on (an older install's `vc4-kms-v3d,noaudio`
  is undone), so a TV or monitor can play sound; a USB output is still preferred whenever it's plugged in. The original is kept as `config.txt.before-nb-box`.
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
| Screen upside down | Box… → Screen → the other button, or `sudo nb-box-helper rotate-270` over SSH (touch turns with it) |
| Taps open the wrong thing | `sudo nb-box-helper touch-rule` over SSH, then restart the app: it turns touch to match `ROTATE` in `/etc/nb-box.conf` |
| On a TV or monitor the text is small from across the room | The box fills any screen at its own resolution. Text size **Auto** (the default) is 1.333× on the 5" panel and 1× on anything taller than 800 px; Box… → Text size → Small, Medium or Large forces one (or `SCALE=` in `/etc/nb-box.conf`). |
| Black screen | `journalctl -u nb-box -b` over SSH; check the ribbon is in DISP 1 (or reinstall with `--dsi0`) |
| No sound | is the chip showing your cable? `wpctl status` over SSH lists outputs; try another USB port |
| Clicks or dropouts | ⚡ low power showing? Use the 45 W supply. Otherwise Settings › App › sound buffer: Steady |
| App closes right after starting (screen flashes back) | rerun the installer with `--4k-kernel` (the Pi 5's default kernel uses 16 KB memory pages) |
| Radio finds nothing | the box needs internet for the station list (radio-browser.info); favorites still play |
| A sheet's page is slow to appear | the first look at each page is drawn and kept (`~/.config/nate-bloom/sheets-cache`); after that it's instant. The next page is drawn ahead |
| A Retro system says "no core installed" | `sudo apt install libretro-<name>` over SSH (the installer tries nestopia, snes9x, gambatte, mgba, genesisplusgx, desmume, beetle-psx, mupen64plus) |
| YouTube casting stops working | YouTube changed something: the box updates yt-dlp once a day by itself; to do it now, `/opt/nb-box/ytdlp/yt-dlp -U` over SSH. AirPlay from the YouTube app still works meanwhile |
| Listen doesn't show up on the phone | phone and box on the same Wi-Fi? Leave Listen and open it again; `systemctl status avahi-daemon` over SSH |
| Moonlight or Kodi stuck | press the power button once: it closes them and the home screen comes back |
| Bluetooth keyboard won't pair | put it in pairing mode right before **Find devices**. If it wants a code, the box shows it large: type it on the keyboard and press Enter. A device that shows its own code gets a keypad on the screen. |
| Games boots Nate Bloom instead | the stick isn't seen as bootable: remake it; check `sudo rpi-eeprom-config` shows `BOOT_ORDER=0xf614` |
| Want the desktop back | `sudo systemctl disable nb-box && sudo systemctl enable getty@tty1 && sudo reboot` |
