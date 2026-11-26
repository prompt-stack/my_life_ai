// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One alarm as persisted natively. Weekdays use ISO numbering: 1 = Monday ... 7 = Sunday. */
internal data class StoredAlarm(
  val id: String,
  val hour: Int,
  val minute: Int,
  val weekdays: List<Int>,
  val label: String?,
  val sound: String,
  val enabled: Boolean,
  /** Epoch millis of the occurrence currently scheduled in AlarmManager (null when disabled). */
  val nextAt: Long? = null
) {
  val isRepeating: Boolean get() = weekdays.isNotEmpty()

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("hour", hour)
    .put("minute", minute)
    .put("weekdays", JSONArray(weekdays))
    .put("label", label ?: JSONObject.NULL)
    .put("sound", sound)
    .put("enabled", enabled)
    .put("nextAt", nextAt ?: JSONObject.NULL)

  companion object {
    fun fromJson(o: JSONObject): StoredAlarm {
      val days = o.optJSONArray("weekdays")
      return StoredAlarm(
        id = o.getString("id"),
        hour = o.getInt("hour"),
        minute = o.getInt("minute"),
        weekdays = (0 until (days?.length() ?: 0)).map { days!!.getInt(it) },
        label = if (o.isNull("label")) null else o.optString("label"),
        sound = o.optString("sound", Sounds.DEFAULT),
        enabled = o.optBoolean("enabled", true),
        nextAt = if (o.isNull("nextAt")) null else o.optLong("nextAt")
      )
    }
  }
}

internal object Sounds {
  const val DEFAULT = "sunrise"
  val IDS = listOf("sunrise", "chimes", "marimba", "piano", "guitar")
  fun isValid(id: String) = id in IDS
  /** Raw resource name copied into res/raw by the config plugin. */
  fun resourceName(id: String) = "alarm_$id"
}

/**
 * Persists alarms in SharedPreferences (JSON). Native persistence matters: the boot and
 * time-change receivers run without any JavaScript, and AlarmManager forgets everything on reboot.
 */
internal object AlarmStore {
  private const val PREFS = "mylife_alarms"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_SNOOZE_ID = "snooze_id"
  private const val KEY_SNOOZE_AT = "snooze_at"
  private val lock = Any()

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun all(ctx: Context): List<StoredAlarm> = synchronized(lock) {
    val raw = prefs(ctx).getString(KEY_ALARMS, null) ?: return emptyList()
    try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { StoredAlarm.fromJson(arr.getJSONObject(it)) }
    } catch (e: Exception) {
      emptyList()
    }
  }

  fun get(ctx: Context, id: String): StoredAlarm? = all(ctx).firstOrNull { it.id == id }

  fun put(ctx: Context, alarm: StoredAlarm) = synchronized(lock) {
    val list = all(ctx).filter { it.id != alarm.id } + alarm
    save(ctx, list)
  }

  fun remove(ctx: Context, id: String) = synchronized(lock) {
    save(ctx, all(ctx).filter { it.id != id })
  }

  private fun save(ctx: Context, list: List<StoredAlarm>) {
    val arr = JSONArray()
    list.forEach { arr.put(it.toJson()) }
    prefs(ctx).edit().putString(KEY_ALARMS, arr.toString()).apply()
  }

  fun snooze(ctx: Context): Pair<String, Long>? {
    val p = prefs(ctx)
    val id = p.getString(KEY_SNOOZE_ID, null) ?: return null
    return id to p.getLong(KEY_SNOOZE_AT, 0L)
  }

  fun setSnooze(ctx: Context, id: String, at: Long) {
    prefs(ctx).edit().putString(KEY_SNOOZE_ID, id).putLong(KEY_SNOOZE_AT, at).apply()
  }

  fun clearSnooze(ctx: Context) {
    prefs(ctx).edit().remove(KEY_SNOOZE_ID).remove(KEY_SNOOZE_AT).apply()
  }
}
