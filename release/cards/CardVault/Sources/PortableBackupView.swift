import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let cardsBackup = UTType(exportedAs: "com.hoooho.cards.backup")
}

private struct BackupFile: FileDocument {
    static var readableContentTypes: [UTType] { [.cardsBackup] }
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

struct PortableBackupView: View {
    @ObservedObject var vault: VaultStore
    @State private var passphrase = ""
    @State private var confirmation = ""
    @State private var importing = false
    @State private var exporting = false
    @State private var file: BackupFile?
    @State private var candidates = VaultContents()
    @State private var showReview = false
    @State private var message: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GlassBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 17) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("换机保管", systemImage: "lock.icloud").font(.caption.weight(.semibold)).foregroundStyle(Glass.ice)
                        Text("加密备份").font(.largeTitle.weight(.semibold))
                        Text("使用独立口令加密备份。请把口令和文件分开保存。")
                            .font(.subheadline).foregroundStyle(Glass.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(18).glassPanel()
                    VStack(alignment: .leading, spacing: 12) {
                        SecureField("输入备份口令", text: $passphrase).textContentType(.none)
                        Divider()
                        SecureField("创建备份时，再输入一次", text: $confirmation).textContentType(.none)
                    }
                    .padding(16).glassPanel()
                    Text("创建时至少 12 个字符。恢复时只需输入旧备份口令。")
                        .font(.caption).foregroundStyle(Glass.muted)
                    PrimaryGlassButton(title: "创建并保存加密备份", icon: "square.and.arrow.up") { create() }
                        .disabled(passphrase.count < 12 || passphrase != confirmation)
                    Button {
                        importing = true
                    } label: {
                        Label("选择加密备份来恢复", systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity, minHeight: 42)
                    }
                    .disabled(passphrase.isEmpty)
                    Text("备份包含卡片与添加的家人。恢复会先验证文件，再预览条数。")
                        .font(.footnote).foregroundStyle(Glass.muted)
                }
                .padding(20)
            }
        }
        .navigationTitle("备份与恢复").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
        }
        .fileExporter(isPresented: $exporting, document: file, contentType: .cardsBackup,
                      defaultFilename: "护护卡包备份") { result in
            file = nil
            if case .failure(let error) = result { message = error.localizedDescription }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.cardsBackup]) { result in
            do {
                let url = try result.get()
                let granted = url.startAccessingSecurityScopedResource()
                defer { if granted { url.stopAccessingSecurityScopedResource() } }
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
                guard size <= VaultStore.maximumPortableBackupBytes else { throw CocoaError(.fileReadTooLarge) }
                let file = try FileHandle(forReadingFrom: url)
                defer { try? file.close() }
                guard let data = try file.read(upToCount: VaultStore.maximumPortableBackupBytes + 1),
                      data.count <= VaultStore.maximumPortableBackupBytes else {
                    throw CocoaError(.fileReadTooLarge)
                }
                candidates = try vault.readPortableBackup(data, passphrase: passphrase)
                passphrase = ""
                confirmation = ""
                showReview = true
            } catch { message = error.localizedDescription }
        }
        .confirmationDialog("恢复到本机卡包？", isPresented: $showReview, titleVisibility: .visible) {
            Button("确认恢复") {
                defer { candidates = VaultContents() }
                do {
                    let restored = try vault.mergePortableBackup(candidates)
                    message = "已恢复 \(restored.cards) 份资料、\(restored.members) 位家人。"
                } catch { message = error.localizedDescription }
            }
            Button("取消", role: .cancel) { candidates = VaultContents() }
        } message: {
            Text("备份里有 \(candidates.records.count) 份资料、\(candidates.familyMembers.count) 位已添加家人。重复项目会跳过。")
        }
        .alert("备份与恢复", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("知道了", role: .cancel) {}
        } message: { Text(message ?? "") }
    }

    private func create() {
        do {
            file = BackupFile(data: try vault.exportPortableBackup(passphrase: passphrase))
            exporting = true
            passphrase = ""
            confirmation = ""
        } catch { message = error.localizedDescription }
    }
}
