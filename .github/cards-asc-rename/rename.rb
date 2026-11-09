require_relative "client"

APP_ID = "6832227842"
BUNDLE_ID = "com.hoooho.cards"
CHINESE_NAME = "电子证件"
ENGLISH_NAME = "Digital Documents"
OLD_BRAND = /护护证件卡包|户户证件卡包|护护卡包|户户卡包|Hoooho (?:Card Wallet|Cards)/i
GROUP_NAMES = ["电子证件内测", "护护卡包内测", "户户卡包内测"].freeze
EDITABLE_STATES = %w[PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED REJECTED METADATA_REJECTED].freeze

def update_name(value, locale)
  return value unless value.is_a?(String)
  new_name = locale.to_s.start_with?("zh") ? CHINESE_NAME : ENGLISH_NAME
  value.gsub(OLD_BRAND, new_name)
end

def update_copy(client, item, resource, keys)
  values = item.fetch("attributes")
  patch = keys.each_with_object({}) do |key, changed|
    current = values[key]
    new_value = update_name(current, values["locale"])
    changed[key] = new_value if current != new_value
  end
  return false if patch.empty?

  item_id = item.fetch("id")
  client.patch(resource, item_id, patch)
  checked = client.get("/v1/#{resource}/#{item_id}").dig("data", "attributes")
  raise "Rename could not be read back from #{resource}" unless patch.all? { |key, value| checked[key] == value }
  true
end

def report(label)
  yield
rescue StandardError => error
  warn("#{label}_FAILED #{error.message}")
  false
end

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
app = verified_app(client)
mode = ARGV.fetch(0)

if mode == "brand"
  name_verified = report("APP_STORE_NAME") do
    app_infos = client.list("/v1/apps/#{APP_ID}/appInfos", { "fields[appInfos]" => "state,appStoreState" })
    raise "No app info found" if app_infos.empty?
    primary_locale = app.dig("attributes", "primaryLocale")
    primary_seen = false
    app_infos.each do |info|
      state = info.dig("attributes", "state") || info.dig("attributes", "appStoreState")
      path = "/v1/appInfos/#{info.fetch('id')}/appInfoLocalizations"
      localizations = client.list(path, { "fields[appInfoLocalizations]" => "name,subtitle,locale" })
      localizations.each do |item|
        values = item.fetch("attributes")
        locale = values.fetch("locale")
        if app_infos.length == 1 || EDITABLE_STATES.include?(state)
          report("APP_STORE_LOCALE_#{locale}") { update_copy(client, item, "appInfoLocalizations", %w[name subtitle]) }
        end
      end
      names = client.list(path, { "fields[appInfoLocalizations]" => "name,locale" })
      primary = names.find { |item| item.dig("attributes", "locale") == primary_locale }
      name = primary&.dig("attributes", "name")
      puts("APP_INFO_STATE #{state} PRIMARY_LOCALE #{primary_locale} NEW_NAME #{name == CHINESE_NAME}")
      primary_seen ||= name == CHINESE_NAME
      remaining = names.count { |item| item.dig("attributes", "name").to_s.match?(OLD_BRAND) }
      puts("APP_INFO_OLD_LOCALIZED_NAMES #{remaining}")
    end
    current_app_name = verified_app(client).dig("attributes", "name")
    puts("APP_RECORD_NAME_VERIFIED #{current_app_name == CHINESE_NAME}")
    raise "Primary localization name did not verify" unless primary_seen
    true
  end

  group_verified = report("INTERNAL_GROUP_NAME") do
    group = internal_group(client)
    group_id = group.fetch("id")
    client.patch("betaGroups", group_id, { "name" => GROUP_NAMES.first }) unless group.dig("attributes", "name") == GROUP_NAMES.first
    checked = internal_group(client)
    raise "Existing internal group name could not be read back" unless checked["id"] == group_id && checked.dig("attributes", "name") == GROUP_NAMES.first
    puts("INTERNAL_GROUP_NAME_VERIFIED true")
    true
  end

  report("BETA_DESCRIPTION") do
    path = "/v1/apps/#{APP_ID}/betaAppLocalizations"
    fields = { "fields[betaAppLocalizations]" => "locale,description" }
    locales = client.list(path, fields)
    updated = locales.count { |item| update_copy(client, item, "betaAppLocalizations", %w[description]) }
    puts("BETA_DESCRIPTION_CHECKED #{locales.length} UPDATED #{updated}")
    true
  end

  report("STORE_VERSION_COPY") do
    versions = client.list("/v1/apps/#{APP_ID}/appStoreVersions", {
      "filter[platform]" => "IOS",
      "fields[appStoreVersions]" => "versionString,appStoreState"
    })
    locales_seen = 0
    updates = 0
    screenshot_sets = 0
    versions.each do |version|
      path = "/v1/appStoreVersions/#{version.fetch('id')}/appStoreVersionLocalizations"
      locales = client.list(path, { "fields[appStoreVersionLocalizations]" => "locale,description,keywords,promotionalText,whatsNew" })
      locales_seen += locales.length
      locales.each do |item|
        if EDITABLE_STATES.include?(version.dig("attributes", "appStoreState"))
          updates += 1 if update_copy(client, item, "appStoreVersionLocalizations", %w[description keywords promotionalText whatsNew])
        end
        screenshot_sets += client.list("/v1/appStoreVersionLocalizations/#{item.fetch('id')}/appScreenshotSets").length
      end
    end
    puts("STORE_VERSION_COPY_CHECKED #{versions.length} LOCALIZATIONS #{locales_seen} UPDATED #{updates} SCREENSHOT_SETS #{screenshot_sets}")
    true
  end

  exit(name_verified && group_verified ? 0 : 1)
end

raise "Unsupported release mode" unless mode == "release"
group_id = internal_group(client).fetch("id")
abort("Invalid group identifier.") unless group_id.match?(/\A[0-9a-f-]{36}\z/i)
app_id = APP_ID
version = "2026.11.13"
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
