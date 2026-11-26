// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Schedules alarms with AlarmManager.setAlarmClock (exact, exempt from Doze, shows the system alarm icon). */
internal object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.mylifealarms.action.FIRE"
  const val EXTRA_ALARM_ID = "alarm_id"
  const val EXTRA_IS_SNOOZE = "is_snooze"
  const val DEFAULT_SNOOZE_MINUTES = 9

  private fun alarmManager(ctx: Context) = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(ctx).canScheduleExactAlarms()

  /** Next wall-clock occurrence strictly after [nowMs] in the current default time zone. */
  fun nextTrigger(alarm: StoredAlarm, nowMs: Long): Long {
    for (offset in 0..7) {
      val cal = Calendar.getInstance()
      cal.timeInMillis = nowMs
      cal.add(Calendar.DAY_OF_YEAR, offset)
      cal.set(Calendar.HOUR_OF_DAY, alarm.hour)
      cal.set(Calendar.MINUTE, alarm.minute)
      cal.set(Calendar.SECOND, 0)
      cal.set(Calendar.MILLISECOND, 0)
      if (cal.timeInMillis <= nowMs) continue
      if (alarm.weekdays.isEmpty() || isoWeekday(cal) in alarm.weekdays) return cal.timeInMillis
    }
    error("unreachable: a valid alarm always has an occurrence within 8 days")
  }

  /** ISO weekday: 1 = Monday ... 7 = Sunday (Calendar uses 1 = Sunday ... 7 = Saturday). */
  private fun isoWeekday(cal: Calendar): Int = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1

  fun isoString(epochMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date(epochMs))

  private fun firePendingIntent(ctx: Context, id: String, snooze: Boolean): PendingIntent {
    val intent = Intent(ctx, AlarmFireReceiver::class.java).apply {
      action = ACTION_FIRE
      data = Uri.parse("mylife-alarm://${if (snooze) "snooze" else "alarm"}/$id")
      putExtra(EXTRA_ALARM_ID, id)
      putExtra(EXTRA_IS_SNOOZE, snooze)
    }
    return PendingIntent.getBroadcast(
      ctx, id.hashCode() + if (snooze) 1 else 0, intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  /** Tapping the system alarm icon opens the app. */
  private fun showPendingIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun setClock(ctx: Context, at: Long, pi: PendingIntent) {
    alarmManager(ctx).setAlarmClock(AlarmManager.AlarmClockInfo(at, showPendingIntent(ctx) ?: pi), pi)
  }

  /**
   * (Re)schedules [alarm] and persists the result. Disabled alarms are cancelled.
   * Throws SecurityException if exact alarms are not permitted.
   */
  fun schedule(ctx: Context, alarm: StoredAlarm): StoredAlarm {
    cancelNative(ctx, alarm.id)
    if (!alarm.enabled) {
      return alarm.copy(nextAt = null).also { AlarmStore.put(ctx, it) }
    }
    val at = nextTrigger(alarm, System.currentTimeMillis())
    setClock(ctx, at, firePendingIntent(ctx, alarm.id, false))
    return alarm.copy(nextAt = at).also { AlarmStore.put(ctx, it) }
  }

  private fun cancelNative(ctx: Context, id: String) {
    alarmManager(ctx).cancel(firePendingIntent(ctx, id, false))
  }

  fun cancel(ctx: Context, id: String) {
    cancelNative(ctx, id)
    alarmManager(ctx).cancel(firePendingIntent(ctx, id, true))
    val snooze = AlarmStore.snooze(ctx)
    if (snooze?.first == id) AlarmStore.clearSnooze(ctx)
  }

  fun snooze(ctx: Context, id: String, minutes: Int) {
    val at = System.currentTimeMillis() + minutes * 60_000L
    AlarmStore.setSnooze(ctx, id, at)
    try {
      setClock(ctx, at, firePendingIntent(ctx, id, true))
    } catch (_: SecurityException) {
      // Exact-alarm permission revoked while ringing: the alarm simply won't snooze.
      AlarmStore.clearSnooze(ctx)
    }
    AlarmEvents.changed()
  }

  /**
   * Called when an alarm fires. Repeating alarms schedule their next occurrence; one-time alarms
   * disable themselves. Returns the alarm if it should ring.
   */
  fun onFired(ctx: Context, id: String, isSnooze: Boolean): StoredAlarm? {
    val alarm = AlarmStore.get(ctx, id) ?: return null
    if (isSnooze) {
      AlarmStore.clearSnooze(ctx)
      return alarm
    }
    if (!alarm.enabled) return null
    if (alarm.isRepeating) {
      try {
        schedule(ctx, alarm)
      } catch (_: SecurityException) {
        AlarmStore.put(ctx, alarm.copy(nextAt = null))
      }
    } else {
      AlarmStore.put(ctx, alarm.copy(enabled = false, nextAt = null))
    }
    return alarm
  }

  /** Boot / update / time or time-zone change: AlarmManager lost its alarms or wall-clock times moved. */
  fun rescheduleAll(ctx: Context) {
    val now = System.currentTimeMillis()
    for (alarm in AlarmStore.all(ctx)) {
      if (!alarm.enabled) continue
      // A one-time alarm whose moment passed while the phone was off or the app updated is missed:
      // never ring it a day late.
      if (!alarm.isRepeating && (alarm.nextAt ?: 0L) <= now) {
        AlarmStore.put(ctx, alarm.copy(enabled = false, nextAt = null))
        continue
      }
      try {
        schedule(ctx, alarm)
      } catch (_: SecurityException) {
        AlarmStore.put(ctx, alarm.copy(nextAt = null))
      }
    }
    AlarmStore.snooze(ctx)?.let { (id, at) ->
      if (at > now && AlarmStore.get(ctx, id) != null) {
        try { setClock(ctx, at, firePendingIntent(ctx, id, true)) } catch (_: SecurityException) { AlarmStore.clearSnooze(ctx) }
      } else {
        AlarmStore.clearSnooze(ctx)
      }
    }
    AlarmEvents.changed()
  }

  /** What `nextTriggerAt` reports to JS. */
  fun nextTriggerFor(alarm: StoredAlarm): Long? {
    if (!alarm.enabled) return null
    val now = System.currentTimeMillis()
    val stored = alarm.nextAt
    return if (stored != null && stored > now) stored else if (alarm.isRepeating) nextTrigger(alarm, now) else null
  }
}
