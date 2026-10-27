package com.natebloom.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Keeps Nate Bloom running while it plays and you're in another app (or the screen is off):
 * a media-playback foreground service with a notification, and a partial wake lock.
 */
class PlaybackService : Service() {

    companion object {
        private const val CHANNEL = "playback"
        private const val ID = 7
        @Volatile private var running = false

        fun start(ctx: Context) {
            if (running) return
            try {
                ctx.startForegroundService(Intent(ctx, PlaybackService::class.java))
            } catch (e: Exception) {
                Log.w(MainActivity.TAG, "couldn't start playback service", e)
            }
        }

        fun stop(ctx: Context) {
            if (!running) return
            ctx.stopService(Intent(ctx, PlaybackService::class.java))
        }
    }

    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n: Notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_play)
            .setContentTitle(getString(R.string.playing_title))
            .setContentText(getString(R.string.playing_text))
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(ID, n)
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NateBloom:playback").apply { acquire(4 * 60 * 60 * 1000L) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onDestroy() {
        running = false
        wake?.let { if (it.isHeld) it.release() }
        wake = null
        super.onDestroy()
    }
}
