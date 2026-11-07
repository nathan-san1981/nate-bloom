package org.natebloom.pocketpet;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** Pocket Pet (full edition) for the Galaxy Tab S10 FE+: the game page in a full-screen WebView. The page tells
 *  the app (PetAndroid.schedule) when the pet will next call for you; the app sets an alarm for that moment and
 *  CallReceiver shows a notification if the app isn't open. */
public class MainActivity extends Activity {
    static volatile boolean visible = false;
    private WebView web;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setBackgroundColor(0xFF2B1F3D);
        web.addJavascriptInterface(new Bridge(getApplicationContext()), "PetAndroid");
        setContentView(web);
        web.loadUrl("file:///android_asset/pet.html?edition=full");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !getPreferences(MODE_PRIVATE).getBoolean("askedNotify", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("askedNotify", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override protected void onResume() {
        super.onResume(); visible = true; immersive();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(CallReceiver.ID);
        if (web != null) web.onResume();
    }
    @Override protected void onPause() { visible = false; if (web != null) { web.evaluateJavascript("window.PET&&PET.save()", null); web.onPause(); } super.onPause(); }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
    @Override public void onBackPressed() { web.evaluateJavascript("window.PET&&PET.pressC()", null); }

    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Called from the page. */
    static class Bridge {
        private final Context ctx;
        Bridge(Context c) { ctx = c; }
        private PendingIntent pi(String title, String text) {
            Intent i = new Intent(ctx, CallReceiver.class).putExtra("title", title).putExtra("text", text);
            return PendingIntent.getBroadcast(ctx, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        @JavascriptInterface public void schedule(String atMs, String title, String text) {
            try {
                long at = Long.parseLong(atMs);
                AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(title, text));
            } catch (Exception ignored) {}
        }
        @JavascriptInterface public void cancel() {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            am.cancel(pi("", ""));
        }
    }
}
