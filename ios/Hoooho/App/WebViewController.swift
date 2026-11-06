import UIKit
import WebKit
import SafariServices

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    private var webView: WKWebView!
    private let progress = UIActivityIndicatorView(style: .medium)
    private let retryButton = UIButton(type: .system)
    private let failureScroll = UIScrollView()
    private let failureMessage = UILabel()
    private let failureDiagnostic = UILabel()
    private let copyDiagnosticButton = UIButton(type: .system)
    private var currentLaunchFailure: LaunchFailure?
    private var downloaded: [ObjectIdentifier: URL] = [:]
    private var pendingShares: [(URL, WKDownload)] = []
    private var currentShareDirectory: URL?
    private var pendingExportError: String?
    private var shareRetry: DispatchWorkItem?
    private var printJob: ReportPrintJob?
    private var hasLoadedPage = false
    private var recoverContentWhenActive = false
    private var lastAutomaticContentRecovery: TimeInterval?
    private var automaticRecoveryNavigation: WKNavigation?
    private let capturePermissions = CapturePermissions.system()
    private var attachmentPicker: NativeAttachments?
    private var pageStatusBarStyle: UIStatusBarStyle = .darkContent
    override var preferredStatusBarStyle: UIStatusBarStyle { pageStatusBarStyle }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = AppAppearance.paperBackground
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let controller = WKUserContentController()
        controller.add(self, name: "hooohoNative")
        if let url = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
           let script = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive(_:)),
            name: UIApplication.didBecomeActiveNotification, object: nil)
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = AppAppearance.paperBackground
        webView.underPageBackgroundColor = AppAppearance.paperBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            // Web content paints through the home-indicator area; CSS safe-area
            // padding keeps controls clear without a second native strip below it.
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        progress.hidesWhenStopped = true
        progress.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progress)
        setupLaunchRecovery()
        NSLayoutConstraint.activate([
            progress.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            progress.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        progress.startAnimating()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--startup-error-fixture") {
            loadFailed(NSError(domain: NSURLErrorDomain, code: URLError.notConnectedToInternet.rawValue))
            return
        }
        if loadNativeFixture() != nil { return }
        #endif
        webView.load(LaunchFailure.startupRequest)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        presentNextDownload()
    }

    private func setupLaunchRecovery() {
        failureScroll.translatesAutoresizingMaskIntoConstraints = false
        failureScroll.backgroundColor = view.backgroundColor
        failureScroll.isHidden = true
        failureScroll.alwaysBounceVertical = false
        view.addSubview(failureScroll)
        let title = UILabel()
        title.text = "暂时无法打开护护"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textColor = .darkText
        title.numberOfLines = 0
        title.adjustsFontForContentSizeCategory = true
        failureMessage.font = .preferredFont(forTextStyle: .body)
        failureMessage.textColor = .darkText
        failureMessage.numberOfLines = 0
        failureMessage.adjustsFontForContentSizeCategory = true
        failureDiagnostic.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        failureDiagnostic.numberOfLines = 0
        failureDiagnostic.textColor = .darkGray
        failureDiagnostic.accessibilityIdentifier = "hoooho.startupDiagnostic"
        retryButton.setTitle("重新连接", for: .normal)
        retryButton.accessibilityIdentifier = "hoooho.retry"
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        let settings = UIButton(type: .system)
        settings.setTitle("打开App系统设置", for: .normal)
        settings.addTarget(self, action: #selector(openAppSettings), for: .touchUpInside)
        let safari = UIButton(type: .system)
        safari.setTitle("用Safari检查启动地址", for: .normal)
        safari.addTarget(self, action: #selector(checkStartupInSafari), for: .touchUpInside)
        copyDiagnosticButton.setTitle("复制诊断信息", for: .normal)
        copyDiagnosticButton.addTarget(self, action: #selector(copyStartupDiagnostic), for: .touchUpInside)
        for button in [retryButton, settings, safari, copyDiagnosticButton] {
            button.titleLabel?.font = .preferredFont(forTextStyle: .body)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        }
        let stack = UIStackView(arrangedSubviews: [title, failureMessage, failureDiagnostic, retryButton, settings, safari, copyDiagnosticButton])
        stack.axis = .vertical
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        failureScroll.addSubview(stack)
        let preferredWidth = stack.widthAnchor.constraint(equalTo: failureScroll.frameLayoutGuide.widthAnchor, constant: -48)
        preferredWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            failureScroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            failureScroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            failureScroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            failureScroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            failureScroll.contentLayoutGuide.widthAnchor.constraint(equalTo: failureScroll.frameLayoutGuide.widthAnchor),
            stack.topAnchor.constraint(equalTo: failureScroll.contentLayoutGuide.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(equalTo: failureScroll.contentLayoutGuide.bottomAnchor, constant: -28),
            stack.centerXAnchor.constraint(equalTo: failureScroll.frameLayoutGuide.centerXAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 480),
            stack.widthAnchor.constraint(lessThanOrEqualTo: failureScroll.frameLayoutGuide.widthAnchor, constant: -48),
            preferredWidth
        ])
    }
    @objc private func retry() {
        failureScroll.isHidden = true
        progress.startAnimating()
        #if DEBUG
        if loadNativeFixture() != nil { return }
        #endif
        if hasLoadedPage { webView.reload() } else { webView.load(LaunchFailure.startupRequest) }
    }
    #if DEBUG
    private func loadNativeFixture() -> WKNavigation? {
        guard ProcessInfo.processInfo.arguments.contains("--native-fixture"),
              let fixture = Bundle.main.url(forResource: "NativeFixture", withExtension: "html") else { return nil }
        return webView.loadFileURL(fixture, allowingReadAccessTo: fixture.deletingLastPathComponent())
    }
    #endif
    @objc private func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
    @objc private func checkStartupInSafari() { UIApplication.shared.open(NavigationPolicy.home) }
    @objc private func copyStartupDiagnostic() {
        guard let failure = currentLaunchFailure else { return }
        UIPasteboard.general.string = failure.diagnostic
        copyDiagnosticButton.setTitle("诊断信息已复制", for: .normal)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard acceptsNavigationResult(navigation) else { return }
        automaticRecoveryNavigation = nil
        hasLoadedPage = true
        currentLaunchFailure = nil
        progress.stopAnimating()
        failureScroll.isHidden = true
    }
    private func showLaunchFailure(_ failure: LaunchFailure) {
        currentLaunchFailure = failure
        failureMessage.text = failure.message
        failureDiagnostic.text = failure.diagnostic
        copyDiagnosticButton.setTitle("复制诊断信息", for: .normal)
        progress.stopAnimating()
        failureScroll.isHidden = false
        failureScroll.setContentOffset(.zero, animated: false)
    }
    private func loadFailed(_ error: Error) {
        let failure = error as NSError
        guard !(failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled) else { return }
        showLaunchFailure(LaunchFailure.from(failure))
        // Never clear cookies, IndexedDB or the current web page on failure.
    }
    private func acceptsNavigationResult(_ navigation: WKNavigation?) -> Bool {
        !recoverContentWhenActive && (automaticRecoveryNavigation == nil || navigation === automaticRecoveryNavigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard acceptsNavigationResult(navigation) else { return }
        automaticRecoveryNavigation = nil
        loadFailed(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        self.webView(webView, didFail: navigation, withError: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        automaticRecoveryNavigation = nil
        recoverContentWhenActive = true
        recoverContentIfActive()
    }

    @objc private func appDidBecomeActive(_ notification: Notification) { recoverContentIfActive() }

    private func recoverContentIfActive() {
        guard recoverContentWhenActive, UIApplication.shared.applicationState == .active else { return }
        recoverContentWhenActive = false

        // A page can finish loading before it crashes again. Keep the retry limit
        // across successful loads so a crash loop leaves the manual recovery screen.
        let now = ProcessInfo.processInfo.systemUptime
        if let lastAutomaticContentRecovery, now - lastAutomaticContentRecovery < 60 {
            showLaunchFailure(.contentProcessEnded())
            return
        }
        lastAutomaticContentRecovery = now
        failureScroll.isHidden = true
        progress.startAnimating()

        #if DEBUG
        if let fixtureNavigation = loadNativeFixture() {
            automaticRecoveryNavigation = fixtureNavigation
            return
        }
        #endif
        let currentURL = webView.url ?? webView.backForwardList.currentItem?.url
        var request = LaunchFailure.startupRequest
        if NavigationPolicy.destination(currentURL) == .app, let currentURL {
            request.url = currentURL
        }
        // Use a fresh GET in the existing view and website data store.
        automaticRecoveryNavigation = webView.load(request)
        if automaticRecoveryNavigation == nil { showLaunchFailure(.contentProcessEnded()) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--native-fixture"), action.request.url?.isFileURL == true {
            decisionHandler(.allow); return
        }
        #endif
        let destination = NavigationPolicy.destination(action.request.url)
        if action.shouldPerformDownload, destination == .app || destination == .download {
            decisionHandler(.download); return
        }
        switch destination {
        case .app:
            decisionHandler(.allow)
        case .download:
            decisionHandler(.download)
        case .external:
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, let url = action.request.url { openExternal(url) }
        case .blocked:
            // Reports use same-origin srcdoc. Neither URL is permitted as a root page.
            let localFrame = action.targetFrame?.isMainFrame == false &&
                NavigationPolicy.trusted(webView.url) &&
                ["about:blank", "about:srcdoc"].contains(action.request.url?.absoluteString ?? "")
            decisionHandler(localFrame ? .allow : .cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType, NavigationPolicy.trusted(response.response.url) {
            decisionHandler(.download)
        } else { decisionHandler(.allow) }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        switch NavigationPolicy.destination(url) {
        case .app: webView.load(action.request)
        case .external: if action.navigationType == .linkActivated { openExternal(url) }
        case .download:
            // Keep blob URLs in the originating WKWebView; Safari cannot read them.
            webView.load(action.request)
        case .blocked: break
        }
        return nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let trusted = NavigationPolicy.captureTrusted(scheme: origin.protocol, host: origin.host, port: origin.port,
            frameURL: frame.request.url, isMainFrame: frame.isMainFrame, pageURL: webView.url)
        guard trusted else { decisionHandler(.deny); return }
        let resources: [CaptureResource]
        switch type {
        case .microphone: resources = [.microphone]
        case .camera: resources = [.camera]
        case .cameraAndMicrophone: resources = [.microphone, .camera]
        @unknown default: decisionHandler(.deny); return
        }
        capturePermissions.authorize(resources) { [weak webView] allowed in
            let stillTrusted = NavigationPolicy.captureTrusted(scheme: origin.protocol, host: origin.host, port: origin.port,
                frameURL: frame.request.url, isMainFrame: frame.isMainFrame, pageURL: webView?.url)
            decisionHandler(allowed && stillTrusted ? .grant : .deny)
        }
    }

    private func openExternal(_ url: URL) {
        if url.scheme == "https" {
            guard presentedViewController == nil, printJob == nil else { return }
            present(SFSafariViewController(url: url), animated: true)
        } else { UIApplication.shared.open(url) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--content-process-fixture"), webView.url?.isFileURL == true,
           message.frameInfo.isMainFrame, message.body as? String == "terminate-content-process-fixture" {
            webViewWebContentProcessDidTerminate(webView)
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--native-fixture"), webView.url?.isFileURL == true,
           message.frameInfo.isMainFrame, let body = message.body as? [String: Any], body["type"] as? String == "attachments",
           let id = body["id"] as? String, id == "native-attachment-fixture" {
            presentAttachments(id: id, mediaOnly: body["mediaOnly"] as? Bool == true); return
        }
        #endif
        guard NavigationPolicy.bridgeTrusted(scheme: origin.protocol, host: origin.host, port: origin.port, pageURL: webView.url),
              let body = message.body as? [String: Any], let id = body["id"] as? String, id.count < 100,
              let type = body["type"] as? String else { return }
        if message.frameInfo.isMainFrame, type == "appearance",
           let hex = body["color"] as? String, let color = AppAppearance.pageBackground(hex: hex) {
            view.backgroundColor = color
            view.window?.backgroundColor = color
            webView.backgroundColor = color
            webView.scrollView.backgroundColor = color
            webView.underPageBackgroundColor = color
            failureScroll.backgroundColor = color
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            if color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
                pageStatusBarStyle = (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 0.5 ? .lightContent : .darkContent
                setNeedsStatusBarAppearanceUpdate()
            }
            return
        }
        if message.frameInfo.isMainFrame, type == "attachments" { presentAttachments(id: id, mediaOnly: body["mediaOnly"] as? Bool == true); return }
        if message.frameInfo.isMainFrame, ["attachment_read", "attachment_release"].contains(type) {
            guard let picker = attachmentPicker, let selectionId = body["selectionId"] as? String, selectionId == picker.selectionId else { reply(id, ok: false); return }
            if type == "attachment_release" { picker.cleanup(); attachmentPicker = nil; reply(id, ok: true); return }
            do {
                guard let fileId = body["fileId"] as? String, let offset = body["offset"] as? Int else { reply(id, ok: false); return }
                reply(id, ok: true, result: try picker.read(fileId: fileId, offset: offset))
            } catch { reply(id, ok: false, result: ["ok": false, "error": error.localizedDescription]) }
            return
        }
        if type == "print" {
            guard presentedViewController == nil, printJob == nil, let html = body["html"] as? String else {
                reply(id, ok: false, frame: message.frameInfo); return
            }
            let frame = message.frameInfo
            let job = ReportPrintJob(owner: self) { [weak self] completed, error in
                guard let self else { return }
                self.reply(id, ok: completed, frame: frame)
                self.printJob = nil
                if let error { self.showExportError(error) }
                self.presentNextDownload()
            }
            printJob = job
            job.start(html: html)
            return
        }
        guard message.frameInfo.isMainFrame, type == "share", presentedViewController == nil, printJob == nil else { reply(id, ok: false, frame: message.frameInfo); return }
        var items: [Any] = []
        if let text = body["text"] as? String, !text.isEmpty, text.count < 100000 { items.append(text) }
        if let raw = body["url"] as? String, !raw.isEmpty {
            guard let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil else { reply(id, ok: false); return }
            items.append(url)
        }
        guard !items.isEmpty else { reply(id, ok: false); return }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = webView
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in
            self?.reply(id, ok: completed)
            self?.presentNextDownload()
        }
        present(sheet, animated: true)
    }

    private func presentAttachments(id: String, mediaOnly: Bool = false) {
        guard presentedViewController == nil, printJob == nil, attachmentPicker?.isPicking != true else { reply(id, ok: false); return }
        attachmentPicker?.cleanup()
        do {
            let picker = try NativeAttachments(owner: self, permissions: capturePermissions, mediaOnly: mediaOnly)
            attachmentPicker = picker
            picker.present { [weak self] result in self?.reply(id, ok: result["ok"] as? Bool == true, result: result) }
        } catch { reply(id, ok: false) }
    }

    private func reply(_ id: String, ok: Bool, frame: WKFrameInfo? = nil, result: [String: Any]? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: [id, result ?? ["ok": ok, "error": ok ? "" : "操作未完成"]]),
              let json = String(data: data, encoding: .utf8) else { return }
        // Use the public ObjC entry point (NS_REFINED_FOR_SWIFT). The Swift wrapper
        // adds a libswiftWebKit dependency missing from the iOS 18.5 simulator layout.
        // No completion conversion is needed; keep delivery to the originating frame.
        webView.__evaluateJavaScript("window.__hooohoNativeReply && window.__hooohoNativeReply(...\(json))", inFrame: frame, in: .page, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("hoooho-export-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent(NavigationPolicy.safeFilename(suggestedFilename))
            downloaded[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil); showExportError() }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloaded.removeValue(forKey: ObjectIdentifier(download)) else { return }
        pendingShares.append((file, download))
        presentNextDownload()
    }
    private func presentNextDownload() {
        shareRetry?.cancel()
        guard !pendingShares.isEmpty || pendingExportError != nil else { return }
        guard presentedViewController == nil, currentShareDirectory == nil, printJob == nil, view.window != nil else {
            // All native sheets (including Safari and print) may dismiss without viewDidAppear.
            // Retry only while there is an actual export waiting for its system share sheet.
            let next = DispatchWorkItem { [weak self] in self?.presentNextDownload() }
            shareRetry = next
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: next)
            return
        }
        if let message = pendingExportError {
            pendingExportError = nil
            let alert = UIAlertController(title: "导出未完成", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "知道了", style: .default) { [weak self] _ in self?.presentNextDownload() })
            present(alert, animated: true)
            return
        }
        let (file, _) = pendingShares.removeFirst()
        currentShareDirectory = file.deletingLastPathComponent()
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = webView
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in
            guard let self else { return }
            if let directory = self.currentShareDirectory { try? FileManager.default.removeItem(at: directory) }
            self.currentShareDirectory = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.presentNextDownload() }
        }
        present(sheet, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloaded.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        showExportError()
    }
    private func showExportError(_ message: String = "原记录仍在，请回到记录后重试。") {
        pendingExportError = message
        presentNextDownload()
    }
}

