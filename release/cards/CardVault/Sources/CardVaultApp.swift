import SwiftUI
import LocalAuthentication
import UIKit
import UserNotifications

@main
struct CardVaultApp: App {
    @StateObject private var vault = VaultStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var incoming: URL?
    @State private var covered = false

    var body: some Scene {
        WindowGroup {
            ZStack {
                GlassBackdrop()
                if vault.isUnlocked {
                    VaultHome(vault: vault, incoming: $incoming)
                } else {
                    VaultLock(vault: vault)
                }
                if covered {
                    Color(red: 0.025, green: 0.046, blue: 0.079)
                        .ignoresSafeArea()
                        .overlay {
                            Image(systemName: "lock.shield")
                                .font(.system(size: 36, weight: .light))
                                .foregroundStyle(Glass.ice)
                        }
                        .accessibilityHidden(true)
                        .zIndex(2)
                }
            }
            .preferredColorScheme(.dark)
            .tint(Glass.ice)
            .onOpenURL { url in
                guard url.isFileURL, url.pathExtension.lowercased() == "hoooho-card" else { return }
                incoming = url
            }
            .onChange(of: scenePhase) { _, next in
                covered = next != .active
                if next == .background { vault.lock() }
            }
        }
    }
}

enum Glass {
    static let ice = Color(red: 0.67, green: 0.95, blue: 0.88)
    static let blue = Color(red: 0.48, green: 0.68, blue: 0.99)
    static let text = Color(red: 0.93, green: 0.96, blue: 1)
    static let muted = Color(red: 0.68, green: 0.75, blue: 0.83)
    static let deep = Color(red: 0.042, green: 0.073, blue: 0.119)
}

extension CardAppearance {
    var accent: Color {
        switch self {
        case .ice: return Glass.ice
        case .blue: return Glass.blue
        case .violet: return Color(red: 0.78, green: 0.69, blue: 0.99)
        case .amber: return Color(red: 0.99, green: 0.79, blue: 0.53)
        }
    }

    var symbol: String {
        switch self {
        case .ice: return "rectangle.and.text.magnifyingglass"
        case .blue: return "doc.text"
        case .violet: return "rectangle.stack"
        case .amber: return "folder"
        }
    }
}

struct GlassBackdrop: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: [Glass.deep, Color(red: 0.026, green: 0.044, blue: 0.078)],
                               startPoint: .topTrailing, endPoint: .bottomLeading)
                RadialGradient(colors: [Glass.blue.opacity(0.26), .clear], center: .topTrailing,
                               startRadius: 0, endRadius: geo.size.width * 0.9)
                RadialGradient(colors: [Glass.ice.opacity(0.13), .clear], center: .bottomLeading,
                               startRadius: 0, endRadius: geo.size.width * 0.7)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct GlassPanel: ViewModifier {
    var radius: CGFloat = 23

    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius))
            .background {
                RoundedRectangle(cornerRadius: radius)
                    .fill(LinearGradient(colors: [.white.opacity(0.10), .white.opacity(0.025)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.22), .white.opacity(0.05)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing))
                    .allowsHitTesting(false)
            }
    }
}

extension View {
    func glassPanel(_ radius: CGFloat = 23) -> some View { modifier(GlassPanel(radius: radius)) }
}

