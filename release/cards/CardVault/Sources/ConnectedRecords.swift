import Foundation
import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

extension UTType {
    static let hooohoCardTransfer = UTType(exportedAs: "com.hoooho.card-transfer", conformingTo: .data)
}

private struct RecordsTransfer: Decodable, Sendable {
    struct Field: Decodable, Sendable {
        let label: String
        let value: String
        let isSensitive: Bool
    }

    let schemaVersion: Int
    let sourceApp: String
    let recordID: UUID
    let kind: String
    let title: String
    let owner: String
    let expiresAt: Date?
    let notes: String?
    let fields: [Field]?
    let imageData: Data?
}

private struct ReviewedTransfer: Identifiable, Sendable {
    let id: UUID
    let title: String
    let owner: String
    let expiry: Date?
    let notes: String
    let fields: [RecordsTransfer.Field]
    let image: Data?
    let isExample: Bool

    var source: String { isExample ? "护护记录演示" : "护护记录" }

    static var example: Self {
        Self(
            id: UUID(uuidString: "C493B71E-F2D5-4685-AF9B-4CB608BF24BD")!,
            title: "出行证明 · 演示",
            owner: "示例成员",
            expiry: nil,
            notes: "这是一份虚构资料，用于体验确认、导入和去重。",
            fields: [.init(label: "证明用途", value: "模拟出行资料", isSensitive: false)],
            image: nil,
            isExample: true
        )
    }

    func record(includeNotes: Bool, includeFields: Bool, includeImage: Bool) -> CardRecord {
        CardRecord(
            title: title,
            category: "出行证明",
            owner: owner,
            notes: includeNotes ? notes : "",
            expiry: expiry,
            imageData: includeImage ? image : nil,
            source: source,
            externalID: id.uuidString,
            customFields: includeFields ? fields.map {
                CardField(label: $0.label, value: $0.value, isSensitive: $0.isSensitive)
            } : []
        )
    }
}

private enum TransferReadError: LocalizedError {
    case wrongFile
    case unreadable
    case tooLarge
    case unsupported
    case malformed
    case invalidImage

    var errorDescription: String? {
        switch self {
        case .wrongFile: return "请选择护护记录生成的 .hoooho-card 资料文件。"
        case .unreadable: return "无法读取资料文件。请在「文件」里确认已下载，再试一次。"
        case .tooLarge: return "资料文件太大，请在护护记录里重新导出较小的副本。"
        case .unsupported: return "卡包暂不支持这种资料版本或类型。请更新 App 后重试。"
        case .malformed: return "资料内容不完整或格式无效。请从护护记录重新导出。"
        case .invalidImage: return "附件无法识别。请在护护记录重新选择一张 PNG 或 JPEG 图片。"
        }
    }
}

private enum RecordsTransferReader {
    static let sourceApp = "com.hoooho.records.preview"
    private static let maxFileBytes = 8 * 1024 * 1024
    private static let maxImageBytes = 5 * 1024 * 1024
    private static let maxImagePixels = 32_000_000
    private static let supportedImageTypes = Set([UTType.jpeg.identifier, UTType.png.identifier])

    static func read(_ url: URL) throws -> ReviewedTransfer {
        guard url.isFileURL, url.pathExtension.lowercased() == "hoooho-card" else {
            throw TransferReadError.wrongFile
        }

        let scope = url.startAccessingSecurityScopedResource()
        defer { if scope { url.stopAccessingSecurityScopedResource() } }

        var coordinatedResult: Result<Data, Error>?
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
            coordinatedResult = Result {
                let info = try coordinatedURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
                guard info.isRegularFile == true, info.isSymbolicLink != true else { throw TransferReadError.wrongFile }
                if let size = info.fileSize, size > maxFileBytes { throw TransferReadError.tooLarge }
                let handle = try FileHandle(forReadingFrom: coordinatedURL)
                defer { try? handle.close() }
                let data = try handle.read(upToCount: maxFileBytes + 1) ?? Data()
                guard data.count <= maxFileBytes else { throw TransferReadError.tooLarge }
                return data
            }
        }

