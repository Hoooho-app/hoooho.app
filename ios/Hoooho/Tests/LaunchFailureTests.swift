import XCTest
@testable import HooohoRecords

final class LaunchFailureTests: XCTestCase {
    func testNetworkFailureShowsOriginalCodeWithoutClaimingPermissionWasDenied() {
        let result = LaunchFailure.from(NSError(domain: NSURLErrorDomain, code: URLError.notConnectedToInternet.rawValue))
        XCTAssertTrue(result.message.contains("检查"))
        XCTAssertFalse(result.message.contains("已拒绝"))
        XCTAssertTrue(result.diagnostic.contains("NSURLErrorDomain · -1009"))
        XCTAssertTrue(result.diagnostic.contains(NavigationPolicy.home.absoluteString))
        XCTAssertTrue(result.diagnostic.contains("版本："))
    }
    func testDiagnosticExcludesSensitiveErrorDetailsAndPrivateNavigation() {
        let privateURL = "https://hooohoapp-production.up.railway.app/private-child?token=sensitive-token&email=private@example.test"
        let result = LaunchFailure.from(NSError(domain: NSURLErrorDomain, code: URLError.timedOut.rawValue,
            userInfo: [NSLocalizedDescriptionKey: "private-child sensitive-token private@example.test", NSURLErrorFailingURLStringErrorKey: privateURL,
                NSUnderlyingErrorKey: NSError(domain: "private@example.test", code: 77)]))
        for secret in ["private-child", "sensitive-token", "private@example.test", "token="] {
            XCTAssertFalse(result.diagnostic.contains(secret))
            XCTAssertFalse(result.message.contains(secret))
        }
        XCTAssertTrue(result.diagnostic.contains("-1001"))
        XCTAssertTrue(result.message.contains("Safari"))
    }
    func testUnknownErrorDomainIsNotEchoedAndTLSKeepsItsOwnExplanation() {
        XCTAssertFalse(LaunchFailure.from(NSError(domain: "sensitive@example.test", code: 42)).diagnostic.contains("sensitive"))
        let tls = LaunchFailure.from(NSError(domain: NSURLErrorDomain, code: URLError.secureConnectionFailed.rawValue))
        XCTAssertTrue(tls.message.contains("安全连接"))
        XCTAssertFalse(tls.message.contains("无线数据"))
        XCTAssertTrue(LaunchFailure.contentProcessEnded().diagnostic.contains("内容进程结束"))
    }
    func testStartupRetryMakesAReadOnlyFreshRequestToTheExistingProduction() {
        let request = LaunchFailure.startupRequest
        XCTAssertEqual(request.url, NavigationPolicy.home)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
        XCTAssertEqual(request.timeoutInterval, 30)
        XCTAssertNil(request.httpBody)
        XCTAssertNil(request.allHTTPHeaderFields?["Authorization"])
    }
}