struct PrimaryGlassButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .foregroundStyle(Color(red: 0.025, green: 0.15, blue: 0.15))
                .background(LinearGradient(colors: [Glass.ice, Color(red: 0.61, green: 0.82, blue: 0.98)],
                                           startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

private struct VaultLock: View {
    @ObservedObject var vault: VaultStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 21) {
                    VStack(spacing: 11) {
                        Text("H O O O H O   /   C A R D S").font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundStyle(Glass.ice)
                        Text("护护卡包").font(.system(size: 44, weight: .semibold, design: .rounded))
                            .foregroundStyle(Glass.text)
                        Text("平时安心收好，需要时放心查看")
                            .font(.callout).foregroundStyle(Glass.muted)
                    }
                    vaultMark
                    VStack(spacing: 8) {
                        Text("卡包已锁定").font(.title2.weight(.semibold))
                        Text("验证设备身份后，即可查看你的资料。")
                            .font(.footnote).foregroundStyle(Glass.muted)
                    }
                    if let message = vault.authenticationMessage {
                        Text(message).font(.footnote).foregroundStyle(.orange)
                            .multilineTextAlignment(.center).padding(.horizontal)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    VStack(spacing: 13) {
                        PrimaryGlassButton(title: vault.isAuthenticating ? "正在验证…" : "解锁卡包",
                                           icon: "faceid") {
                            Task { _ = await vault.unlock() }
                        }
                        .disabled(vault.isAuthenticating)
                        Label("本机加密保管", systemImage: "shield.checkered")
                            .font(.caption2.weight(.medium)).foregroundStyle(Glass.muted)
                    }
                    .padding(17).glassPanel()
                }
                .padding(.horizontal, 25)
                .padding(.vertical, 30)
                .frame(minHeight: geo.size.height)
                .frame(maxWidth: 475)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
        .sensoryFeedback(.success, trigger: vault.isUnlocked) { old, new in !old && new && !reduceMotion }
    }

    private var vaultMark: some View {
        ZStack {
            Circle().strokeBorder(.white.opacity(0.075), lineWidth: 1).frame(width: 213)
            Circle().strokeBorder(.white.opacity(0.10), lineWidth: 1).frame(width: 176)
            Circle().fill(Glass.blue.opacity(0.22)).frame(width: 135).blur(radius: 36)
            RoundedRectangle(cornerRadius: 42).fill(.ultraThinMaterial).frame(width: 118, height: 118)
                .overlay { RoundedRectangle(cornerRadius: 42).strokeBorder(.white.opacity(0.20)) }
                .rotationEffect(.degrees(-10))
            Image(systemName: "lock.shield")
                .font(.system(size: 49, weight: .light))
                .foregroundStyle(LinearGradient(colors: [Glass.ice, Glass.blue],
                                                startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .frame(height: 208)
        .accessibilityHidden(true)
    }
}

private enum VaultTab: String, CaseIterable {
    case cards = "卡包", calendar = "有效期", profile = "我的"

    var symbol: String {
        switch self {
        case .cards: return "rectangle.on.rectangle"
        case .calendar: return "calendar"
        case .profile: return "person.crop.circle"
        }
    }
}

private enum CardEntryChoice {
    case form(CardForm.EntrySource)
    case connected
}

private struct VaultHome: View {
    private struct NewCardDraft: Identifiable {
        let id = UUID()
        let owner: String
        let entry: CardForm.EntrySource
    }

    @ObservedObject var vault: VaultStore
    @Binding var incoming: URL?
    @State private var tab: VaultTab = .cards
    @State private var paths: [UUID] = []
    @State private var filter = ""
    @State private var query = ""
    @State private var newCard: NewCardDraft?
    @State private var showingEntryOptions = false
    @State private var pendingEntry: CardEntryChoice?
    @State private var showingFamilyForm = false
    @State private var calendarMonth = Date()
    @State private var showConnection = false
    @State private var showDemo = false
    @State private var feedback: String?
    @State private var showingBackup = false

    private var filtered: [CardRecord] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return vault.records.filter { record in
            (filter.isEmpty || record.ownerName == filter) && (term.isEmpty ||
                [record.title, record.ownerName, record.category].contains { $0.localizedCaseInsensitiveContains(term) })
        }
    }

    var body: some View {
        NavigationStack(path: $paths) {
            ZStack {
                GlassBackdrop()
                ScrollView {
                    Group {
                        switch tab {
                        case .cards: cards
                        case .calendar:
                            CardExpiryCalendar(records: vault.records, month: $calendarMonth) { paths.append($0) }
                        case .profile: profile
                        }
                    }
                    .frame(maxWidth: 520)
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 17)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollIndicators(.hidden)
                .id(tab)
            }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom, spacing: 0) { dock }
            .navigationDestination(for: UUID.self) { id in
                CardDetail(vault: vault, id: id)
            }
        }
        .sheet(isPresented: $showingEntryOptions, onDismiss: openPendingEntry) {
            CardEntryOptions { choice in
                pendingEntry = choice
                showingEntryOptions = false
            }
            .modifier(PrivateSceneCover())
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .preferredColorScheme(.dark)
        }
        .sheet(item: $newCard) { draft in
            CardForm(initial: nil, vault: vault, defaultOwner: draft.owner, entry: draft.entry) { record in
                newCard = nil
                if !filter.isEmpty { filter = record.ownerName }
                query = ""
                paths = [record.id]
            }
            .modifier(PrivateSceneCover())
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showingFamilyForm) {
            FamilyMemberForm(vault: vault) { name in
                filter = name
                query = ""
                showingFamilyForm = false
            }
            .modifier(PrivateSceneCover())
            .presentationDetents([.medium, .large])
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showConnection) {
            NavigationStack { ConnectedRecordsView(vault: vault, incoming: $incoming) }
                .modifier(PrivateSceneCover())
                .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showingBackup) {
            NavigationStack { PortableBackupView(vault: vault) }
                .modifier(PrivateSceneCover())
                .preferredColorScheme(.dark)
        }
        .onAppear { if incoming != nil { showConnection = true } }
        .onChange(of: incoming) { _, url in if url != nil { showConnection = true } }
        .onChange(of: vault.owners) { _, owners in
            if !filter.isEmpty, !owners.contains(filter) { filter = "" }
        }
        .confirmationDialog("载入虚构示例？", isPresented: $showDemo, titleVisibility: .visible) {
            Button("载入示例") {
                do { try vault.loadDemoRecords() } catch { feedback = error.localizedDescription }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("示例会保存在此设备，方便试用卡包与导出工具。")
        }
        .alert("操作提示", isPresented: Binding(
            get: { feedback != nil }, set: { if !$0 { feedback = nil } }
        )) {
            Button("知道了", role: .cancel) {}
        } message: { Text(feedback ?? "") }
    }

    private var cards: some View {
        VStack(alignment: .leading, spacing: 15) {
            header("护护卡包", eyebrow: "HOOOHO  /  PRIVATE WALLET", walletActions: true)
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Label("保险库已解锁", systemImage: "shield.checkered")
                        .font(.caption.weight(.semibold)).foregroundStyle(Glass.ice)
                    Spacer()
                    Text("01 / VAULT").font(.caption2.monospaced()).foregroundStyle(Glass.muted)
                }
                Text("平时安心收好，\n需要时放心查看").font(.system(size: 29, weight: .semibold, design: .rounded))
                    .foregroundStyle(Glass.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("已收纳 \(vault.records.count) 份资料 · 首页隐藏原件")
                    .font(.footnote).foregroundStyle(Glass.muted)
            }
            .padding(19)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassPanel(25)
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Glass.ice)
                TextField("搜索名称、证件类型或成员", text: $query)
                    .textInputAutocapitalization(.never)
            }
            .font(.subheadline).padding(13).glassPanel(15)
            ownerFilters
            if filtered.isEmpty {
                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("没有符合条件的资料").foregroundStyle(Glass.muted).padding(.vertical, 16)
                    Button("清除搜索") { query = "" }.font(.footnote)
                } else {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(filter.isEmpty ? "还没有卡片" : "\(filter)暂无卡片")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Glass.text)
                        Text("点右上角的＋录入卡片。").font(.footnote).foregroundStyle(Glass.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14).glassPanel(17)
                }
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 152), spacing: 9)], spacing: 9) {
                    ForEach(filtered) { record in
                        Button { paths.append(record.id) } label: { card(record) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var ownerFilters: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ownerChip("全部", value: "").id("")
                    ForEach(vault.owners, id: \.self) { name in
                        ownerChip(name == "全部" ? "全部（成员）" : name, value: name).id(name)
                    }
                    Button { showingFamilyForm = true } label: {
                        Image(systemName: "plus")
                            .font(.footnote.weight(.semibold)).foregroundStyle(Glass.ice)
                            .frame(width: 34, height: 32)
                            .background(Glass.ice.opacity(0.10), in: Capsule())
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("添加家人")
                }
            }
            .scrollIndicators(.hidden)
            .onChange(of: filter) { _, selected in
                withAnimation(.easeInOut(duration: 0.2)) { proxy.scrollTo(selected) }
            }
        }
    }

    private func openPendingEntry() {
        let choice = pendingEntry
        pendingEntry = nil
        guard let choice, vault.isUnlocked else { return }
        switch choice {
        case .form(let entry):
            newCard = NewCardDraft(owner: filter.isEmpty ? "本人" : filter, entry: entry)
        case .connected:
            showConnection = true
        }
    }

    private var profile: some View {
        VStack(alignment: .leading, spacing: 14) {
            header("我的卡包", eyebrow: "03 / PRIVACY")
            actionRow("现在锁定", "立即遮住卡片和原件", "lock.shield") { vault.lock() }
            actionRow("资料连接", "查看来源，导入指定的护护资料", "link") { showConnection = true }
            actionRow("加密备份与恢复", "用独立口令保护备份文件，换机时可恢复", "externaldrive.badge.timemachine") { showingBackup = true }
            actionRow("载入虚构示例", "体验自定义卡、证件遮挡和副本导出", "sparkles") { showDemo = true }
            VStack(alignment: .leading, spacing: 7) {
                Text("资料如何保管").font(.headline)
                Text("本机加密保存。离开 App 会锁定。更换手机或关闭设备密码前，请先创建加密备份。")
                    .font(.footnote).foregroundStyle(Glass.muted).lineSpacing(3)
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading).glassPanel()
        }
    }

    private var dock: some View {
        HStack(spacing: 4) {
            ForEach(VaultTab.allCases, id: \.self) { item in
                Button {
                    paths.removeAll()
                    tab = item
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: item.symbol).font(.system(size: 19, weight: .medium))
                        Text(item.rawValue).font(.caption2.weight(.medium))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(tab == item ? Glass.ice : Glass.muted)
                    .background(tab == item ? Glass.ice.opacity(0.12) : Color.clear,
                                in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == item ? .isSelected : [])
            }
        }
        .padding(6).glassPanel(19)
        .padding(.horizontal, 15).padding(.bottom, 4)
    }

    private func header(_ title: String, eyebrow: String, walletActions: Bool = false) -> some View {
        HStack(alignment: .bottom, spacing: 7) {
            VStack(alignment: .leading, spacing: 6) {
                Text(eyebrow).font(.caption2.weight(.semibold).monospaced()).foregroundStyle(Glass.ice)
                Text(title).font(.system(size: 34, weight: .semibold, design: .rounded)).foregroundStyle(Glass.text)
            }
            Spacer(minLength: 0)
            if walletActions {
                Button { showingEntryOptions = true } label: {
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Glass.ice)
                        .frame(width: 44, height: 44)
                        .background(Glass.ice.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
                        .glassPanel(15)
                }.buttonStyle(.plain).accessibilityLabel("录入卡片")
                Button { vault.lock() } label: {
                    Image(systemName: "lock").font(.system(size: 16, weight: .medium))
                        .frame(width: 44, height: 44).glassPanel(15)
                }.buttonStyle(.plain).accessibilityLabel("锁定卡包")
            }
        }
    }

    private func ownerChip(_ label: String, value: String) -> some View {
        Button { filter = value } label: {
            Text(label).font(.footnote.weight(.medium))
                .padding(.horizontal, 12).padding(.vertical, 8)
                .foregroundStyle(filter == value ? Glass.ice : Glass.muted)
                .background((filter == value ? Glass.ice : Color.white).opacity(filter == value ? 0.14 : 0.05), in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityAddTraits(filter == value ? .isSelected : [])
    }

    private func card(_ record: CardRecord) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Image(systemName: record.externalID == nil ? record.appearance.symbol : "link")
                    .font(.system(size: 16, weight: .medium)).foregroundStyle(record.appearance.accent)
                Spacer()
                Image(systemName: "eye.slash").font(.caption2).foregroundStyle(Glass.muted)
            }
            Text(record.title).font(.headline).foregroundStyle(Glass.text).lineLimit(1)
            Text([record.ownerName, record.category].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption2).foregroundStyle(Glass.muted).lineLimit(1)
        }
        .padding(13)
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
        .background {
            RoundedRectangle(cornerRadius: 18).fill(
                LinearGradient(colors: [record.appearance.accent.opacity(0.16), .clear],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            )
        }
        .glassPanel(18)
    }
}

