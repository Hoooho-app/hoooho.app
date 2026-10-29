import XCTest
import UIKit

final class LaunchTests: XCTestCase {
    func testAttachmentMenuHasFourSystemSourcesAndCancellationPreservesThePage() {
        let app = XCUIApplication()
        app.launchArguments = ["--native-fixture"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["选择测试附件"].waitForExistence(timeout: 20))
        app.webViews.buttons["选择测试附件"].tap()
        for label in ["照片图库", "拍照", "拍视频", "选择文件"] {
            XCTAssertTrue(app.buttons[label].waitForExistence(timeout: 5))
        }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Four-system-attachment-sources-synthetic-NOT-production"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        dismissSourceMenu(app)
        XCTAssertTrue(app.webViews.staticTexts["已取消附件选择"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.webViews.staticTexts["这是合成夹具，不是正式业务页面。"].exists)
        app.webViews.buttons["选择测试附件"].tap()
        XCTAssertTrue(app.buttons["照片图库"].waitForExistence(timeout: 5))
        app.buttons["照片图库"].tap()
        let cancelLibrary = app.buttons.matching(NSPredicate(format: "label == 'Cancel' OR label == '取消'")).firstMatch
        XCTAssertTrue(cancelLibrary.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["拍视频"].exists)
        cancelLibrary.tap()
        XCTAssertTrue(app.webViews.staticTexts["已取消附件选择"].waitForExistence(timeout: 5))
    }
    private func dismissSourceMenu(_ app: XCUIApplication) {
        if app.buttons["取消"].exists { app.buttons["取消"].tap() }
        else { app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.15)).tap() }
    }
    func testNativeWebKitLaunchAndInteraction() {
        let app = XCUIApplication()
        app.launchArguments = ["--native-fixture"]
        app.launch()
        XCTAssertTrue(app.webViews.staticTexts["护护原生容器测试"].waitForExistence(timeout: 20))
        app.webViews.buttons["测试页面交互"].tap()
        XCTAssertTrue(app.webViews.staticTexts["交互已响应"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Native-container-synthetic-fixture-NOT-production"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        assertPaperSafeAreas(app)
    }

    private func assertPaperSafeAreas(_ app: XCUIApplication) {
        let image = app.screenshot().image
        guard let bitmap = image.cgImage else { return XCTFail("Missing native screenshot") }
        let web = app.webViews.firstMatch.frame
        let window = app.frame
        XCTAssertGreaterThan(web.minY - window.minY, 0, "Status-bar safe area must remain outside the web content")
        assertPaperPixel(bitmap, x: bitmap.width / 4, y: 6)
        assertPaperPixel(bitmap, x: bitmap.width * 3 / 4, y: 6)
        if window.height / window.width > 2 {
            XCTAssertGreaterThan(window.maxY - web.maxY, 0, "The current iPhone must exercise the home-indicator safe area")
            assertPaperPixel(bitmap, x: bitmap.width / 4, y: bitmap.height - 7)
            assertPaperPixel(bitmap, x: bitmap.width * 3 / 4, y: bitmap.height - 7)
        }
    }

    private func assertPaperPixel(_ image: CGImage, x: Int, y: Int) {
        guard let pixel = image.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return XCTFail("Cannot read native edge pixel") }
        var rgba = [UInt8](repeating: 0, count: 4)
        let drew = rgba.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1,
                bitsPerComponent: 8, bytesPerRow: 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            return true
        }
        XCTAssertTrue(drew)
        for (actual, expected) in zip(rgba, [244, 242, 237, 255]) {
            XCTAssertLessThanOrEqual(abs(Int(actual) - expected), 2, "Native edge at (\(x), \(y)) must be paper, got \(rgba)")
        }
    }
}
