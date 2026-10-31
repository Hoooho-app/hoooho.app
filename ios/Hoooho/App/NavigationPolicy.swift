import Foundation

enum NavigationDestination: Equatable { case app, download, external, blocked }

enum NavigationPolicy {
    // Use the same Production service while the canonical domain is offline for ICP filing.
    static let home = URL(string: "https://hooohoapp-production.up.railway.app/nurse-station")!
    private static let trustedHosts: Set<String> = ["hoooho.com", "hooohoapp-production.up.railway.app"]
    static func bridgeTrusted(scheme: String, host: String, port: Int, pageURL: URL?) -> Bool {
        scheme == "https" && trustedHosts.contains(host) && (port == 0 || port == 443) &&
            trusted(pageURL) && pageURL?.host?.lowercased() == host
    }
    static func captureTrusted(scheme: String, host: String, port: Int, frameURL: URL?, isMainFrame: Bool, pageURL: URL?) -> Bool {
        bridgeTrusted(scheme: scheme, host: host, port: port, pageURL: pageURL) &&
            isMainFrame && trusted(frameURL) && frameURL?.host?.lowercased() == host
    }
    static func trusted(_ url: URL?) -> Bool {
        guard let url, url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(), trustedHosts.contains(host),
              url.port == nil || url.port == 443,
              url.user == nil, url.password == nil else { return false }
        return true
    }
    static func destination(_ url: URL?) -> NavigationDestination {
        guard let url else { return .blocked }
        if trusted(url) {
            let path = url.path
            if path == "/family-ray-home-life-workspace" || path.hasPrefix("/family-ray-home-life-workspace/") {
                return .external
            }
            return .app
        }
        if url.scheme == "blob", trusted(URL(string: String(url.absoluteString.dropFirst(5)))) { return .download }
        if ["https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") { return .external }
        return .blocked
    }
    static func safeFilename(_ proposed: String) -> String {
        let last = (proposed.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let clean = last.components(separatedBy: .controlCharacters).joined()
        return clean.isEmpty || clean == "." || clean == ".." ? "护护记录.txt" : String(clean.prefix(160))
    }
}

