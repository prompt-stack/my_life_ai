// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

private fun permissionRequired(msg: String) = CodedException("ERR_PERMISSION_REQUIRED", msg, null)
private fun notFound(id: String) = CodedException("ERR_NOT_FOUND", "No alarm with id $id.", null)
private fun invalidArgs(msg: String) = CodedException("ERR_INVALID_ARGS", msg, null)

class MyLifeAlarmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw CodedException("ERR_UNAVAILABLE", "React context is not available.", null)

  private val listener = object : AlarmEvents.Listener {
    override fun onFired(alarmId: String, inApp: Boolean) {
      sendEvent("onAlarmFired", mapOf("id" to alarmId, "inApp" to inApp))
    }

    override fun onDismissed(alarmId: String, reason: String) {
      sendEvent("onAlarmDismissed", mapOf("id" to alarmId, "reason" to reason))
    }

    override fun onChanged() {
      sendEvent("onAlarmsChanged", emptyMap())
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MyLifeAlarms")

    Events("onAlarmFired", "onAlarmDismissed", "onAlarmsChanged")

    OnCreate {
      AlarmEvents.add(listener)
      // The module may load after the activity is already in front, so seed from the process state.
      AlarmEvents.appInForeground = runCatching {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
      }.getOrDefault(false)
    }
    OnDestroy { AlarmEvents.remove(listener) }

    OnActivityEntersForeground { AlarmEvents.appInForeground = true }
    OnActivityEntersBackground { AlarmEvents.appInForeground = false }
    OnActivityDestroys { AlarmEvents.appInForeground = false }

    Function("isSupported") { true }

    AsyncFunction("getPermissions") {
      val ctx = context
      val nm = ctx.getSystemService(NotificationManager::class.java)
      mapOf(
        "exactAlarm" to if (AlarmScheduler.canScheduleExact(ctx)) "granted" else "denied",
        "fullScreen" to when {
          Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> "not_applicable"
          nm.canUseFullScreenIntent() -> "granted"
          else -> "denied"
        },
        "notifications" to if (nm.areNotificationsEnabled()) "granted" else "denied"
      )
    }

    AsyncFunction("requestExactAlarmPermission") {
      val ctx = context
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !AlarmScheduler.canScheduleExact(ctx)) {
        startSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, withPackage = true)
      }
    }

    AsyncFunction("requestFullScreenPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (!nm.canUseFullScreenIntent()) {
          startSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, withPackage = true)
        }
      }
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      val ctx = context
      val nm = ctx.getSystemService(NotificationManager::class.java)
      val permissions = appContext.permissions
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || permissions == null) {
        promise.resolve(if (nm.areNotificationsEnabled()) "granted" else "denied")
      } else {
        permissions.askForPermissions({ result ->
          val granted = result[Manifest.permission.POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED
          promise.resolve(if (granted) "granted" else "denied")
        }, Manifest.permission.POST_NOTIFICATIONS)
      }
    }

    // iOS-only in practice; on Android there is no separate authorization step.
    AsyncFunction("requestAuthorization") { "granted" }

    AsyncFunction("openBatterySettings") {
      val opened = runCatching { startSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS, withPackage = false) }
      if (opened.isFailure) startSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, withPackage = true)
    }

    // Best effort: Xiaomi / Redmi / POCO (MIUI, HyperOS) keep an "Autostart" screen that decides
    // whether apps may start in the background after a reboot. Returns true if that screen opened.
    AsyncFunction("openAutostartSettings") {
      val maker = Build.MANUFACTURER.lowercase()
      var opened = false
      if (maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco")) {
        val intent = Intent().apply {
          component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        opened = runCatching { context.startActivity(intent) }.isSuccess
      }
      if (!opened) startSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, withPackage = true)
      opened
    }

    AsyncFunction("listAlarms") {
      val ctx = context
      AlarmStore.all(ctx).sortedWith(compareBy({ it.hour }, { it.minute })).map { toJs(it) }
    }

    AsyncFunction("createAlarm") { input: Map<String, Any?> ->
      val ctx = context
      val hour = intArg(input["hour"], "hour", 0..23)
      val minute = intArg(input["minute"], "minute", 0..59)
      val weekdays = weekdaysArg(input["weekdays"])
      val sound = soundArg(input["sound"])
      val enabled = (input["enabled"] as? Boolean) ?: true
      val label = (input["label"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
      if (enabled && !AlarmScheduler.canScheduleExact(ctx)) {
        throw permissionRequired("Exact alarm permission is required to schedule alarms.")
      }
      val alarm = StoredAlarm(UUID.randomUUID().toString(), hour, minute, weekdays, label, sound, enabled)
      val saved = scheduleOrThrow(ctx, alarm)
      AlarmEvents.changed()
      toJs(saved)
    }

    AsyncFunction("updateAlarm") { id: String, changes: Map<String, Any?> ->
      val ctx = context
      val current = AlarmStore.get(ctx, id) ?: throw notFound(id)
      var next = current
      if (changes.containsKey("hour")) next = next.copy(hour = intArg(changes["hour"], "hour", 0..23))
      if (changes.containsKey("minute")) next = next.copy(minute = intArg(changes["minute"], "minute", 0..59))
      if (changes.containsKey("weekdays")) next = next.copy(weekdays = weekdaysArg(changes["weekdays"]))
      if (changes.containsKey("label")) {
        next = next.copy(label = (changes["label"] as? String)?.trim()?.takeIf { it.isNotEmpty() })
      }
      if (changes.containsKey("sound")) next = next.copy(sound = soundArg(changes["sound"]))
      if (changes.containsKey("enabled")) {
        next = next.copy(enabled = changes["enabled"] as? Boolean ?: throw invalidArgs("enabled must be a boolean."))
      }
      if (next.enabled && !AlarmScheduler.canScheduleExact(ctx)) {
        throw permissionRequired("Exact alarm permission is required to schedule alarms.")
      }
      val saved = scheduleOrThrow(ctx, next)
      AlarmEvents.changed()
      toJs(saved)
    }

    AsyncFunction("deleteAlarm") { id: String ->
      val ctx = context
      if (AlarmStore.get(ctx, id) == null) throw notFound(id)
      AlarmScheduler.cancel(ctx, id)
      if (AlarmRingService.ringingId == id) AlarmRingService.stop(ctx)
      AlarmStore.remove(ctx, id)
      AlarmEvents.changed()
    }

    AsyncFunction("getRingingAlarmId") { AlarmRingService.ringingId }

    // Silences the ringing alarm without dismissing it (for a voice turn). Auto-resumes after 20 s.
    AsyncFunction("pauseRinging") { AlarmRingService.pause(context) }

    AsyncFunction("resumeRinging") { AlarmRingService.resume(context) }

    // Ducks the ringing alarm while the app listens for "AI": 1 = normal, 0.25 = quiet. Not persisted.
    AsyncFunction("setRingVolume") { fraction: Double ->
      AlarmRingService.setVolume(context, fraction.toFloat().coerceIn(0f, 1f))
    }

    // With an id, it must be the alarm that is ringing right now; without one it stops whatever rings.
    AsyncFunction("stopRinging") { id: String? ->
      requireRinging(id)
      AlarmRingService.stop(context)
    }

    AsyncFunction("snooze") { id: String?, minutes: Int? ->
      requireRinging(id)
      val m = minutes ?: AlarmScheduler.DEFAULT_SNOOZE_MINUTES
      if (m !in 1..120) throw invalidArgs("minutes must be between 1 and 120.")
      AlarmRingService.snooze(context, m)
    }
  }

  private fun requireRinging(id: String?) {
    if (id == null) return
    if (AlarmRingService.ringingId != id) throw notFound(id)
  }

  private fun scheduleOrThrow(ctx: Context, alarm: StoredAlarm): StoredAlarm =
    try {
      AlarmScheduler.schedule(ctx, alarm)
    } catch (e: SecurityException) {
      throw permissionRequired("Exact alarm permission is required to schedule alarms.")
    }

  private fun startSettings(action: String, withPackage: Boolean) {
    val ctx = context
    val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (withPackage) intent.data = Uri.parse("package:${ctx.packageName}")
    ctx.startActivity(intent)
  }

  private fun toJs(a: StoredAlarm): Map<String, Any?> = mapOf(
    "id" to a.id,
    "hour" to a.hour,
    "minute" to a.minute,
    "weekdays" to a.weekdays,
    "label" to a.label,
    "sound" to a.sound,
    "enabled" to a.enabled,
    "nextTriggerAt" to AlarmScheduler.nextTriggerFor(a)?.let { AlarmScheduler.isoString(it) }
  )

  private fun intArg(v: Any?, name: String, range: IntRange): Int {
    val n = (v as? Number)?.toDouble() ?: throw invalidArgs("$name must be a number.")
    if (n != Math.floor(n) || n.toInt() !in range) throw invalidArgs("$name must be an integer in $range.")
    return n.toInt()
  }

  private fun weekdaysArg(v: Any?): List<Int> {
    if (v == null) return emptyList()
    val list = v as? List<*> ?: throw invalidArgs("weekdays must be an array.")
    val days = list.map { (it as? Number)?.toInt() ?: throw invalidArgs("weekdays must contain numbers.") }
    if (days.any { it !in 1..7 }) throw invalidArgs("weekdays use 1 (Monday) to 7 (Sunday).")
    return days.distinct().sorted()
  }

  private fun soundArg(v: Any?): String {
    val s = v as? String ?: return Sounds.DEFAULT
    if (!Sounds.isValid(s)) throw invalidArgs("Unknown sound '$s'.")
    return s
  }
}
