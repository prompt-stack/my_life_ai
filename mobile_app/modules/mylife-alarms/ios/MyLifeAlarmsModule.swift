// Part of MyLife AI. The AlarmKit scheduling approach (relative schedules, LiveActivityIntent stop/open
// intents, alarmUpdates observation) is adapted from react-native-alarm-scheduler v1.1.0,
// MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
import ExpoModulesCore
import Foundation
import UIKit

#if canImport(AlarmKit)
import AlarmKit
#endif

private func codedError(_ code: String, _ message: String) -> Exception {
  Exception(name: code, description: message, code: code)
}

public class MyLifeAlarmsModule: Module {
  private var updatesTask: Task<Void, Never>?
  private var changeObserver: NSObjectProtocol?

  /// AlarmKit needs iOS 26+ (and an SDK that has it at build time).
  private static var isSupported: Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { return true }
    #endif
    return false
  }

  public func definition() -> ModuleDefinition {
    Name("MyLifeAlarms")

    Events("onAlarmFired", "onAlarmDismissed", "onAlarmsChanged")

    OnCreate {
      self.startObserving()
    }

    OnDestroy {
      self.updatesTask?.cancel()
      self.updatesTask = nil
      if let observer = self.changeObserver {
        NotificationCenter.default.removeObserver(observer)
        self.changeObserver = nil
      }
    }

    Function("isSupported") { () -> Bool in
      return Self.isSupported
    }

    AsyncFunction("getPermissions") { () -> [String: String] in
      var notDetermined = "unknown"
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { notDetermined = AlarmKitBridge.authorizationState() }
      #endif
      // Exact-alarm and full-screen are Android concepts; AlarmKit authorization covers iOS.
      return ["exactAlarm": notDetermined, "fullScreen": "not_applicable", "notifications": notDetermined]
    }

    AsyncFunction("requestExactAlarmPermission") { () -> Void in }
    AsyncFunction("requestFullScreenPermission") { () -> Void in }

    AsyncFunction("requestNotificationPermission") { () async -> String in
      return await Self.requestAuthorizationValue()
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      guard Self.isSupported else {
        throw codedError("ERR_UNSUPPORTED", "Alarms need iOS 26 or newer.")
      }
      return await Self.requestAuthorizationValue()
    }

    AsyncFunction("openBatterySettings") { () -> Void in
      Self.openAppSettings()
    }

    AsyncFunction("openAutostartSettings") { () -> Bool in
      return false
    }

    AsyncFunction("listAlarms") { () async throws -> [[String: Any?]] in
      try Self.requireSupport()
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { AlarmKitBridge.reconcile() }
      #endif
      return AlarmRecordStore.all()
        .sorted { ($0.hour, $0.minute) < ($1.hour, $1.minute) }
        .map { Self.toJs($0) }
    }

    AsyncFunction("createAlarm") { (input: [String: Any?]) async throws -> [String: Any?] in
      try Self.requireSupport()
      let alarm = StoredAlarm(
        id: UUID().uuidString,
        hour: try Self.intArg(input["hour"], "hour", 0...23),
        minute: try Self.intArg(input["minute"], "minute", 0...59),
        weekdays: try Self.weekdaysArg(input["weekdays"]),
        label: Self.labelArg(input["label"]),
        sound: try Self.soundArg(input["sound"]),
        enabled: (input["enabled"] as? Bool) ?? true
      )
      try await Self.apply(alarm)
      AlarmRecordStore.put(alarm)
      self.sendEvent("onAlarmsChanged", [:])
      return Self.toJs(alarm)
    }

    AsyncFunction("updateAlarm") { (id: String, changes: [String: Any?]) async throws -> [String: Any?] in
      try Self.requireSupport()
      guard var alarm = AlarmRecordStore.get(id) else {
        throw codedError("ERR_NOT_FOUND", "No alarm with id \(id).")
      }
      if changes.keys.contains("hour") { alarm.hour = try Self.intArg(changes["hour"], "hour", 0...23) }
      if changes.keys.contains("minute") { alarm.minute = try Self.intArg(changes["minute"], "minute", 0...59) }
      if changes.keys.contains("weekdays") { alarm.weekdays = try Self.weekdaysArg(changes["weekdays"]) }
      if changes.keys.contains("label") { alarm.label = Self.labelArg(changes["label"]) }
      if changes.keys.contains("sound") { alarm.sound = try Self.soundArg(changes["sound"]) }
      if changes.keys.contains("enabled") {
        guard let enabled = changes["enabled"] as? Bool else {
          throw codedError("ERR_INVALID_ARGS", "enabled must be a boolean.")
        }
        alarm.enabled = enabled
      }
      try await Self.apply(alarm)
      AlarmRecordStore.put(alarm)
      self.sendEvent("onAlarmsChanged", [:])
      return Self.toJs(alarm)
    }

    AsyncFunction("deleteAlarm") { (id: String) async throws -> Void in
      try Self.requireSupport()
      guard AlarmRecordStore.get(id) != nil else {
        throw codedError("ERR_NOT_FOUND", "No alarm with id \(id).")
      }
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { AlarmKitBridge.cancel(id: id) }
      #endif
      AlarmRecordStore.remove(id)
      self.sendEvent("onAlarmsChanged", [:])
    }

    AsyncFunction("getRingingAlarmId") { () -> String? in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return AlarmKitBridge.alertingAlarmId() }
      #endif
      return nil
    }

    // The system alert owns the sound on iOS: nothing to pause.
    AsyncFunction("pauseRinging") { () -> Void in }
    AsyncFunction("resumeRinging") { () -> Void in }

    AsyncFunction("stopRinging") { (id: String?) async throws -> Void in
      try Self.requireSupport()
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { try AlarmKitBridge.stopAlerting(id: id) }
      #endif
    }

    // AlarmKit has no snooze that we can trigger.
    AsyncFunction("snooze") { (_: String?, _: Int?) async throws -> Void in
      throw codedError("ERR_UNSUPPORTED", "Snooze is not available on iPhone.")
    }
  }

  // MARK: - Observation

  private func startObserving() {
    changeObserver = NotificationCenter.default.addObserver(forName: .myLifeAlarmsChanged, object: nil, queue: nil) { [weak self] _ in
      self?.sendEvent("onAlarmsChanged", [:])
    }
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      updatesTask = Task { [weak self] in
        var alerting = Set<String>()
        for await alarms in AlarmManager.shared.alarmUpdates {
          guard !Task.isCancelled, let self else { return }
          let nowAlerting = Set(alarms.filter { $0.state == .alerting }.map { $0.id.uuidString })
          for id in nowAlerting.subtracting(alerting) {
            self.sendEvent("onAlarmFired", ["id": id])
          }
          for id in alerting.subtracting(nowAlerting) {
            self.sendEvent("onAlarmDismissed", ["id": id, "reason": "stop"])
            AlarmKitBridge.markFired(alarmId: id)
          }
          alerting = nowAlerting
          AlarmKitBridge.reconcile()
          self.sendEvent("onAlarmsChanged", [:])
        }
      }
    }
    #endif
  }

  // MARK: - Helpers

  private static func requireSupport() throws {
    guard isSupported else {
      throw codedError("ERR_UNSUPPORTED", "Alarms need iOS 26 or newer.")
    }
  }

  /// Schedules in AlarmKit; requires authorization for enabled alarms.
  private static func apply(_ alarm: StoredAlarm) async throws {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      if alarm.enabled && !AlarmKitBridge.isAuthorized() {
        throw codedError("ERR_PERMISSION_REQUIRED", "Alarm permission has not been granted.")
      }
      try await AlarmKitBridge.apply(alarm)
      return
    }
    #endif
    throw codedError("ERR_UNSUPPORTED", "Alarms need iOS 26 or newer.")
  }

  private static func requestAuthorizationValue() async -> String {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { return await AlarmKitBridge.requestAuthorization() }
    #endif
    return "denied"
  }

  private static func openAppSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    DispatchQueue.main.async { UIApplication.shared.open(url) }
  }

  private static func toJs(_ alarm: StoredAlarm) -> [String: Any?] {
    let next = alarm.enabled
      ? AlarmTime.nextTrigger(hour: alarm.hour, minute: alarm.minute, weekdays: alarm.weekdays).map(AlarmTime.isoString)
      : nil
    return [
      "id": alarm.id,
      "hour": alarm.hour,
      "minute": alarm.minute,
      "weekdays": alarm.weekdays,
      "label": alarm.label,
      "sound": alarm.sound,
      "enabled": alarm.enabled,
      "nextTriggerAt": next
    ]
  }

  private static func intArg(_ value: Any?, _ name: String, _ range: ClosedRange<Int>) throws -> Int {
    guard let number = value as? NSNumber, number.doubleValue == number.doubleValue.rounded(),
      range.contains(number.intValue) else {
      throw codedError("ERR_INVALID_ARGS", "\(name) must be an integer between \(range.lowerBound) and \(range.upperBound).")
    }
    return number.intValue
  }

  private static func weekdaysArg(_ value: Any?) throws -> [Int] {
    guard let value, !(value is NSNull) else { return [] }
    guard let list = value as? [Any], list.allSatisfy({ ($0 as? NSNumber).map { (1...7).contains($0.intValue) } ?? false }) else {
      throw codedError("ERR_INVALID_ARGS", "weekdays must be numbers from 1 (Monday) to 7 (Sunday).")
    }
    return Array(Set(list.compactMap { ($0 as? NSNumber)?.intValue })).sorted()
  }

  private static func labelArg(_ value: Any?) -> String? {
    guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
    return text
  }

  private static func soundArg(_ value: Any?) throws -> String {
    guard let sound = value as? String else { return AlarmSounds.defaultId }
    guard AlarmSounds.ids.contains(sound) else {
      throw codedError("ERR_INVALID_ARGS", "Unknown sound '\(sound)'.")
    }
    return sound
  }
}
