import AVFoundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import Vision
import VisionKit

private struct CardTemplate: Identifiable {
    let name: String
    let suggestedFields: [String]
    var id: String { name }
}

private struct CardTemplateGroup: Identifiable {
    let name: String
    let icon: String
    let items: [CardTemplate]
    var id: String { name }

    private static func item(_ name: String, _ fields: String...) -> CardTemplate {
        CardTemplate(name: name, suggestedFields: fields)
    }

    static let all: [Self] = [
        .init(name: "身份与家庭", icon: "person.2", items: [
            item("身份证", "签发机关", "出生日期", "住址"),
            item("居留许可", "许可类别", "签发地", "签发日期"),
            item("永久居民卡", "签发地", "签发日期"),
            item("中国社保卡", "发卡地", "发卡日期"),
            item("医疗保险卡", "参保地区", "参保机构"),
            item("户口本", "户主", "户别", "住址"),
            item("结婚证", "配偶", "登记日期", "登记机关"),
            item("出生证明", "出生日期", "签发机构", "签发日期")
        ]),
        .init(name: "出行", icon: "airplane", items: [
            item("护照", "签发地", "签发日期"),
            item("往来港澳通行证", "签注类别", "签注到期日"),
            item("往来台湾通行证", "签注类别", "签注到期日"),
            item("签证", "目的地", "签证类别", "允许停留天数"),
            item("驾驶证", "准驾车型", "初领日期", "签发机关"),
            item("行驶证", "车牌", "VIN", "注册日期"),
            item("汽车保险", "保险公司", "关联车辆", "险种")
        ]),
        .init(name: "金融与房产", icon: "building.columns", items: [
            item("银行卡"),
            item("不动产权证", "权利人", "坐落", "登记日期")
        ]),
        .init(name: "工作与学习", icon: "briefcase", items: [
            item("学生证", "学校", "学号", "入学日期"),
            item("学历证书", "院校", "学历", "专业"),
            item("营业执照", "主体名称", "统一社会信用代码", "登记日期"),
            item("工作证", "机构", "员工号", "签发日期"),
            item("工作许可", "签发地", "许可类别"),
            item("职业资格证", "资格名称", "等级", "发证机构")
        ]),
        .init(name: "其他", icon: "rectangle.stack", items: [
            item("通用卡片", "机构", "用途"),
            item("自定义")
        ])
    ]

    static func suggestions(for category: String) -> [String] {
        all.lazy.flatMap(\.items).first { $0.name == category }?.suggestedFields ?? []
    }
}

@MainActor
struct CardForm: View {
    enum EntrySource {
        case manual, camera, photos
    }

    let initial: CardRecord?
    let vault: VaultStore
    var onSaved: (CardRecord) -> Void
    private let defaultOwner: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft: CardRecord
    @State private var customType: String
    @State private var selectedTemplate: String
    @State private var hasExpiry: Bool
    @State private var selectedExpiry: Date
    @State private var photos: [PhotosPickerItem] = []
    @State private var loadingPhoto = false
    @State private var showPhotoPicker = false
    @State private var showTemplatePicker = false
    @State private var showScanner = false
    @State private var entry: EntrySource
    @State private var confirmDiscard = false
    @State private var confirmBankType = false
    @State private var error: String?
    @State private var recognizedLines: [String] = []
    @State private var recognitionTask: Task<Void, Never>?
    @State private var recognitionID = UUID()
    @State private var recognizing = false
    @State private var showRecognition = false
    @State private var imagePreview = false
    @State private var previewIndex = 0

    private let mint = Color(red: 0.66, green: 0.95, blue: 0.87)
    private let quiet = Color(red: 0.65, green: 0.72, blue: 0.81)
    private let surface = Color(red: 0.067, green: 0.107, blue: 0.166)

    init(initial: CardRecord?, vault: VaultStore, defaultOwner: String = "本人", entry: EntrySource = .manual,
         onSaved: @escaping (CardRecord) -> Void) {
        self.initial = initial
        self.vault = vault
        self.onSaved = onSaved
        self.defaultOwner = defaultOwner
        let startingDraft = initial ?? CardRecord(title: "", category: "通用卡片", owner: defaultOwner)
        let knownTemplate = CardTemplateGroup.all.flatMap(\.items).contains { $0.name == startingDraft.category }
        _draft = State(initialValue: startingDraft)
        _selectedTemplate = State(initialValue: knownTemplate ? startingDraft.category : "自定义")
        _customType = State(initialValue: knownTemplate ? "" : startingDraft.category)
        _hasExpiry = State(initialValue: startingDraft.expiry != nil)
        _selectedExpiry = State(initialValue: startingDraft.expiry ?? Date())
        _entry = State(initialValue: entry)
    }

