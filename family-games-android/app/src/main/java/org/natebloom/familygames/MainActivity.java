package org.natebloom.familygames;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Family Games: one button that downloads and installs the tablet games (Pocket Pet and OpenTTD).
 * Android asks once per app ("Do you want to install this app?"); everything else is done here.
 */
public class MainActivity extends Activity {
    static final String TAG = "FamilyGames";
    static final String ACTION_DONE = "org.natebloom.familygames.INSTALL_DONE";

    /** name, what it is, download (public releases of nathan-san1981/nate-bloom) */
    static final String[][] APPS = {
        {"Pocket Pet", "a pocket pet to hatch and raise",
            "https://github.com/nathan-san1981/nate-bloom/releases/download/pocket-pet-v1.0.2/PocketPet-1.0.2.apk"},
        {"OpenTTD", "build railways, roads and towns (Transport Tycoon)",
            "https://github.com/nathan-san1981/nate-bloom/releases/download/unicorn-railways-v0.1.25/OpenTTD-tablet-0.1.25.apk"},
    };

    TextView status;
    Button button;
    int next = 0;
    boolean busy = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        float d = getResources().getDisplayMetrics().density;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = (int) (32 * d);
        col.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("Family Games");
        title.setTextSize(34);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.parseColor("#7A1F4C"));
        title.setGravity(Gravity.CENTER);
        col.addView(title);

        StringBuilder list = new StringBuilder("This puts these games on the tablet:\n");
        for (String[] a : APPS) list.append("\n•  ").append(a[0]).append(": ").append(a[1]);
        TextView what = text(list.toString(), 18);
        what.setGravity(Gravity.START);
        col.addView(what, lp(d, 24));

        button = new Button(this);
        button.setText("Install the games");
        button.setTextSize(24);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#C2367E"));
        bg.setCornerRadius(40 * d);
        button.setBackground(bg);
        button.setPadding(pad, (int) (18 * d), pad, (int) (18 * d));
        button.setOnClickListener(v -> start());
        col.addView(button, lp(d, 32));

        status = text("Tap the button. For each game the tablet asks \"Do you want to install this app?\": tap Install.", 18);
        col.addView(status, lp(d, 24));

        ScrollView sv = new ScrollView(this);
        sv.addView(col);
        setContentView(sv);
        handle(getIntent());
    }

    TextView text(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor("#3B2350"));
        t.setGravity(Gravity.CENTER);
        t.setLineSpacing(0, 1.2f);
        return t;
    }

    LinearLayout.LayoutParams lp(float d, int topDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = (int) (topDp * d);
        return p;
    }

    void say(String s) { runOnUiThread(() -> status.setText(s)); }

    void start() {
        if (busy) return;
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            say("One-time step: switch on \"Allow from this source\" on the next screen, then come back here and tap the button again.");
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                Log.e(TAG, "settings", e);
            }
            return;
        }
        busy = true;
        button.setEnabled(false);
        button.setAlpha(0.5f);
        installNext();
    }

    void installNext() {
        if (next >= APPS.length) {
            busy = false;
            say("All done! The games are on the home screen and in the app list. You can delete Family Games now.");
            runOnUiThread(() -> { button.setText("Done"); });
            return;
        }
        final String[] app = APPS[next];
        new Thread(() -> {
            try {
                File f = new File(getCacheDir(), "app" + next + ".apk");
                download(app[2], f, app[0]);
                say("Installing " + app[0] + "…");
                commit(f, app[0]);
            } catch (Exception e) {
                Log.e(TAG, "install " + app[0], e);
                failed(app[0] + " couldn't download. Check the Wi-Fi and tap the button to try again.");
            }
        }).start();
    }

    void download(String url, File out, String name) throws Exception {
        HttpURLConnection c = null;
        for (int hop = 0; hop < 6; hop++) {   // GitHub sends release downloads on to its file servers
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { url = c.getHeaderField("Location"); c.disconnect(); continue; }
            if (code != 200) throw new Exception("HTTP " + code);
            break;
        }
        long total = c.getContentLengthLong(), got = 0;
        int lastPct = -1;
        try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) {
                o.write(buf, 0, n);
                got += n;
                int pct = total > 0 ? (int) (got * 100 / total) : -1;
                if (pct != lastPct) { lastPct = pct; say("Downloading " + name + (pct >= 0 ? "… " + pct + "%" : "…")); }
            }
        }
    }

    void commit(File f, String name) throws Exception {
        PackageInstaller pi = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setSize(f.length());
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(f); OutputStream o = s.openWrite(name, 0, f.length())) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
                s.fsync(o);
            }
            Intent done = new Intent(this, MainActivity.class).setAction(ACTION_DONE);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getActivity(this, id, done, flags);
            s.commit(pend.getIntentSender());
        }
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handle(i);
    }

    void handle(Intent i) {
        if (i == null || !ACTION_DONE.equals(i.getAction())) return;
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String name = next < APPS.length ? APPS[next][0] : "the game";
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                say("Tap Install to put " + name + " on the tablet.");
                startActivity(confirm);
            }
        } else if (st == PackageInstaller.STATUS_SUCCESS) {
            new File(getCacheDir(), "app" + next + ".apk").delete();
            next++;
            installNext();
        } else {
            String msg = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Log.e(TAG, "install failed: " + st + " " + msg);
            failed(name + " wasn't installed" + (st == PackageInstaller.STATUS_FAILURE_ABORTED ? " (Cancel was tapped)" : "")
                + ". Tap the button to try again.");
        }
    }

    void failed(String msg) {
        runOnUiThread(() -> {
            busy = false;
            status.setText(msg);
            button.setEnabled(true);
            button.setAlpha(1f);
            button.setText("Try again");
        });
    }
}
