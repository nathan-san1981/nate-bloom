package org.natebloom.pocketpet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The pet is calling: a notification (unless the app is already open). Tapping it opens the pet. */
public class CallReceiver extends BroadcastReceiver {
    static final int ID = 1;
    @Override
    public void onReceive(Context ctx, Intent in) {
        if (MainActivity.visible) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("calls", "Pet calls", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(ctx, "calls")
                .setSmallIcon(android.R.drawable.star_on)
                .setContentTitle(in.getStringExtra("title"))
                .setContentText(in.getStringExtra("text"))
                .setContentIntent(open).setAutoCancel(true).build();
        try { nm.notify(ID, n); } catch (SecurityException ignored) {}
    }
}
