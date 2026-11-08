import Foundation
import ImageIO
import SwiftUI
import UIKit

struct ExportEditor: View {
    let title: String
    let imageData: Data?
    let fields: [String]
    let extraImages: [Data]

    @Environment(\.scenePhase) private var scenePhase
    @State private var source: UIImage?
    @State private var currentPage = 0
    @State private var viewedPages: Set<Int> = []
    @State private var otherPageRedactions: [Int: [ExportRedaction]] = [:]
    @State private var redactions: [ExportRedaction] = []
    @State private var selectedRegion: UUID?
    @State private var maskStyle: ExportMaskStyle = .solid
    @State private var drag: ExportMaskDrag?
    @State private var watermark = "仅供办理使用"
    @State private var watermarkStyle: ExportWatermarkStyle = .diagonal
    @State private var watermarkOpacity = 0.34
    @State private var format: ExportDocumentFormat = .png
    @State private var package: ExportSharePackage?
    @State private var temporaryDirectory: URL?
    @State private var errorMessage: String?
    @State private var attemptedLoad = false
    @State private var confirmUnmaskedExport = false

    private let tint = Color(red: 0.67, green: 0.93, blue: 0.83)
    private let backdrop = Color(red: 0.043, green: 0.075, blue: 0.083)
    private let softText = Color.white.opacity(0.72)

    init(title: String, imageData: Data?, fields: [String], extraImages: [Data] = []) {
        self.title = title
        self.imageData = imageData
        self.fields = fields
        self.extraImages = extraImages
    }

    private var photoPages: [Data] {
        (imageData.map { [$0] } ?? []) + extraImages
    }