private struct CardEntryOptions: View {
    let choose: (CardEntryChoice) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var choosingImport = false

    var body: some View {
        ZStack {
            GlassBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 11) {
                    HStack(spacing: 8) {
                        if choosingImport {
                            Button { choosingImport = false } label: {
                                Image(systemName: "chevron.left")
                                    .frame(width: 44, height: 44)
                                    .glassPanel(14)
                            }.buttonStyle(.plain).accessibilityLabel("返回录入选项")
                        }
                        Text(choosingImport ? "选择导入来源" : "录入卡片")
                            .font(.title2.weight(.semibold)).foregroundStyle(Glass.text)
                            .accessibilityAddTraits(.isHeader)
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark").font(.subheadline.weight(.medium))
                                .frame(width: 44, height: 44).glassPanel(14)
                        }.buttonStyle(.plain).accessibilityLabel("关闭录入选项")
                    }
                    if choosingImport {
                        actionRow("从相册导入", "选择一张或多张证件照片", "photo.on.rectangle") {
                            choose(.form(.photos))
                        }
                        actionRow("从护护 App 导入", "选择资料文件并核对内容", "link") { choose(.connected) }
                    } else {
                        actionRow("拍摄", "用相机扫描证件", "viewfinder") { choose(.form(.camera)) }
                        actionRow("导入", "选择相册照片或护护资料", "square.and.arrow.down") {
                            choosingImport = true
                        }
                        Button { choose(.form(.manual)) } label: {
                            Label("手动填写", systemImage: "pencil")
                                .font(.subheadline.weight(.medium)).foregroundStyle(Glass.ice)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20).padding(.vertical, 18)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

private struct FamilyMemberForm: View {
    @ObservedObject var vault: VaultStore
    let onSaved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ZStack {
                GlassBackdrop()
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("添加后可按这位家人查看卡片，录入时也能直接选用。")
                            .font(.subheadline).foregroundStyle(Glass.muted)
                        TextField("姓名或称呼", text: $name)
                            .textContentType(.none)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.done)
                            .onSubmit(save)
                            .padding(14).glassPanel(15)
                            .privacySensitive()
                        if let message {
                            Text(message).font(.footnote).foregroundStyle(Glass.muted)
                        }
                        PrimaryGlassButton(title: "添加家人", icon: "person.badge.plus", action: save)
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .frame(maxWidth: 440)
                    .padding(20)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("添加家人").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            }
        }
    }

