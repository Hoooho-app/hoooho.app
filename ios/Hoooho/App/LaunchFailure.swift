import Foundation

struct LaunchFailure {
    let message: String
    let diagnostic: String

    static func from(_ error: NSError, bundle: Bundle = .main) -> LaunchFailure {
        let domain = [NSURLErrorDomain, "WKErrorDomain"].contains(error.domain) ? error.domain : "系统错误"
        let message: String
        if error.domain == NSURLErrorDomain {
            switch URLError.Code(rawValue: error.code) {
            case .notConnectedToInternet, .dataNotAllowed, .internationalRoamingOff:
                message = "护护当前无法使用网络。请在系统设置中检查此App的无线数据权限，再重新连接。"
            case .timedOut, .cannotConnectToHost, .networkConnectionLost:
                message = "与服务器的连接未完成。可先用Safari检查同一地址，再重新连接。"
            case .cannotFindHost, .dnsLookupFailed:
                message = "当前网络未能找到服务器地址。可用Safari检查同一地址，并保留下面的错误编号。"
            case .secureConnectionFailed, .serverCertificateHasBadDate, .serverCertificateUntrusted, .serverCertificateHasUnknownRoot, .serverCertificateNotYetValid:
                message = "安全连接未完成。请检查设备时间与网络，并把下面的错误编号提供给我们。"
            default:
                message = "页面加载未完成。请重新连接；若仍失败，请把下面的诊断信息提供给我们。"
            }
        } else {
            message = "页面加载未完成。请重新连接；若仍失败，请把下面的诊断信息提供给我们。"
        }
        return LaunchFailure(message: message, diagnostic: diagnostic(bundle: bundle, code: "\(domain) · \(error.code)"))
    }
    static func contentProcessEnded(bundle: Bundle = .main) -> LaunchFailure {
        LaunchFailure(message: "页面运行已中断，请重新连接。已保存的数据和本机存储会保留。", diagnostic: diagnostic(bundle: bundle, code: "WebKit · 内容进程结束"))
    }
    static func seedTestFlightUnavailable(bundle: Bundle = .main) -> LaunchFailure {
        LaunchFailure(message: "杭州的 Seed 内测服务尚未就绪，请稍后重新连接。", diagnostic: diagnostic(bundle: bundle, code: "Seed TestFlight · 服务待就绪"))
    }
    private static func diagnostic(bundle: Bundle, code: String) -> String {
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知"
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "未知"
        return "版本：\(version)（\(build)）\n启动地址：\(NavigationPolicy.home.absoluteString)\n错误：\(code)"
    }
    static var startupRequest: URLRequest {
        URLRequest(url: NavigationPolicy.home, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
    }
}
