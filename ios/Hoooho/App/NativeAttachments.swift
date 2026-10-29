import UIKit
import PhotosUI
import UniformTypeIdentifiers

/// Owns only files explicitly selected for one request. No photo-library scan.
final class NativeAttachmentSelection {
    let id = UUID().uuidString
    private let directory: URL
    private(set) var files: [(id: String, url: URL, size: Int, mime: String)] = []
    private(set) var active = true

    init() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("hoooho-attachment-" + id, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func add(_ url: URL) throws {
        guard active, files.count < 12 else { throw failure("最多选择12份资料") }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        let mime = Self.mime(url.pathExtension)
        guard size > 0 else { throw failure("所选文件为空，请重新选择") }
        let video = mime.hasPrefix("video/")
        guard ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf", "video/mp4", "video/quicktime", "video/webm"].contains(mime) else {
            throw failure("请选择照片、PDF 或 MP4、MOV、WebM 视频")
        }
        guard !(video && !files.isEmpty), !files.contains(where: { $0.mime.hasPrefix("video/") }) else {
            throw failure("请单独选择一段视频")
        }
        guard video ? size <= 100 * 1024 * 1024 : size + files.reduce(0, { $0 + $1.size }) <= 15 * 1024 * 1024 else {
            throw failure(video ? "视频超过100MB，请裁剪后重新选择" : "资料总大小不能超过15MB")
        }
        let fileId = UUID().uuidString
        let folder = directory.appendingPathComponent(fileId, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent(NavigationPolicy.safeFilename(url.lastPathComponent))
        try FileManager.default.copyItem(at: url, to: destination)
        files.append((fileId, destination, size, mime))
    }

    func metadata(origin: String) -> [String: Any] {
        ["ok": true, "selectionId": id, "origin": origin, "files": files.map {
            ["id": $0.id, "name": $0.url.lastPathComponent, "size": $0.size, "mimeType": $0.mime] as [String: Any]
        }]
    }

    func read(fileId: String, offset: Int) throws -> [String: Any] {
        guard active, let file = files.first(where: { $0.id == fileId }), offset >= 0, offset < file.size else {
            throw failure("所选资料已过期，请重新选择")
        }
        let handle = try FileHandle(forReadingFrom: file.url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let data = try handle.read(upToCount: min(512 * 1024, file.size - offset)) ?? Data()
        guard !data.isEmpty else { throw failure("资料读取未完成，请重新选择") }
        return ["ok": true, "data": data.base64EncodedString()]
    }

    func cleanup() {
        active = false
        try? FileManager.default.removeItem(at: directory)
        files.removeAll()
    }
    deinit { cleanup() }

    private static func mime(_ ext: String) -> String {
        let known = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic", "heif": "image/heif", "pdf": "application/pdf", "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"]
        return known[ext.lowercased()] ?? UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
    private func failure(_ message: String) -> Error { NSError(domain: "HooohoAttachments", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}

/// A UIKit action sheet and system pickers; other web file inputs stay untouched.
final class NativeAttachments: NSObject, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate, UIPopoverPresentationControllerDelegate {
    private weak var owner: UIViewController?
    private let permissions: CapturePermissions
    private let selection: NativeAttachmentSelection
    private var completion: (([String: Any]) -> Void)?
    private var expiry: Timer?
    private var origin = "library"
    var isPicking: Bool { completion != nil }
    var selectionId: String { selection.id }

    init(owner: UIViewController, permissions: CapturePermissions) throws {
        self.owner = owner
        self.permissions = permissions
        self.selection = try NativeAttachmentSelection()
    }

    func present(completion: @escaping ([String: Any]) -> Void) {
        self.completion = completion
        let menu = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        let sources: [(String, () -> Void)] = [("照片图库", { self.library() }), ("拍照", { self.camera(video: false) }), ("拍视频", { self.camera(video: true) }), ("选择文件", { self.documents() })]
        for (title, open) in sources {
            menu.addAction(UIAlertAction(title: title, style: .default) { [weak menu] _ in menu?.dismiss(animated: true, completion: open) })
        }
        menu.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in self.finish(cancelled: true) })
        menu.popoverPresentationController?.sourceView = owner?.view
        menu.popoverPresentationController?.sourceRect = CGRect(x: owner?.view.bounds.midX ?? 0, y: owner?.view.bounds.maxY ?? 0, width: 1, height: 1)
        show(menu)
    }

    private func show(_ controller: UIViewController) {
        guard let owner, owner.view.window != nil, owner.presentedViewController == nil else { finish(error: "系统选择器暂不可用，请重试"); return }
        controller.popoverPresentationController?.delegate = self
        owner.present(controller, animated: true) { controller.presentationController?.delegate = self }
    }

    private func library() {
        var configuration = PHPickerConfiguration()
        configuration.filter = .any(of: [.images, .videos])
        configuration.selectionLimit = 12
        configuration.selection = .ordered
        configuration.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        show(picker)
    }

    private func camera(video: Bool) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { finish(error: "此设备没有可用相机，可以从图库或文件中选择"); return }
        permissions.authorize(video ? [.camera, .microphone] : [.camera]) { [weak self] allowed in
            guard let self, self.isPicking else { return }
            guard allowed else { self.finish(error: video ? "相机或麦克风未获授权，请允许后重试" : "相机未获授权，请允许后重试"); return }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.mediaTypes = [video ? UTType.movie.identifier : UTType.image.identifier]
            picker.cameraCaptureMode = video ? .video : .photo
            picker.delegate = self
            self.origin = "capture"
            self.show(picker)
        }
    }

    private func documents() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.jpeg, .png, .image, .pdf, .movie], asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = self
        show(picker)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard !results.isEmpty else { finish(cancelled: true); return }
        load(results.map(\.itemProvider), index: 0)
    }

