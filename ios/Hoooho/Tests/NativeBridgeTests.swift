import XCTest
import UIKit
import WebKit
@testable import HooohoRecords

@MainActor
final class NativeBridgeTests: XCTestCase, WKScriptMessageHandler {
    private var page: WKWebView?
    private var received: XCTestExpectation?
    private var captured: WKScriptMessage?

    func testReportSrcdocPrintCarriesTheReportInsteadOfTheAppPage() async throws {
        received = expectation(description: "Report frame reaches the native bridge")
        let configuration = WKWebViewConfiguration()
        let content = configuration.userContentController
        content.add(self, name: "hooohoNative")
        let scriptURL = try XCTUnwrap(Bundle.main.url(forResource: "NativeBridge", withExtension: "js"))
        content.addUserScript(WKUserScript(source: try String(contentsOf: scriptURL, encoding: .utf8), injectionTime: .atDocumentStart, forMainFrameOnly: false))
        // Match the real container's visible WebKit lifecycle instead of relying
        // on background activity for a detached test view.
        let host = try XCTUnwrap((UIApplication.shared.delegate as? AppDelegate)?.window?.rootViewController)
        let page = WKWebView(frame: host.view.bounds, configuration: configuration)
        self.page = page
        page.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.addSubview(page)
        defer {
            content.removeScriptMessageHandler(forName: "hooohoNative")
            page.stopLoading()
            page.removeFromSuperview()
            self.page = nil
            received = nil
            captured = nil
        }
        XCTAssertNotNil(page.window)
        // Synthetic local HTML with the production origin; no network requests or health writes.
        page.loadHTMLString("""
        <!doctype html><html><body><h1>APP CHROME MUST NOT PRINT</h1><script>
        const frame = document.createElement('iframe');
        frame.srcdoc = '<!doctype html><html><body><h1>REPORT SNAPSHOT 42</h1></body></html>';
        frame.onload = () => frame.contentWindow.print();
        document.body.append(frame);
        </script></body></html>
        """, baseURL: URL(string: "https://hoooho.com"))
        await fulfillment(of: [try XCTUnwrap(received)], timeout: 15)
        let message = try XCTUnwrap(captured)
        let body = try XCTUnwrap(message.body as? [String: Any])
        XCTAssertFalse(message.frameInfo.isMainFrame)
        XCTAssertEqual(message.frameInfo.securityOrigin.protocol, "https")
        XCTAssertEqual(message.frameInfo.securityOrigin.host, "hoooho.com")
        XCTAssertEqual(body["type"] as? String, "print")
        let html = try XCTUnwrap(body["html"] as? String)
        XCTAssertTrue(html.contains("REPORT SNAPSHOT 42"))
        XCTAssertFalse(html.contains("APP CHROME MUST NOT PRINT"))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        captured = message
        received?.fulfill()
    }
}
