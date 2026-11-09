require_relative "client"
app_id = "6832227842"
client = AppStoreConnect.new
abort("Wrong app record") unless client.get("/v1/apps/#{app_id}").dig("data", "attributes", "bundleId") == "com.hoooho.cards"
builds = client.get("/v1/builds", {
  "filter[app]" => app_id,
  "sort" => "-uploadedDate",
  "limit" => "8",
  "fields[builds]" => "version,processingState,uploadedDate"
}).fetch("data")
builds.each do |row|
  values = row.fetch("attributes")
  version = values.fetch("version")
  state = values.fetch("processingState")
  next unless version.match?(/\A[0-9.]+\z/) && state.match?(/\A[A-Z_]+\z/)
  puts "CARDS_BUILD_STATUS #{version} #{state}"
end

# Recheck whether the retry reached the Apple build list.

present = builds.any? { |row| row.fetch("attributes").fetch("version") == "2026.11.9" }
File.open(ENV.fetch("GITHUB_OUTPUT"), "a") { |file| file.puts("retry_present=#{present}") }
