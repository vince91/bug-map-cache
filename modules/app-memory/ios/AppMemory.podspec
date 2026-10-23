Pod::Spec.new do |s|
  s.name           = 'AppMemory'
  s.version        = '1.0.0'
  s.summary        = 'Reports the app memory footprint'
  s.description    = 'Reports the app memory footprint'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