    private func save() {
        do { onSaved(try vault.addFamilyMember(name)) }
        catch { message = error.localizedDescription }
    }
}

private func actionRow(_ title: String, _ subtitle: String, _ icon: String,
                       action: @escaping () -> Void) -> some View {
    Button(action: action) {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 16, weight: .medium))
                .foregroundStyle(Glass.ice).frame(width: 38, height: 38)
                .background(Glass.ice.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Glass.text)
                Text(subtitle).font(.caption).foregroundStyle(Glass.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Glass.muted)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(17)
    }
    .buttonStyle(.plain)
}

private func safeExportFields(_ record: CardRecord) -> [String] {
    record.customFields.filter { !$0.isSensitive && !$0.value.isEmpty }.map { "\($0.label)  \($0.value)" }
}

private struct CardDetail: View {
    @ObservedObject var vault: VaultStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    let id: UUID
    @State private var revealed = false
    @State private var page = 0
    @State private var authentication: LAContext?
    @State private var rehide: Task<Void, Never>?
    @State private var edit = false
    @State private var export = false
    @State private var deleting = false
    @State private var reminderSet = false
    @State private var message: String?

    private var record: CardRecord? { vault.records.first { $0.id == id } }

    var body: some View {
        ZStack {
            GlassBackdrop()
            if let record {
                ScrollView {
                    VStack(alignment: .leading, spacing: 13) {
                        VStack(alignment: .leading, spacing: 7) {
                            Label(revealed ? "短时查看已开启" : "原件已遮挡", systemImage: revealed ? "eye" : "lock.shield")
                                .font(.caption.weight(.semibold)).foregroundStyle(Glass.ice)
                            Text(record.title).font(.largeTitle.weight(.semibold)).foregroundStyle(Glass.text)
                            Text([record.ownerName, record.category].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(Glass.muted)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(19).glassPanel()
                        let pages = [record.imageData].compactMap { $0 } + record.extraImages
                        if revealed, !pages.isEmpty, let image = UIImage(data: pages[min(page, pages.count - 1)]) {
                            Image(uiImage: image).resizable().scaledToFit()
                                .frame(maxWidth: .infinity)
                                .clipShape(RoundedRectangle(cornerRadius: 17))
                                .accessibilityLabel("第 \(page + 1) 页原件").privacySensitive()
                            if pages.count > 1 {
                                HStack {
                                    Button("上一页") { page -= 1 }.disabled(page == 0)
                                    Spacer()
                                    Text("\(page + 1) / \(pages.count)").monospacedDigit().foregroundStyle(Glass.muted)
                                    Spacer()
                                    Button("下一页") { page += 1 }.disabled(page >= pages.count - 1)
                                }.font(.footnote).padding(12).glassPanel(15)
                            }
                        } else if !pages.isEmpty {
                            HStack(spacing: 10) {
                                Image(systemName: "eye.slash")
                                Text("原件已遮挡 · \(pages.count) 页")
                            }
                            .font(.footnote).foregroundStyle(Glass.muted)
                            .frame(maxWidth: .infinity, minHeight: 102).glassPanel(17)
                        }
                        VStack(spacing: 0) {
                            info("来源", record.source)
                            if !record.number.isEmpty { info("号码", revealed ? record.number : "••••  " + String(record.number.suffix(4))) }
                            if let expiry = record.expiry { info("有效期至", expiry.formatted(date: .abbreviated, time: .omitted)) }
                            ForEach(record.customFields) { field in
                                if !field.value.isEmpty {
                                    info(field.label, field.isSensitive && !revealed ? "已遮挡" : field.value)
                                }
                            }
                            if !record.notes.isEmpty { info("备注", revealed ? record.notes : "已遮挡") }
                        }.padding(.horizontal, 14).glassPanel(17).privacySensitive()
                        PrimaryGlassButton(title: revealed ? "立即遮挡" : "验证并查看原件",
                                           icon: revealed ? "eye.slash" : "faceid") {
                            if revealed { hide() } else { authenticate { beginReveal() } }
                        }
                        .disabled(authentication != nil)
                        actionRow("编辑", "调整资料名称、成员和自定义字段", "pencil") { authenticate { edit = true } }
                        VStack(alignment: .leading, spacing: 8) {
                            Text("工具").font(.headline).foregroundStyle(Glass.text)
                                .accessibilityAddTraits(.isHeader)
                            actionRow("导出副本", "添加水印、实色遮挡或马赛克", "square.and.arrow.up") {
                                authenticate { export = true }
                            }
                            if let expiry = record.expiry {
                                actionRow(reminderSet ? "关闭到期提醒" : "开启到期提醒",
                                          "本机提醒只显示通用文案", "bell") { toggleReminder(expiry) }
                            }
                        }
                        Button("删除本机证件", role: .destructive) { deleting = true }
                            .frame(maxWidth: .infinity).font(.footnote).padding(.vertical, 7)
                    }.frame(maxWidth: 520).padding(20).frame(maxWidth: .infinity)
                }.scrollIndicators(.hidden)
            } else {
                ContentUnavailableView("找不到资料", systemImage: "rectangle.slash")
            }
        }
        .navigationTitle("证件详情").navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .sheet(isPresented: $edit, onDismiss: hide) {
            if let record {
                CardForm(initial: record, vault: vault) { saved in
                    edit = false
                    if reminderSet {
                        Task { @MainActor in
                            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [reminderID])
                            reminderSet = false
                            if let expiry = saved.expiry { await scheduleReminder(expiry, requestPermission: false) }
                        }
                    }
                }
                    .modifier(PrivateSceneCover())
            }
        }
        .sheet(isPresented: $export, onDismiss: hide) {
            if let record {
                NavigationStack {
                    ExportEditor(title: record.title, imageData: record.imageData, fields: safeExportFields(record), extraImages: record.extraImages)
                }
                .modifier(PrivateSceneCover())
            }
        }
        .onChange(of: phase) { _, value in if value == .background { hide() } }
        .onDisappear(perform: hide)
        .task {
            reminderSet = await UNUserNotificationCenter.current().pendingNotificationRequests()
                .contains { $0.identifier == reminderID }
        }
        .confirmationDialog("删除本机证件？", isPresented: $deleting, titleVisibility: .visible) {
            Button("删除证件", role: .destructive) {
                do {
                    try vault.remove(id)
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [reminderID])
                    dismiss()
                } catch { message = error.localizedDescription }
            }
            Button("取消", role: .cancel) {}
        } message: { Text("将移除这份证件及其本机字段。以前导出的文件仍由收件人持有。") }
        .alert("操作提示", isPresented: Binding(
            get: { message != nil }, set: { if !$0 { message = nil } }
        )) {
            Button("知道了", role: .cancel) {}
        } message: { Text(message ?? "") }
    }

