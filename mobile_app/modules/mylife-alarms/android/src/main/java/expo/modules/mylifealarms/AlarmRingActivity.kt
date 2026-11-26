// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen ringing screen shown over the lock screen. Built in code so the module ships no
 * layout resources and inherits nothing from the host theme (dark, high contrast).
 */
class AlarmRingActivity : Activity() {
  private val listener = object : AlarmEvents.Listener {
    override fun onDismissed(alarmId: String, reason: String) {
      if (alarmId == alarmIdShown && reason != "replaced") runOnUiThread { finish() }
    }
  }
  private var alarmIdShown: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    AlarmEvents.add(listener)
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bind(intent)
  }

  override fun onResume() {
    super.onResume()
    // Stopped from the notification while this screen was in the background.
    if (AlarmRingService.ringingId == null) finish()
  }

  override fun onDestroy() {
    AlarmEvents.remove(listener)
    super.onDestroy()
  }

  @Deprecated("The alarm cannot be dismissed with the back gesture; use Stop or Snooze.")
  override fun onBackPressed() {
    // Intentionally ignored.
  }

  private fun bind(intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
    val alarm = id?.let { AlarmStore.get(this, it) }
    if (alarm == null) {
      finish()
      return
    }
    alarmIdShown = alarm.id
    setContentView(buildContent(alarm))
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildContent(alarm: StoredAlarm): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#111114"))
      setPadding(dp(32), dp(48), dp(32), dp(48))
    }
    root.addView(TextView(this).apply {
      text = String.format("%02d:%02d", alarm.hour, alarm.minute)
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 72f)
      typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      text = alarm.label?.takeIf { it.isNotBlank() } ?: "Alarm"
      setTextColor(Color.parseColor("#C8C8D0"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, dp(48))
    })
    root.addView(actionButton("Stop", filled = true) {
      AlarmRingService.stop(this)
      finish()
    })
    root.addView(actionButton("Snooze ${AlarmScheduler.DEFAULT_SNOOZE_MINUTES} min", filled = false) {
      AlarmRingService.snooze(this, AlarmScheduler.DEFAULT_SNOOZE_MINUTES)
      finish()
    })
    root.addView(actionButton("Speak", filled = false, description = "Talk to MyLife") {
      openAssistant()
    })
    return root
  }

  /**
   * Opens the app's Assistant ready to listen (`<scheme>://assistant?voice=1`). The alarm keeps
   * ringing: only the activity closes, the service is untouched. The assistant pauses the sound
   * while it listens and resumes it afterwards. Over the lock screen the system asks the user to
   * unlock first (the user is present: they tapped the button).
   */
  private fun openAssistant() {
    // `t` makes every tap a distinct URL so the app re-triggers even if it already shows ?voice=1.
    val uri = Uri.parse("$APP_SCHEME://assistant?voice=1&t=${System.currentTimeMillis()}")
    val launch = Intent(Intent.ACTION_VIEW, uri)
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (runCatching { startActivity(launch) }.isSuccess) finish()
  }

  private fun actionButton(
    label: String,
    filled: Boolean,
    description: String = label,
    onClick: () -> Unit,
  ): Button =
    Button(this).apply {
      text = label
      isAllCaps = false
      contentDescription = description
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      setTextColor(if (filled) Color.parseColor("#111114") else Color.WHITE)
      background = GradientDrawable().apply {
        cornerRadius = dp(40).toFloat()
        if (filled) setColor(Color.WHITE) else {
          setColor(Color.TRANSPARENT)
          setStroke(dp(2), Color.WHITE)
        }
      }
      minHeight = dp(80)
      minimumHeight = dp(80)
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        bottomMargin = dp(16)
      }
      setOnClickListener { onClick() }
    }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private companion object {
    /** Must match `scheme` in mobile_app/app.json. */
    const val APP_SCHEME = "mylifeai"
  }
}
