import XCTest

final class LaunchTests: XCTestCase {
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
