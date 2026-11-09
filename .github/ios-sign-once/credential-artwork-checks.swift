import Foundation

@main
struct CredentialArtworkChecks {
    static func main() throws {
        let assets = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let templates = CardTemplateGroup.all.flatMap(\.items)
        precondition(templates.count == 24)
        precondition(Set(templates.map(\.name)).count == templates.count)
        precondition(Set(templates.map(\.artwork)).count == templates.count)
        for template in templates {
            let artwork = CardTemplateGroup.artwork(for: template.name)
            precondition(artwork == template.artwork)
            let set = assets.appendingPathComponent(artwork + ".imageset", isDirectory: true)
            let contents = try Data(contentsOf: set.appendingPathComponent("Contents.json"))
            _ = try JSONSerialization.jsonObject(with: contents)
            let image = try Data(contentsOf: set.appendingPathComponent("Artwork.png"))
            precondition(image.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]))
        }
        let custom = CardTemplateGroup.artwork(for: CredentialFieldSchema.customCategory)
        precondition(CardTemplateGroup.artwork(for: "Custom fixture") == custom)
        precondition(CardTemplateGroup.artwork(for: CredentialFieldSchema.legacyGenericCategory) == custom)
    }
}