        guard coordinationError == nil, let coordinatedResult else { throw TransferReadError.unreadable }
        let data: Data
        do {
            data = try coordinatedResult.get()
        } catch let error as TransferReadError {
            throw error
        } catch {
            throw TransferReadError.unreadable
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload: RecordsTransfer
        do {
            payload = try decoder.decode(RecordsTransfer.self, from: data)
        } catch {
            throw TransferReadError.malformed
        }
        guard payload.schemaVersion == 1, payload.sourceApp == sourceApp, payload.kind == "travel_certificate" else {
            throw TransferReadError.unsupported
        }

        let title = try text(payload.title, limit: 100, required: true)
        let owner = try text(payload.owner, limit: 60, required: true)
        let notes = try text(payload.notes ?? "", limit: 1_000, multiline: true)
        let incomingFields = payload.fields ?? []
        guard incomingFields.count <= 12 else { throw TransferReadError.malformed }
        let fields = try incomingFields.map { field in
            try RecordsTransfer.Field(
                label: text(field.label, limit: 50, required: true),
                value: text(field.value, limit: 500, required: true, multiline: true),
                isSensitive: field.isSensitive
            )
        }
        guard Set(fields.map { $0.label.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil) }).count == fields.count else {
            throw TransferReadError.malformed
        }

        if let expiry = payload.expiresAt {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(secondsFromGMT: 0)!
            guard (1900...2200).contains(calendar.component(.year, from: expiry)) else {
                throw TransferReadError.malformed
            }
        }

        return ReviewedTransfer(
            id: payload.recordID,
            title: title,
            owner: owner,
            expiry: payload.expiresAt,
            notes: notes,
            fields: fields,
            image: try payload.imageData.map(cleanImage),
            isExample: false
        )
    }

    private static func text(_ value: String, limit: Int, required: Bool = false, multiline: Bool = false) throws -> String {
        let allowed = value.unicodeScalars.allSatisfy { scalar in
            if multiline && (scalar.value == 0x0A || scalar.value == 0x0D) { return true }
            return !CharacterSet.controlCharacters.contains(scalar)
        }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard allowed, cleaned.count <= limit, !required || !cleaned.isEmpty else { throw TransferReadError.malformed }
        return cleaned
    }

    private static func cleanImage(_ data: Data) throws -> Data {
        guard data.count <= maxImageBytes else { throw TransferReadError.tooLarge }
        let inputOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, inputOptions),
              CGImageSourceGetCount(source) == 1,
              let kind = CGImageSourceGetType(source),
              supportedImageTypes.contains(kind as String),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, inputOptions) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= maxImagePixels / height else {
            throw TransferReadError.invalidImage
        }
        let resizeOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2400,
            kCGImageSourceShouldCacheImmediately: true
        ]
        let output = NSMutableData()
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, resizeOptions as CFDictionary),
              let destination = CGImageDestinationCreateWithData(output as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw TransferReadError.invalidImage
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw TransferReadError.invalidImage }
        return output as Data
    }
}

@MainActor
struct ConnectedRecordsView: View {
    @ObservedObject var vault: VaultStore
    @Binding var incoming: URL?

    @State private var isFilePickerPresented = false
    @State private var staged: ReviewedTransfer?
    @State private var requestID: UUID?
    @State private var status: String?
    @State private var reader: Task<Void, Never>?

