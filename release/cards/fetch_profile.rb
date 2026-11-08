#!/usr/bin/env ruby
require "base64"
require "fileutils"
require "spaceship"

key_path, output_path = ARGV
abort("Usage: fetch_profile.rb KEY_PATH OUTPUT_PATH") unless key_path && output_path

token = Spaceship::ConnectAPI::Token.create(
  key_id: ENV.fetch("CARDS_ASC_KEY_ID"),
  issuer_id: ENV.fetch("CARDS_ASC_ISSUER_ID"),
  filepath: key_path,
  in_house: false
)
Spaceship::ConnectAPI.token = token

expected_id = "Z6F45L2VQ3"
expected_name = "Hoooho Cards App Store 20261108"
expected_bundle = "com.hoooho.cards"
profiles = Spaceship::ConnectAPI::Profile.all(
  filter: { name: expected_name, profileType: Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE },
  includes: "bundleId,certificates"
)
matches = profiles.select do |profile|
  profile.id.to_s == expected_id &&
    profile.name == expected_name &&
    profile.bundle_id&.identifier == expected_bundle &&
    profile.valid?
end
abort("Expected exactly one active Cards App Store profile; found #{matches.length}.") unless matches.length == 1

content = Base64.decode64(matches.first.profile_content.to_s)
abort("Apple returned an empty Cards provisioning profile.") if content.empty?
FileUtils.mkdir_p(File.dirname(output_path), mode: 0700)
File.binwrite(output_path, content)
File.chmod(0600, output_path)
puts("Fetched the exact existing Cards App Store provisioning profile.")
