Pod::Spec.new do |s|
  s.name           = 'FocusShield'
  s.version        = '1.0.0'
  s.summary        = 'Zonemate 집중 모드용 iOS 앱 차단(Screen Time / FamilyControls) 모듈'
  s.description    = 'FamilyControls + ManagedSettings로 집중 중 사용자가 고른 앱에 차단막(shield)을 씌운다.'
  s.author         = 'Zonemate Team'
  s.homepage       = 'https://github.com/madcamp-official/26s-w2-c2-03'
  s.license        = 'MIT'
  # FamilyActivityPicker/AuthorizationCenter(for: .individual)는 iOS 16+.
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
