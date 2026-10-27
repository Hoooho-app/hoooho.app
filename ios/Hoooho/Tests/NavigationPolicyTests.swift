import XCTest
@testable import HooohoRecords

final class NavigationPolicyTests: XCTestCase {
    func testOnlyOwnedHTTPSOriginIsTrusted() {
        XCTAssertTrue(NavigationPolicy.trusted(URL(string: "https://hoooho.com/nurse-station")))
        for raw in ["http://hoooho.com/", "https://hoooho.com.evil.example/", "https://evil.example/?hoooho.com", "https://user:pass@hoooho.com/", "https://hoooho.com:444/"] {
            XCTAssertFalse(NavigationPolicy.trusted(URL(string: raw)), raw)
        }
    }
    func testSeparateFamilyAndExternalDestinations() {
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://hoooho.com/family-ray-home-life-workspace/settings")), .external)
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://hoooho.com/health-events")), .app)
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "https://example.com")), .external)
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "javascript:alert(1)")), .blocked)
    }
    func testBlobExportsStayInWebKit() {
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "blob:https://hoooho.com/123")), .download)
        XCTAssertEqual(NavigationPolicy.destination(URL(string: "blob:https://evil.example/123")), .blocked)
    }
    func testExportFilenameCannotEscapeTemporaryDirectory() {
        XCTAssertEqual(NavigationPolicy.safeFilename("../../child.txt"), "child.txt")
        XCTAssertEqual(NavigationPolicy.safeFilename("..\\child.pdf"), "child.pdf")
        XCTAssertEqual(NavigationPolicy.safeFilename(""), "护护记录.txt")
        XCTAssertFalse(NavigationPolicy.safeFilename("record\n.txt").contains("\n"))
    }
}
