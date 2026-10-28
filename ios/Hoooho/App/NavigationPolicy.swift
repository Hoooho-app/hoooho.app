import Foundation

enum NavigationDestination: Equatable { case app, download, external, blocked }

enum NavigationPolicy {
    static let home = URL(string: "https://hoooho.com/nurse-station")!
    static func captureTrusted(scheme: String, host: String, port: Int, frameURL: URL?, isMainFrame: Bool, pageURL: URL?) -> Bool {
        scheme == "https" && host == "hoooho.com" && (port == 0 || port == 443) &&
            isMainFrame && trusted(frameURL) && trusted(pageURL)
    }
    static func trusted(_ url: URL?) -> Bool {
        guard let url, url.scheme?.lowercased() == "https",
              url.host?.lowercased() == "hoooho.com",
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
        if url.scheme == "blob", url.absoluteString.hasPrefix("blob:https://hoooho.com/") { return .download }
        if ["https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") { return .external }
        return .blocked
    }
    static func safeFilename(_ proposed: String) -> String {
        let last = (proposed.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let clean = last.components(separatedBy: .controlCharacters).joined()
        return clean.isEmpty || clean == "." || clean == ".." ? "护护记录.txt" : String(clean.prefix(160))
    }
}