    init(vault: VaultStore, incoming: Binding<URL?> = .constant(nil)) {
        self.vault = vault
        self._incoming = incoming
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                intro
                actions
                if let status {
                    Text(status)
                        .font(.footnote)
                        .foregroundStyle(Color(red: 0.72, green: 0.83, blue: 0.89))
                        .accessibilityIdentifier("connectedRecords.status")
                }
            }
            .padding(22)
        }
        .navigationTitle("护护资料连接")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $isFilePickerPresented, allowedContentTypes: [.hooohoCardTransfer]) { result in
            switch result {
            case .success(let url): beginRead(url)
            case .failure: status = "未能读取所选文件，请重新选择。"
            }
        }
        .sheet(item: $staged, onDismiss: consumeIncoming) { candidate in
            TransferReview(candidate: candidate) { record in
                try approve(record)
            }
            .preferredColorScheme(.dark)
        }
        .onAppear(perform: consumeIncoming)
        .onChange(of: incoming) { _, _ in consumeIncoming() }
        .onChange(of: vault.isUnlocked) { _, unlocked in
            if unlocked {
                consumeIncoming()
            } else {
                resetReview()
            }
        }
        .onDisappear(perform: resetReview)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "link.badge.plus")
                .font(.system(size: 25, weight: .medium))
                .foregroundStyle(Color(red: 0.66, green: 0.95, blue: 0.88))
            Text("护护记录")
                .font(.title2.weight(.semibold))
            Text("把选中的出行证明收进卡包")
                .font(.subheadline.weight(.medium))
            Text("从「文件」选取护护资料，先核对成员和内容，再决定哪些字段留在本机。")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay {
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(.white.opacity(0.11))
        }
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                status = nil
                isFilePickerPresented = true
            } label: {
                Label("选择资料文件", systemImage: "doc.badge.plus")
                    .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.66, green: 0.95, blue: 0.88))
            .foregroundStyle(Color(red: 0.04, green: 0.13, blue: 0.17))
            .accessibilityIdentifier("connectedRecords.choose")

            Button {
                status = nil
                staged = .example
            } label: {
                Label("用虚构资料试一次", systemImage: "doc.text.magnifyingglass")
                    .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("connectedRecords.example")

            if requestID != nil {
                ProgressView("正在核对资料文件")
                    .font(.footnote)
            }
        }
        .disabled(!vault.isUnlocked || requestID != nil)
    }

    private func consumeIncoming() {
        guard vault.isUnlocked, requestID == nil, staged == nil, let url = incoming else { return }
        incoming = nil
        beginRead(url)
    }

    private func beginRead(_ url: URL) {
        guard vault.isUnlocked, requestID == nil else { return }
        status = nil
        let id = UUID()
        requestID = id
        reader = Task {
            let result = await Task.detached(priority: .userInitiated) {
                Result { try RecordsTransferReader.read(url) }
            }.value
            guard !Task.isCancelled, requestID == id, vault.isUnlocked else { return }
            requestID = nil
            switch result {
            case .success(let candidate): staged = candidate
            case .failure(let error): status = error.localizedDescription
            }
        }
    }

    private func approve(_ record: CardRecord) throws {
        let isDuplicate = vault.records.contains {
            $0.source == record.source && $0.externalID == record.externalID
        }
        try vault.importApproved(record)
        staged = nil
        status = isDuplicate
            ? "这份资料已在卡包中，保留了现有版本。"
            : "已存入卡包，可以在「出行证明」里查看。"
    }

    private func resetReview() {
        reader?.cancel()
        reader = nil
        requestID = nil
        staged = nil
        status = nil
    }
}

@MainActor
private struct TransferReview: View {
    let candidate: ReviewedTransfer
    let approve: (CardRecord) throws -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var includeNotes = false
    @State private var includeFields = false
    @State private var includeImage = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("随卡保存") {
                    LabeledContent("标题", value: candidate.title)
                    LabeledContent("成员", value: candidate.owner)
                    LabeledContent("类型", value: "出行证明")
                    if let expiry = candidate.expiry {
                        LabeledContent("有效期") {
                            Text(expiry, style: .date)
                        }
                    }
                    LabeledContent(candidate.isExample ? "演示来源" : "文件声明来源", value: candidate.source)
                }

                if !candidate.notes.isEmpty || !candidate.fields.isEmpty || candidate.image != nil {
                    Section("按需添加") {
                        if !candidate.notes.isEmpty {
                            Toggle("同时保存备注", isOn: $includeNotes)
                            if includeNotes { Text(candidate.notes).font(.footnote) }
                        }
                        if !candidate.fields.isEmpty {
                            Toggle("同时保存附加字段", isOn: $includeFields)
                            if includeFields {
                                ForEach(candidate.fields, id: \.label) { field in
                                    LabeledContent(field.label, value: field.isSensitive ? "已遮挡" : field.value)
                                }
                            }
                        }
                        if let image = candidate.image.flatMap(UIImage.init(data:)) {
                            Toggle("同时保存图片副本", isOn: $includeImage)
                            if includeImage {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxHeight: 180)
                                    .frame(maxWidth: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .accessibilityLabel("将存入卡包的图片副本")
                            }
                        }
                    }
                }

                Section {
                    Text(candidate.isExample
                         ? "这份虚构资料会保存到本机卡包，之后可删除。"
                         : "请确认文件由你从护护记录导出。导入会创建一个本机副本，来源中的后续更改需重新核对。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("确认收进卡包")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("确认保存", action: save)
                        .accessibilityIdentifier("connectedRecords.approve")
                }
            }
        }
        .overlay {
            if scenePhase != .active {
                Color(red: 0.03, green: 0.05, blue: 0.08)
                    .ignoresSafeArea()
                    .overlay { Image(systemName: "lock.shield").font(.system(size: 30, weight: .light)) }
                    .accessibilityHidden(true)
            }
        }
    }

    private func save() {
        do {
            try approve(candidate.record(includeNotes: includeNotes, includeFields: includeFields, includeImage: includeImage))
        } catch {
            self.error = error.localizedDescription
        }
    }
}
