Nate Bloom as a Linux app, for Linux Mint 21 and 22 (and other Ubuntu-based systems).

**Install:** download **NateBloom-linux.deb** below and double-click it. Mint's package installer opens; choose **Install Package**. Or in a terminal: `sudo apt install ./NateBloom-linux.deb`. Nate Bloom then shows up in the menu under **Sound & Video**. Later versions install over this one and keep your sounds, songs and settings.

The **AppImage** runs without installing (make it executable, then double-click). On Mint 22 it needs `sudo apt install libfuse2t64` once.

What the app adds to the website:
- **Works offline.** The whole app is inside it; it updates itself from the website in the background and offers a restart when an update is ready. Studio instruments and library sounds are kept after their first download.
- **Fast pads.** Beat Pads plays from its own low-latency audio player (PipeWire or PulseAudio, else ALSA or JACK). The ⚡ button next to FX shows the delay.
- **Plugins** (Web Audio Modules), all inside the app so they work offline: Nate Bloom's own (Hall, Plate, Cloud, Tape Echo, Ensemble, Juno Chorus, Tape, Lo-Fi, Ladder Filter, Bus Compressor, Auto-Pan, Ring Mod, and the physical-model Marimba, Nylon Guitar, Violin, Flute, Clarinet and Voice), plus Synth-101, Spectrum: Modal, the DRM-16 drum sampler and the community effects. **Your own plugins** are in too: Twin 77, Duet 80, Nebula 80, Hypnagogia, Para Four, Stab 85, Pop 89, Unicorn Dream, Fuzz Bass, Ballad Kit and Glitch Starter, marked YOURS, with their own panels and presets. Under **Plugins** in the toolbar.
- **⚡ Fast plugins** (top of Plugins): your own plugins (YOURS) play from the app's own low-latency audio, the same DSP compiled into the app, so they answer sooner when you play them live. While it's on, Nate Bloom's effects, Takes and Tracks don't hear them.
- **Link with the tablet app** on the same Wi-Fi: **Link** in the toolbar → **Turn on**, then on the tablet ☰ → Link → Find computers (the first time it asks for the code this computer shows). Send projects either way, and **Play together**: one tempo, and Play and Stop start and stop both at the same moment. If you turned on Mint's firewall, let Link through once: `sudo ufw allow 47811/udp && sudo ufw allow 47812/tcp`.
- **Sound out:** MIDI → Sound out picks the output (a USB interface, headphones, HDMI). The fast pads follow it.
- **USB MIDI** through Linux's own MIDI: plug in the K.O. II and open MIDI → Connect. Velocity, pitch bend, the mod wheel, aftertouch and the sustain pedal all play, plugin instruments included.
- **Plugin effects anywhere:** on the whole mix, on one sound, or on Send A and Send B that every sound can feed.
- **Saves go to Downloads/Nate Bloom** (backups, WAVs, stems, MIDI files); the menu's **Open the Saves Folder** opens it.
- **Keeps playing when minimised**, and keeps the computer from sleeping while it plays.
- Full screen with **F11**; **View → Version** switches between Nate Bloom and Nate Bloom Lite.
