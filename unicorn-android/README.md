# Unicorn Clock for Fire tablets

A bedside unicorn weather clock for young kids, as a small Android app for Amazon Fire tablets (and any Android
tablet). Free and open source (MIT). Everything is built in and works offline, except fresh weather, which
falls back to the saved forecast.

- Clock, bedtime and wake-up rainbow, weather and what to wear, alarms, timers, notes and voice notes, sun,
  moon and space screens, Unicorn Music, three games (Unicorn Run, Unicorn Run 2, Unicorn Dungeon)
- Opens by itself when the tablet turns on, full screen, and comes straight back if Home or Recents is pressed
  (or if it's swiped away in Recents); the Back key just closes whatever is open on the clock
- Grown-up settings (behind the PIN) are the only way out
- Real backlight dimming at bedtime; the tablet's own voice reads aloud anything you type (names, reminders)

**Download:** [UnicornClock.apk](https://github.com/nathan-san1981/nate-bloom/releases/download/unicorn-clock/UnicornClock.apk)

## Install on a Fire tablet

1. On the Fire (grown-up profile): **Settings → Security & Privacy → Apps from Unknown Sources**, and turn it on
   for **Silk Browser**.
2. In Silk, open the download link above, then open the downloaded **UnicornClock.apk** and tap **Install**.
3. Open **Unicorn Clock**. Allow the microphone (voice notes) and location (the weather's "Find this tablet")
   if it asks. If Android shows its one-time "Viewing full screen" tip, tap **Got it**.
4. Open grown-up settings (tap the moon bedtime button on the clock, or hold the clock for 3 seconds) and set a
   **Grown-up PIN** in the box at the top. The **Tablet app** buttons (Exit, Pin, Let it open by itself, Voice
   settings) stay hidden until there is a PIN, so a little one can't tap her way out.
5. Let it come back by itself and open at start-up: under **Tablet app**, tap **Let it open by itself**, then turn
   on **Display over other apps** for Unicorn Clock and go back.

That's it. The **Tablet app** box in grown-up settings shows what's working.

## Moving over from Fully Kiosk

Settings, alarms, notes, voice notes, stars and calendar dates live in the old clock, so bring them across once:

1. In the clock in Fully Kiosk: grown-up settings → **Backup** → **Save a backup**. That also copies it.
2. In Unicorn Clock: grown-up settings → **Backup** → **Paste a backup**. Long-press the box, choose **Paste**,
   then tap **Restore pasted backup**. Or use **Restore from file** and pick the saved backup file.

Then remove Fully Kiosk from the tablet's start-up, so only one of them opens.

## Leaving the clock (grown-ups)

Grown-up settings → **Tablet app** → **Exit to the tablet**. Opening Unicorn Clock again turns everything back on.

**Pin the clock** in the same box is a stronger lock: Home and Recents stop working altogether. Android asks
to confirm it each time, so it's optional. To unpin, hold Back and Home together, or use Exit to the tablet.

## Optional: full lockdown (device owner)

For a tablet that does nothing but the clock (no status bar, no way out without the PIN), make the app the
device owner with a computer and a USB cable. Android only allows this on a tablet with no other user
profiles or accounts, so it usually means a factory reset first.

```
adb shell dpm set-device-owner com.unicornclock.app/.AdminReceiver
```

Undo it any time from grown-up settings → Tablet app → **Undo full lockdown** (tap it twice). In full lockdown the
microphone and location are allowed up front, since permission prompts can't always show there.

## If something's off

- **Typed words aren't read aloud:** Tablet app → **Voice settings**, and make sure an English voice is installed
  and set as the default.
- **Doesn't open at start-up or come back after Home:** Tablet app → **Let it open by itself** → turn on
  **Display over other apps**.
- **The clock looks stuck:** it restarts itself after a crash. If it crashes 3 times within 10 minutes it stops
  reopening by itself (so a broken update can never take over the tablet); open it from its icon, or hold the
  power button and choose Restart.
- **Tablet app buttons are missing:** set a Grown-up PIN first (top of grown-up settings).

## Building it

`unicorn-android/` is a standard Android project (Kotlin, one screen with a WebView). The clock page is
`app/src/main/assets/unicorn-clock.html`. GitHub Actions (`.github/workflows/unicorn-android.yml`) builds the APK
and checks it on Fire-sized Android 9 and 11 emulators (what Fire OS 7 and 8 are built on).

**Signing.** Every build is signed with the same key, so updates install over the old copy and keep her
settings. CI uses the private key in `keystore/release.jks.enc` when the repository has the `UNICORN_KEY_PASS`
Actions secret (Settings → Secrets and variables → Actions); without it, it uses the public test key in
`keystore/unicornclock.jks`. `signing.txt` in each CI run says which key signed it. Pick one before installing on
a tablet: switching keys later means uninstalling, which clears the app's data (save a backup first).

Older Fire tablets run older web engines (Chrome 69 on Android 9). The clock page is built to
use only syntax those engines read, with `inset` and `clamp()` written out longhand and a flex-gap stand-in that
switches on where flex `gap` is missing.

The page talks to the app through the same `fully.*` calls Fully Kiosk offers (`setScreenBrightness`,
`textToSpeech`, `stopTextToSpeech`, `getAudioVolume`, `setAudioVolume`), plus `unicornApp.*` for the kiosk
extras, so the same page works in both.

## Licenses

The app's own code is MIT (see LICENSE). The clock bundles Brogue CE (AGPL-3.0; source:
[brogue-source.tar.gz](https://nathan-san1981.github.io/nate-bloom/brogue/brogue-source.tar.gz)) and its tiles
(CC BY-SA 4.0), the Fredoka font (SIL OFL 1.1), and voice clips made with Kokoro-82M (Apache-2.0).
