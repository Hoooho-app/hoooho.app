import UIKit
import WebKit
import SafariServices

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    private var webView: WKWebView!
    private let progress = UIActivityIndicatorView(style: .medium)
    private let retryButton = UIButton(type: .system)
    private var downloaded: [ObjectIdentifier: URL] = [:]
    private var pendingShares: [(URL, WKDownload)] = []
    private var currentShareDirectory: URL?
    private var hasLoadedPage = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.97, blue: 0.95, alpha: 1)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let controller = WKUserContentController()
        controller.add(self, name: "hooohoNative")
        if let url = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
           let script = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        progress.hidesWhenStopped = true
        progress.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progress)
        retryButton.setTitle("连接未完成，点此重试", for: .normal)
        retryButton.accessibilityIdentifier = "hoooho.retry"
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        retryButton.translatesAutoresizingMaskIntoConstraints = false
        retryButton.backgroundColor = view.backgroundColor
        retryButton.layer.cornerRadius = 12
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
        retryButton.isHidden = true
        view.addSubview(retryButton)
        NSLayoutConstraint.activate([
            progress.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            progress.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            retryButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            retryButton.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        progress.startAnimating()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--native-fixture"),
           let fixture = Bundle.main.url(forResource: "NativeFixture", withExtension: "html") {
            webView.loadFileURL(fixture, allowingReadAccessTo: fixture.deletingLastPathComponent())
            return
        }
        #endif
        webView.load(URLRequest(url: NavigationPolicy.home))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        presentNextDownload()
    }

    @objc private func retry() {
        retryButton.isHidden = true
        progress.startAnimating()
        if hasLoadedPage { webView.reload() } else { webView.load(URLRequest(url: NavigationPolicy.home)) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedPage = true
        progress.stopAnimating()
        retryButton.isHidden = true
    }
    private func loadFailed(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        progress.stopAnimating()
        retryButton.isHidden = false
        // Never clear cookies, IndexedDB or the current web page on failure.
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loadFailed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loadFailed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        progress.stopAnimating(); retryButton.isHidden = false
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
            // about:blank is needed by empty subframes and print popups, never by a root navigation.
            decisionHandler(action.targetFrame?.isMainFrame == false && action.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
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
        let trusted = origin.protocol == "https" && origin.host == "hoooho.com" &&
            (origin.port == 0 || origin.port == 443) && NavigationPolicy.trusted(frame.request.url)
        decisionHandler(trusted ? .prompt : .deny)
    }

    private func openExternal(_ url: URL) {
        if url.scheme == "https" {
            guard presentedViewController == nil else { return }
            present(SFSafariViewController(url: url), animated: true)
        } else { UIApplication.shared.open(url) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, NavigationPolicy.trusted(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let id = body["id"] as? String, id.count < 100,
              let type = body["type"] as? String else { return }
        if type == "print" {
            guard presentedViewController == nil else { reply(id, ok: false); return }
            let printer = UIPrintInteractionController.shared
            printer.printFormatter = webView.viewPrintFormatter()
            printer.present(animated: true) { [weak self] _, completed, _ in self?.reply(id, ok: completed) }
            return
        }
        guard type == "share", presentedViewController == nil else { reply(id, ok: false); return }
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
        sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in self?.reply(id, ok: completed) }
        present(sheet, animated: true)
    }

    private func reply(_ id: String, ok: Bool) {
        guard let data = try? JSONSerialization.data(withJSONObject: [id, ["ok": ok, "error": ok ? "" : "操作未完成"]]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.__hooohoNativeReply && window.__hooohoNativeReply(...\(json))", completionHandler: nil)
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
        guard presentedViewController == nil, currentShareDirectory == nil, !pendingShares.isEmpty else { return }
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
    private func showExportError() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "导出未完成", message: "原记录仍在，请回到记录后重试。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "知道了", style: .default))
        present(alert, animated: true)
    }
}
