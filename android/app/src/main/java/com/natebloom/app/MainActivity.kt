package com.natebloom.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Nate Bloom for Android: the web app in a WebView, plus what a browser tab can't do on a tablet:
 * USB MIDI through Android's own MIDI service (the K.O. II), saving straight to Downloads,
 * playing on in the background, storage the browser can't clear, and a full-screen window.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val HOST = "nathan-san1981.github.io"
        const val ORIGIN = "https://$HOST"
        const val START_URL = "$ORIGIN/nate-bloom/"
        const val TAG = "NateBloom"
    }

    lateinit var web: WebView
        private set
    lateinit var bridge: NativeBridge
        private set
    private lateinit var midi: MidiBridge
    private var fast: FastPads? = null
    private lateinit var link: LinkBridge
    private var startScript = ""
    private var startScriptAtDocStart = false
    private var visible = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }

    private var pendingPermission: PermissionRequest? = null
    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val p = pendingPermission
        pendingPermission = null
        if (p != null) {
            if (ok) p.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else p.deny()
        }
    }
    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(true)

        web = WebView(this)
        web.setBackgroundColor(0xFF13111B.toInt())
        setContentView(web)
        goFullScreen()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            userAgentString = userAgentString + " NateBloomApp/" + BuildConfig.VERSION_NAME
        }

        bridge = NativeBridge(this)
        midi = MidiBridge(this)
        web.addJavascriptInterface(bridge, "NBNativeBridge")
        web.addJavascriptInterface(midi, "NBMidiBridge")
        link = LinkBridge(this)
        web.addJavascriptInterface(link, "NBLinkNative")
        if (FastPads.available) fast = FastPads(this).also { web.addJavascriptInterface(it, "NBFastPads") }

        startScript = assets.open("nb-native.js").bufferedReader().use { it.readText() }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, startScript, setOf(ORIGIN))
            startScriptAtDocStart = true
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST && (u.path ?: "").startsWith("/nate-bloom")) return false
                // anything else (credits, GitHub, the clocks) opens in the browser
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: ActivityNotFoundException) { }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                bridge.pageHost = Uri.parse(url ?: "").host ?: ""
                if (!startScriptAtDocStart) view.evaluateJavascript(startScript, null)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    Log.w(TAG, "page failed: ${error.errorCode} ${error.description}")
                    view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null)
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                val types = params.acceptTypes.flatMap { it.split(",") }.map { it.trim() }.filter { it.isNotEmpty() }
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                    // only narrow the picker when every type is a real MIME type (".wav", ".nbproj" can't be expressed)
                    if (types.isNotEmpty() && types.all { it.contains("/") }) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                }
                return try {
                    pickFiles.launch(intent)
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.host != HOST) {
                        request.deny(); return@runOnUiThread
                    }
                    if (!request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        request.deny(); return@runOnUiThread
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingPermission?.deny()
                        pendingPermission = request
                        askMic.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i(TAG, "console ${m.messageLevel()}: ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Back closes the sheet that's open in the app; with nothing open it leaves the app running
                web.evaluateJavascript("(window.NB_NATIVE && NB_NATIVE.back) ? NB_NATIVE.back() : false") { r ->
                    if (r != "true") moveTaskToBack(true)
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        if (web.url == null) web.loadUrl(START_URL)

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun goFullScreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let {
            it.hide(WindowInsetsCompat.Type.systemBars())
            it.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goFullScreen()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        web.onResume()
        web.resumeTimers()
        PlaybackService.stop(this)
        web.evaluateJavascript("window.NB_NATIVE && NB_NATIVE.foreground && NB_NATIVE.foreground(true)", null)
    }

    override fun onPause() {
        visible = false
        // still visible here, so a foreground service may start: it keeps the sound going in the background
        if (bridge.playing) PlaybackService.start(this)
        web.evaluateJavascript("window.NB_NATIVE && NB_NATIVE.foreground && NB_NATIVE.foreground(false)", null)
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
        // nothing playing: let the page rest (timers paused) to save battery
        if (!bridge.playing) {
            web.onPause()
            fast?.sleep()   // the page wakes it again when Beat Pads is used
        }
    }

    /** Called by the page (through the bridge) when the sound starts or stops. */
    fun onPlayingChanged(on: Boolean) {
        runOnUiThread {
            if (!on && !visible) {
                PlaybackService.stop(this)
                web.onPause()
            }
        }
    }

    override fun onDestroy() {
        PlaybackService.stop(this)
        midi.close()
        fast?.sleep()
        web.destroy()
        super.onDestroy()
    }

    private fun offlinePage(): String = """
        <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#13111b;color:#ece7f7;font:16px system-ui,sans-serif;text-align:center">
        <div><h2 style="margin:0 0 8px">${getString(R.string.offline_title)}</h2><p style="color:#8e86a6;margin:0 0 18px">${getString(R.string.offline_text)}</p>
        <button onclick="location.href='$START_URL'" style="font:600 16px system-ui;background:#c4a3ff;color:#13111b;border:0;border-radius:10px;padding:12px 22px">Try again</button></div></body>
    """.trimIndent()
}
