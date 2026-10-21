Pod::Spec.new do |s|
  s.name = 'NicoGoogleSignIn'
  s.version = '1.0.0'
  s.summary = 'Native Google sign-in for nico notes.'
  s.description = 'Exposes Google identity tokens to the existing authenticated backend.'
  s.license = { :type => 'Proprietary' }
  s.author = 'nico notes'
  s.homepage = 'https://notes.nishitnagar.com'
  s.source = { :git => '' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  # 9.0 adds the custom nonce API required by our backend verification.
  s.dependency 'GoogleSignIn', '9.0.0'
end
