package com.natebloom.app

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiInputPort
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * window.NBMidiBridge: Android's MIDI service behind the page's Web MIDI calls (a WebView has no Web MIDI).
 * Port ids are "<device>:<port>:i" (the page reads from it) or "<device>:<port>:o" (the page sends to it).
 * Everything that touches devices runs on one high-priority thread, which also times outgoing clock.
 */
class MidiBridge(private val act: MainActivity) {

    private val mm: MidiManager? = act.getSystemService(Context.MIDI_SERVICE) as MidiManager?
    private val thread = HandlerThread("nb-midi", Process.THREAD_PRIORITY_URGENT_AUDIO).apply { start() }
    private val handler = Handler(thread.looper)
    private val devices = HashMap<Int, MidiDevice>()
    private val opening = HashMap<Int, MutableList<(MidiDevice) -> Unit>>()
    private val readers = HashMap<String, MidiOutputPort>()
    private val writers = HashMap<String, MidiInputPort>()

    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) { notifyPage() }
        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            closeDevice(device.id)
            notifyPage()
        }
    }

    init {
        @Suppress("DEPRECATION")
        mm?.registerDeviceCallback(callback, handler)
    }

    private fun infos(): List<MidiDeviceInfo> {
        val m = mm ?: return emptyList()
        return if (Build.VERSION.SDK_INT >= 33) m.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
        else legacyDevices(m)
    }

    @Suppress("DEPRECATION")
    private fun legacyDevices(m: MidiManager): List<MidiDeviceInfo> = m.devices.toList()

    private fun trusted(): Boolean = act.bridge.pageHost == MainActivity.HOST

    @JavascriptInterface
    fun list(): String {
        if (!trusted()) return "[]"
        val arr = JSONArray()
        for (d in infos()) {
            val p = d.properties
            val name = p.getString(MidiDeviceInfo.PROPERTY_NAME) ?: p.getString(MidiDeviceInfo.PROPERTY_PRODUCT) ?: "MIDI device"
            val maker = p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: ""
            val many = d.inputPortCount > 1 || d.outputPortCount > 1
            for (port in d.ports) {
                val pageInput = port.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT
                val o = JSONObject()
                o.put("id", "${d.id}:${port.portNumber}:${if (pageInput) "i" else "o"}")
                o.put("type", if (pageInput) "input" else "output")
                val pn = port.name ?: ""
                o.put("name", if (many && pn.isNotBlank()) "$name $pn" else name)
                o.put("manufacturer", maker)
                arr.put(o)
            }
        }
        return arr.toString()
    }

    private data class PortId(val device: Int, val port: Int, val pageInput: Boolean)

    private fun parse(id: String): PortId? {
        val parts = id.split(":")
        if (parts.size != 3) return null
        val dev = parts[0].toIntOrNull() ?: return null
        val port = parts[1].toIntOrNull() ?: return null
        return PortId(dev, port, parts[2] == "i")
    }

    private fun withDevice(info: MidiDeviceInfo, f: (MidiDevice) -> Unit) {
        devices[info.id]?.let { f(it); return }
        val waiting = opening[info.id]
        if (waiting != null) { waiting.add(f); return }
        opening[info.id] = mutableListOf(f)
        val m = mm ?: return
        m.openDevice(info, { dev ->
            val list = opening.remove(info.id) ?: mutableListOf()
            if (dev == null) { Log.w(MainActivity.TAG, "couldn't open MIDI device ${info.id}"); return@openDevice }
            devices[info.id] = dev
            list.forEach { it(dev) }
        }, handler)
    }

    @JavascriptInterface
    fun open(id: String) {
        if (!trusted()) return
        val pid = parse(id) ?: return
        handler.post {
            val info = infos().firstOrNull { it.id == pid.device } ?: return@post
            withDevice(info) { dev ->
                try {
                    if (pid.pageInput) {
                        if (!readers.containsKey(id)) dev.openOutputPort(pid.port)?.let { p -> p.connect(Reader(id)); readers[id] = p }
                    } else {
                        if (!writers.containsKey(id)) dev.openInputPort(pid.port)?.let { p -> writers[id] = p }
                    }
                } catch (e: Exception) {
                    Log.w(MainActivity.TAG, "MIDI open $id failed", e)
                }
            }
        }
    }

    @JavascriptInterface
    fun close(id: String) {
        if (!trusted()) return
        handler.post {
            readers.remove(id)?.let { try { it.close() } catch (e: Exception) { } }
            writers.remove(id)?.let { try { it.close() } catch (e: Exception) { } }
        }
    }

    /** bytes: "144,60,100"; delayMs: when it should go out (the page's timestamp minus now). */
    @JavascriptInterface
    fun send(id: String, bytes: String, delayMs: Double) {
        if (!trusted()) return
        val data = try {
            bytes.split(",").filter { it.isNotBlank() }.map { it.trim().toInt().toByte() }.toByteArray()
        } catch (e: NumberFormatException) { return }
        if (data.isEmpty()) return
        val r = Runnable {
            val w = writers[id]
            if (w == null) {
                // first send opens the port; this message goes once it's open
                open(id)
                handler.postDelayed({ writers[id]?.let { try { it.send(data, 0, data.size) } catch (e: Exception) { } } }, 30)
            } else try { w.send(data, 0, data.size) } catch (e: Exception) { }
        }
        if (delayMs < 1.0) handler.post(r) else handler.postAtTime(r, SystemClock.uptimeMillis() + delayMs.toLong())
    }

    private fun closeDevice(deviceId: Int) {
        handler.post {
            val pre = "$deviceId:"
            readers.keys.filter { it.startsWith(pre) }.forEach { k -> readers.remove(k)?.let { try { it.close() } catch (e: Exception) { } } }
            writers.keys.filter { it.startsWith(pre) }.forEach { k -> writers.remove(k)?.let { try { it.close() } catch (e: Exception) { } } }
            devices.remove(deviceId)?.let { try { it.close() } catch (e: Exception) { } }
        }
    }

    private fun notifyPage() {
        act.web.post { act.web.evaluateJavascript("window.__nbMidiState && __nbMidiState()", null) }
    }

    fun close() {
        try { mm?.unregisterDeviceCallback(callback) } catch (e: Exception) { }
        handler.post {
            readers.values.forEach { try { it.close() } catch (e: Exception) { } }
            writers.values.forEach { try { it.close() } catch (e: Exception) { } }
            devices.values.forEach { try { it.close() } catch (e: Exception) { } }
            readers.clear(); writers.clear(); devices.clear()
            thread.quitSafely()
        }
    }

    /** Incoming bytes, split into whole MIDI messages and handed to the page in one call per batch. */
    private inner class Reader(val id: String) : MidiReceiver() {
        private val framer = Framer()
        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            val out = framer.feed(msg, offset, count)
            if (out.isEmpty()) return
            val js = StringBuilder("window.__nbMidiIn&&__nbMidiIn(").append(JSONObject.quote(id)).append(",[")
            out.forEachIndexed { i, m ->
                if (i > 0) js.append(',')
                js.append('[')
                m.forEachIndexed { j, b -> if (j > 0) js.append(','); js.append(b.toInt() and 0xff) }
                js.append(']')
            }
            js.append("])")
            val s = js.toString()
            act.web.post { act.web.evaluateJavascript(s, null) }
        }
    }
}

