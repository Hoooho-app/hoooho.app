import UIKit

enum AppAppearance {
    // Matches --hoho-color-page-background in src/styles/tokens.css (#f4f2ed).
    static let paperBackground = UIColor(named: "PaperBackground")
        ?? UIColor(red: 244.0 / 255.0, green: 242.0 / 255.0, blue: 237.0 / 255.0, alpha: 1)

    static func pageBackground(hex: String) -> UIColor? {
        guard hex.count == 7, hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
              let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                       green: CGFloat((value >> 8) & 255) / 255,
                       blue: CGFloat(value & 255) / 255, alpha: 1)
    }
}
