require_relative "client"

APP_ID = "6832227842"
BUNDLE_ID = "com.hoooho.cards"
GROUP_NAMES = ["电子证件内测", "护护卡包内测", "户户卡包内测"].freeze

def verified_app(client)
  app = client.get("/v1/apps/#{APP_ID}", { "fields[apps]" => "bundleId,name,primaryLocale" }).fetch("data")
  raise "The app record does not match the approved bundle" unless app["id"] == APP_ID && app.dig("attributes", "bundleId") == BUNDLE_ID
  app
end

def internal_group(client)
  groups = client.list("/v1/apps/#{APP_ID}/betaGroups", { "fields[betaGroups]" => "name,isInternalGroup" })
  matches = groups.select do |group|
    attributes = group.fetch("attributes")
    attributes["isInternalGroup"] == true && GROUP_NAMES.include?(attributes["name"])
  end
  raise "Expected one existing internal group" unless matches.length == 1
  matches.first
end

client = AppStoreConnect.new
verified_app(client)
group_id = internal_group(client).fetch("id")
abort("Invalid group identifier.") unless group_id.match?(/\A[0-9a-f-]{36}\z/i)
app_id = APP_ID
version = "2026.11.16"
marketing_version = "0.1.0"
build_id = nil
100.times do
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

puts("PINNED_BUILD_VALID #{marketing_version} (#{version})")
retryable = /HTTP (404|409|429|500|502|503|504)\b/
last_state = nil
18.times do
  begin
    linked = linked?(client, group_id, build_id)
    state = client.get("/v1/builds/#{build_id}/buildBetaDetail").dig("data", "attributes", "internalBuildState")
    if state != last_state && state.to_s.match?(/\A[A-Z_]+\z/)
      puts("PINNED_INTERNAL_STATE #{state}")
      last_state = state
    end
    if linked && state == "IN_BETA_TESTING"
      puts("INTERNAL_TESTFLIGHT_VERIFIED #{marketing_version} (#{version})")
      exit 0
    end
    unless linked
      begin
        client.add_build(group_id, build_id)
      rescue RuntimeError => error
        raise unless error.message.include?("HTTP 404 ")
        client.add_group(build_id, group_id)
      end
    end
  rescue RuntimeError => error
    raise unless error.message.match?(retryable)
    puts("Waiting for the processed build and internal group relationship.")
  end
  sleep 7
end
abort("The processed build could not be confirmed as available to the existing internal group.")