/** Turns a MIDI byte stream (running status, real-time bytes mixed in, SysEx) into whole messages. */
class Framer {
    private var status = 0
    private var need = 0
    private val cur = ByteArrayOutputStream()
    private var sysex: ByteArrayOutputStream? = null

    private fun dataLen(s: Int): Int = when {
        s < 0xC0 -> 2
        s < 0xE0 -> 1
        s < 0xF0 -> 2
        s == 0xF1 || s == 0xF3 -> 1
        s == 0xF2 -> 2
        else -> 0
    }

    fun feed(b: ByteArray, off: Int, n: Int): List<ByteArray> {
        val out = ArrayList<ByteArray>()
        for (i in off until off + n) {
            val x = b[i].toInt() and 0xff
            if (x >= 0xF8) { out.add(byteArrayOf(x.toByte())); continue }   // clock, start, stop: may arrive mid-message
            val sx = sysex
            if (x == 0xF0) { sysex = ByteArrayOutputStream().apply { write(x) }; status = 0; continue }
            if (sx != null) {
                if (x == 0xF7) { sx.write(x); out.add(sx.toByteArray()); sysex = null; continue }
                if (x < 0x80) { sx.write(x); continue }
                sysex = null   // a status byte ends an unterminated SysEx
            }
            if (x >= 0x80) {
                status = x; need = dataLen(x); cur.reset(); cur.write(x)
                if (need == 0) { out.add(cur.toByteArray()); cur.reset(); if (x >= 0xF0) status = 0 }
                continue
            }
            if (status == 0) continue
            if (cur.size() == 0) cur.write(status)   // running status
            cur.write(x)
            if (cur.size() - 1 >= need) {
                out.add(cur.toByteArray()); cur.reset()
                if (status >= 0xF0) status = 0
            }
        }
        return out
    }
}