    private var pageCount: Int { max(1, photoPages.count) }
    private var pagesToExport: [Int] { format == .pdf ? Array(0..<pageCount) : [currentPage] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 17) {
                header
                if pageCount > 1 { pageSelector }
                if let source {
                    preview(source)
                    maskControls
                    watermarkControls
                    formatControls
                } else if attemptedLoad {
                    glass {
                        Label("这份原件无法生成预览", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                        Text("请返回证件，检查图片后重试。")
                            .font(.footnote)
                            .foregroundStyle(softText)
                    }
                } else {
                    ProgressView("正在准备本机预览")
                        .frame(maxWidth: .infinity, minHeight: 170)
                        .tint(tint)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 20)
        }
        .background {
            RadialGradient(
                colors: [Color(red: 0.11, green: 0.23, blue: 0.23), backdrop],
                center: .topLeading,
                startRadius: 8,
                endRadius: 440
            )
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .navigationTitle("安全副本")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if source != nil {
                exportAction
            }
        }
        .overlay {
            if scenePhase != .active {
                backdrop.ignoresSafeArea()
                    .overlay {
                        Image(systemName: "lock.shield")
                            .font(.system(size: 30, weight: .light))
                            .foregroundStyle(tint)
                    }
                    .accessibilityHidden(true)
            }
        }
        .task {
            loadSource()
        }
        .onDisappear {
            if package == nil { cleanTemporaryDirectory() }
        }
        .sheet(item: $package, onDismiss: cleanTemporaryDirectory) { item in
            ExportActivitySheet(url: item.file) { failed in
                if failed {
                    errorMessage = "系统分享未完成，请重试。"
                }
                package = nil
            }
        }
        .confirmationDialog("副本含未遮挡的页面", isPresented: $confirmUnmaskedExport, titleVisibility: .visible) {
            Button("确认生成副本", role: .destructive, action: createPackage)
            Button("返回编辑", role: .cancel) {}
        } message: {
            let pages = pagesToExport.filter { masks(for: $0).isEmpty }.map { String($0 + 1) }.joined(separator: "、")
            Text("第 \(pages) 页没有遮挡。请确认这些页面可以对外发送。")
        }
        .alert("检查副本", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("副本 · 本机生成", systemImage: "lock.shield")
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
            Text("检查副本，再决定发什么")
                .font(.title2.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            Text("这是接收方会看到的画面。拖出一个遮挡区域，或点选已有区域后调整。")
                .font(.footnote)
                .foregroundStyle(softText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var pageSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("第 \(currentPage + 1) / \(pageCount) 页 · 遮挡仅应用于当前页")
                .font(.caption.weight(.medium))
                .foregroundStyle(softText)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    ForEach(0..<pageCount, id: \.self) { page in
                        Button {
                            showPage(page)
                        } label: {
                            HStack(spacing: 4) {
                                Text("第 \(page + 1) 页")
                                if !masks(for: page).isEmpty {
                                    Image(systemName: "rectangle.fill")
                                        .font(.system(size: 7))
                                }
                            }
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(page == currentPage ? tint.opacity(0.20) : .white.opacity(0.08), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(page == currentPage ? tint : .white)
                    }
                }
            }
        }
    }

    private func preview(_ original: UIImage) -> some View {
        let bitmap = ExportArtwork.render(
            original: original,
            longestSide: 680,
            redactions: visibleRedactions,
            watermark: currentWatermark,
            watermarkStyle: watermarkStyle,
            opacity: watermarkOpacity
        )
        return GeometryReader { geometry in
            let displayedSize = ExportArtwork.fit(original.size, inside: geometry.size)
            ZStack {
                Image(uiImage: bitmap)
                    .resizable()
                    .frame(width: displayedSize.width, height: displayedSize.height)
                    .accessibilityHidden(true)
                ForEach(visibleRedactions) { region in
                    if selectedRegion == region.id || drag?.region.id == region.id {
                        let bounds = region.rect.scaled(to: displayedSize)
                        Rectangle()
                            .strokeBorder(tint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                            .frame(width: bounds.width, height: bounds.height)
                            .position(x: bounds.midX, y: bounds.midY)
                            .allowsHitTesting(false)
                    }
                }
            }
            .frame(width: displayedSize.width, height: displayedSize.height)
            .contentShape(Rectangle())
            .highPriorityGesture(maskDragGesture(in: displayedSize))
            .onTapGesture { location in
                let point = normalized(location, in: displayedSize)
                if let hit = redactions.last(where: { $0.rect.contains(point) }) {
                    select(hit)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(height: 246)
        .padding(9)
        .background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 19))
        .overlay {
            RoundedRectangle(cornerRadius: 19)
                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
                .allowsHitTesting(false)
        }
        .accessibilityLabel("已处理的副本预览")
    }

    private var maskControls: some View {
        glass {
            HStack {
                Label("遮挡与马赛克", systemImage: "rectangle.dashed")
                    .font(.headline)
                Spacer()
                Button {
                    addCenteredRegion()
                } label: {
                    Label("加区域", systemImage: "plus")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .tint(tint)
            }
            Picker("遮挡方式", selection: $maskStyle) {
                ForEach(ExportMaskStyle.allCases) { style in
                    Text(style.rawValue).tag(style)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: maskStyle) { _, newStyle in
                guard let selectedRegion,
                      let index = redactions.firstIndex(where: { $0.id == selectedRegion }) else { return }
                redactions[index].style = newStyle
            }
            Text(redactions.contains(where: { $0.style == .mosaic }) || maskStyle == .mosaic
                ? "马赛克保留轮廓和颜色。证号、地址和人脸建议使用实心遮挡。"
                : "实心遮挡会把原像素替换为纯色。向图上拖动可添加，拖动已选区域可移动。")
                .font(.caption)
                .foregroundStyle(softText)
            if !redactions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        ForEach(Array(redactions.enumerated()), id: \.element.id) { index, region in
                            Button {
                                select(region)
                            } label: {
                                Text("区域 \(index + 1)")
                                    .font(.caption.weight(.medium))
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 7)
                                    .background(
                                        region.id == selectedRegion ? tint.opacity(0.20) : .white.opacity(0.08),
                                        in: Capsule()
                                    )
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(region.id == selectedRegion ? tint : .white)
                        }
                    }
                }
            }
            if let selectedRegion, let region = redactions.first(where: { $0.id == selectedRegion }) {
                HStack(spacing: 15) {
                    regionSlider("宽度", value: region.rect.width, horizontal: true)
                    regionSlider("高度", value: region.rect.height, horizontal: false)
                }
                Button("移除此区域", role: .destructive) {
                    redactions.removeAll { $0.id == selectedRegion }
                    self.selectedRegion = nil
                }
                .font(.caption.weight(.medium))
                .buttonStyle(.borderless)
            }
        }
    }

    private var watermarkControls: some View {
        glass {
            Label("用途水印", systemImage: "textformat")
                .font(.headline)
            Picker("水印样式", selection: $watermarkStyle) {
                ForEach(ExportWatermarkStyle.allCases) { style in
                    Text(style.rawValue).tag(style)
                }
            }
            .pickerStyle(.segmented)
            if watermarkStyle != .none {
                TextField("例如：仅供入学材料审核", text: $watermark, axis: .vertical)
                    .lineLimit(1...2)
                    .textInputAutocapitalization(.never)
                    .font(.subheadline)
                    .padding(10)
                    .background(.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 9))
                    .onChange(of: watermark) { _, text in
                        if text.count > 40 { watermark = String(text.prefix(40)) }
                    }
                HStack {
                    Text("不透明度")
                    Slider(value: $watermarkOpacity, in: 0.15...0.85)
                        .tint(tint)
                        .accessibilityLabel("水印不透明度")
                    Text(watermarkOpacity, format: .percent.precision(.fractionLength(0)))
                        .monospacedDigit()
                        .frame(width: 40, alignment: .trailing)
                }
                .font(.caption)
                .foregroundStyle(softText)
            }
        }
    }

    private var formatControls: some View {
        glass {
            Label("导出格式", systemImage: "doc")
                .font(.headline)
            Picker("导出格式", selection: $format) {
                ForEach(ExportDocumentFormat.allCases) { item in
                    Text(item.rawValue).tag(item)
                }
            }
            .pickerStyle(.segmented)
            if pageCount > 1 {
                Text(format == .pdf ? "PDF 包含全部 \(pageCount) 页，逐页应用遮挡，水印应用到所有页面。" : "PNG 只导出当前第 \(currentPage + 1) 页。")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(tint)
            }
            Text("副本由预览画面重新生成，原始照片元数据和可搜索文字层不会复制到副本。")
                .font(.caption)
                .foregroundStyle(softText)
        }
    }

    private var exportAction: some View {
        VStack(spacing: 8) {
            Button(action: beginExport) {
                Label("生成并选择去向", systemImage: "square.and.arrow.up")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 47)
                    .foregroundStyle(backdrop)
                    .background(tint, in: RoundedRectangle(cornerRadius: 13))
            }
            .buttonStyle(.plain)
            .disabled(package != nil)
            Text("发出的文件由接收方保管。")
                .font(.caption2)
                .foregroundStyle(softText)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    private var currentWatermark: String {
        watermark
            .split(whereSeparator: \.isNewline)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var visibleRedactions: [ExportRedaction] {
        guard let drag else { return redactions }
        return redactions.filter { $0.id != drag.region.id } + [drag.region]
    }

    private func glass<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 9, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(13)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(.white.opacity(0.11), lineWidth: 1)
                    .allowsHitTesting(false)
            }
    }

    private func regionSlider(_ label: String, value: CGFloat, horizontal: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(softText)
            Slider(
                value: Binding(get: { Double(value) }, set: { adjustSelected(to: CGFloat($0), horizontal: horizontal) }),
                in: 0.025...1
            )
            .tint(tint)
            .accessibilityLabel(label)
        }
    }

    private func maskDragGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 5, coordinateSpace: .local)
            .onChanged { value in
                let start = normalized(value.startLocation, in: size)
                let current = normalized(value.location, in: size)
                if drag == nil {
                    if let region = redactions.last(where: { $0.rect.contains(start) }) {
                        select(region)
                        drag = ExportMaskDrag(region: region, original: region.rect)
                    } else {
                        let region = ExportRedaction(rect: .zero, style: maskStyle)
                        drag = ExportMaskDrag(region: region, original: nil)
                    }
                }
                guard var updated = drag else { return }
                if let original = updated.original {
                    updated.region.rect.origin = CGPoint(
                        x: (original.minX + current.x - start.x).bounded(to: 0...(1 - original.width)),
                        y: (original.minY + current.y - start.y).bounded(to: 0...(1 - original.height))
                    )
                } else {
                    updated.region.rect = CGRect(
                        x: min(start.x, current.x),
                        y: min(start.y, current.y),
                        width: abs(start.x - current.x),
                        height: abs(start.y - current.y)
                    )
                }
                drag = updated
            }
            .onEnded { _ in
                guard let updated = drag else { return }
                drag = nil
                guard updated.region.rect.width >= 0.025, updated.region.rect.height >= 0.025 else { return }
                if let index = redactions.firstIndex(where: { $0.id == updated.region.id }) {
                    redactions[index] = updated.region
                } else {
                    redactions.append(updated.region)
                }
                select(updated.region)
            }
    }

    private func addCenteredRegion() {
        let next = ExportRedaction(
            rect: CGRect(x: 0.31, y: 0.42, width: 0.38, height: 0.16),
            style: maskStyle
        )
        redactions.append(next)
        select(next)
    }

    private func select(_ region: ExportRedaction) {
        selectedRegion = region.id
        maskStyle = region.style
    }

    private func normalized(_ point: CGPoint, in size: CGSize) -> CGPoint {
        CGPoint(
            x: (point.x / max(size.width, 1)).bounded(to: 0...1),
            y: (point.y / max(size.height, 1)).bounded(to: 0...1)
        )
    }

    private func adjustSelected(to value: CGFloat, horizontal: Bool) {
        guard let selectedRegion,
              let index = redactions.firstIndex(where: { $0.id == selectedRegion }) else { return }
        var rect = redactions[index].rect
        if horizontal {
            rect.origin.x = (rect.midX - value / 2).bounded(to: 0...(1 - value))
            rect.size.width = value
        } else {
            rect.origin.y = (rect.midY - value / 2).bounded(to: 0...(1 - value))
            rect.size.height = value
        }
        redactions[index].rect = rect
    }

    private func loadSource() {
        guard !attemptedLoad else { return }
        attemptedLoad = true
        ExportSharePackage.purgeStaleCopies()
        if let first = photoPages.first {
            source = ExportArtwork.decode(first, maxPixelSize: 900)
        } else {
            let card = ExportArtwork.card(title: title, fields: fields)
            source = card.image
            if let fieldArea = card.fieldArea {
                redactions = [ExportRedaction(rect: fieldArea, style: .solid)]
            }
        }
        if source != nil { viewedPages.insert(0) }
    }

    private func showPage(_ page: Int) {
        guard page != currentPage, photoPages.indices.contains(page) else { return }
        otherPageRedactions[currentPage] = redactions
        currentPage = page
        redactions = otherPageRedactions[page] ?? []
        selectedRegion = nil
        maskStyle = .solid
        drag = nil
        source = ExportArtwork.decode(photoPages[page], maxPixelSize: 900)
        if source != nil { viewedPages.insert(page) }
    }

    private func masks(for page: Int) -> [ExportRedaction] {
        page == currentPage ? redactions : (otherPageRedactions[page] ?? [])
    }

    private func beginExport() {
        if let unviewed = pagesToExport.first(where: { !viewedPages.contains($0) }) {
            showPage(unviewed)
            errorMessage = source == nil
                ? "第 \(unviewed + 1) 页无法读取。可修复原件后重新导出整份 PDF。"
                : "已打开第 \(unviewed + 1) 页。请先查看每一页，确认要显示的内容。"
            return
        }
        if pagesToExport.contains(where: { masks(for: $0).isEmpty }) {
            confirmUnmaskedExport = true
        } else {
            createPackage()
        }
    }

    private func createPackage() {
        guard package == nil, source != nil else { return }
        guard watermarkStyle == .none || !currentWatermark.isEmpty else {
            errorMessage = "请填写用途水印，或将样式设为无水印。"
            return
        }
        cleanTemporaryDirectory()
        do {
            let file = try ExportSharePackage.write(as: format) {
                switch format {
                case .png:
                    guard let data = try renderPage(currentPage).pngData() else { throw CocoaError(.fileWriteUnknown) }
                    return data
                case .pdf:
                    return try ExportArtwork.pdf(pageCount: pageCount, renderPage: renderPage)
                }
            }
            temporaryDirectory = file.directory
            package = file
        } catch let error as ExportPageError {
            showPage(error.index)
            errorMessage = "第 \(error.index + 1) 页无法读取。未生成任何对外文件。"
        } catch {
            errorMessage = "没有生成副本。请检查本机存储空间后再试。"
        }
    }

    private func renderPage(_ index: Int) throws -> UIImage {
        let images = photoPages
        let original = images.isEmpty ? source : ExportArtwork.decode(images[index])
        guard let original else { throw ExportPageError(index: index) }
        return ExportArtwork.render(
            original: original,
            longestSide: 2400,
            redactions: masks(for: index),
            watermark: currentWatermark,
            watermarkStyle: watermarkStyle,
            opacity: watermarkOpacity
        )
    }

    private func cleanTemporaryDirectory() {
        if let temporaryDirectory {
            try? FileManager.default.removeItem(at: temporaryDirectory)
            self.temporaryDirectory = nil
        }
    }
}

