#!/usr/bin/env ruby

require "json"
require "net/http"
require "openssl"
require "uri"
require "jwt"

class AppStoreConnect
  API = "https://api.appstoreconnect.apple.com"

  def initialize
    @key = OpenSSL::PKey.read(ENV.fetch("ASC_API_KEY_P8"))
    @key_id = ENV.fetch("ASC_KEY_ID")
    @issuer_id = ENV.fetch("ASC_ISSUER_ID")
  end

  def get(path, query = {})
    request(Net::HTTP::Get, path, query: query)
  end

  def add_build(group_id, build_id)
    request(Net::HTTP::Post, "/v1/betaGroups/#{group_id}/relationships/builds",
      body: { data: [{ type: "builds", id: build_id }] })
  end

  private

  def token
    now = Time.now.to_i
    JWT.encode({ iss: @issuer_id, iat: now, exp: now + 300, aud: "appstoreconnect-v1" },
      @key, "ES256", { kid: @key_id, typ: "JWT" })
  end

  def request(type, path, query: {}, body: nil)
    uri = URI(API + path)
    uri.query = URI.encode_www_form(query) unless query.empty?
    call = type.new(uri)
    call["Authorization"] = "Bearer #{token}"
    call["Accept"] = "application/json"
    if body
      call["Content-Type"] = "application/json"
      call.body = JSON.generate(body)
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 25) do |https|
      https.request(call)
    end
    unless response.is_a?(Net::HTTPSuccess)
      errors = JSON.parse(response.body).fetch("errors", []).filter_map do |error|
        code = error["code"]
        code if code.is_a?(String) && code.match?(/\A[A-Z0-9_.-]{1,80}\z/)
      end rescue []
      abort("App Store Connect rejected #{type::METHOD} with HTTP #{response.code} #{errors.join(' ')}")
    end
    return nil if response.code == "204"
    JSON.parse(response.body)
  end
end

client = AppStoreConnect.new
bundle_id = "com.hoooho.cards"
app_id = "6832227842"
group_name = "护护卡包内测"
version = "2026.11.4"
marketing_version = "0.1.0"
app = client.get("/v1/apps/#{app_id}", { "fields[apps]" => "bundleId" }).fetch("data")
abort("App identity does not match the approved bundle.") unless app["id"] == app_id && app.dig("attributes", "bundleId") == bundle_id

groups = client.get("/v1/apps/#{app_id}/betaGroups", { "fields[betaGroups]" => "name,isInternalGroup", "limit" => "200" }).fetch("data")
matches = groups.select { |group| group.dig("attributes", "name") == group_name && group.dig("attributes", "isInternalGroup") == true }
abort("Expected exactly one matching internal beta group.") unless matches.length == 1
group_id = matches.first.fetch("id")
abort("Invalid group identifier.") unless group_id.match?(/\A[0-9a-f-]{36}\z/i)

build_id = nil
60.times do
  response = client.get("/v1/builds", {
    "filter[app]" => app_id,
    "filter[version]" => version,
    "include" => "preReleaseVersion",
    "fields[preReleaseVersions]" => "version,platform",
    "fields[builds]" => "version,processingState,expired,usesNonExemptEncryption,preReleaseVersion"
  })
  builds = response.fetch("data")
  abort("More than one build matched the pinned version.") if builds.length > 1
  build = builds.first
  if build
    state = build.dig("attributes", "processingState")
    abort("The pinned build failed processing.") if %w[FAILED INVALID].include?(state)
    if state == "VALID"
      prerelease = build.dig("relationships", "preReleaseVersion", "data", "id")
      release = response.fetch("included", []).find { |item| item["type"] == "preReleaseVersions" && item["id"] == prerelease }
      abort("The build does not match the expected iOS beta version.") unless build.dig("attributes", "version") == version &&
        build.dig("attributes", "expired") == false && release&.dig("attributes", "platform") == "IOS" &&
        release&.dig("attributes", "version") == marketing_version
      build_id = build.fetch("id")
      break
    end
  end
  sleep 5
end
abort("Timed out waiting for the pinned build to be processed.") unless build_id&.match?(/\A[0-9a-f-]{36}\z/i)

def linked?(client, group_id, build_id)
  client.get("/v1/betaGroups/#{group_id}/builds", { "fields[builds]" => "version", "limit" => "200" })
    .fetch("data").any? { |build| build["id"] == build_id }
end

client.add_build(group_id, build_id) unless linked?(client, group_id, build_id)
10.times do
  if linked?(client, group_id, build_id)
    detail = client.get("/v1/builds/#{build_id}/buildBetaDetail").dig("data", "attributes", "internalBuildState")
    if detail == "IN_BETA_TESTING"
      puts("Verified #{marketing_version} (#{version}) is testing in the existing Cards internal group.")
      exit 0
    end
  end
  sleep 4
end
abort("Build assignment completed without confirmation of internal Testing status.")
