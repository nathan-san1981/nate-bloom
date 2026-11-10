Nate Bloom for the **Nate Bloom Box**: the Linux app built for ARM64, for a Raspberry Pi 5 running Raspberry Pi OS (64-bit).

**Install:** don't download this by hand — run the box installer on the Pi (it fetches `NateBloom-pi-arm64.deb` from here):

```sh
curl -fsSL https://raw.githubusercontent.com/nathan-san1981/nate-bloom/main/box/install.sh | bash
```

Instructions, parts and troubleshooting: `box/README.md` in the repository. Once installed, **Box… → Check for an update** in Play installs newer versions from this page.

**New: Karaoke.** A Karaoke tile on the home screen opens the karaoke big screen from another computer on your
Wi-Fi (KARAOKE= and KARAOKE_CERT= in /etc/nb-box.conf): songs stream from there and nothing is kept on the box.
Phones scan the QR code and sing into their own mic.

**New: any screen.** The box fills whatever it's plugged into at that screen's own resolution: the 5" panel, a
monitor or a TV over HDMI. Text size Auto (the new default) is 1.333× on the panel and 1× on a TV or monitor; Small,
Medium and Large still force one. Run the box installer again to get it.

**New: a CarPlay-style main screen.** Pages of big icons that scroll sideways, the clock and what's playing beside them.

**Radio, Sheets, Retro and an idle screen.** Internet radio on the touch screen; sheet music and chord charts
(PDFs from `~/Sheets` or a stick, page turns from the pads, the pedal or a tap); RetroArch games without rebooting
into the stick (NES to PlayStation keep the music going); and, off until you switch it on, a clock-and-weather screen
when the box sits untouched. One app on the screen plus one music source is the rule; zram is the safety net. Run the
box installer again to add them.

**YouTube casting.** Listen now shows up behind the Cast button in YouTube and YouTube Music; the box plays the
music itself and the phone is the remote. Run the box installer again to add it (mpv and yt-dlp).

**Jam along.** Turn on Keep playing in Listen and your phone's Spotify, YouTube or AirPlay music
keeps going under Nate Bloom, Keys and game streams, with a chip in the top bar for the level and Stop. Bluetooth
keyboards that want a pairing code now show it on the screen, and text fields get an on-screen keyboard.

**The home screen.** Power on to six choices: Nate Bloom, Keys (piano lessons), Listen (Spotify Connect and
AirPlay), Stream (Moonlight PC games), Media (Kodi) and Games (a Batocera USB stick). The power button is Home (hold
2 s to shut down), and Settings pairs a Bluetooth keyboard, Xbox controller or headphones. Run the box installer again
to get it: the new pieces install alongside, nothing is lost.

