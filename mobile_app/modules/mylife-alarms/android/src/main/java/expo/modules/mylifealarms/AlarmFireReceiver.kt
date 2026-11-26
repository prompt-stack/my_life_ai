// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

class AlarmFireReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmScheduler.ACTION_FIRE) return
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
    val isSnooze = intent.getBooleanExtra(AlarmScheduler.EXTRA_IS_SNOOZE, false)
    // A throw from a background broadcast would crash the host app; fail quietly instead.
    runCatching {
      val alarm = AlarmScheduler.onFired(context, id, isSnooze) ?: return
      // App in front and screen on: the app shows its own ringing overlay, so skip the full-screen
      // takeover. The service still rings and posts the notification with Stop / Snooze.
      val interactive = context.getSystemService(PowerManager::class.java)?.isInteractive == true
      val inApp = AlarmEvents.appInForeground && interactive
      AlarmRingService.start(context, alarm.id, inApp)
      AlarmEvents.fired(alarm.id, inApp)
      AlarmEvents.changed()
    }
  }
}
