package com.unicornclock.app

import android.app.admin.DeviceAdminReceiver

/** Present only so a grown-up can make the clock the device owner for full lockdown (optional). */
class AdminReceiver : DeviceAdminReceiver()