private struct ExportPageError: Error {
    let index: Int
}

private enum ExportMaskStyle: String, CaseIterable, Identifiable {
    case solid = "实心遮挡"
    case mosaic = "马赛克"
    var id: Self { self }
}

private enum ExportWatermarkStyle: String, CaseIterable, Identifiable {
    case none = "无水印"
    case diagonal = "斜向"
    case tiled = "平铺"
    var id: Self { self }
}

private enum ExportDocumentFormat: String, CaseIterable, Identifiable {
    case png = "PNG 图片"
    case pdf = "A4 PDF"
    var id: Self { self }
    var fileExtension: String { self == .png ? "png" : "pdf" }
}

private struct ExportRedaction: Identifiable {
    var id = UUID()
    var rect: CGRect
    var style: ExportMaskStyle
}

private struct ExportMaskDrag {
    var region: ExportRedaction
    let original: CGRect?
}

private extension CGFloat {
    func bounded(to range: ClosedRange<CGFloat>) -> CGFloat {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

private extension CGRect {
    func scaled(to size: CGSize) -> CGRect {
        CGRect(x: minX * size.width, y: minY * size.height, width: width * size.width, height: height * size.height)
    }
}

private enum ExportArtwork {
    static func fit(_ source: CGSize, inside bounds: CGSize) -> CGSize {
        guard source.width > 0, source.height > 0 else { return .zero }
        let ratio = min(bounds.width / source.width, bounds.height / source.height)
        return CGSize(width: source.width * ratio, height: source.height * ratio)
    }

    static func decode(_ data: Data, maxPixelSize: Int = 2400) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let imageSource = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, thumbnailOptions as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    static func card(title: String, fields: [String]) -> (image: UIImage, fieldArea: CGRect?) {
        let width: CGFloat = 1060
        let margin: CGFloat = 76
        let fieldWidth = width - 2 * margin
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 32, weight: .medium),
            .foregroundColor: UIColor(red: 0.11, green: 0.19, blue: 0.19, alpha: 1)
        ]
        let entries = fields.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let lineHeights = entries.map {
            ceil(($0 as NSString).boundingRect(
                with: CGSize(width: fieldWidth, height: CGFloat.greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: attributes,
                context: nil
            ).height) + 14
        }
        let fieldStart: CGFloat = 210
        let fieldHeight = lineHeights.reduce(0, +)
        let height = max(370, fieldStart + fieldHeight + 70)
        let size = CGSize(width: width, height: height)
        let drawSize = fit(size, inside: CGSize(width: 2400, height: 2400))
        let image = opaqueRenderer(size: drawSize).image { context in
            context.cgContext.scaleBy(x: drawSize.width / width, y: drawSize.height / height)
            UIColor(red: 0.94, green: 0.97, blue: 0.96, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            let ink = UIColor(red: 0.08, green: 0.25, blue: 0.23, alpha: 1)
            ("护护卡包 · 证件摘录" as NSString).draw(at: CGPoint(x: margin, y: 45), withAttributes: [
                .font: UIFont.systemFont(ofSize: 21, weight: .semibold), .foregroundColor: ink
            ])
            (title as NSString).draw(with: CGRect(x: margin, y: 90, width: fieldWidth, height: 86), options: [
                .usesLineFragmentOrigin, .truncatesLastVisibleLine
            ], attributes: [
                .font: UIFont.systemFont(ofSize: 42, weight: .bold), .foregroundColor: ink
            ], context: nil)
            ink.withAlphaComponent(0.18).setFill()
            context.fill(CGRect(x: margin, y: 184, width: fieldWidth, height: 2))
            var top = fieldStart
            for (entry, lineHeight) in zip(entries, lineHeights) {
                (entry as NSString).draw(
                    with: CGRect(x: margin, y: top, width: fieldWidth, height: lineHeight),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: attributes,
                    context: nil
                )
                top += lineHeight
            }
        }
        let fieldArea = entries.isEmpty ? nil : CGRect(
            x: (margin - 8) / width,
            y: (fieldStart - 6) / height,
            width: (fieldWidth + 16) / width,
            height: (fieldHeight + 12) / height
        )
        return (image, fieldArea)
    }

    static func render(
        original: UIImage,
        longestSide: CGFloat,
        redactions: [ExportRedaction],
        watermark: String,
        watermarkStyle: ExportWatermarkStyle,
        opacity: Double
    ) -> UIImage {
        let scaled = fit(original.size, inside: CGSize(width: longestSide, height: longestSide))
        let size = CGSize(width: max(1, scaled.width.rounded()), height: max(1, scaled.height.rounded()))
        let bounds = CGRect(origin: .zero, size: size)
        let renderer = opaqueRenderer(size: size)
        let base = renderer.image { context in
            UIColor.white.setFill()
            context.fill(bounds)
            original.draw(in: bounds)
        }
        return renderer.image { context in
            base.draw(in: bounds)
            for region in redactions where region.style == .mosaic {
                let pixels = region.rect.scaled(to: size).integral.intersection(bounds)
                drawMosaic(base, in: pixels, outputSize: size, context: context.cgContext)
            }
            UIColor(red: 0.12, green: 0.20, blue: 0.21, alpha: 1).setFill()
            for region in redactions where region.style == .solid {
                let pixels = region.rect.scaled(to: size).integral.intersection(bounds)
                if !pixels.isNull && !pixels.isEmpty { context.fill(pixels) }
            }
            if watermarkStyle != .none && !watermark.isEmpty {
                drawWatermark(watermark, style: watermarkStyle, opacity: opacity, inside: size, context: context.cgContext)
            }
        }
    }

    static func pdf(pageCount: Int, renderPage: @escaping (Int) throws -> UIImage) throws -> Data {
        let a4 = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
        let paperArea = a4.insetBy(dx: 36, dy: 36)
        var failure: Error?
        let data = UIGraphicsPDFRenderer(bounds: a4).pdfData { context in
            for index in 0..<pageCount {
                autoreleasepool {
                    do {
                        let image = try renderPage(index)
                        let scaled = fit(image.size, inside: paperArea.size)
                        let placed = CGRect(x: paperArea.midX - scaled.width / 2, y: paperArea.midY - scaled.height / 2,
                                            width: scaled.width, height: scaled.height)
                        context.beginPage()
                        UIColor.white.setFill()
                        context.cgContext.fill(a4)
                        image.draw(in: placed)
                    } catch {
                        failure = error
                    }
                }
                if failure != nil { break }
            }
        }
        if let failure { throw failure }
        return data
    }

    private static func opaqueRenderer(size: CGSize) -> UIGraphicsImageRenderer {
        let settings = UIGraphicsImageRendererFormat()
        settings.scale = 1
        settings.opaque = true
        return UIGraphicsImageRenderer(size: size, format: settings)
    }

    private static func drawMosaic(_ base: UIImage, in rect: CGRect, outputSize: CGSize, context: CGContext) {
        guard !rect.isNull, !rect.isEmpty else { return }
        guard let cropped = base.cgImage?.cropping(to: rect) else {
            context.setFillColor(UIColor(red: 0.12, green: 0.20, blue: 0.21, alpha: 1).cgColor)
            context.fill(rect)
            return
        }
        let cellSide = max(1, min(outputSize.width, outputSize.height) / 29)
        let sampled = CGSize(width: max(1, (rect.width / cellSide).rounded()),
                             height: max(1, (rect.height / cellSide).rounded()))
        let tiles = opaqueRenderer(size: sampled).image { sampleContext in
            sampleContext.cgContext.interpolationQuality = .medium
            UIImage(cgImage: cropped).draw(in: CGRect(origin: .zero, size: sampled))
        }
        context.saveGState()
        context.interpolationQuality = .none
        tiles.draw(in: rect, blendMode: .copy, alpha: 1)
        context.restoreGState()
    }

    private static func drawWatermark(
        _ value: String, style: ExportWatermarkStyle, opacity: Double, inside size: CGSize, context: CGContext
    ) {
        let shortest = min(size.width, size.height)
        let count = max(1, value.count)
        let fontSize = min(shortest * 0.075, size.width * 0.75 / CGFloat(count))
        let text = value as NSString
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: max(1, fontSize), weight: .heavy),
            .foregroundColor: UIColor(red: 0.06, green: 0.24, blue: 0.23, alpha: CGFloat(opacity)),
            .strokeColor: UIColor(white: 1, alpha: CGFloat(opacity) * 0.72),
            .strokeWidth: -1.4
        ]
        let textSize = text.size(withAttributes: attributes)
        context.saveGState()
        context.translateBy(x: size.width / 2, y: size.height / 2)
        context.rotate(by: -.pi / 8)
        switch style {
        case .none:
            break
        case .diagonal:
            text.draw(at: CGPoint(x: -textSize.width / 2, y: -textSize.height / 2), withAttributes: attributes)
        case .tiled:
            let reach = hypot(size.width, size.height) / 2
            let stepX = max(size.width * 0.42, textSize.width + shortest * 0.11)
            let stepY = max(size.height * 0.16, textSize.height + shortest * 0.13)
            for (row, y) in stride(from: -reach, through: reach, by: stepY).enumerated() {
                let offset = row.isMultiple(of: 2) ? 0 : stepX / 2
                for x in stride(from: -reach - stepX + offset, through: reach, by: stepX) {
                    text.draw(at: CGPoint(x: x, y: y), withAttributes: attributes)
                }
            }
        }
        context.restoreGState()
    }
}