    private let maxPages = 12
    private let maxAttachmentBytes = 30 * 1024 * 1024
    private let maxPageBytes = 8 * 1024 * 1024

    private var pages: [Data] {
        if let first = draft.imageData { return [first] + draft.extraImages }
        return draft.extraImages
    }

    private var isBankCard: Bool { selectedTemplate == "银行卡" }
    private var trimmedTitle: String { draft.title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var currentCategory: String {
        let namedType = customType.trimmingCharacters(in: .whitespacesAndNewlines)
        return selectedTemplate == "自定义" && !namedType.isEmpty ? namedType : selectedTemplate
    }
    private var isDirty: Bool {
        if let initial {
            return draft != initial || currentCategory != initial.category
                || hasExpiry != (initial.expiry != nil)
                || (hasExpiry && Optional(selectedExpiry) != initial.expiry)
        }
        return !trimmedTitle.isEmpty || draft.owner != defaultOwner || !draft.number.isEmpty
            || !draft.notes.isEmpty || !pages.isEmpty || !draft.customFields.isEmpty
            || hasExpiry || selectedTemplate != "通用卡片" || draft.appearance != .ice
    }
    private var validationMessage: String? {
        if selectedTemplate == "自定义", currentCategory != "自定义",
           CardTemplateGroup.all.lazy.flatMap(\.items).contains(where: { $0.name == currentCategory }) {
            return "这个类型已有专用模板，请从类型列表选择。"
        }
        if !isBankCard && draft.customFields.contains(where: {
            !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && $0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) { return "有字段填了内容，请为它补上字段名。" }
        return nil
    }

    var body: some View {
        NavigationStack {
            ZStack {
                formBackground
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        identitySection
                        appearanceSection
                        if !isBankCard { attachmentSection }
                        fieldsSection
                        expirySection
                        if let validationMessage {
                            Label(validationMessage, systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(quiet)
                        }
                        saveButton
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 26)
                    .frame(maxWidth: 600)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(initial == nil ? "新增卡片" : "编辑卡片")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(surface, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: requestDismiss)
                        .foregroundStyle(quiet)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存", action: save)
                        .fontWeight(.semibold)
                        .foregroundStyle(mint)
                        .disabled(trimmedTitle.isEmpty || validationMessage != nil || loadingPhoto)
                }
            }
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled(isDirty || loadingPhoto)
        .sheet(isPresented: $showTemplatePicker) { templatePicker }
        .sheet(isPresented: $showRecognition) { recognitionSheet }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photos,
                      maxSelectionCount: max(1, maxPages - pages.count), selectionBehavior: .ordered,
                      matching: .images)
        .fullScreenCover(isPresented: $showScanner) {
            FormDocumentScanner(
                maxPageCount: maxPages - pages.count,
                onComplete: receiveScan,
                onCancel: { showScanner = false },
                onFailure: { failure in
                    showScanner = false
                    error = failure
                }
            )
            .ignoresSafeArea()
        }
        .sheet(isPresented: $imagePreview) {
            NavigationStack {
                ZStack {
                    formBackground
                    if pages.indices.contains(previewIndex), scenePhase == .active {
                        TabView(selection: $previewIndex) {
                            ForEach(pages.indices, id: \.self) { index in
                                if let image = UIImage(data: pages[index]) {
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFit()
                                        .padding(16)
                                        .privacySensitive()
                                        .accessibilityLabel("证件照片第 \(index + 1) 页")
                                        .tag(index)
                                }
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: pages.count > 1 ? .always : .never))
                    }
                }
                .navigationTitle("第 \(previewIndex + 1) 页 · 共 \(pages.count) 页")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("完成") { imagePreview = false }
                            .foregroundStyle(mint)
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
        .onAppear(perform: openEntrySource)
        .task(id: photos) { await readPhotos(photos) }
        .onDisappear {
            cancelRecognition()
        }
        .onChange(of: showRecognition) { _, isPresented in
            if !isPresented { recognizedLines = [] }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                photos = []
                loadingPhoto = false
                cancelRecognition()
                showRecognition = false
                imagePreview = false
                showScanner = false
                showPhotoPicker = false
            }
        }
        .confirmationDialog("放弃本次编辑？", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("放弃编辑", role: .destructive) { dismiss() }
            Button("继续编辑", role: .cancel) {}
        } message: {
            Text("已保存的卡片仍可查看。本次填写的内容和照片将从编辑页面清除。")
        }
        .confirmationDialog("切换成银行卡？", isPresented: $confirmBankType, titleVisibility: .visible) {
            Button("移除本次附件和其他字段", role: .destructive) { applyTemplate("银行卡") }
            Button("保留当前类型", role: .cancel) {}
        } message: {
            Text("银行卡只保存卡片名称、所属人、末四位和可选有效期。")
        }
        .alert("需要处理", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("知道了", role: .cancel) { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private var formBackground: some View {
        ZStack {
            Color(red: 0.033, green: 0.066, blue: 0.119)
            RadialGradient(colors: [Color.blue.opacity(0.22), .clear], center: .topTrailing, startRadius: 10, endRadius: 400)
            RadialGradient(colors: [mint.opacity(0.10), .clear], center: .bottomLeading, startRadius: 0, endRadius: 330)
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label("本机卡包", systemImage: "lock.shield")
                .font(.caption.weight(.semibold))
                .foregroundStyle(mint)
            Text(initial == nil ? "把重要资料收好" : "整理卡片资料")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text("可以只填写文字，也可以附上证件照片。保存前请核对你要留下的内容。")
                .font(.subheadline)
                .foregroundStyle(quiet)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var identitySection: some View {
        panel("卡片信息", icon: "rectangle.on.rectangle.angled") {
            Button { showTemplatePicker = true } label: {
                HStack(spacing: 9) {
                    Text("类型").foregroundStyle(quiet)
                    Spacer()
                    Text(selectedTemplate).foregroundStyle(.white)
                    Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(mint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("证件类型")
            .accessibilityValue(selectedTemplate)
            Divider()
            if selectedTemplate == "自定义" {
                textRow("类型名称", prompt: "如出行证明", text: $customType)
                Divider()
            }
            textRow("名称", prompt: "如孩子的护照", text: $draft.title)
            Divider()
            HStack(spacing: 10) {
                textRow("所属人", prompt: "如本人或孩子", text: $draft.owner)
                Menu {
                    ForEach(vault.owners, id: \.self) { name in
                        Button {
                            draft.owner = name
                        } label: {
                            if draft.ownerName == name {
                                Label(name, systemImage: "checkmark")
                            } else {
                                Text(name)
                            }
                        }
                    }
                } label: {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 19)).foregroundStyle(mint)
                        .frame(width: 44, height: 44)
                        .background(mint.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("选择所属人")
            }
        }
    }

    private var appearanceSection: some View {
        panel("封面样式", icon: "swatchpalette") {
            HStack {
                Image(systemName: draft.appearance.symbol).foregroundStyle(draft.appearance.accent)
                Text(trimmedTitle.isEmpty ? "卡片预览" : trimmedTitle).lineLimit(1)
                Spacer()
                Image(systemName: "eye.slash").font(.caption).foregroundStyle(quiet)
            }
            .font(.subheadline.weight(.semibold))
            .padding(13)
            .background(draft.appearance.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 13))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CardAppearance.allCases) { appearance in
                        Button { draft.appearance = appearance } label: {
                            Label(appearance.title, systemImage: draft.appearance == appearance ? "checkmark.circle.fill" : "circle.fill")
                                .font(.caption.weight(.medium)).foregroundStyle(appearance.accent)
                                .padding(.horizontal, 10).frame(minHeight: 42)
                                .background(appearance.accent.opacity(0.09), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(draft.appearance == appearance ? .isSelected : [])
                    }
                }
            }
        }
    }

    private var attachmentSection: some View {
        panel("证件照片", icon: "doc.viewfinder") {
            Text("可扫描或导入最多 \(maxPages) 页。首页只显示卡片封面样式。")
                .font(.footnote)
                .foregroundStyle(quiet)
            if !pages.isEmpty { pageGallery }
            if pages.count < maxPages {
                HStack(spacing: 10) {
                    Button(action: startScan) {
                        captureLabel("扫描", icon: "viewfinder")
                    }
                    .buttonStyle(.plain)
                    .disabled(loadingPhoto)
                    Button { showPhotoPicker = true } label: {
                        captureLabel("从相册选取", icon: "photo")
                    }
                    .buttonStyle(.plain)
                    .disabled(loadingPhoto)
                }
            }
            if loadingPhoto {
                ProgressView("正在读取照片…")
                    .font(.footnote)
                    .tint(mint)
            } else if !pages.isEmpty {
                recognitionButton
            }
        }
    }

    private var pageGallery: some View {
        let attachments = pages
        return ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 10) {
                ForEach(attachments.indices, id: \.self) { index in
                    VStack(alignment: .leading, spacing: 4) {
                        Button {
                            previewIndex = index
                            imagePreview = true
                        } label: {
                            Group {
                                if scenePhase == .active, let image = FormImageCodec.thumbnail(attachments[index]) {
                                    Image(uiImage: image).resizable().scaledToFill()
                                } else {
                                    Color.clear
                                }
                            }
                            .frame(width: 83, height: 57)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .privacySensitive()
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("预览第 \(index + 1) 页")
                        HStack(spacing: 2) {
                            Text(index == 0 ? "第 1 页 · 封面" : "第 \(index + 1) 页")
                                .font(.caption2)
                                .foregroundStyle(quiet)
                            Spacer(minLength: 1)
                            Menu {
                                Button("前移", systemImage: "arrow.left") { movePage(index, by: -1) }
                                    .disabled(index == 0)
                                Button("后移", systemImage: "arrow.right") { movePage(index, by: 1) }
                                    .disabled(index + 1 >= attachments.count)
                                Button(role: .destructive) { removePage(index) } label: {
                                    Label("移除", systemImage: "trash")
                                }
                            } label: {
                                Image(systemName: "ellipsis.circle")
                                    .foregroundStyle(mint)
                                    .frame(width: 24, height: 30)
                            }
                            .accessibilityLabel("第 \(index + 1) 页操作")
                            .disabled(loadingPhoto)
                        }
                    }
                    .frame(width: 83)
                    .padding(6)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 11))
                }
            }
        }
    }

    @ViewBuilder
    private var recognitionButton: some View {
        if recognizing {
            ProgressView("正在识别…").tint(mint).font(.footnote)
        } else if pages.count == 1 {
            Button { startRecognition(at: 0) } label: {
                Label("在本机识别文字", systemImage: "text.viewfinder")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(mint)
        } else {
            Menu {
                ForEach(pages.indices, id: \.self) { index in
                    Button("第 \(index + 1) 页") { startRecognition(at: index) }
                }
            } label: {
                Label("选择页面识别文字", systemImage: "text.viewfinder")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(mint)
        }
    }

    private var fieldsSection: some View {
        panel(isBankCard ? "银行卡资料" : "字段与备注", icon: "slider.horizontal.3") {
            if isBankCard {
                Text("只保存卡片名称、所属人、卡号末四位和可选有效期。")
                    .font(.footnote)
                    .foregroundStyle(quiet)
                textRow("卡号末四位", prompt: "可留空", text: $draft.number, keyboard: .asciiCapableNumberPad)
                    .onChange(of: draft.number) { _, value in
                        let digits = String(value.filter { "0123456789".contains($0) }.suffix(4))
                        if digits != value { draft.number = digits }
                    }
            } else {
                textRow("号码", prompt: "可留空", text: $draft.number, sensitive: true)
                Divider()
                TextField("备注（可留空）", text: $draft.notes, axis: .vertical)
                    .font(.subheadline)
                    .lineLimit(2...4)
                    .privacySensitive()
                    .foregroundStyle(.white)
                if !draft.customFields.isEmpty { Divider() }
                ForEach($draft.customFields) { $field in
                    VStack(alignment: .leading, spacing: 9) {
                        HStack {
                            TextField("字段名", text: $field.label)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(mint)
                            Button(role: .destructive) {
                                let id = field.id
                                draft.customFields.removeAll { $0.id == id }
                            } label: {
                                Image(systemName: "minus.circle")
                                    .frame(width: 44, height: 30)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("移除字段")
                        }
                        TextField("输入内容", text: $field.value, axis: .vertical)
                            .font(.subheadline)
                            .lineLimit(1...3)
                            .privacySensitive()
                            .foregroundStyle(.white)
                        Toggle("敏感字段", isOn: $field.isSensitive)
                            .tint(mint)
                            .font(.footnote)
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 13))
                }
                if draft.customFields.count < 20 {
                    HStack(spacing: 12) {
                        Button {
                            draft.customFields.append(CardField(label: "", value: ""))
                        } label: {
                            Label("添加自定义字段", systemImage: "plus.circle")
                        }
                        let suggestions = CardTemplateGroup.suggestions(for: selectedTemplate)
                            .filter { suggestion in !draft.customFields.contains { $0.label == suggestion } }
                        if !suggestions.isEmpty {
                            Menu {
                                ForEach(suggestions, id: \.self) { suggestion in
                                    Button(suggestion) {
                                        draft.customFields.append(CardField(label: suggestion, value: ""))
                                    }
                                }
                            } label: {
                                Label("常用字段", systemImage: "sparkle")
                            }
                        }
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(mint)
                }
            }
        }
    }

    private var expirySection: some View {
        panel("有效期", icon: "calendar") {
            Toggle("设置到期日", isOn: $hasExpiry)
                .tint(mint)
                .font(.subheadline.weight(.medium))
            if hasExpiry {
                Divider()
                DatePicker("到期日", selection: $selectedExpiry, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .font(.subheadline)
            }
        }
    }

    private var saveButton: some View {
        Button(action: save) {
            Label("保存到本机卡包", systemImage: "lock")
                .font(.headline)
                .foregroundStyle(Color(red: 0.025, green: 0.12, blue: 0.12))
                .padding(.vertical, 15)
                .frame(maxWidth: .infinity)
                .background(mint.opacity(trimmedTitle.isEmpty || validationMessage != nil || loadingPhoto ? 0.48 : 1),
                            in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(trimmedTitle.isEmpty || validationMessage != nil || loadingPhoto)
    }

    private func textRow(
        _ label: String, prompt: String, text: Binding<String>,
        keyboard: UIKeyboardType = .default, sensitive: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(quiet)
            TextField(prompt, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.subheadline)
                .foregroundStyle(.white)
                .privacySensitive(sensitive)
                .accessibilityLabel(label)
        }
    }

    private func captureLabel(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.footnote.weight(.semibold))
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(mint)
            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private func panel<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(mint)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .strokeBorder(Color.white.opacity(0.095), lineWidth: 1)
                .allowsHitTesting(false)
        }
    }

    private var templatePicker: some View {
        NavigationStack {
            ZStack {
                formBackground
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("选一个合适的模板").font(.title2.weight(.bold))
                        Text("模板提供常用字段。也可以自定义类型和字段。")
                            .font(.subheadline).foregroundStyle(quiet)
                        ForEach(CardTemplateGroup.all) { group in
                            panel(group.name, icon: group.icon) {
                                ForEach(group.items) { item in
                                    Button {
                                        showTemplatePicker = false
                                        if item.name == "银行卡", selectedTemplate != "银行卡",
                                           !pages.isEmpty || !draft.notes.isEmpty || !draft.customFields.isEmpty || !draft.number.isEmpty {
                                            confirmBankType = true
                                        } else {
                                            applyTemplate(item.name)
                                        }
                                    } label: {
                                        HStack {
                                            Text(item.name)
                                            Spacer()
                                            if item.name == selectedTemplate {
                                                Image(systemName: "checkmark.circle.fill").foregroundStyle(mint)
                                            }
                                        }
                                        .font(.subheadline)
                                        .frame(minHeight: 34)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("证件类型")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { showTemplatePicker = false }.foregroundStyle(mint)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var recognitionSheet: some View {
        NavigationStack {
            ZStack {
                formBackground
                ScrollView {
                    VStack(alignment: .leading, spacing: 13) {
                        Text("识别结果需要核对。点选一行，才会作为新的敏感字段带回表单。")
                            .font(.subheadline)
                            .foregroundStyle(quiet)
                        ForEach(recognizedLines.indices, id: \.self) { index in
                            Button {
                                guard draft.customFields.count < 20, !isBankCard else { return }
                                draft.customFields.append(CardField(label: "识别文字", value: recognizedLines[index]))
                                showRecognition = false
                                recognizedLines = []
                            } label: {
                                HStack {
                                    Text(recognizedLines[index]).multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: "plus.circle").foregroundStyle(mint)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                                .privacySensitive()
                            }
                            .buttonStyle(.plain)
                            .disabled(draft.customFields.count >= 20)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("本机识别结果")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") {
                        showRecognition = false
                        recognizedLines = []
                    }
                    .foregroundStyle(mint)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func requestDismiss() {
        if isDirty || loadingPhoto {
            confirmDiscard = true
        } else {
            dismiss()
        }
    }

    private func applyTemplate(_ name: String) {
        selectedTemplate = name
        if name == "银行卡" {
            setPages([])
            draft.notes = ""
            draft.customFields = []
            draft.number = String(draft.number.filter { "0123456789".contains($0) }.suffix(4))
        }
    }

    private func setPages(_ updated: [Data]) {
        photos = []
        loadingPhoto = false
        cancelRecognition()
        showRecognition = false
        draft.imageData = updated.first
        draft.extraImages = Array(updated.dropFirst())
    }

    private func movePage(_ index: Int, by offset: Int) {
        var updated = pages
        guard updated.indices.contains(index), updated.indices.contains(index + offset) else { return }
        updated.swapAt(index, index + offset)
        setPages(updated)
    }

    private func removePage(_ index: Int) {
        var updated = pages
        guard updated.indices.contains(index) else { return }
        updated.remove(at: index)
        setPages(updated)
    }

    private func appendPages(_ additions: [Data]) throws {
        let updated = pages + additions
        guard updated.count <= maxPages else { throw FormImageError.tooManyPages }
        guard updated.allSatisfy({ $0.count <= maxPageBytes }),
              updated.reduce(0, { $0 + $1.count }) <= maxAttachmentBytes else {
            throw FormImageError.attachmentsTooLarge
        }
        setPages(updated)
    }

    private func openEntrySource() {
        let source = entry
        entry = .manual
        switch source {
        case .manual: break
        case .camera: startScan()
        case .photos: showPhotoPicker = true
        }
    }

    private func startScan() {
        guard VNDocumentCameraViewController.isSupported else {
            error = "此设备无法打开扫描相机。可以从相册选取或手动填写。"
            return
        }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        guard status != .denied && status != .restricted else {
            error = "相机未授权。可在系统设置开启权限，或直接从相册选取。"
            return
        }
        showScanner = true
    }

    private func receiveScan(_ scannedPages: [Data]) {
        showScanner = false
        guard !isBankCard, vault.isUnlocked else { return }
        do {
            guard !scannedPages.isEmpty else { throw FormImageError.invalid }
            try appendPages(scannedPages)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func readPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty, !isBankCard else { return }
        loadingPhoto = true
        defer { if photos == items { loadingPhoto = false } }
        do {
            var selected: [Data] = []
            var availableBytes = maxAttachmentBytes - pages.reduce(0, { $0 + $1.count })
            for item in items {
                try Task.checkCancellation()
                guard let input = try await item.loadTransferable(type: Data.self) else {
                    throw FormImageError.invalid
                }
                let worker = Task.detached(priority: .userInitiated) {
                    try FormImageCodec.normalizePhoto(input)
                }
                let normalized = try await worker.value
                guard normalized.count <= maxPageBytes, normalized.count <= availableBytes else {
                    throw FormImageError.attachmentsTooLarge
                }
                availableBytes -= normalized.count
                selected.append(normalized)
            }
            guard !Task.isCancelled, photos == items, !isBankCard, vault.isUnlocked else { return }
            try appendPages(selected)
        } catch {
            guard !Task.isCancelled, photos == items else { return }
            photos = []
            loadingPhoto = false
            self.error = error.localizedDescription
        }
    }

    private func startRecognition(at index: Int) {
        let attachments = pages
        guard attachments.indices.contains(index) else { return }
        let data = attachments[index]
        let requestID = UUID()
        recognitionID = requestID
        recognizing = true
        recognitionTask = Task {
            let worker = Task.detached(priority: .userInitiated) { try FormImageCodec.recognize(data) }
            do {
                let lines = try await worker.value
                guard !Task.isCancelled, recognitionID == requestID, vault.isUnlocked else { return }
                if lines.isEmpty {
                    error = "没有识别到清晰文字。可以换张照片或手动填写。"
                } else {
                    recognizedLines = lines
                    showRecognition = true
                }
            } catch {
                guard !Task.isCancelled, recognitionID == requestID else { return }
                self.error = "这张照片暂时无法识别。可以重试或手动填写。"
            }
            if recognitionID == requestID { recognizing = false }
        }
    }

    private func cancelRecognition() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionID = UUID()
        recognizing = false
        recognizedLines = []
    }

    private func save() {
        guard !trimmedTitle.isEmpty, validationMessage == nil, !loadingPhoto else { return }
        var record = draft
        record.title = trimmedTitle
        record.category = currentCategory
        record.owner = draft.ownerName
        record.expiry = hasExpiry ? Calendar.current.startOfDay(for: selectedExpiry) : nil
        if isBankCard {
            record.number = String(record.number.filter { "0123456789".contains($0) }.suffix(4))
            record.imageData = nil
            record.extraImages = []
            record.notes = ""
            record.customFields = []
        } else {
            record.number = record.number.trimmingCharacters(in: .whitespacesAndNewlines)
            record.customFields = record.customFields.compactMap { field in
                var clean = field
                clean.label = field.label.trimmingCharacters(in: .whitespacesAndNewlines)
                clean.value = field.value.trimmingCharacters(in: .whitespacesAndNewlines)
                return clean.label.isEmpty ? nil : clean
            }
        }
        do {
            try vault.save(record)
            onSaved(record)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private enum FormImageError: LocalizedError {
    case invalid
    case tooLarge
    case tooManyPages
    case attachmentsTooLarge

    var errorDescription: String? {
        switch self {
        case .invalid: return "未能读取照片，请选择其他图片或重新拍摄。"
        case .tooLarge: return "照片过大，请先缩小尺寸或重新拍摄。"
        case .tooManyPages: return "一张卡片最多 12 页。已有页面已保留，请减少新增页数。"
        case .attachmentsTooLarge: return "这次添加超过卡片容量。已有页面已保留，请减少页数或选用较小的图片。"
        }
    }
}

private enum FormImageCodec {
    static func thumbnail(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 230
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    static func normalizePhoto(_ data: Data) throws -> Data {
        guard data.count <= 60 * 1024 * 1024 else { throw FormImageError.tooLarge }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2_200,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary),
              let result = UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.85) else {
            throw FormImageError.invalid
        }
        return result
    }

    @MainActor
    static func normalizeScan(_ image: UIImage) -> Data? {
        let largestSide = max(image.size.width, image.size.height)
        guard largestSide.isFinite, largestSide > 0 else { return nil }
        let ratio = min(1, 2_200 / largestSide)
        let size = CGSize(width: max(1, floor(image.size.width * ratio)),
                          height: max(1, floor(image.size.height * ratio)))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return normalized.jpegData(compressionQuality: 0.85)
    }

    static func recognize(_ data: Data) throws -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        let supported = (try? request.supportedRecognitionLanguages()) ?? []
        let selected = ["zh-Hans", "en-US"].filter(supported.contains)
        if !selected.isEmpty { request.recognitionLanguages = selected }
        let handler = VNImageRequestHandler(data: data, options: [:])
        try handler.perform([request])
        var seen = Set<String>()
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return Array(lines.filter { !$0.isEmpty && seen.insert($0).inserted }.prefix(30))
    }
}

@MainActor
private struct FormDocumentScanner: UIViewControllerRepresentable {
    let maxPageCount: Int
    let onComplete: ([Data]) -> Void
    let onCancel: () -> Void
    let onFailure: (String) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    @MainActor
    final class Coordinator: NSObject, @preconcurrency VNDocumentCameraViewControllerDelegate {
        let parent: FormDocumentScanner

        init(parent: FormDocumentScanner) {
            self.parent = parent
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan
        ) {
            guard scan.pageCount <= parent.maxPageCount else {
                parent.onFailure("这张卡片还能添加 \(parent.maxPageCount) 页。已有页面已保留，请减少本次扫描页数。")
                return
            }
            var pages: [Data] = []
            for index in 0..<scan.pageCount {
                guard let page = autoreleasepool(invoking: { FormImageCodec.normalizeScan(scan.imageOfPage(at: index)) }) else {
                    parent.onFailure("有页面无法读取。已有页面已保留，请重新扫描。")
                    return
                }
                pages.append(page)
            }
            parent.onComplete(pages)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onCancel()
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController, didFailWithError error: Error
        ) {
            parent.onFailure("没有完成扫描，可以重试、从相册选取或手动填写。")
        }
    }
}
