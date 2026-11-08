import Combine
import CommonCrypto
import CryptoKit
import Foundation
import LocalAuthentication
import Security

struct CardField: Identifiable, Codable, Equatable {
    var id: UUID
    var label: String
    var value: String
    var isSensitive: Bool

    init(id: UUID = UUID(), label: String, value: String, isSensitive: Bool = true) {
        self.id = id
        self.label = label
        self.value = value
        self.isSensitive = isSensitive
    }
}

enum CardAppearance: String, CaseIterable, Codable, Identifiable {
    case ice, blue, violet, amber
    var id: String { rawValue }

    var title: String {
        switch self {
        case .ice: return "冰青"
        case .blue: return "雾蓝"
        case .violet: return "夜紫"
        case .amber: return "琥珀"
        }
    }
}

struct CardRecord: Identifiable, Codable, Equatable {
    var id: UUID
    var title: String
    var category: String
    var owner: String
    var number: String
    var notes: String
    var expiry: Date?
    var imageData: Data?
    var extraImages: [Data]
    var source: String
    var externalID: String?
    var customFields: [CardField]
    var createdAt: Date
    var appearance: CardAppearance

    var ownerName: String {
        let name = owner.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "本人" : name
    }

    init(
        id: UUID = UUID(),
        title: String,
        category: String,
        owner: String,
        number: String = "",
        notes: String = "",
        expiry: Date? = nil,
        imageData: Data? = nil,
        extraImages: [Data] = [],
        source: String = "本机",
        externalID: String? = nil,
        customFields: [CardField] = [],
        createdAt: Date = Date(),
        appearance: CardAppearance = .ice
    ) {
        self.id = id
        self.title = title
        self.category = category
        self.owner = owner
        self.number = number
        self.notes = notes
        self.expiry = expiry
        self.imageData = imageData
        self.extraImages = extraImages
        self.source = source
        self.externalID = externalID
        self.customFields = customFields
        self.createdAt = createdAt
        self.appearance = appearance
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, category, owner, number, notes, expiry, imageData, extraImages
        case source, externalID, customFields, createdAt, appearance
    }

    init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        id = try fields.decode(UUID.self, forKey: .id)
        title = try fields.decode(String.self, forKey: .title)
        category = try fields.decode(String.self, forKey: .category)
        owner = try fields.decode(String.self, forKey: .owner)
        number = try fields.decode(String.self, forKey: .number)
        notes = try fields.decode(String.self, forKey: .notes)
        expiry = try fields.decodeIfPresent(Date.self, forKey: .expiry)
        imageData = try fields.decodeIfPresent(Data.self, forKey: .imageData)
        extraImages = try fields.decodeIfPresent([Data].self, forKey: .extraImages) ?? []
        source = try fields.decode(String.self, forKey: .source)
        externalID = try fields.decodeIfPresent(String.self, forKey: .externalID)
        customFields = try fields.decode([CardField].self, forKey: .customFields)
        createdAt = try fields.decode(Date.self, forKey: .createdAt)
        appearance = try fields.decodeIfPresent(CardAppearance.self, forKey: .appearance) ?? .ice
    }
}

enum VaultError: LocalizedError {
    case locked
    case titleRequired
    case invalidFamilyName
    case invalidImport
    case attachmentLimit
    case bankCardRestricted
    case vaultSizeLimit
    case invalidPassphrase
    case invalidBackup
    case backupEncryption
    case keyUnavailable
    case cannotRead
    case cannotSave

    var errorDescription: String? {
        switch self {
        case .locked: return "请先验证身份，打开卡包。"
        case .titleRequired: return "请填写证件名称。"
        case .invalidFamilyName: return "请输入 1 至 24 个字符的姓名或称呼，避开「全部」和「本人」。"
        case .invalidImport: return "这份资料缺少可核对的来源。"
        case .attachmentLimit: return "每份资料最多保存 12 页，单页不超过 8 MB，合计不超过 30 MB。"
        case .bankCardRestricted: return "银行卡只保存名称、所属人、可选末四位和有效期。请移除照片、备注和自定义字段。"
        case .vaultSizeLimit: return "卡包已达到当前版本的存储上限。请减少附件后重试。"
        case .invalidPassphrase: return "请输入至少 12 个字符的备份口令，最多 256 字节。"
        case .invalidBackup: return "无法打开备份。请核对口令和文件是否完整。"
        case .backupEncryption: return "无法生成加密备份，请重试。"
        case .keyUnavailable: return "此设备的卡包密钥不可用。请确认设备密码已启用。"
        case .cannotRead: return "暂时无法读取卡包，现有文件仍然保留。请重试验证。"
        case .cannotSave: return "本次修改未写入卡包。请保留当前内容并重试。"
        }
    }
}

