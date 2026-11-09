from pathlib import Path
from shutil import copyfile
import sys

app, tests = map(Path, sys.argv[1:])

def edit(path, old, new):
    source = path.read_text()
    assert source.count(old) == 1, old
    path.write_text(source.replace(old, new))

vault = app / "Sources/Vault.swift"
unlock = """        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--credential-scan-fixture") {
            do {
                let opened = try readArchive(using: LAContext())
                session = opened.session ?? Session(keyID: UUID(), key: Self.credentialFixtureKey)
                contents = opened.contents
                isUnlocked = true
                print("VISA QA fixture vault opened with \\(records.count) records")
                if ProcessInfo.processInfo.arguments.contains("--seed-legacy-bank"),
                   !records.contains(where: { $0.title == "旧版银行卡样本" }) {
                    var legacy = CardRecord(title: "旧版银行卡样本", category: "银行卡", owner: "本人", number: "4242")
                    legacy.bankDetails.cardNumber = "4242424242424242"
                    legacy.bankDetails.sides = [.front]
                    try save(legacy)
                }
                return true
            } catch {
                authenticationMessage = error.localizedDescription
                print("VISA QA fixture vault open failed: \\(error.localizedDescription)")
                return false
            }
        }
        #endif

"""
guard = "        guard !isAuthenticating else { return false }\n\n"
edit(vault, guard, guard + unlock)
load = "    private func loadKey(id: UUID, context: LAContext) throws -> SymmetricKey {"
fixture_key = """    #if DEBUG && targetEnvironment(simulator)
    private static var credentialFixtureKey: SymmetricKey { SymmetricKey(data: Data(repeating: 92, count: 32)) }
    #endif

"""
edit(vault, load, fixture_key + load + """
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--credential-scan-fixture") { return Self.credentialFixtureKey }
        #endif""")

save_boundary = """        try persist(updated)
        return record
    }

    @discardableResult
    func addFamilyMember"""
edit(vault, save_boundary, """        try persist(updated)
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--credential-scan-fixture"),
           record.isBankCard, record.bankDetails.hasProtectedNumbers {
            let portable = try exportPortableBackup(passphrase: "synthetic test passphrase")
            let restored = try readPortableBackup(portable, passphrase: "synthetic test passphrase")
            guard let bank = restored.records.first(where: { $0.id == record.id }) else {
                preconditionFailure("The backup should retain the bank record.")
            }
            precondition(bank.bankTail == record.bankTail && !bank.bankDetails.hasProtectedNumbers && bank.photoPages.isEmpty)
            let opened = try readArchive(using: LAContext())
            precondition(opened.contents.records.first(where: { $0.id == record.id })?.photoPages == record.photoPages)
            print("VISA QA archive contains \\(record.photoPages.count) protected photo pages")
            let encrypted = try Data(contentsOf: archiveURL())
            if !record.bankDetails.cardNumber.isEmpty {
                precondition(encrypted.range(of: Data(record.bankDetails.cardNumber.utf8)) == nil)
            }
        }
        #endif
        return record
    }

    @discardableResult
    func addFamilyMember""")

detail = app / "Sources/CardVaultApp.swift"
root_tint = "            .tint(Glass.ice)\n            .onOpenURL"
edit(detail, root_tint, """            .tint(Glass.ice)
            .task(id: scenePhase) {
                guard scenePhase == .active, !vault.isUnlocked,
                      ProcessInfo.processInfo.arguments.contains("--automatic-fixture-unlock") else { return }
                _ = await vault.unlock()
            }
            .onOpenURL""")
auth = "    private func authenticate(onVerified: @escaping () -> Void) {\n"
edit(detail, auth, auth + """        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--credential-scan-fixture") {
            if !ProcessInfo.processInfo.arguments.contains("--deny-reveal") { onVerified() }
            return
        }
        #endif
""")

