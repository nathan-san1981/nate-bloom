package com.natebloom.app

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * The tablet's own view of what's plugged in, for Nate Bloom's Gear panel and its reports (NBNativeBridge.diag):
 * every USB device Android can see and whether it offers sound or MIDI, the audio outputs Android has and the one
 * media goes to, the media volume, Android's MIDI devices, what else is playing, and whether Purist is installed.
 * Nothing here is held open or changed; it's read fresh on each call. Every part is guarded: a part that fails
 * says so instead of losing the rest.
 */
object Diag {

    private val PURIST = listOf("com.purist.player", "com.purist", "com.purist.app")   // (also listed in the manifest's <queries>)

    fun json(ctx: Context): String {
        val o = JSONObject()
        o.put("app", BuildConfig.VERSION_NAME)
        o.put("sdk", Build.VERSION.SDK_INT)
        o.put("model", Build.MODEL ?: "")
        part(o, "usb") { usb(ctx) }
        part(o, "audio") { audio(ctx, o) }
        part(o, "midi") { midi(ctx) }
        part(o, "purist") { purist(ctx) }
        part(o, "alsa") { alsa() }
        return o.toString()
    }

    private fun part(o: JSONObject, key: String, f: () -> Any?) {
        try {
            val v = f()
            if (v != null) o.put(key, v)
        } catch (e: Throwable) {
            Log.w(MainActivity.TAG, "diag $key failed", e)
            o.put(key + "Err", (e.message ?: e.javaClass.simpleName).take(160))
        }
    }

    // ---------- USB: what's on the bus, from the descriptors (no permission needed to read them)

    private fun usbName(d: UsbDevice): String {
        val maker = (d.manufacturerName ?: "").trim()
        val product = (d.productName ?: "").trim()
        val name = when {
            product.isEmpty() -> maker
            maker.isEmpty() || product.lowercase(Locale.US).startsWith(maker.lowercase(Locale.US)) -> product
            else -> "$maker $product"
        }
        return name.ifBlank { String.format(Locale.US, "USB device %04x:%04x", d.vendorId, d.productId) }
    }

    private fun usb(ctx: Context): JSONArray {
        val arr = JSONArray()
        val um = ctx.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return arr
        val devs = um.deviceList.values.sortedBy { it.deviceName }
        for (d in devs) {
            var audio = false; var midi = false; var pin = false; var pout = false
            val cls = JSONArray()
            for (i in 0 until d.interfaceCount) {
                val f = d.getInterface(i)
                val c = f.interfaceClass; val s = f.interfaceSubclass
                cls.put("$c/$s")
                if (c != UsbConstants.USB_CLASS_AUDIO) continue
                if (s == 3) midi = true                      // MIDI streaming
                if (s == 2) {                                // audio streaming: which way the sound goes
                    audio = true
                    for (e in 0 until f.endpointCount) {
                        val ep = f.getEndpoint(e)
                        if (ep.type != UsbConstants.USB_ENDPOINT_XFER_ISOC) continue
                        if (ep.direction == UsbConstants.USB_DIR_OUT) pout = true else pin = true
                    }
                }
            }
            arr.put(JSONObject()
                .put("name", usbName(d))
                .put("vid", String.format(Locale.US, "%04x", d.vendorId))
                .put("pid", String.format(Locale.US, "%04x", d.productId))
                .put("path", d.deviceName)
                .put("audio", audio).put("midi", midi).put("in", pin).put("out", pout)
                .put("permission", um.hasPermission(d))
                .put("cls", cls))
        }
        return arr
    }

    // ---------- sound: Android's outputs and inputs, where media goes, the volume, what else plays

