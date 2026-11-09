import XCTest

final class CredentialUITests: XCTestCase {
    private func launch(denyingReveal: Bool = false, seedLegacyBank: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--credential-scan-fixture", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        if denyingReveal { app.launchArguments.append("--deny-reveal") }
        if seedLegacyBank { app.launchArguments.append("--seed-legacy-bank") }
        app.launch()
        let unlock = app.buttons["解锁证件"]
        XCTAssertTrue(unlock.waitForExistence(timeout: 10))
        unlock.tap()
        XCTAssertTrue(app.buttons["新增证件"].waitForExistence(timeout: 8))
        return app
    }

    private func openForm(_ app: XCUIApplication) {
        app.buttons["新增证件"].tap()
        XCTAssertTrue(app.navigationBars["新增证件"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["证件照片"].exists)
        XCTAssertTrue(app.staticTexts["资料信息"].exists)
        XCTAssertFalse(app.staticTexts["资料字段"].exists)
    }

    private func capture(_ name: String, in app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func tapVisible(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<7 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
        element.tap()
    }

    private func tapAlbumPhoto(in app: XCUIApplication) {
        app.buttons["从相册选取"].tap()
        let picker = app.navigationBars["Photos"]
        XCTAssertTrue(picker.waitForExistence(timeout: 8))
        let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 6))
        for element in [photo, picker.buttons["Done"]] {
            let rect = element.frame
            app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: rect.midX, dy: rect.midY)).tap()
        }
        XCTAssertTrue(picker.waitForNonExistence(timeout: 8))
    }

    private func editableText(_ name: String, in app: XCUIApplication) -> XCUIElement {
        let label = NSPredicate(format: "label == %@", name)
        let field = app.textFields.matching(label).firstMatch
        return field.exists ? field : app.textViews.matching(label).firstMatch
    }

    private func waitForValue(_ text: String, field: XCUIElement, contains: Bool = false) {
        let rule = NSPredicate(format: contains ? "value CONTAINS %@" : "value == %@", text)
        let result = XCTNSPredicateExpectation(predicate: rule, object: field)
        let outcome = XCTWaiter.wait(for: [result], timeout: 14)
        if outcome != .completed {
            XCTFail("Expected \(text) in \(field), found \(field.exists ? String(describing: field.value) : "missing")")
        }
    }

    func testBankScanShowsFullNumbersBeforeSaveAndMasksUntilVerified() {
        let app = launch()
        openForm(app)
        app.buttons["证件类型"].tap()
        let bank = app.buttons["银行卡"]
        XCTAssertTrue(bank.waitForExistence(timeout: 8))
        XCTAssertTrue(bank.isHittable)
        bank.tap()
        let number = app.textFields["完整卡号"]
        let code = app.textFields["安全码"]
        let camera = app.buttons["拍照"]
        let form = app.navigationBars["新增证件"]
        func captureBankPhoto() {
            for _ in 0..<6 where !camera.isHittable { app.swipeDown() }
            XCTAssertTrue(camera.isHittable)
            camera.tap()
            let shutter = app.buttons["拍摄"]
            XCTAssertTrue(shutter.waitForExistence(timeout: 8))
            shutter.tap()
            XCTAssertTrue(form.waitForExistence(timeout: 15))
            XCTAssertFalse(app.staticTexts["虚构卡片校正失败"].exists)
        }
        captureBankPhoto()
        waitForValue("4242424242424242", field: number)
        captureBankPhoto()
        waitForValue("4242424242424242", field: number)
        waitForValue("083", field: code)
        capture("01 Full numbers in the scan draft", in: app)
        XCTAssertTrue(app.buttons["卡种"].exists)
        XCTAssertEqual(app.buttons["卡种"].value as? String, "VISA 信用卡")
        waitForValue("SAMPLE PERSON", field: editableText("持卡人姓名", in: app))
        waitForValue("浦发银行", field: app.textFields["发卡机构"])
        waitForValue("02/32", field: app.textFields["scan.expiry"].exists
                     ? app.textFields["scan.expiry"] : app.textFields["有效期"])

        let save = app.navigationBars["新增证件"].buttons["保存"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.navigationBars["证件详情"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.staticTexts["4242424242424242"].exists)
        XCTAssertFalse(app.staticTexts["083"].exists)
        XCTAssertTrue(app.staticTexts["证件照片"].exists)
        XCTAssertTrue(app.staticTexts["资料信息"].exists)
        XCTAssertFalse(app.buttons["detail.data.reveal"].exists)
        let reveal = app.buttons["detail.photo.reveal"]
        XCTAssertEqual(reveal.label, "验证并查看原件")
        XCTAssertEqual(reveal.value as? String, "原件已遮挡 · 2 张")
        let preview = app.buttons["detail.photo.preview"]
        XCTAssertFalse(preview.exists)
        capture("02 Original and fields are masked", in: app)
        tapVisible(reveal, in: app)
        XCTAssertTrue(preview.waitForExistence(timeout: 8))
        XCTAssertEqual(preview.label, "第 1 张原件")
        XCTAssertLessThanOrEqual(preview.frame.width, 152)
        XCTAssertLessThanOrEqual(preview.frame.height, 96)
        XCTAssertTrue(app.staticTexts["4242424242424242"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["083"].exists)
        capture("03 Compact verified Visa original", in: app)
        app.buttons["下一张"].tap()
        XCTAssertEqual(preview.label, "第 2 张原件")
        preview.tap()
        XCTAssertTrue(app.navigationBars["第 2 张"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.images["第 2 张原件"].exists)
        app.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["立即遮挡"].waitForExistence(timeout: 8))
        app.buttons["立即遮挡"].tap()
        XCTAssertTrue(reveal.waitForExistence(timeout: 8))
        XCTAssertFalse(preview.exists)
        XCTAssertFalse(app.staticTexts["4242424242424242"].exists)
        XCTAssertFalse(app.staticTexts["083"].exists)
        tapVisible(app.buttons["detail.expiry"], in: app)
        XCTAssertTrue(app.staticTexts["2032年2月"].waitForExistence(timeout: 8))

        app.terminate()
        let reopened = launch(denyingReveal: true)
        let title = reopened.staticTexts["浦发银行 · VISA 信用卡"].firstMatch
        tapVisible(title, in: reopened)
        XCTAssertTrue(reopened.navigationBars["证件详情"].waitForExistence(timeout: 8))
        tapVisible(reopened.buttons["detail.photo.reveal"], in: reopened)
        XCTAssertFalse(reopened.buttons["detail.photo.preview"].exists)
        XCTAssertFalse(reopened.staticTexts["4242424242424242"].exists)
        XCTAssertFalse(reopened.staticTexts["083"].exists)
        reopened.terminate()
        let verified = launch()
        tapVisible(verified.staticTexts["浦发银行 · VISA 信用卡"].firstMatch, in: verified)
        tapVisible(verified.buttons["detail.photo.reveal"], in: verified)
        XCTAssertTrue(verified.buttons["detail.photo.preview"].waitForExistence(timeout: 8))
    }

    func testIdentityUsesTheSamePhotoEntranceAndProtectedPreview() {
        let app = launch()
        XCTAssertTrue(app.buttons["管理家人"].exists)
        openForm(app)
        app.buttons["证件类型"].tap()
        app.buttons["身份证"].tap()
        tapAlbumPhoto(in: app)
        let draftPreview = app.buttons["预览第 1 张"]
        XCTAssertTrue(draftPreview.waitForExistence(timeout: 12))
        let save = app.navigationBars["新增证件"].buttons["保存"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 15), .completed)
        save.tap()
        XCTAssertTrue(app.navigationBars["证件详情"].waitForExistence(timeout: 8))
        let reveal = app.buttons["detail.photo.reveal"]
        XCTAssertEqual(reveal.value as? String, "原件已遮挡 · 1 张")
        XCTAssertFalse(app.buttons["detail.photo.preview"].exists)
        tapVisible(reveal, in: app)
        let preview = app.buttons["detail.photo.preview"]
        XCTAssertTrue(preview.waitForExistence(timeout: 8))
        XCTAssertEqual(preview.label, "第 1 张原件")
        capture("04 Compact verified identity original", in: app)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["解锁证件"].waitForExistence(timeout: 8))
        XCTAssertFalse(preview.exists)
    }

    func testLegacyBankCardShowsAnExplicitMissingPhotoAndCanSupplement() {
        let app = launch(seedLegacyBank: true)
        tapVisible(app.staticTexts["旧版银行卡样本"].firstMatch, in: app)
        XCTAssertTrue(app.navigationBars["证件详情"].waitForExistence(timeout: 8))
        let add = app.buttons["detail.photo.add"]
        XCTAssertTrue(add.waitForExistence(timeout: 8))
        XCTAssertEqual(add.value as? String, "未保存照片")
        XCTAssertFalse(app.buttons["detail.photo.reveal"].exists)
        let dataReveal = app.buttons["detail.data.reveal"]
        tapVisible(dataReveal, in: app)
        XCTAssertTrue(app.staticTexts["4242424242424242"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["detail.photo.preview"].exists)
        app.swipeDown()
        tapVisible(add, in: app)
        XCTAssertTrue(app.navigationBars["编辑证件"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["拍照"].exists)
        XCTAssertTrue(app.buttons["从相册选取"].exists)
        tapAlbumPhoto(in: app)
        XCTAssertTrue(app.buttons["预览第 1 张"].waitForExistence(timeout: 12))
        app.navigationBars["编辑证件"].buttons["保存"].tap()
        let reveal = app.buttons["detail.photo.reveal"]
        XCTAssertTrue(reveal.waitForExistence(timeout: 8))
        XCTAssertFalse(add.exists)
        tapVisible(reveal, in: app)
        XCTAssertTrue(app.buttons["detail.photo.preview"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["4242424242424242"].exists)
    }
}
