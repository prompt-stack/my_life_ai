// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import java.util.concurrent.CopyOnWriteArraySet

/**
 * Bridges receivers/service back to whoever is listening (the JS module, the ringing activity)
 * when, and only when, they are alive. State is persisted by [AlarmStore] regardless.
 */
internal object AlarmEvents {
  interface Listener {
    /** [inApp]: the app was in the foreground, so no full-screen ringing screen was launched. */
    fun onFired(alarmId: String, inApp: Boolean) {}
    /** reason: "stop" | "snooze" | "timeout" | "replaced" */
    fun onDismissed(alarmId: String, reason: String) {}
    fun onChanged() {}
  }

  private val listeners = CopyOnWriteArraySet<Listener>()

  /**
   * True while the app's own activity is resumed (maintained by the module's activity lifecycle
   * hooks). False when the process was started by the alarm, or the app is backgrounded.
   */
  @Volatile var appInForeground = false

  fun add(l: Listener) { listeners.add(l) }
  fun remove(l: Listener) { listeners.remove(l) }

  fun fired(id: String, inApp: Boolean) = listeners.forEach { it.onFired(id, inApp) }
  fun dismissed(id: String, reason: String) = listeners.forEach { it.onDismissed(id, reason) }
  fun changed() = listeners.forEach { it.onChanged() }
}