    private func load(_ providers: [NSItemProvider], index: Int) {
        guard index < providers.count else { finish(); return }
        let provider = providers[index]
        let family = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) ? UTType.movie : UTType.image
        let type = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: family) == true } ?? family.identifier
        provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, _ in
            guard let self else { return }
            do {
                guard let url else { throw NSError(domain: "HooohoAttachments", code: 2) }
                // The system removes this URL when this callback returns.
                try self.selection.add(url)
                DispatchQueue.main.async { self.load(providers, index: index + 1) }
            } catch {
                DispatchQueue.main.async { self.finish(error: error.localizedDescription) }
            }
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated: true); finish(cancelled: true) }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        do {
            if let url = info[.mediaURL] as? URL { try selection.add(url) }
            else if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 1) {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".jpg")
                defer { try? FileManager.default.removeItem(at: url) }
                try data.write(to: url); try selection.add(url)
            } else { finish(error: "拍摄内容未能读取，请重试"); return }
            finish()
        } catch { finish(error: error.localizedDescription) }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(cancelled: true) }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        do {
            for url in urls {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                try selection.add(url)
            }
            finish()
        } catch { finish(error: error.localizedDescription) }
    }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(cancelled: true) }
    func popoverPresentationControllerDidDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) { finish(cancelled: true) }

    private func finish(cancelled: Bool = false, error: String? = nil) {
        guard let completion else { return }
        self.completion = nil
        if cancelled || error != nil { cleanup(); completion(["ok": false, "cancelled": cancelled, "error": error ?? "已取消"]); return }
        touch()
        completion(selection.metadata(origin: origin))
    }
    func read(fileId: String, offset: Int) throws -> [String: Any] { touch(); return try selection.read(fileId: fileId, offset: offset) }
    private func touch() { expiry?.invalidate(); expiry = Timer.scheduledTimer(withTimeInterval: 120, repeats: false) { [weak self] _ in self?.cleanup() } }
    func cleanup() { expiry?.invalidate(); expiry = nil; selection.cleanup() }
    deinit { expiry?.invalidate() }
}
