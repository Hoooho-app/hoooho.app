#!/usr/bin/env ruby
require "base64"
require "digest"
require "fileutils"
require "openssl"
require "spaceship"

key_path, p12_path, output_path = ARGV
abort("Usage: fetch_profile.rb KEY_PATH P12_PATH OUTPUT_PATH") unless key_path && p12_path && output_path

token = Spaceship::ConnectAPI::Token.create(
  key_id: ENV.fetch("CARDS_ASC_KEY_ID"),
  issuer_id: ENV.fetch("CARDS_ASC_ISSUER_ID"),
  filepath: key_path,
  in_house: false
)
Spaceship::ConnectAPI.token = token

bundle_identifier = "com.hoooho.cards"
profile_name = "Hoooho Cards CI Shared Certificate 20261108"
profile_type = Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE

p12 = OpenSSL::PKCS12.new(
  File.binread(p12_path),
  ENV.fetch("CARDS_IOS_DISTRIBUTION_P12_PASSWORD")
)
local_fingerprint = Digest::SHA1.hexdigest(p12.certificate.to_der).upcase

certificates = Spaceship::ConnectAPI::Certificate.all(
  filter: { certificateType: "DISTRIBUTION,IOS_DISTRIBUTION" }
)
matching_certificates = certificates.select do |certificate|
  begin
    remote_fingerprint = Digest::SHA1.hexdigest(Base64.decode64(certificate.certificate_content.to_s)).upcase
    certificate.valid? && remote_fingerprint == local_fingerprint
  rescue OpenSSL::OpenSSLError, ArgumentError
    false
  end
end
abort("The existing distribution P12 does not match exactly one active Apple Distribution certificate.") unless matching_certificates.length == 1
certificate = matching_certificates.first

bundle = Spaceship::ConnectAPI::BundleId.find(bundle_identifier)
abort("Apple Developer has no exact Bundle ID #{bundle_identifier}.") unless bundle

profiles = Spaceship::ConnectAPI::Profile.all(
  filter: { name: profile_name, profileType: profile_type },
  includes: "bundleId,certificates"
).select { |profile| profile.name == profile_name }

profile = profiles.find do |candidate|
  candidate.valid? &&
    candidate.bundle_id&.id == bundle.id &&
    candidate.certificates&.any? { |item| item&.id == certificate.id }
end

if profile
  puts("Reusing the active Cards profile for the existing distribution certificate.")
elsif profiles.any?
  abort("A profile with the deterministic CI name exists but has different signing material.")
else
  profile = Spaceship::ConnectAPI::Profile.create(
    name: profile_name,
    profile_type: profile_type,
    bundle_id_id: bundle.id,
    certificate_ids: [certificate.id],
    device_ids: []
  )
  abort("Apple did not return the new Cards profile.") unless profile
  puts("Created a Cards App Store profile for the existing distribution certificate.")
end

content = Base64.decode64(profile.profile_content.to_s)
abort("Apple returned an empty Cards provisioning profile.") if content.empty?
FileUtils.mkdir_p(File.dirname(output_path), mode: 0700)
File.binwrite(output_path, content)
File.chmod(0600, output_path)
puts("Prepared the exact Cards App Store provisioning profile.")
