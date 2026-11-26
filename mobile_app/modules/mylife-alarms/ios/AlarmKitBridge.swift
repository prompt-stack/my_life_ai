// Part of MyLife AI. The AlarmKit scheduling approach (relative schedules, LiveActivityIntent stop/open
// intents, alarmUpdates observation) is adapted from react-native-alarm-scheduler v1.1.0,
// MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
import ExpoModulesCore
import Foundation

#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import SwiftUI
import UIKit

@available(iOS 26.0, *)
struct MyLifeAlarmMetadata: AlarmMetadata {
  let alarmId: String
}

/// Stop button: records that the alarm rang. One-time alarms disable themselves (metadata kept so they can be re-enabled).
@available(iOS 26.0, *)
struct MyLifeStopAlarmIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop Alarm"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var supportedModes: IntentModes { .background }

  @Parameter(title: "Alarm ID")
  var alarmId: String

  init() {
    alarmId = ""
  }

  init(alarmId: String) {
    self.alarmId = alarmId
  }

  func perform() async throws -> some IntentResult {
    AlarmKitBridge.markFired(alarmId: alarmId)
    return .result()
  }
}

/// Secondary "Open" button: brings MyLife to the foreground.
@available(iOS 26.0, *)
struct MyLifeOpenAlarmIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Open MyLife"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var supportedModes: IntentModes { .foreground(.immediate) }

  @Parameter(title: "Alarm ID")
  var alarmId: String

  init() {
    alarmId = ""
  }

  init(alarmId: String) {
    self.alarmId = alarmId
  }

  func perform() async throws -> some IntentResult {
    AlarmKitBridge.markFired(alarmId: alarmId)
    // Same deep link as Android's "Speak" button: the Assistant starts listening. The alarm keeps
    // alerting; the user can say "stop the alarm".
    await AlarmKitBridge.openAssistantForVoice()
    return .result()
  }
}

@available(iOS 26.0, *)
enum AlarmKitBridge {
  /// Must match `scheme` in mobile_app/app.json.
  static let appScheme = "mylifeai"

  @MainActor
  static func openAssistantForVoice() async {
    guard let url = URL(string: "\(appScheme)://assistant?voice=1&t=\(Int(Date().timeIntervalSince1970 * 1000))") else { return }
    // The app is still coming to the foreground when the intent runs: give it a moment.
    try? await Task.sleep(nanoseconds: 400_000_000)
    _ = await UIApplication.shared.open(url)
  }

  /// The alarm that is alerting right now, if any.
  static func alertingAlarmId() -> String? {
    let alarms = (try? AlarmManager.shared.alarms) ?? []
    return alarms.first { $0.state == .alerting }?.id.uuidString
  }

  /// Stops the alerting alarm. With an id it must be the one alerting, otherwise ERR_NOT_FOUND.
  static func stopAlerting(id: String?) throws {
    guard let alerting = alertingAlarmId(), id == nil || id?.lowercased() == alerting.lowercased(),
      let uuid = UUID(uuidString: alerting) else {
      throw Exception(name: "NotFound", description: "No alarm is ringing\(id.map { " with id \($0)" } ?? "").", code: "ERR_NOT_FOUND")
    }
    try AlarmManager.shared.stop(id: uuid)
    // The Stop button's intent does not run for programmatic stops.
    markFired(alarmId: alerting)
  }

  static func authorizationState() -> String {
    switch AlarmManager.shared.authorizationState {
    case .authorized: return "granted"
    case .denied: return "denied"
    default: return "unknown"
    }
  }

  static func requestAuthorization() async -> String {
    let state = try? await AlarmManager.shared.requestAuthorization()
    return state == .authorized ? "granted" : "denied"
  }

  static func isAuthorized() -> Bool {
    AlarmManager.shared.authorizationState == .authorized
  }

  static func currentAlarmIds() -> Set<String> {
    let alarms = (try? AlarmManager.shared.alarms) ?? []
    return Set(alarms.map { $0.id.uuidString })
  }

  static func cancel(id: String) {
    guard let uuid = UUID(uuidString: id) else { return }
    try? AlarmManager.shared.cancel(id: uuid)
  }

  /// Schedules (or reschedules) the alarm in AlarmKit. A disabled alarm is cancelled and nothing else.
  static func apply(_ alarm: StoredAlarm) async throws {
    guard let uuid = UUID(uuidString: alarm.id) else {
      throw Exception(name: "InvalidArgs", description: "Alarm id must be a UUID.", code: "ERR_INVALID_ARGS")
    }
    try? AlarmManager.shared.cancel(id: uuid)
    guard alarm.enabled else { return }

    let title = alarm.label?.isEmpty == false ? alarm.label! : "Alarm"
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.fill"),
      secondaryButton: AlarmButton(text: "Open", textColor: .white, systemImageName: "app.badge"),
      secondaryButtonBehavior: .custom
    )
    let attributes = AlarmAttributes(
      presentation: AlarmPresentation(alert: alert),
      metadata: MyLifeAlarmMetadata(alarmId: alarm.id),
      tintColor: Color.accentColor
    )
    let time = Alarm.Schedule.Relative.Time(hour: alarm.hour, minute: alarm.minute)
    let schedule: Alarm.Schedule = alarm.weekdays.isEmpty
      ? .relative(.init(time: time, repeats: .never))
      : .relative(.init(time: time, repeats: .weekly(alarm.weekdays.map(localeWeekday))))

    _ = try await AlarmManager.shared.schedule(
      id: uuid,
      configuration: AlarmManager.AlarmConfiguration.alarm(
        schedule: schedule,
        attributes: attributes,
        stopIntent: MyLifeStopAlarmIntent(alarmId: alarm.id),
        secondaryIntent: MyLifeOpenAlarmIntent(alarmId: alarm.id),
        sound: alertSound(alarm.sound)
      )
    )
  }

  private static func alertSound(_ sound: String) -> AlertConfiguration.AlertSound {
    #if targetEnvironment(simulator)
    // The iOS 26 Simulator's ToneLibrary can crash SpringBoard on custom alarm tones: use the default there.
    return .default
    #else
    return .named("\(sound).caf")
    #endif
  }

  private static func localeWeekday(_ iso: Int) -> Locale.Weekday {
    switch iso {
    case 1: return .monday
    case 2: return .tuesday
    case 3: return .wednesday
    case 4: return .thursday
    case 5: return .friday
    case 6: return .saturday
    default: return .sunday
    }
  }

  /// One-time alarms that fired (or were stopped) disable themselves.
  static func markFired(alarmId: String) {
    guard var alarm = AlarmRecordStore.get(alarmId), alarm.weekdays.isEmpty, alarm.enabled else { return }
    alarm.enabled = false
    AlarmRecordStore.put(alarm)
    NotificationCenter.default.post(name: .myLifeAlarmsChanged, object: nil)
  }

  /// Enabled one-time alarms that AlarmKit no longer knows about have already fired: disable them.
  static func reconcile() {
    let known = currentAlarmIds()
    for var alarm in AlarmRecordStore.all() where alarm.enabled && alarm.weekdays.isEmpty && !known.contains(alarm.id) {
      alarm.enabled = false
      AlarmRecordStore.put(alarm)
    }
  }
}
#endif
