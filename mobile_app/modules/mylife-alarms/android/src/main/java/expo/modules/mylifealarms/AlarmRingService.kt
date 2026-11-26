// Part of MyLife AI. Structure (receiver/service/activity split, boot rescheduling, event bridge) is
// adapted from react-native-alarm-scheduler v1.1.0, MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
package expo.modules.mylifealarms

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Foreground service (type specialUse, subtype "User-scheduled alarm clock ringing") that owns
 * the ringing: looping sound on the alarm stream with a gradual volume ramp, vibration, a wake
 * lock and the alarm notification. Stops itself after [MAX_RING_MS].
 */
class AlarmRingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var focusRequest: AudioFocusRequest? = null
  private var currentId: String? = null
  private var rampStartedAt = 0L

  /** Multiplier applied on top of the ramp while the app listens for "AI" (1 = not ducked). */
  private var duck = 1f

  private fun rampFraction(): Float =
    ((System.currentTimeMillis() - rampStartedAt).toFloat() / RAMP_MS).coerceIn(0f, 1f)

  /** Sets the player volume from the ramp position and the duck multiplier. */
  private fun applyVolume() {
    val p = player ?: return
    val base = START_VOLUME + (1f - START_VOLUME) * rampFraction()
    val volume = (base * duck).coerceIn(0f, 1f)
    runCatching { p.setVolume(volume, volume) }
  }

  private val rampTick = object : Runnable {
    override fun run() {
      if (player == null) return
      applyVolume()
      if (rampFraction() < 1f) handler.postDelayed(this, RAMP_STEP_MS)
    }
  }

  /** The app re-asserts ducking while it listens; if it goes away, the alarm returns to full volume. */
  private val unduck = Runnable { setDuck(1f) }

  private val timeout = Runnable { finishRinging("timeout") }

  /** True while the sound and vibration are paused for a voice turn (the alarm is still "ringing"). */
  private var paused = false
  private val autoResume = Runnable { resumeRinging() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        if (currentId == null) stopSelf() else finishRinging("stop")
      }
      // Late control commands (the alarm just ended) must not leave an idle service running.
      ACTION_PAUSE -> if (currentId == null) stopSelf() else pauseRinging()
      ACTION_RESUME -> if (currentId == null) stopSelf() else resumeRinging()
      ACTION_SET_VOLUME ->
        if (currentId == null) stopSelf() else setDuck(intent?.getFloatExtra(EXTRA_VOLUME, 1f) ?: 1f)
      ACTION_SNOOZE -> {
        val id = currentId
        if (id == null) {
          stopSelf()
        } else {
          finishRinging("snooze")
          AlarmScheduler.snooze(this, id, intent?.getIntExtra(EXTRA_MINUTES, AlarmScheduler.DEFAULT_SNOOZE_MINUTES) ?: AlarmScheduler.DEFAULT_SNOOZE_MINUTES)
        }
      }
      else -> {
        val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        val alarm = id?.let { AlarmStore.get(this, it) }
        if (alarm == null) {
          // Must still satisfy startForegroundService's contract before bailing out.
          startForegroundCompat(AlarmNotifications.build(this, StoredAlarm("none", 0, 0, emptyList(), null, Sounds.DEFAULT, false)))
          stopForeground(STOP_FOREGROUND_REMOVE)
          stopSelf()
        } else {
          startRinging(alarm, intent?.getBooleanExtra(EXTRA_IN_APP, false) ?: false)
        }
      }
    }
    return START_NOT_STICKY
  }

  private fun startForegroundCompat(notification: android.app.Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(AlarmNotifications.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(AlarmNotifications.NOTIFICATION_ID, notification)
    }
  }

  private fun startRinging(alarm: StoredAlarm, inApp: Boolean) {
    startForegroundCompat(AlarmNotifications.build(this, alarm, fullScreen = !inApp))
    // A second alarm while one rings: take over, the first is reported as replaced.
    val previous = currentId
    if (previous != null && previous != alarm.id) {
      AlarmEvents.dismissed(previous, "replaced")
    }
    releaseResources()
    currentId = alarm.id
    acquireWakeLock()
    requestAudioFocus()
    startSound(alarm.sound)
    startVibration()
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, MAX_RING_MS)
  }

  /**
   * Silences sound and vibration so speech recognition can hear the user, without dismissing:
   * the foreground service, notification, wake lock and the 10-minute timeout all stay. If nobody
   * resumes or stops within [PAUSE_SAFETY_MS], ringing resumes by itself so a failed voice turn
   * can never leave an alarm silent.
   */
  private fun pauseRinging() {
    val p = player
    if (currentId == null || p == null) return
    if (!paused) {
      paused = true
      handler.removeCallbacks(rampTick)
      runCatching { if (p.isPlaying) p.pause() }
      stopVibration()
      abandonAudioFocus()
    }
    handler.removeCallbacks(autoResume)
    handler.postDelayed(autoResume, PAUSE_SAFETY_MS)
  }

  /** Ducks (or restores) the alarm volume without pausing it. Respects the ramp and survives pause/resume. */
  private fun setDuck(fraction: Float) {
    duck = fraction.coerceIn(0f, 1f)
    handler.removeCallbacks(unduck)
    if (duck < 1f) handler.postDelayed(unduck, DUCK_SAFETY_MS)
    if (currentId != null && !paused) applyVolume()
  }

  private fun resumeRinging() {
    handler.removeCallbacks(autoResume)
    val p = player
    if (currentId == null || p == null || !paused) return
    paused = false
    requestAudioFocus()
    runCatching { p.start() }
    // Ramp up again from the start volume so the alarm does not blast right after speech.
    rampStartedAt = System.currentTimeMillis()
    applyVolume()
    handler.postDelayed(rampTick, RAMP_STEP_MS)
    startVibration()
  }

  private fun alarmAttributes() = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private fun startSound(soundId: String) {
    val attrs = alarmAttributes()
    val mp = MediaPlayer()
    try {
      mp.setAudioAttributes(attrs)
      val resId = resources.getIdentifier(Sounds.resourceName(soundId), "raw", packageName)
      if (resId != 0) {
        resources.openRawResourceFd(resId).use { afd ->
          mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        }
      } else {
        // Sound resource missing (should not happen): fall back to the phone's default alarm tone.
        mp.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
      }
      mp.isLooping = true
      mp.setVolume(START_VOLUME, START_VOLUME)
      mp.prepare()
      mp.start()
      player = mp
      rampStartedAt = System.currentTimeMillis()
      handler.postDelayed(rampTick, RAMP_STEP_MS)
    } catch (e: Exception) {
      runCatching { mp.release() }
    }
  }

  @Suppress("DEPRECATION")
  private fun startVibration() {
    val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    if (vibrator?.hasVibrator() != true) return
    val pattern = longArrayOf(0, 700, 700)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), alarmAttributes())
    } else {
      vibrator.vibrate(pattern, 0, alarmAttributes())
    }
  }

  private fun stopVibration() {
    @Suppress("DEPRECATION")
    val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    vibrator?.cancel()
  }

  private fun acquireWakeLock() {
    val pm = getSystemService(PowerManager::class.java) ?: return
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MyLife:AlarmRinging").apply {
      acquire(MAX_RING_MS + 5_000L)
    }
  }

  private fun requestAudioFocus() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val am = getSystemService(AudioManager::class.java) ?: return
    val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(alarmAttributes())
      .build()
    am.requestAudioFocus(req)
    focusRequest = req
  }

  private fun abandonAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { getSystemService(AudioManager::class.java)?.abandonAudioFocusRequest(it) }
    }
    focusRequest = null
  }

  private fun releaseResources() {
    paused = false
    duck = 1f
    handler.removeCallbacks(unduck)
    handler.removeCallbacks(autoResume)
    handler.removeCallbacks(rampTick)
    handler.removeCallbacks(timeout)
    player?.let { runCatching { it.stop() }; runCatching { it.release() } }
    player = null
    stopVibration()
    wakeLock?.let { if (it.isHeld) runCatching { it.release() } }
    wakeLock = null
    abandonAudioFocus()
  }

  private fun finishRinging(reason: String) {
    val id = currentId
    currentId = null
    ringingId = null
    releaseResources()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    if (id != null) {
      AlarmEvents.dismissed(id, reason)
      AlarmEvents.changed()
    }
  }

  override fun onDestroy() {
    releaseResources()
    ringingId = null
    super.onDestroy()
  }

  companion object {
    const val ACTION_START = "expo.modules.mylifealarms.action.START_RINGING"
    const val ACTION_STOP = "expo.modules.mylifealarms.action.STOP"
    const val ACTION_SNOOZE = "expo.modules.mylifealarms.action.SNOOZE"
    const val ACTION_PAUSE = "expo.modules.mylifealarms.action.PAUSE"
    const val ACTION_RESUME = "expo.modules.mylifealarms.action.RESUME"
    const val ACTION_SET_VOLUME = "expo.modules.mylifealarms.action.SET_VOLUME"
    private const val PAUSE_SAFETY_MS = 20_000L
    /** Ducking lapses after this long unless the app re-asserts it (it does, every 10 s). */
    private const val DUCK_SAFETY_MS = 30_000L
    const val EXTRA_VOLUME = "volume"
    const val EXTRA_IN_APP = "in_app"
    const val EXTRA_MINUTES = "minutes"
    private const val MAX_RING_MS = 10 * 60 * 1000L
    private const val RAMP_MS = 20_000L
    private const val RAMP_STEP_MS = 250L
    private const val START_VOLUME = 0.3f

    /** Id of the alarm currently ringing (null when silent); read by the ringing activity. */
    @Volatile var ringingId: String? = null

    fun start(ctx: Context, alarmId: String, inApp: Boolean = false) {
      ringingId = alarmId
      val intent = Intent(ctx, AlarmRingService::class.java)
        .setAction(ACTION_START)
        .putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
        .putExtra(EXTRA_IN_APP, inApp)
      ctx.startForegroundService(intent)
    }

    fun stop(ctx: Context) {
      // Cleared right away (the service finishes asynchronously) so callers never see a stale id.
      ringingId = null
      ctx.startService(Intent(ctx, AlarmRingService::class.java).setAction(ACTION_STOP))
    }

    /** Only meaningful while an alarm rings; a no-op otherwise (the service is not started). */
    fun pause(ctx: Context) {
      if (ringingId == null) return
      ctx.startService(Intent(ctx, AlarmRingService::class.java).setAction(ACTION_PAUSE))
    }

    /** Ducks the ringing alarm to [fraction] (0..1) of its normal volume; 1 restores it. */
    fun setVolume(ctx: Context, fraction: Float) {
      if (ringingId == null) return
      ctx.startService(
        Intent(ctx, AlarmRingService::class.java).setAction(ACTION_SET_VOLUME).putExtra(EXTRA_VOLUME, fraction)
      )
    }

    fun resume(ctx: Context) {
      if (ringingId == null) return
      ctx.startService(Intent(ctx, AlarmRingService::class.java).setAction(ACTION_RESUME))
    }

    fun snooze(ctx: Context, minutes: Int) {
      ringingId = null
      ctx.startService(
        Intent(ctx, AlarmRingService::class.java).setAction(ACTION_SNOOZE).putExtra(EXTRA_MINUTES, minutes)
      )
    }
  }
}
