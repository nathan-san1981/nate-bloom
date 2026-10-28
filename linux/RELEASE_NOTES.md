Nate Bloom as a Linux app, for Linux Mint 21 and 22 (and other Ubuntu-based systems).

**Install:** download **NateBloom-linux.deb** below and double-click it. Mint's package installer opens; choose **Install Package**. Or in a terminal: `sudo apt install ./NateBloom-linux.deb`. Nate Bloom then shows up in the menu under **Sound & Video**. Later versions install over this one and keep your sounds, songs and settings.

The **AppImage** runs without installing (make it executable, then double-click). On Mint 22 it needs `sudo apt install libfuse2t64` once.

What the app adds to the website:
- **Works offline.** The whole app is inside it; it updates itself from the website in the background and offers a restart when an update is ready. Studio instruments and library sounds are kept after their first download.
- **Fast pads.** Beat Pads plays from its own low-latency audio player (PipeWire or PulseAudio, else ALSA or JACK). The ⚡ button next to FX shows the delay.
- **Plugins** (Web Audio Modules), all inside the app so they work offline: Nate Bloom's own (Hall, Plate, Cloud, Tape Echo, Ensemble, Juno Chorus, Tape, Lo-Fi, Ladder Filter, Bus Compressor, Auto-Pan, Ring Mod, and the physical-model Marimba, Nylon Guitar, Violin, Flute, Clarinet and Voice), plus Synth-101, Spectrum: Modal, the DRM-16 drum sampler and the community effects. Under **Plugins** in the toolbar.
- **USB MIDI** through Linux's own MIDI: plug in the K.O. II and open MIDI → Connect. Velocity, pitch bend, the mod wheel, aftertouch and the sustain pedal all play, plugin instruments included.
- **Plugin effects anywhere:** on the whole mix, on one sound, or on Send A and Send B that every sound can feed.
- **Saves go to Downloads/Nate Bloom** (backups, WAVs, stems, MIDI files); the menu's **Open the Saves Folder** opens it.
- **Keeps playing when minimised**, and keeps the computer from sleeping while it plays.
- Full screen with **F11**; **View → Version** switches between Nate Bloom and Nate Bloom Lite.
