package com.natebloom.app

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import android.webkit.JavascriptInterface

/**
 * window.NBAbleton: Ableton Link (native/ablink, built into libnbfastpads). Nate Bloom joins the Link session on the
 * Wi-Fi with Bitwig and the other Link apps: one tempo, one beat grid, Play and Stop together. The page does the
 * music (index.html, "Ableton Link"). Android only lets an app hear the multicast that Link finds its peers with
 * while it holds a multicast lock, so one is held while Link is on.
 */
class AbletonLink(private val act: MainActivity) {
    private var lock: WifiManager.MulticastLock? = null

    private fun trusted(): Boolean = act.bridge.pageHost == MainActivity.HOST

    /** false when the app was built without Link */
    fun supported(): Boolean = try { nAvailable() } catch (e: Throwable) { false }

    @JavascriptInterface
    fun enable(on: Boolean, bpm: Double): Boolean {
        if (!trusted()) return false
        multicast(on)
        return nEnable(on, bpm)
    }
    @JavascriptInterface fun sync(on: Boolean) { if (trusted()) nSync(on) }
    @JavascriptInterface fun state(q: Double): String = nState(q)
    @JavascriptInterface fun now(): Double = nNow()
    @JavascriptInterface fun timeAtBeat(b: Double, q: Double): Double = nTimeAtBeat(b, q)
    @JavascriptInterface fun setTempo(bpm: Double) { if (trusted()) nTempo(bpm) }
    @JavascriptInterface fun start(at: Double, q: Double): Double = if (trusted()) nStart(at, q) else 0.0
    @JavascriptInterface fun stop(at: Double) { if (trusted()) nStop(at) }

    fun close() {
        try { nEnable(false, 0.0) } catch (e: Throwable) {}
        multicast(false)
    }

    private fun multicast(on: Boolean) {
        try {
            if (on && lock == null) {
                val wm = act.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                lock = wm.createMulticastLock("nbableton").also { it.setReferenceCounted(false); it.acquire() }
            }
            if (!on) { lock?.release(); lock = null }
        } catch (e: Exception) {
            Log.w(MainActivity.TAG, "Ableton Link multicast lock", e)
        }
    }

    private external fun nAvailable(): Boolean
    private external fun nEnable(on: Boolean, bpm: Double): Boolean
    private external fun nSync(on: Boolean)
    private external fun nState(q: Double): String
    private external fun nNow(): Double
    private external fun nTimeAtBeat(b: Double, q: Double): Double
    private external fun nTempo(bpm: Double)
    private external fun nStart(at: Double, q: Double): Double
    private external fun nStop(at: Double)
}
