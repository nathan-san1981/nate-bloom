package com.unicornclock.railways;

import android.content.res.AssetManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;

import org.libsdl.app.SDLActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** OpenTTD (libmain.so) on SDL2. Before the game starts, the base sets and starting config in the APK's
 *  assets/game are copied to the app's internal storage, once per installed version. */
public class RailwaysActivity extends SDLActivity {
    private static final String TAG = "UnicornRailways";

    @Override
    protected String[] getLibraries() {
        return new String[] { "SDL2", "main" };
    }

    @Override
    protected String[] getArguments() {
        // SDL video, SDL sound, no music driver yet. The emulator tests can ask for a new game straight away
        // (extra ottd_args = "-g"); nothing else is accepted from outside.
        java.util.ArrayList<String> a = new java.util.ArrayList<>(java.util.Arrays.asList("-v", "sdl", "-s", "sdl", "-m", "null"));
        String extra = getIntent() != null ? getIntent().getStringExtra("ottd_args") : null;
        if ("-g".equals(extra)) a.add("-g");
        return a.toArray(new String[0]);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        immersive(); // before the game's surface exists, so it starts at full size
        try {
            unpackAssets();
        } catch (Exception e) {
            Log.e(TAG, "couldn't unpack the game files", e);
        }
        super.onCreate(savedInstanceState);
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    /** Full screen from the very first frame, so the game's surface never changes size under it
     *  (a late switch left touches scaled to the old, shorter screen). */
    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    private void unpackAssets() throws Exception {
        File root = getFilesDir();
        long stamp = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        File marker = new File(root, ".unpacked");
        String want = Long.toString(stamp);
        if (marker.exists() && want.equals(readSmall(marker))) return;
        long t0 = System.currentTimeMillis();
        copyTree(getAssets(), "game", root, false);
        try (OutputStream o = new FileOutputStream(marker)) { o.write(want.getBytes("UTF-8")); }
        Log.i(TAG, "unpacked game files in " + (System.currentTimeMillis() - t0) + " ms");
    }

    /** Copies assets/<path> into dir. Files under config/ are only written if missing, so her settings stay. */
    private void copyTree(AssetManager am, String path, File dir, boolean keepExisting) throws IOException {
        String[] names = am.list(path);
        if (names == null || names.length == 0) {
            File out = new File(dir, path.substring(path.indexOf('/') + 1));
            if (keepExisting && out.exists()) return;
            out.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream o = new FileOutputStream(out)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            }
            return;
        }
        for (String n : names) {
            String child = path + "/" + n;
            copyTree(am, child, dir, keepExisting || child.startsWith("game/config"));
        }
    }

    private static String readSmall(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[64];
            int n = in.read(b);
            return n > 0 ? new String(b, 0, n, "UTF-8") : "";
        } catch (IOException e) {
            return "";
        }
    }
}