    private fun typeName(t: Int): String = when (t) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "built-in speaker"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "built-in speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> "built-in mic"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired headset"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired headphones"
        AudioDeviceInfo.TYPE_LINE_ANALOG -> "line"
        AudioDeviceInfo.TYPE_LINE_DIGITAL -> "digital line"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth (calls)"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth"
        AudioDeviceInfo.TYPE_BLE_HEADSET -> "Bluetooth LE headset"
        AudioDeviceInfo.TYPE_BLE_SPEAKER -> "Bluetooth LE speaker"
        AudioDeviceInfo.TYPE_BLE_BROADCAST -> "Bluetooth LE broadcast"
        AudioDeviceInfo.TYPE_HEARING_AID -> "hearing aid"
        AudioDeviceInfo.TYPE_HDMI -> "HDMI"
        AudioDeviceInfo.TYPE_HDMI_ARC -> "HDMI ARC"
        AudioDeviceInfo.TYPE_HDMI_EARC -> "HDMI eARC"
        AudioDeviceInfo.TYPE_USB_DEVICE -> "USB device"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB accessory"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "USB headset"
        AudioDeviceInfo.TYPE_DOCK -> "dock"
        AudioDeviceInfo.TYPE_DOCK_ANALOG -> "dock (analog)"
        AudioDeviceInfo.TYPE_TELEPHONY -> "telephony"
        AudioDeviceInfo.TYPE_REMOTE_SUBMIX -> "remote submix"
        AudioDeviceInfo.TYPE_IP -> "IP"
        AudioDeviceInfo.TYPE_BUS -> "bus"
        AudioDeviceInfo.TYPE_FM -> "FM"
        AudioDeviceInfo.TYPE_AUX_LINE -> "aux line"
        AudioDeviceInfo.TYPE_UNKNOWN -> "unknown"
        else -> "type $t"
    }

    private fun dev(d: AudioDeviceInfo): JSONObject = JSONObject()
        .put("type", typeName(d.type))
        .put("name", d.productName?.toString() ?: "")
        .put("id", d.id)
        .put("address", d.address ?: "")

    private fun usageName(u: Int): String = when (u) {
        AudioAttributes.USAGE_MEDIA -> "media"
        AudioAttributes.USAGE_GAME -> "game"
        AudioAttributes.USAGE_VOICE_COMMUNICATION -> "call"
        AudioAttributes.USAGE_ALARM -> "alarm"
        AudioAttributes.USAGE_NOTIFICATION -> "notification"
        AudioAttributes.USAGE_NOTIFICATION_RINGTONE -> "ringtone"
        AudioAttributes.USAGE_ASSISTANCE_SONIFICATION -> "system sound"
        AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE -> "navigation"
        AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY -> "accessibility"
        AudioAttributes.USAGE_ASSISTANT -> "assistant"
        AudioAttributes.USAGE_UNKNOWN -> "unknown"
        else -> "usage $u"
    }

    /** Fills outputs, inputs, media, volume, playing and out into o; returns null (the parts go straight in). */
    private fun audio(ctx: Context, o: JSONObject): Any? {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return null
        val outs = JSONArray(); for (d in am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) outs.put(dev(d))
        val ins = JSONArray(); for (d in am.getDevices(AudioManager.GET_DEVICES_INPUTS)) ins.put(dev(d))
        o.put("outputs", outs); o.put("inputs", ins)
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()
                val media = JSONArray()
                for (d in am.getAudioDevicesForAttributes(attrs)) media.put(typeName(d.type) + ": " + (d.productName ?: ""))
                o.put("media", media)
            } catch (e: Throwable) { o.put("mediaErr", (e.message ?: e.javaClass.simpleName).take(120)) }
        }
        o.put("volume", JSONObject()
            .put("music", am.getStreamVolume(AudioManager.STREAM_MUSIC))
            .put("max", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            .put("fixed", am.isVolumeFixed))
        try {
            val cfgs = am.activePlaybackConfigurations
            val usages = JSONArray(); for (c in cfgs) usages.put(usageName(c.audioAttributes.usage))
            o.put("playing", JSONObject().put("count", cfgs.size).put("usages", usages).put("musicActive", am.isMusicActive))
        } catch (e: Throwable) { o.put("playingErr", (e.message ?: e.javaClass.simpleName).take(120)) }
        o.put("out", JSONObject()
            .put("rate", am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE) ?: "")
            .put("frames", am.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER) ?: "")
            .put("mode", am.mode))
        return null
    }

    // ---------- MIDI: what Android's MIDI service lists, both transports on Android 13+

    private fun midiType(t: Int): String = when (t) {
        MidiDeviceInfo.TYPE_USB -> "USB"
        MidiDeviceInfo.TYPE_VIRTUAL -> "virtual"
        MidiDeviceInfo.TYPE_BLUETOOTH -> "Bluetooth"
        else -> "type $t"
    }

    private fun midi(ctx: Context): JSONArray {
        val arr = JSONArray()
        val mm = ctx.getSystemService(Context.MIDI_SERVICE) as? MidiManager ?: return arr
        val seen = HashSet<Int>()
        val infos = ArrayList<Pair<MidiDeviceInfo, String>>()
        if (Build.VERSION.SDK_INT >= 33) {
            for (d in mm.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM)) infos.add(Pair(d, "MIDI 1.0"))
            for (d in mm.getDevicesForTransport(MidiManager.TRANSPORT_UNIVERSAL_MIDI_PACKETS)) infos.add(Pair(d, "MIDI 2.0 (UMP)"))
        } else {
            for (d in legacyDevices(mm)) infos.add(Pair(d, "MIDI 1.0"))
        }
        for ((d, transport) in infos) {
            if (!seen.add(d.id)) continue
            val p = d.properties
            val usbDev = try { usbOf(p) } catch (e: Throwable) { null }
            arr.put(JSONObject()
                .put("name", p.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "")
                .put("maker", p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: "")
                .put("product", p.getString(MidiDeviceInfo.PROPERTY_PRODUCT) ?: "")
                .put("type", midiType(d.type))
                .put("transport", transport)
                .put("inPorts", d.inputPortCount).put("outPorts", d.outputPortCount)
                .put("usbName", if (usbDev != null) usbName(usbDev) else ""))
        }
        return arr
    }

    @Suppress("DEPRECATION")
    private fun legacyDevices(mm: MidiManager): List<MidiDeviceInfo> = mm.devices.toList()

    @Suppress("DEPRECATION")
    private fun usbOf(p: android.os.Bundle): UsbDevice? = p.getParcelable(MidiDeviceInfo.PROPERTY_USB_DEVICE)

    // ---------- Purist (the hi-fi player that can take USB devices away from Android before 1.4.4)

    private fun purist(ctx: Context): String {
        val pm = ctx.packageManager
        var notVisible = false
        for (pkg in PURIST) {
            try {
                val info = if (Build.VERSION.SDK_INT >= 33) pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0)) else legacyInfo(pm, pkg)
                return info.versionName ?: "installed"
            } catch (e: PackageManager.NameNotFoundException) {
                // not this name
            } catch (e: Throwable) {
                notVisible = true
            }
        }
        return if (notVisible) "not visible" else "not installed"
    }

    @Suppress("DEPRECATION")
    private fun legacyInfo(pm: PackageManager, pkg: String): android.content.pm.PackageInfo = pm.getPackageInfo(pkg, 0)

    // ---------- ALSA's own card list, when the system lets an app read it

    private fun alsa(): String = try {
        File("/proc/asound/cards").readText().trim().take(600).ifBlank { "no cards" }
    } catch (e: Throwable) { "unreadable" }
}
