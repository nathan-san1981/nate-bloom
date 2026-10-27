package com.natebloom.app

import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.OutputStream

/**
 * window.NBNativeBridge in the page. Called on the WebView's bridge thread.
 * - files the app saves (backups, WAVs, stems, MIDI) go to Downloads/Nate Bloom
 * - the page says when sound is playing, so the app can keep going in the background
 */
class NativeBridge(private val act: MainActivity) {

    @Volatile var pageHost: String = ""
    @Volatile var playing: Boolean = false
        private set

    private class FileOut(val name: String, val uri: Uri, val out: OutputStream)
    private val files = HashMap<Int, FileOut>()
    private var nextId = 1

    private fun trusted(): Boolean = pageHost == MainActivity.HOST

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun setPlaying(on: Boolean) {
        if (!trusted() || on == playing) return
        playing = on
        act.onPlayingChanged(on)
    }

    /** Start a file in Downloads/Nate Bloom. Returns an id for fileChunk/fileEnd, or -1. */
    @JavascriptInterface
    fun fileBegin(name: String, mime: String): Int {
        if (!trusted()) return -1
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120).ifBlank { "Nate Bloom file" }
        return try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
                put(MediaStore.MediaColumns.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Nate Bloom")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = act.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return -1
            val out = act.contentResolver.openOutputStream(uri) ?: return -1
            synchronized(files) {
                val id = nextId++
                files[id] = FileOut(safe, uri, out)
                id
            }
        } catch (e: Exception) {
            Log.w(MainActivity.TAG, "fileBegin failed", e); -1
        }
    }

    @JavascriptInterface
    fun fileChunk(id: Int, b64: String): Boolean {
        val f = synchronized(files) { files[id] } ?: return false
        return try {
            f.out.write(Base64.decode(b64, Base64.DEFAULT)); true
        } catch (e: Exception) {
            Log.w(MainActivity.TAG, "fileChunk failed", e); false
        }
    }

    /** Finish the file; returns where it went ("" if it failed). */
    @JavascriptInterface
    fun fileEnd(id: Int): String {
        val f = synchronized(files) { files.remove(id) } ?: return ""
        return try {
            f.out.close()
            val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            act.contentResolver.update(f.uri, values, null, null)
            val where = "Downloads/Nate Bloom/" + f.name
            act.runOnUiThread { Toast.makeText(act, "Saved to $where", Toast.LENGTH_LONG).show() }
            where
        } catch (e: Exception) {
            Log.w(MainActivity.TAG, "fileEnd failed", e)
            try { act.contentResolver.delete(f.uri, null, null) } catch (x: Exception) { }
            ""
        }
    }

    @JavascriptInterface
    fun toast(msg: String) {
        if (!trusted()) return
        act.runOnUiThread { Toast.makeText(act, msg.take(200), Toast.LENGTH_SHORT).show() }
    }
}
