package com.natebloom.app

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.Writer
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.Executors

/**
 * window.NBLinkNative: Nate Bloom Link, the tablet's side. Finds a computer running the Nate Bloom Linux app on
 * the same Wi-Fi (a UDP broadcast to port 47811), links to it over TCP (port 47812, one JSON message per line)
 * and passes messages both ways. Everything arriving goes to the page as window.__nbLinkIn(json).
 * The page does the music (projects, tempo, play together); this only finds, connects and relays.
 */
class LinkBridge(private val act: MainActivity) {
    private val io = Executors.newCachedThreadPool()
    private val writer = Executors.newSingleThreadExecutor()   // (messages keep their order)
    @Volatile private var sock: Socket? = null
    @Volatile private var out: Writer? = null

    private fun trusted(): Boolean = act.bridge.pageHost == MainActivity.HOST

    private fun toPage(json: String) {
        act.runOnUiThread { act.web.evaluateJavascript("window.__nbLinkIn&&window.__nbLinkIn(" + JSONObject.quote(json) + ")", null) }
    }

    @JavascriptInterface
    fun available(): Boolean = true

    /** Ask the Wi-Fi who's there for about two seconds; each computer that answers arrives as {t:"found", name, host, port}. */
    @JavascriptInterface
    fun find() {
        if (!trusted()) return
        io.execute {
            var lock: WifiManager.MulticastLock? = null
            try {
                val wm = act.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                lock = wm.createMulticastLock("nblink").also { it.setReferenceCounted(false); it.acquire() }
                DatagramSocket().use { ds ->
                    ds.broadcast = true
                    ds.soTimeout = 300
                    val q = "NBLINK?".toByteArray()
                    val targets = (broadcasts() + InetAddress.getByName("255.255.255.255")).distinct()
                    val seen = HashSet<String>()
                    val buf = ByteArray(2048)
                    val end = System.currentTimeMillis() + 2000
                    var nextSend = 0L
                    while (System.currentTimeMillis() < end) {
                        if (System.currentTimeMillis() >= nextSend) {
                            for (a in targets) try { ds.send(DatagramPacket(q, q.size, a, 47811)) } catch (e: Exception) { }
                            nextSend = System.currentTimeMillis() + 600
                        }
                        try {
                            val p = DatagramPacket(buf, buf.size)
                            ds.receive(p)
                            val o = JSONObject(String(p.data, 0, p.length, Charsets.UTF_8))
                            val host = p.address.hostAddress ?: continue
                            if (o.optInt("nb") == 1 && seen.add(host)) {
                                toPage(JSONObject().put("t", "found").put("name", o.optString("name", host)).put("host", host).put("port", o.optInt("port", 47812)).toString())
                            }
                        } catch (e: SocketTimeoutException) { } catch (e: Exception) { }
                    }
                }
            } catch (e: Exception) {
                Log.w(MainActivity.TAG, "link: find failed", e)
            } finally {
                try { lock?.release() } catch (e: Exception) { }
                toPage("{\"t\":\"find-done\"}")
            }
        }
    }

    private fun broadcasts(): List<InetAddress> = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { ni -> ni.interfaceAddresses.mapNotNull { it.broadcast } }
    } catch (e: Exception) { emptyList() }

    /** Link to a computer. {t:"connected"} then its messages; {t:"disconnected"} when it ends. */
    @JavascriptInterface
    fun connect(host: String, port: Int) {
        if (!trusted()) return
        close()
        io.execute {
            val s = Socket()
            try {
                s.tcpNoDelay = true
                s.keepAlive = true
                s.connect(InetSocketAddress(host, if (port > 0) port else 47812), 5000)
                sock = s
                out = OutputStreamWriter(s.getOutputStream(), Charsets.UTF_8)
                toPage(JSONObject().put("t", "connected").put("host", host).toString())
                val r = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8), 1 shl 16)
                while (true) {
                    val line = r.readLine() ?: break
                    if (line.isNotBlank()) toPage(line)
                }
            } catch (e: Exception) {
                if (sock === s || sock == null) toPage(JSONObject().put("t", "link-error").put("why", e.message ?: "couldn't reach it").toString())
            } finally {
                try { s.close() } catch (e: Exception) { }
                if (sock === s) { sock = null; out = null }
                toPage("{\"t\":\"disconnected\"}")
            }
        }
    }

    @JavascriptInterface
    fun send(json: String): Boolean {
        if (!trusted()) return false
        val w = out ?: return false
        writer.execute { try { w.write(json); w.write("\n"); w.flush() } catch (e: Exception) { } }
        return true
    }

    @JavascriptInterface
    fun close() {
        val s = sock
        sock = null; out = null
        if (s != null) io.execute { try { s.close() } catch (e: Exception) { } }
    }
}
