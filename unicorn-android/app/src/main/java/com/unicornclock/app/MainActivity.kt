package com.unicornclock.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.system.exitProcess

/**
 * Unicorn Clock for Fire tablets (and any Android tablet): the clock page, built into the app, in a full-screen
 * WebView, plus what a kiosk needs. It answers the same `fully.*` calls the clock already makes in Fully Kiosk
 * (real backlight brightness, the tablet's own voice, volume), so the page works the same in both.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val TAG = "UnicornClock"
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/assets/unicorn-clock.html"
    }

    private lateinit var web: WebView
    private lateinit var assets: WebViewAssetLoader
    private val ui = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("unicorn", Context.MODE_PRIVATE) }

    // kiosk: pin the clock once each time it opens; after "Exit to the tablet" stay unpinned until reopened
    private var kioskOn = true
    private var pinTried = false
    private var brightness = -1f

    // the tablet's own text-to-speech, for words the clock has no recording of (names you type, reminders)
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var ttsPending: String? = null
    private var ttsEngine = ""

    // ---------- results from system screens ----------
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }
    private var saveText: String? = null
    private val saveDoc = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = saveText
        saveText = null
        var ok = false
        if (uri != null && text != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
                ok = true
            } catch (e: Exception) {
                Log.w(TAG, "save failed", e)
            }
        }
        js("window.unicornSaved&&unicornSaved(${if (ok) "true" else "false"})")
    }
    private var pendingMic: PermissionRequest? = null
    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val p = pendingMic
        pendingMic = null
        if (p != null) {
            if (ok) p.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else p.deny()
        }
    }
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private val askGeo = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val p = pendingGeo
        pendingGeo = null
        p?.second?.invoke(p.first, ok, false)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        restartAfterCrash()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        WebView.setWebContentsDebuggingEnabled(true)
        assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        makeWebView()
        web.loadUrl(START_URL)
        deviceOwnerSetup()
        fullScreen()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // the clock has its own back buttons; the tablet's Back key never leaves the clock
            override fun handleOnBackPressed() {
                js("window.unicornBack&&unicornBack()")
            }
        })

        tts = TextToSpeech(applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                val t = tts!!
                ttsEngine = t.defaultEngine ?: ""
                try {
                    if (t.isLanguageAvailable(Locale.US) >= TextToSpeech.LANG_AVAILABLE) t.language = Locale.US
                } catch (e: Exception) {
                }
                t.setSpeechRate(0.95f)
                ttsPending?.let { speak(it) }
                ttsPending = null
            }
        }
    }

    // ---------- the web view ----------
    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun makeWebView() {
        web = WebView(this)
        web.setBackgroundColor(0xFF0B0A1F.toInt())
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = WebView.OVER_SCROLL_NEVER
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false   // bedtime sounds and alarms start on their own
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setGeolocationEnabled(true)
        }
        web.addJavascriptInterface(FullyBridge(), "fully")
        web.addJavascriptInterface(AppBridge(), "unicornApp")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            // stay on the clock: no link can take her off to the web
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != HOST

            override fun onPageFinished(view: WebView, url: String) {
                ui.postDelayed({ startKiosk() }, 1200)
            }

            // if the page's renderer ever dies (low memory), build a fresh one and carry on
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.w(TAG, "renderer gone, crashed=${detail.didCrash()}")
                (web.parent as? ViewGroup)?.removeView(web)
                web.destroy()
                makeWebView()
                web.loadUrl(START_URL)
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                ui.post {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources) {
                        request.deny()
                    } else if (has(Manifest.permission.RECORD_AUDIO)) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingMic = request
                        askMic.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (has(Manifest.permission.ACCESS_COARSE_LOCATION)) callback.invoke(origin, true, false)
                else {
                    pendingGeo = origin to callback
                    askGeo.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                }
            }

            // "Restore from file" in grown-up settings
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    pickFile.launch(Intent.createChooser(pick, "Choose the backup file"))
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w(TAG, "page: ${m.message()} @${m.lineNumber()}")
                return true
            }
        }
        setContentView(web)
    }

    private fun js(code: String) = ui.post { if (::web.isInitialized) web.evaluateJavascript(code, null) }
    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    // ---------- full screen, kept on ----------
    private fun fullScreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) fullScreen()
    }

    override fun onResume() {
        super.onResume()
        fullScreen()
        if (::web.isInitialized) web.onResume()
        ui.postDelayed({ startKiosk() }, 800)
    }

    // opened again from the app icon (or by itself at start-up): pin again
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        kioskOn = true
        pinTried = false
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    // ---------- kiosk ----------
    private fun lockState(): Int {
        val am = getSystemService(ActivityManager::class.java)
        return am.lockTaskModeState
    }

    private fun isOwner(): Boolean = getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(packageName)

    /** Pin the clock (Home and Recents stop working). As device owner it is silent and complete; otherwise
     *  Android asks once to confirm, and we never nag again if a grown-up says no. */
    private fun startKiosk() {
        if (!kioskOn || isFinishing) return
        if (lockState() != ActivityManager.LOCK_TASK_MODE_NONE) return
        if (pinTried && !isOwner()) return
        pinTried = true
        try {
            startLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "could not pin", e)
        }
    }

    private fun stopKiosk() {
        kioskOn = false
        try {
            stopLockTask()
        } catch (e: Exception) {
        }
    }

    /** Only after `adb shell dpm set-device-owner com.unicornclock.app/.AdminReceiver`: the clock becomes the
     *  home screen, the status bar and lock screen go away, and pinning needs no confirmation. */
    private fun deviceOwnerSetup() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        if (!dpm.isDeviceOwnerApp(packageName)) return
        val admin = ComponentName(this, AdminReceiver::class.java)
        try {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            if (Build.VERSION.SDK_INT >= 28) dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)
            dpm.setStatusBarDisabled(admin, true)
            dpm.setKeyguardDisabled(admin, true)
            val home = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, home, ComponentName(this, MainActivity::class.java))
            val plugged = BatteryManager.BATTERY_PLUGGED_AC or BatteryManager.BATTERY_PLUGGED_USB or BatteryManager.BATTERY_PLUGGED_WIRELESS
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, plugged.toString())
        } catch (e: Exception) {
            Log.w(TAG, "device owner setup", e)
        }
    }

    private fun leaveOwnerHome() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        if (!dpm.isDeviceOwnerApp(packageName)) return
        val admin = ComponentName(this, AdminReceiver::class.java)
        try {
            dpm.clearPackagePersistentPreferredActivities(admin, packageName)
            dpm.setStatusBarDisabled(admin, false)
        } catch (e: Exception) {
        }
    }

    // ---------- crash recovery ----------
    private fun restartAfterCrash() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            Log.e(TAG, "crash, restarting", e)
            try {
                val pi = PendingIntent.getActivity(
                    applicationContext, 7, Intent(applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_CANCEL_CURRENT
                )
                getSystemService(AlarmManager::class.java).set(AlarmManager.RTC, System.currentTimeMillis() + 2000, pi)
            } catch (x: Exception) {
                previous?.uncaughtException(t, e)
            }
            exitProcess(2)
        }
    }

    // ---------- voice ----------
    private fun speak(text: String) {
        val t = tts
        if (t == null || !ttsReady) {
            ttsPending = text
            return
        }
        val params = Bundle().apply { putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC) }
        t.speak(text, TextToSpeech.QUEUE_FLUSH, params, "uc" + System.nanoTime())
    }

    private fun stream(s: Int): Int = when (s) {
        AudioManager.STREAM_ALARM, AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_RING, AudioManager.STREAM_SYSTEM -> s
        else -> AudioManager.STREAM_MUSIC   // Fully's 9 (speech) plays on the media stream here
    }

    /** The same names Fully Kiosk gives the page, so the clock needs no changes to use them. */
    inner class FullyBridge {
        @JavascriptInterface
        fun setScreenBrightness(v: Float) {
            ui.post {
                val lp = window.attributes
                lp.screenBrightness = if (v < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else (v / 255f).coerceIn(0.01f, 1f)
                brightness = lp.screenBrightness
                window.attributes = lp
            }
        }

        @JavascriptInterface
        fun getScreenBrightness(): Int = if (brightness < 0) -1 else (brightness * 255).roundToInt()

        @JavascriptInterface
        fun textToSpeech(text: String) = speak(text)

        @JavascriptInterface
        fun textToSpeech(text: String, locale: String) = speak(text)

        @JavascriptInterface
        fun textToSpeech(text: String, locale: String, engine: String) = speak(text)

        @JavascriptInterface
        fun stopTextToSpeech() {
            tts?.stop()
            ttsPending = null
        }

        @JavascriptInterface
        fun getAudioVolume(s: Int): Int {
            val am = getSystemService(AudioManager::class.java)
            val st = stream(s)
            val max = am.getStreamMaxVolume(st).coerceAtLeast(1)
            return (am.getStreamVolume(st) * 100f / max).roundToInt()
        }

        @JavascriptInterface
        fun setAudioVolume(level: Int, s: Int) {
            val am = getSystemService(AudioManager::class.java)
            val st = stream(s)
            val max = am.getStreamMaxVolume(st)
            try {
                am.setStreamVolume(st, (level.coerceIn(0, 100) * max / 100f).roundToInt(), 0)
            } catch (e: SecurityException) {
            }
        }

        @JavascriptInterface
        fun getDeviceName(): String = Build.MANUFACTURER + " " + Build.MODEL
    }

    /** Extras only the app has: kiosk status and exit, backups to a file, permission shortcuts. */
    inner class AppBridge {
        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun status(): String {
            val canOpenAlone = isOwner() || Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this@MainActivity)
            return JSONObject().apply {
                put("version", BuildConfig.VERSION_NAME)
                put("pinned", lockState() != ActivityManager.LOCK_TASK_MODE_NONE)
                put("lockMode", when (lockState()) {
                    ActivityManager.LOCK_TASK_MODE_LOCKED -> "locked"
                    ActivityManager.LOCK_TASK_MODE_PINNED -> "pinned"
                    else -> "none"
                })
                put("owner", isOwner())
                put("opensAtStart", canOpenAlone && prefs.getBoolean("boot", true))
                put("bootPref", prefs.getBoolean("boot", true))
                put("canOpenAlone", canOpenAlone)
                put("ttsReady", ttsReady)
                put("ttsEngine", ttsEngine)
                put("mic", has(Manifest.permission.RECORD_AUDIO))
                put("brightness", getScreenBrightnessValue())
                put("device", Build.MANUFACTURER + " " + Build.MODEL)
                put("android", Build.VERSION.SDK_INT)
            }.toString()
        }

        private fun getScreenBrightnessValue(): Int = if (brightness < 0) -1 else (brightness * 255).roundToInt()

        /** Grown-up settings (behind the PIN): leave the clock for the tablet. Reopening the clock pins it again. */
        @JavascriptInterface
        fun exitToTablet() {
            ui.post {
                stopKiosk()
                leaveOwnerHome()
                if (!moveTaskToBack(true)) finish()
            }
        }

        @JavascriptInterface
        fun pinAgain() {
            ui.post {
                kioskOn = true
                pinTried = false
                if (isOwner()) deviceOwnerSetup()
                startKiosk()
            }
        }

        @JavascriptInterface
        fun setOpenAtStart(on: Boolean) {
            prefs.edit().putBoolean("boot", on).apply()
        }

        @JavascriptInterface
        fun openStartAloneSettings() {
            ui.post {
                try {
                    stopKiosk()
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                } catch (e: Exception) {
                    try {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                    } catch (x: Exception) {
                    }
                }
            }
        }

        @JavascriptInterface
        fun openVoiceSettings() {
            ui.post {
                try {
                    stopKiosk()
                    startActivity(Intent("com.android.settings.TTS_SETTINGS"))
                } catch (e: Exception) {
                }
            }
        }

        /** Save a backup with Android's own "save as" screen (WebView can't download files). */
        @JavascriptInterface
        fun saveText(name: String, text: String) {
            ui.post {
                saveText = text
                try {
                    saveDoc.launch(name)
                } catch (e: Exception) {
                    saveText = null
                    js("window.unicornSaved&&unicornSaved(false)")
                }
            }
        }
    }
}
