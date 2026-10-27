package com.natebloom.app

import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * window.NBFastPads in the page: Beat Pads' low-latency player (AAudio, in nb_fastpads.cpp).
 * The page renders each pad's sound ahead of time and loads it here; a tap then only asks for a slot to play.
 */
class FastPads(private val act: MainActivity) {

    companion object {
        val available: Boolean = try {
            System.loadLibrary("nbfastpads"); true
        } catch (e: Throwable) {
            Log.w(MainActivity.TAG, "fast pads unavailable", e); false
        }
    }

    private fun trusted(): Boolean = act.bridge.pageHost == MainActivity.HOST

    @JavascriptInterface fun start(): Boolean = trusted() && nStart()
    @JavascriptInterface fun sleep() = nStop()
    @JavascriptInterface fun info(): String = nInfo()
    @JavascriptInterface fun rate(): Int = nRate()

    /** pcm: base64 of interleaved stereo 16-bit little-endian samples at rate() */
    @JavascriptInterface
    fun load(slot: Int, b64: String, frames: Int): Boolean {
        if (!trusted()) return false
        return try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val shorts = ShortArray(bytes.size / 2)
            ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
            nLoad(slot, shorts, frames); true
        } catch (e: Exception) {
            Log.w(MainActivity.TAG, "fast pads load failed", e); false
        }
    }

    @JavascriptInterface fun clear(slot: Int) = nClear(slot)
    @JavascriptInterface fun play(slot: Int, gl: Double, gr: Double, choke: Int, pad: Int): Boolean = nPlay(slot, gl.toFloat(), gr.toFloat(), choke, pad)
    @JavascriptInterface fun stopAll() = nStopAll()
    @JavascriptInterface fun stopPad(pad: Int) = nStopPad(pad)
    @JavascriptInterface fun choke(group: Int, exceptPad: Int) = nChoke(group, exceptPad)

    private external fun nStart(): Boolean
    private external fun nStop()
    private external fun nInfo(): String
    private external fun nRate(): Int
    private external fun nLoad(slot: Int, pcm: ShortArray, frames: Int)
    private external fun nClear(slot: Int)
    private external fun nPlay(slot: Int, gl: Float, gr: Float, choke: Int, pad: Int): Boolean
    private external fun nStopAll()
    private external fun nStopPad(pad: Int)
    private external fun nChoke(group: Int, exceptPad: Int)
    private external fun nMaster(g: Float)
}
