Pod::Spec.new do |s|
  s.name           = 'MyLifeAlarms'
  s.version        = '0.1.0'
  s.summary        = 'MyLife AI native alarms (Android AlarmManager, iOS 26+ AlarmKit)'
  s.description    = 'Local Expo module owned by MyLife AI. Adapted from react-native-alarm-scheduler (MIT).'
  s.license        = { :type => 'MIT' }
  s.author         = 'MyLife AI'
  s.homepage       = 'https://example.invalid/mylife-ai'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # AlarmKit exists only on iOS 26+: weak-link it so the app still launches on older iOS.
  s.weak_frameworks = 'AlarmKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
