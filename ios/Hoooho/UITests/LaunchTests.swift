import XCTest

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
    }
}