    private func info(_ name: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 13) {
            Text(name).foregroundStyle(Glass.muted)
            Spacer()
            Text(value).foregroundStyle(Glass.text).multilineTextAlignment(.trailing)
        }
        .font(.subheadline).padding(.vertical, 12)
    }

    private var reminderID: String { "hoooho-card-expiry-" + id.uuidString }

    private func toggleReminder(_ expiry: Date) {
        if reminderSet {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [reminderID])
            reminderSet = false
        } else {
            Task { @MainActor in await scheduleReminder(expiry, requestPermission: true) }
        }
    }

    private func scheduleReminder(_ expiry: Date, requestPermission: Bool) async {
        let center = UNUserNotificationCenter.current()
        let now = Date()
        guard expiry > now else { message = "这个到期日已过，可以先更新日期。"; return }
        do {
            if requestPermission {
                let allowed = try await center.requestAuthorization(options: [.alert, .sound])
                guard allowed else { message = "通知权限关闭。可在系统设置中开启。"; return }
            }
            let lead = Calendar.current.date(byAdding: .day, value: -30, to: expiry) ?? expiry
            let date = lead > now ? lead : expiry
            let content = UNMutableNotificationContent()
            content.title = "护护卡包"
            content.body = "有一项资料待查看。"
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSince(now)), repeats: false)
            try await center.add(UNNotificationRequest(identifier: reminderID, content: content, trigger: trigger))
            reminderSet = true
        } catch { message = "提醒未能保存。请稍后重试。" }
    }

    private func authenticate(onVerified: @escaping () -> Void) {
        guard authentication == nil else { return }
        let context = LAContext()
        context.localizedCancelTitle = "先不查看"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            message = "请在设备设置中先启用密码。"
            return
        }
        authentication = context
        Task { @MainActor in
            defer { if authentication === context { authentication = nil } }
            do {
                let verified = try await context.evaluatePolicy(.deviceOwnerAuthentication,
                    localizedReason: "验证你的身份后查看完整证件。")
                guard verified, authentication === context, vault.isUnlocked else { return }
                onVerified()
            } catch {
                if authentication === context, ![LAError.userCancel.rawValue, LAError.systemCancel.rawValue,
                                                  LAError.appCancel.rawValue].contains((error as NSError).code) {
                    message = "设备验证未完成，请重试。"
                }
            }
        }
    }

    private func beginReveal() {
        revealed = true
        page = 0
        rehide?.cancel()
        rehide = Task { @MainActor in
            try? await Task.sleep(for: .seconds(30))
            if !Task.isCancelled { hide() }
        }
    }

    private func hide() {
        authentication?.invalidate()
        authentication = nil
        rehide?.cancel()
        rehide = nil
        revealed = false
    }
}

struct PrivateSceneCover: ViewModifier {
    @Environment(\.scenePhase) private var phase

    func body(content: Content) -> some View {
        content.overlay {
            if phase != .active {
                Glass.deep.ignoresSafeArea().overlay {
                    Image(systemName: "lock.shield").font(.title2).foregroundStyle(Glass.ice)
                }.accessibilityHidden(true)
            }
        }
    }
}