struct VaultContents: Codable {
    var records: [CardRecord] = []
    var familyMembers: [String] = []

    static func decode(_ data: Data, version: Int) throws -> VaultContents {
        let decoder = PropertyListDecoder()
        if version == 1 {
            return VaultContents(records: try decoder.decode([CardRecord].self, from: data))
        }
        return try decoder.decode(VaultContents.self, from: data)
    }

    static func familyName(_ input: String) throws -> String {
        let name = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...24).contains(name.count), name != "全部", name != "本人" else {
            throw VaultError.invalidFamilyName
        }
        return name
    }
}

@MainActor
final class VaultStore: ObservableObject {
    @Published private var contents = VaultContents()
    @Published private(set) var isUnlocked = false
    @Published private(set) var isAuthenticating = false
    @Published private(set) var authenticationMessage: String?

    var records: [CardRecord] { contents.records }

    var owners: [String] {
        let names = Set(contents.familyMembers + records.map(\.ownerName)).subtracting(["本人"])
        return ["本人"] + names.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    private struct Archive: Codable {
        let version: Int
        let keyID: UUID
        let ciphertext: Data

        static let currentVersion = 2

        static func associatedData(for keyID: UUID, version: Int = currentVersion) -> Data {
            Data("HooohoCards/Vault/\(version)/\(keyID.uuidString)".utf8)
        }
    }

    private struct Session {
        let keyID: UUID
        let key: SymmetricKey
    }

    private struct PortableArchive: Codable {
        let identifier: String
        let version: Int
        let iterations: UInt32
        let salt: Data
        let ciphertext: Data

        static let formatIdentifier = "com.hoooho.cards.portable"
        static let currentVersion = 2
        static let roundCount: UInt32 = 600_000
        static let saltSize = 16

        static func associatedData(salt: Data, version: Int = currentVersion) -> Data {
            Data("\(formatIdentifier)/\(version)/\(roundCount)/".utf8) + salt
        }
    }

    private struct ExternalReference: Hashable {
        let source: String
        let id: String

        init?(_ record: CardRecord) {
            guard let id = record.externalID, !id.isEmpty else { return nil }
            self.source = record.source
            self.id = id
        }
    }

    private static let keychainService = "com.hoooho.cards.local-vault"
    private static let mebibyte = 1024 * 1024
    private static let maximumPayloadBytes = 80 * mebibyte
    nonisolated static let maximumPortableBackupBytes = 96 * 1024 * 1024
    private var session: Session?
    private var authenticationContext: LAContext?
    private var authenticationAttempt: UUID?
    private let fileManager = FileManager.default

    @discardableResult
    func unlock() async -> Bool {
        guard !isUnlocked else { return true }
        guard !isAuthenticating else { return false }

        let context = LAContext()
        context.localizedCancelTitle = "取消"
        var eligibilityError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &eligibilityError) else {
            if let eligibilityError {
                authenticationMessage = Self.authenticationFailure(eligibilityError)
            } else {
                authenticationMessage = "暂时无法启动设备验证，请稍后重试。"
            }
            return false
        }

        let attempt = UUID()
        authenticationAttempt = attempt
        authenticationContext = context
        authenticationMessage = nil
        isAuthenticating = true

        defer {
            if authenticationAttempt == attempt {
                authenticationAttempt = nil
                authenticationContext = nil
                isAuthenticating = false
                context.invalidate()
            }
        }

        do {
            let authenticated = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "验证你的身份，打开护护卡包。"
            )
            guard authenticationAttempt == attempt, !Task.isCancelled else { return false }
            guard authenticated else {
                authenticationMessage = "未能验证身份，请重试。"
                return false
            }

            let opened = try readArchive(using: context)
            session = opened.session
            contents = opened.contents
            isUnlocked = true
            return true
        } catch {
            guard authenticationAttempt == attempt else { return false }
            authenticationMessage = Self.authenticationFailure(error)
            return false
        }
    }

    func lock() {
        authenticationAttempt = nil
        authenticationContext?.invalidate()
        authenticationContext = nil
        isAuthenticating = false
        authenticationMessage = nil
        isUnlocked = false
        contents = VaultContents()
        session = nil
    }

    func save(_ record: CardRecord) throws {
        try requireUnlocked()
        try Self.validateRecord(record)

        var updated = records
        if let index = updated.firstIndex(where: { $0.id == record.id }) {
            updated[index] = record
        } else {
            updated.insert(record, at: 0)
        }
        try persist(updated)
    }

    @discardableResult
    func addFamilyMember(_ input: String) throws -> String {
        try requireUnlocked()
        let name = try VaultContents.familyName(input)
        if !contents.familyMembers.contains(name) {
            try persist(records, familyMembers: contents.familyMembers + [name])
        }
        return name
    }

    @discardableResult
    func importApproved(_ record: CardRecord) throws -> CardRecord {
        try requireUnlocked()
        let source = record.source.trimmingCharacters(in: .whitespacesAndNewlines)
        let externalID = record.externalID?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !source.isEmpty, let externalID, !externalID.isEmpty else {
            throw VaultError.invalidImport
        }
        if let existing = records.first(where: { $0.source == source && $0.externalID == externalID }) {
            return existing
        }

        var imported = record
        imported.id = UUID()
        imported.source = source
        imported.externalID = externalID
        try save(imported)
        return imported
    }

    func remove(_ id: UUID) throws {
        try requireUnlocked()
        guard records.contains(where: { $0.id == id }) else { return }
        try persist(records.filter { $0.id != id })
    }

    func clear() throws {
        try requireUnlocked()
        guard !records.isEmpty || !contents.familyMembers.isEmpty else { return }
        try persist([], familyMembers: [])
    }

    func exportPortableBackup(passphrase: String) throws -> Data {
        try requireUnlocked()
        try Self.validatePassphrase(passphrase)
        do {
            let salt = try Self.randomBytes(count: PortableArchive.saltSize)
            let key = try Self.portableKey(passphrase: passphrase, salt: salt)
            let encoder = PropertyListEncoder()
            encoder.outputFormat = .binary
            let payload = try encoder.encode(contents)
            guard payload.count <= Self.maximumPayloadBytes else { throw VaultError.vaultSizeLimit }
            let box = try AES.GCM.seal(payload, using: key, authenticating: PortableArchive.associatedData(salt: salt))
            guard let ciphertext = box.combined else { throw VaultError.backupEncryption }

            let data = try encoder.encode(PortableArchive(
                identifier: PortableArchive.formatIdentifier,
                version: PortableArchive.currentVersion,
                iterations: PortableArchive.roundCount,
                salt: salt,
                ciphertext: ciphertext
            ))
            guard data.count <= Self.maximumPortableBackupBytes else { throw VaultError.vaultSizeLimit }
            return data
        } catch let error as VaultError {
            throw error
        } catch {
            throw VaultError.backupEncryption
        }
    }

    func readPortableBackup(_ data: Data, passphrase: String) throws -> VaultContents {
        try requireUnlocked()
        try Self.validatePassphrase(passphrase)
        guard data.count <= Self.maximumPortableBackupBytes else { throw VaultError.vaultSizeLimit }
        do {
            let decoder = PropertyListDecoder()
            let archive = try decoder.decode(PortableArchive.self, from: data)
            guard archive.identifier == PortableArchive.formatIdentifier,
                  (1...PortableArchive.currentVersion).contains(archive.version),
                  archive.iterations == PortableArchive.roundCount,
                  archive.salt.count == PortableArchive.saltSize,
                  archive.ciphertext.count <= Self.maximumPayloadBytes + 28
            else { throw VaultError.invalidBackup }

            let key = try Self.portableKey(passphrase: passphrase, salt: archive.salt)
            let box = try AES.GCM.SealedBox(combined: archive.ciphertext)
            let payload = try AES.GCM.open(
                box, using: key,
                authenticating: PortableArchive.associatedData(salt: archive.salt, version: archive.version)
            )
            return try VaultContents.decode(payload, version: archive.version)
        } catch {
            throw VaultError.invalidBackup
        }
    }

    @discardableResult
    func mergePortableBackup(_ incoming: VaultContents) throws -> (cards: Int, members: Int) {
        try requireUnlocked()
        var ids = Set(records.map(\.id))
        var references = Set(records.compactMap(ExternalReference.init))
        var additions: [CardRecord] = []
        for record in incoming.records {
            let reference = ExternalReference(record)
            guard !ids.contains(record.id),
                  reference.map({ !references.contains($0) }) ?? true
            else { continue }
            try Self.validateRecord(record)
            ids.insert(record.id)
            if let reference { references.insert(reference) }
            additions.append(record)
        }
        var members = contents.familyMembers
        var knownMembers = Set(members)
        for input in incoming.familyMembers {
            let name = try VaultContents.familyName(input)
            if knownMembers.insert(name).inserted { members.append(name) }
        }
        let addedMembers = members.count - contents.familyMembers.count
        if !additions.isEmpty || addedMembers > 0 {
            try persist(records + additions, familyMembers: members)
        }
        return (additions.count, addedMembers)
    }

    static let demoRecords: [CardRecord] = [
        CardRecord(
            title: "出行证明",
            category: "出行",
            owner: "示例家人",
            notes: "这是一份用于体验跨应用关联的演示资料。",
            source: "护护记录 · 示例",
            externalID: "demo.travel-proof.v1",
            customFields: [CardField(label: "用途", value: "家庭出行准备", isSensitive: false)]
        ),
        CardRecord(
            title: "家庭旅行护照",
            category: "证件",
            owner: "示例家人",
            number: "SAMPLE0028",
            notes: "演示数据，用于体验遮挡、查找和导出。"
        ),
        CardRecord(
            title: "入学资料",
            category: "家庭",
            owner: "示例家人",
            notes: "演示数据，包含一项自定义字段。",
            customFields: [CardField(label: "材料类型", value: "家庭申请材料", isSensitive: false)]
        )
    ]

    func loadDemoRecords() throws {
        try requireUnlocked()
        let calendar = Calendar.current
        let demoExpiry = calendar.date(byAdding: .day, value: 4, to: calendar.startOfDay(for: Date()))
        let demos = Self.demoRecords.enumerated().compactMap { index, record -> CardRecord? in
            var demo = record
            demo.source = "演示"
            demo.externalID = "demo.record.\(index)"
            guard !records.contains(where: { $0.source == demo.source && $0.externalID == demo.externalID }) else {
                return nil
            }
            if index < 2 { demo.expiry = demoExpiry }
            return demo
        }
        guard !demos.isEmpty else { return }
        try persist(demos + records)
    }

    private func requireUnlocked() throws {
        guard isUnlocked else { throw VaultError.locked }
    }

    private static func validateRecord(_ record: CardRecord) throws {
        guard !record.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw VaultError.titleRequired
        }
        guard record.extraImages.count <= 12 else { throw VaultError.attachmentLimit }
        let attachments = (record.imageData.map { [$0] } ?? []) + record.extraImages
        guard attachments.count <= 12,
              attachments.allSatisfy({ !$0.isEmpty && $0.count <= 8 * mebibyte }),
              attachments.reduce(0, { $0 + $1.count }) <= 30 * mebibyte
        else { throw VaultError.attachmentLimit }

        if record.category.trimmingCharacters(in: .whitespacesAndNewlines) == "银行卡" {
            let tail = record.number.utf8
            guard (tail.isEmpty || (tail.count == 4 && tail.allSatisfy({ (48...57).contains($0) }))),
                  attachments.isEmpty, record.notes.isEmpty, record.customFields.isEmpty
            else { throw VaultError.bankCardRestricted }
        }
    }

    private static func validatePassphrase(_ passphrase: String) throws {
        guard passphrase.count >= 12, passphrase.utf8.count <= 256,
              !passphrase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { throw VaultError.invalidPassphrase }
    }

    private static func randomBytes(count: Int) throws -> Data {
        var data = Data(count: count)
        let status = data.withUnsafeMutableBytes { bytes -> OSStatus in
            guard let address = bytes.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, count, address)
        }
        guard status == errSecSuccess else { throw VaultError.backupEncryption }
        return data
    }

    private static func portableKey(passphrase: String, salt: Data) throws -> SymmetricKey {
        let passwordLength = passphrase.utf8.count
        let keyLength = 32
        var keyBytes = Data(count: keyLength)
        let status = passphrase.withCString { password in
            salt.withUnsafeBytes { saltBytes in
                keyBytes.withUnsafeMutableBytes { keyBuffer in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2), password, passwordLength,
                        saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), PortableArchive.roundCount,
                        keyBuffer.bindMemory(to: UInt8.self).baseAddress, keyLength
                    )
                }
            }
        }
        guard status == Int32(kCCSuccess) else { throw VaultError.backupEncryption }
        return SymmetricKey(data: keyBytes)
    }

    private func archiveURL(createDirectory: Bool = false) throws -> URL {
        var directory = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: createDirectory
        ).appendingPathComponent("CardVault", isDirectory: true)

        if createDirectory {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            var resources = URLResourceValues()
            resources.isExcludedFromBackup = true
            try directory.setResourceValues(resources)
        }
        return directory.appendingPathComponent("vault.plist", isDirectory: false)
    }

    private func readArchive(using context: LAContext) throws -> (session: Session?, contents: VaultContents) {
        do {
            let url = try archiveURL()
            let encoded: Data
            do {
                encoded = try Data(contentsOf: url)
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
                return (nil, VaultContents())
            }
            let decoder = PropertyListDecoder()
            let archive = try decoder.decode(Archive.self, from: encoded)
            guard (1...Archive.currentVersion).contains(archive.version) else { throw VaultError.cannotRead }

            let key = try loadKey(id: archive.keyID, context: context)
            let box = try AES.GCM.SealedBox(combined: archive.ciphertext)
            let cleartext = try AES.GCM.open(
                box,
                using: key,
                authenticating: Archive.associatedData(for: archive.keyID, version: archive.version)
            )
            return (
                Session(keyID: archive.keyID, key: key),
                try VaultContents.decode(cleartext, version: archive.version)
            )
        } catch let error as VaultError {
            throw error
        } catch let error as CocoaError where error.code == .fileNoSuchFile {
            return (nil, VaultContents())
        } catch {
            throw VaultError.cannotRead
        }
    }

    private func persist(_ updated: [CardRecord], familyMembers: [String]? = nil) throws {
        let opened: Session
        let createdKey: Bool
        if let session {
            opened = session
            createdKey = false
        } else {
            opened = try createKey()
            createdKey = true
        }

        do {
            let encoder = PropertyListEncoder()
            encoder.outputFormat = .binary
            let contents = VaultContents(records: updated, familyMembers: familyMembers ?? self.contents.familyMembers)
            let cleartext = try encoder.encode(contents)
            guard cleartext.count <= Self.maximumPayloadBytes else { throw VaultError.vaultSizeLimit }
            let box = try AES.GCM.seal(
                cleartext,
                using: opened.key,
                authenticating: Archive.associatedData(for: opened.keyID)
            )
            guard let combined = box.combined else { throw VaultError.cannotSave }
            let archive = Archive(
                version: Archive.currentVersion,
                keyID: opened.keyID,
                ciphertext: combined
            )
            let url = try archiveURL(createDirectory: true)
            try encoder.encode(archive).write(to: url, options: [.atomic, .completeFileProtection])

            session = opened
            self.contents = contents
        } catch {
            if createdKey {
                SecItemDelete(Self.keychainQuery(id: opened.keyID) as CFDictionary)
            }
            throw (error as? VaultError) ?? VaultError.cannotSave
        }
    }

    private static func keychainQuery(id: UUID) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: id.uuidString
        ]
    }

    private func createKey() throws -> Session {
        let id = UUID()
        let key = SymmetricKey(size: .bits256)
        guard let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .userPresence,
            nil
        ) else {
            throw VaultError.keyUnavailable
        }

        var item = Self.keychainQuery(id: id)
        item[kSecAttrAccessControl as String] = accessControl
        item[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
            throw VaultError.keyUnavailable
        }
        return Session(keyID: id, key: key)
    }

    private func loadKey(id: UUID, context: LAContext) throws -> SymmetricKey {
        var query = Self.keychainQuery(id: id)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecUseAuthenticationContext as String] = context

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let bytes = result as? Data,
              bytes.count == 32
        else {
            throw VaultError.keyUnavailable
        }
        return SymmetricKey(data: bytes)
    }

    private static func authenticationFailure(_ error: Error) -> String {
        let value = error as NSError
        if value.domain == LAError.errorDomain {
            switch LAError.Code(rawValue: value.code) {
            case .passcodeNotSet:
                return "请先在系统设置中启用设备密码。"
            case .userCancel, .systemCancel, .appCancel:
                return "验证已取消，卡包保持锁定。"
            case .authenticationFailed, .biometryLockout:
                return "验证未通过，请重试或使用设备密码。"
            default:
                return "暂时无法验证设备身份，请稍后重试。"
            }
        }
        return (error as? VaultError)?.localizedDescription ?? "暂时无法打开卡包，请重试。"
    }
}
