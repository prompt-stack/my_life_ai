// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build

internal object AlarmNotifications {
  const val CHANNEL_ID = "mylife_alarms_ringing"
  const val NOTIFICATION_ID = 7421

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Rings when one of your alarms goes off"
      // The service plays the sound and vibration itself (looping, with a volume ramp).
      setSound(null, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }
    nm.createNotificationChannel(channel)
  }

  private fun servicePendingIntent(ctx: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(ctx, AlarmRingService::class.java).setAction(action)
    return PendingIntent.getService(ctx, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun ringActivityIntent(ctx: Context, alarmId: String): Intent =
    Intent(ctx, AlarmRingActivity::class.java).apply {
      putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    }

  fun build(ctx: Context, alarm: StoredAlarm, fullScreen: Boolean = true): Notification {
    ensureChannel(ctx)
    val activityPi = PendingIntent.getActivity(
      ctx, alarm.id.hashCode(), ringActivityIntent(ctx, alarm.id),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val stopPi = servicePendingIntent(ctx, AlarmRingService.ACTION_STOP, 1)
    val snoozePi = servicePendingIntent(ctx, AlarmRingService.ACTION_SNOOZE, 2)
    val title = alarm.label?.takeIf { it.isNotBlank() } ?: "Alarm"
    val time = String.format("%02d:%02d", alarm.hour, alarm.minute)

    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL_ID) else Notification.Builder(ctx)
    builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText(time)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(activityPi)
      .addAction(Notification.Action.Builder(null, "Snooze", snoozePi).build())
      .addAction(Notification.Action.Builder(null, "Stop", stopPi).build())
    // Full-screen takeover when permitted; otherwise a heads-up notification (HIGH importance).
    // Skipped while the app is in the foreground: the app shows its own ringing overlay instead.
    if (fullScreen) builder.setFullScreenIntent(activityPi, true)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      builder.setPriority(Notification.PRIORITY_MAX)
    }
    return builder.build()
  }
}