private struct ExportSharePackage: Identifiable {
    let id = UUID()
    let directory: URL
    let file: URL

    private static var parent: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("HooohoCardCopies", isDirectory: true)
    }

    static func write(as format: ExportDocumentFormat, generate: () throws -> Data) throws -> Self {
        let manager = FileManager.default
        let created = Int(Date().timeIntervalSince1970)
        let directory = parent.appendingPathComponent("\(created)-\(UUID().uuidString)", isDirectory: true)
        try manager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        do {
            let data = try generate()
            let file = directory.appendingPathComponent("护护卡包-副本.\(format.fileExtension)")
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            return Self(directory: directory, file: file)
        } catch {
            try? manager.removeItem(at: directory)
            throw error
        }
    }

    static func purgeStaleCopies() {
        let manager = FileManager.default
        guard let directories = try? manager.contentsOfDirectory(at: parent, includingPropertiesForKeys: nil) else { return }
        let threshold = Int(Date().timeIntervalSince1970) - 3600
        for directory in directories {
            guard let created = Int(directory.lastPathComponent.prefix(while: { $0 != "-" })),
                  created < threshold else { continue }
            try? manager.removeItem(at: directory)
        }
    }
}

private struct ExportActivitySheet: UIViewControllerRepresentable {
    let url: URL
    let completion: (Bool) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, error in
            DispatchQueue.main.async { completion(error != nil) }
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