scanner = app / "Sources/CardGuidedScanner.swift"
edit(scanner, "import CoreImage\n", "import CoreImage\nimport CoreImage.CIFilterBuiltins\n")
camera_method = "    private func startCamera() async {\n"
edit(scanner, camera_method, r'''
    private var usesFixtureCamera: Bool {
        ProcessInfo.processInfo.arguments.contains("--credential-scan-fixture")
    }

    private func fixtureFrame(frame: CGRect, viewport: CGSize, dimensions: ScanDimensions) -> CIImage {
        let rows = pageOffset == 0
            ? ["SPD BANK", "VISA CREDIT CARD", "UNIONPAY", "4242 4242 4242 4242", "VALID THRU 02/32", "SAMPLE PERSON"]
            : ["4242 083", "DOMESTIC HOTLINE 95528", "OVERSEAS HOTLINE +86-21-00000123",
               "24-HOUR CONCIERGE 400-000-0123", "www.fixture-bank.example.com", "REMARKS: FOR DEMONSTRATION"]
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: 1_284, height: 810)
        let card = UIGraphicsImageRenderer(size: size, format: format).image { context in
            context.cgContext.setFillColor(UIColor(white: 0.96, alpha: 1).cgColor)
            context.cgContext.fill(CGRect(origin: .zero, size: size))
            let font = UIFont.monospacedSystemFont(ofSize: 47, weight: .semibold)
            for (index, row) in rows.enumerated() {
                (row as NSString).draw(at: CGPoint(x: 94, y: 80 + index * 134),
                                       withAttributes: [.font: font, .foregroundColor: UIColor.black])
            }
        }
        let image = CGRect(x: 0, y: 0, width: floor(viewport.width * 4), height: floor(viewport.height * 4))
        let target = CardScanGuide.imageCrop(frame: frame, viewport: viewport, image: image)
        let backdrop = CIImage(color: CIColor(red: 0.09, green: 0.11, blue: 0.12)).cropped(to: image)
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: target.minX + x * target.width, y: target.minY + y * target.height)
        }
        let warp = CIFilter.perspectiveTransform()
        warp.inputImage = CIImage(cgImage: card.cgImage!)
        warp.topLeft = point(0.17, 0.92)
        warp.topRight = point(0.94, 0.76)
        warp.bottomRight = point(0.88, 0.11)
        warp.bottomLeft = point(0.07, 0.24)
        return warp.outputImage!.composited(over: backdrop).cropped(to: image)
    }

''' + camera_method + "        if usesFixtureCamera { return }\n")
edit(scanner, ".disabled(!camera.ready || !progress.canCapture || busy || finished)",
     ".disabled(!(camera.ready || usesFixtureCamera) || !progress.canCapture || busy || finished)")
edit(scanner, ".opacity(camera.ready && progress.canCapture ? 1 : 0.48)",
     ".opacity((camera.ready || usesFixtureCamera) && progress.canCapture ? 1 : 0.48)")
capture = "    private func capture(frame: CGRect, viewport: CGSize) {\n"
edit(scanner, capture, capture + '''        if usesFixtureCamera {
            let image = fixtureFrame(frame: frame, viewport: viewport, dimensions: dimensions)
            let result = GuidedScanCamera.processFrame(image, frame: frame, viewport: viewport,
                dimensions: dimensions, requiresCorners: true, context: CIContext())
            switch result {
            case .photo(let data):
                let rect = UIImage(data: data)!.size
                precondition(abs(rect.width / rect.height - dimensions.ratio) < 0.015)
                if progress.accept(data) { finishIfComplete() }
            default:
                problem = "虚构卡片校正失败"
            }
            return
        }
''')

project = app / "project.yml"
edit(project, "schemes:\n", """  CredentialUITests:
    type: bundle.ui-testing
    platform: iOS
    sources: [CredentialUITests]
    dependencies:
      - target: CardVault
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.hoooho.cards.qa.scan
        GENERATE_INFOPLIST_FILE: YES
schemes:
""")
edit(project, "    archive:\n", """    test:
      config: Debug
      targets: [CredentialUITests]
    archive:
""")
tests_dir = app / "CredentialUITests"
tests_dir.mkdir()
copyfile(tests, tests_dir / tests.name)
