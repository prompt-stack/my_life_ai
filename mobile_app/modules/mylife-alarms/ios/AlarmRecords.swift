// Part of MyLife AI. The AlarmKit scheduling approach (relative schedules, LiveActivityIntent stop/open
// intents, alarmUpdates observation) is adapted from react-native-alarm-scheduler v1.1.0,
// MIT License, Copyright (c) 2026 Raj Maurya.
// See modules/mylife-alarms/LICENSE-react-native-alarm-scheduler and the README NOTICE.
import Foundation

/// One alarm as persisted by MyLife (AlarmKit itself only knows the schedule). Weekdays are ISO: 1 = Monday ... 7 = Sunday.
struct StoredAlarm: Codable, Equatable {
  var id: String
  var hour: Int
  var minute: Int
  var weekdays: [Int]
  var label: String?
  var sound: String
  var enabled: Bool
}

enum AlarmSounds {
  static let ids = ["sunrise", "chimes", "marimba", "piano", "guitar"]
  static let defaultId = "sunrise"
}

enum AlarmRecordStore {
  private static let key = "mylife.alarms.v1"
  private static let lock = NSLock()

  static func all() -> [StoredAlarm] {
    lock.lock(); defer { lock.unlock() }
    guard let data = UserDefaults.standard.data(forKey: key),
      let list = try? JSONDecoder().decode([StoredAlarm].self, from: data) else {
      return []
    }
    return list
  }

  static func get(_ id: String) -> StoredAlarm? {
    all().first { $0.id == id }
  }

  static func put(_ alarm: StoredAlarm) {
    var list = all().filter { $0.id != alarm.id }
    list.append(alarm)
    save(list)
  }

  static func remove(_ id: String) {
    save(all().filter { $0.id != id })
  }

  private static func save(_ list: [StoredAlarm]) {
    lock.lock(); defer { lock.unlock() }
    if let data = try? JSONEncoder().encode(list) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }
}

enum AlarmTime {
  /// Next wall-clock occurrence after `now` (AlarmKit does not expose it, so we compute it).
  static func nextTrigger(hour: Int, minute: Int, weekdays: [Int], after now: Date = Date()) -> Date? {
    let calendar = Calendar.current
    func occurrence(weekday: Int?) -> Date? {
      var parts = DateComponents(hour: hour, minute: minute, second: 0)
      if let weekday { parts.weekday = weekday }
      return calendar.nextDate(after: now, matching: parts, matchingPolicy: .nextTime)
    }
    if weekdays.isEmpty { return occurrence(weekday: nil) }
    // Calendar weekday: 1 = Sunday ... 7 = Saturday.
    let candidates = weekdays.compactMap { occurrence(weekday: ($0 % 7) + 1) }
    return candidates.min()
  }

  static func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    formatter.timeZone = TimeZone.current
    return formatter.string(from: date)
  }
}

extension Notification.Name {
  static let myLifeAlarmsChanged = Notification.Name("MyLifeAlarmsChanged")
}
