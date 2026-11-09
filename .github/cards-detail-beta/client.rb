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

  def patch(resource, id, attributes)
    request(Net::HTTP::Patch, "/v1/#{resource}/#{id}",
      body: { data: { type: resource, id: id, attributes: attributes } })
  end

  def list(path, query = {})
    response = get(path, query.merge("limit" => "200"))
    raise "Unexpected pagination for #{path}" if response.dig("links", "next")
    response.fetch("data")
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
      if type == Net::HTTP::Patch && response.code == "409"
        payload = JSON.parse(response.body).fetch("errors", [])
        issues = payload.filter_map do |error|
          detail = error["detail"].to_s
          "name_in_use" if detail.match?(/already (?:in use|being used)|app name.+already|not available/i)
        end
        errors.concat(issues.uniq)
      end
      raise "App Store Connect rejected #{type::METHOD} with HTTP #{response.code} #{errors.join(' ')}"
    end
    return nil if response.code == "204"
    JSON.parse(response.body)
  end
end

