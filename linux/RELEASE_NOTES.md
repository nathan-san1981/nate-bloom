Nate Bloom as a Linux app, for Linux Mint 21 and 22 (and other Ubuntu-based systems).

**Install:** download **NateBloom-linux.deb** below and double-click it. Mint's package installer opens; choose **Install Package**. Or in a terminal: `sudo apt install ./NateBloom-linux.deb`. Nate Bloom then shows up in the menu under **Sound & Video**. Later versions install over this one and keep your sounds, songs and settings.

The **AppImage** runs without installing (make it executable, then double-click). On Mint 22 it needs `sudo apt install libfuse2t64` once.

What the app adds to the website:
- **Works offline.** The whole app is inside it; it updates itself from the website in the background and offers a restart when an update is ready. Studio instruments and library sounds are kept after their first download.
- **Fast pads.** Beat Pads plays from its own low-latency audio player (PipeWire or PulseAudio, else ALSA or JACK). The ⚡ button next to FX shows the delay.
- **USB MIDI** through Linux's own MIDI: plug in the K.O. II and open MIDI → Connect.
- **Saves go to Downloads/Nate Bloom** (backups, WAVs, stems, MIDI files); the menu's **Open the Saves Folder** opens it.
- **Keeps playing when minimised**, and keeps the computer from sleeping while it plays.
- Full screen with **F11**; **View → Version** switches between Nate Bloom and Nate Bloom Lite.
