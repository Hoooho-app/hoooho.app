import XCTest
import UIKit
@testable import HooohoRecords

final class AppAppearanceTests: XCTestCase {
    func testPageColorAcceptsOnlyOpaqueSixDigitRGB() throws {
        for invalid in ["", "#fff", "red", "#f4f2ed00", "#gggggg", "#ffffff\n"] {
            XCTAssertNil(AppAppearance.pageBackground(hex: invalid))
        }
        let color = try XCTUnwrap(AppAppearance.pageBackground(hex: "#F0F4F5"))
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        XCTAssertEqual(red, 240.0 / 255.0, accuracy: 0.002)
        XCTAssertEqual(green, 244.0 / 255.0, accuracy: 0.002)
        XCTAssertEqual(blue, 245.0 / 255.0, accuracy: 0.002)
        XCTAssertEqual(alpha, 1)
    }

    func testLaunchAndWindowShareThePaperAssetInBothAppearances() throws {
        let launch = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "UILaunchScreen") as? [String: Any])
        let name = try XCTUnwrap(launch["UIColorName"] as? String)
        let color = try XCTUnwrap(UIColor(named: name))
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for value in [color, AppAppearance.paperBackground] {
                var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
                XCTAssertTrue(value.resolvedColor(with: traits).getRed(&red, green: &green, blue: &blue, alpha: &alpha))
                XCTAssertEqual(red, 244.0 / 255.0, accuracy: 0.002)
                XCTAssertEqual(green, 242.0 / 255.0, accuracy: 0.002)
                XCTAssertEqual(blue, 237.0 / 255.0, accuracy: 0.002)
                XCTAssertEqual(alpha, 1, accuracy: 0.002)
            }
        }
    }
}
