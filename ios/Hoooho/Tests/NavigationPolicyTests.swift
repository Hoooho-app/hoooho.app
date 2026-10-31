import XCTest
@testable import HooohoRecords

final class NavigationPolicyTests: XCTestCase {
    private let productionHosts = ["hoooho.com", "hooohoapp-production.up.railway.app"]
    func testStartupUsesTheAvailableRailwayProductionEntry() {
        XCTAssertEqual(NavigationPolicy.home.absoluteString, "https://hooohoapp-production.up.railway.app/nurse-station")
        XCTAssertEqual(NavigationPolicy.destination(NavigationPolicy.home), .app)
    }
    func testCaptureCannotBeGrantedToAnUntrustedOriginOrFrame() {
        for host in productionHosts {
            let home = URL(string: "https://\(host)/nurse-station")!
            XCTAssertTrue(NavigationPolicy.captureTrusted(scheme: "https", host: host, port: 443, frameURL: home, isMainFrame: true, pageURL: home))
            XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "http", host: host, port: 0, frameURL: home, isMainFrame: true, pageURL: home))
            XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "https", host: host + ".evil.example", port: 0, frameURL: home, isMainFrame: true, pageURL: home))
            XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "https", host: host, port: 444, frameURL: home, isMainFrame: true, pageURL: home))
            XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "https", host: host, port: 0, frameURL: home, isMainFrame: false, pageURL: home))
            for otherHost in productionHosts.filter({ $0 != host }) + ["example.com"] {
                let other = URL(string: "https://\(otherHost)/")!
                XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "https", host: host, port: 0, frameURL: other, isMainFrame: true, pageURL: home))
                XCTAssertFalse(NavigationPolicy.captureTrusted(scheme: "https", host: host, port: 0, frameURL: home, isMainFrame: true, pageURL: other))
            }
        }
    }
    func testMessageBridgeRequiresThePagesExactTrustedOrigin() {
        for host in productionHosts {
            let page = URL(string: "https://\(host)/nurse-station")!
            XCTAssertTrue(NavigationPolicy.bridgeTrusted(scheme: "https", host: host, port: 0, pageURL: page))
            for otherHost in productionHosts.filter({ $0 != host }) + [host + ".evil.example", "other.up.railway.app"] {
                XCTAssertFalse(NavigationPolicy.bridgeTrusted(scheme: "https", host: otherHost, port: 443, pageURL: page))
            }
            XCTAssertFalse(NavigationPolicy.bridgeTrusted(scheme: "http", host: host, port: 0, pageURL: page))
            XCTAssertFalse(NavigationPolicy.bridgeTrusted(scheme: "https", host: host, port: 444, pageURL: page))
            XCTAssertFalse(NavigationPolicy.bridgeTrusted(scheme: "https", host: host, port: 443, pageURL: nil))
        }
    }
    func testOnlyOwnedHTTPSOriginIsTrusted() {
        for host in productionHosts {
            XCTAssertTrue(NavigationPolicy.trusted(URL(string: "https://\(host)/nurse-station")))
            for raw in ["http://\(host)/", "https://\(host).evil.example/", "https://evil.example/?\(host)", "https://user:pass@\(host)/", "https://\(host):444/"] {
                XCTAssertFalse(NavigationPolicy.trusted(URL(string: raw)), raw)
            }
        }
        XCTAssertFalse(NavigationPolicy.trusted(URL(string: "https://other.up.railway.app")))
    }
    func testSeparateFamilyAndExternalDestinations() {
        for host in productionHosts {
            XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://\(host)/family-ray-home-life-workspace/settings")), .external)
            XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://\(host)/health-events")), .app)
        }
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://example.com")), .external)
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "javascript:alert(1)")), .blocked)
    }
    func testBlobExportsStayInWebKit() {
        for host in productionHosts {
            XCTAssertEqual(NavigationPolicy.destination(URL(string: "blob:https://\(host)/123")), .download)
            for raw in ["blob:https://\(host).evil.example/123", "blob:https://\(host):444/123", "blob:https://user:pass@\(host)/123", "blob:http://\(host)/123"] {
                XCTAssertEqual(NavigationPolicy.destination(URL(string: raw)), .blocked)
            }
        }
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "blob:https://evil.example/123")), .blocked)
    }
    func testExportFilenameCannotEscapeTemporaryDirectory() {
        XCTAssertEqual(NavigationPolicy.safeFilename("../../child.txt"), "child.txt")
        XCTAssertEqual(NavigationPolicy.safeFilename("..\\child.pdf"), "child.pdf")
        XCTAssertEqual(NavigationPolicy.safeFilename(""), "护护记录.txt")
        XCTAssertFalse(NavigationPolicy.safeFilename("record\n.txt").contains("\n"))
    }
}

