import UIKit
import WebKit

// Print the immutable report frame, never the application's surrounding UI.
// The extra web view is local, scriptless and cannot navigate to remote pages.
final class ReportPrintJob: NSObject, WKNavigationDelegate {
    private weak var owner: UIViewController?
    private let page: WKWebView
    private let completion: (Bool, String?) -> Void
    private var timeout: DispatchWorkItem?
    private var finished = false

    init(owner: UIViewController, completion: @escaping (Bool, String?) -> Void) {
        self.owner = owner
        self.completion = completion
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        page = WKWebView(frame: CGRect(x: 0, y: 0, width: 612, height: 792), configuration: configuration)
        super.init()
        page.navigationDelegate = self
    }

    func start(html: String) {
        guard !html.isEmpty, html.utf8.count <= 50_000_000, let owner else {
            finish(false, "情况单过大或内容为空，请改用导出文件后分享。"); return
        }
        // Put a restrictive policy before any supplied HTML. Report photos are data URLs.
        let policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'\">"
        let content: String
        if let head = html.range(of: "<head>", options: .caseInsensitive) {
            var secured = html
            secured.insert(contentsOf: policy, at: head.upperBound)
            content = secured
        } else { content = policy + html }
        page.isAccessibilityElement = false
        page.accessibilityElementsHidden = true
        owner.view.insertSubview(page, at: 0)
        let deadline = DispatchWorkItem { [weak self] in self?.finish(false, "打印准备超时，原记录仍在，请重试或导出文件。") }
        timeout = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: deadline)
        page.loadHTMLString(content, baseURL: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        timeout?.cancel()
        guard let owner, owner.presentedViewController == nil else {
            finish(false, "请先关闭当前系统窗口后重试打印。"); return
        }
        let printer = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = "护护就诊情况单"
        info.outputType = .general
        printer.printInfo = info
        printer.printFormatter = page.viewPrintFormatter()
        let handler: UIPrintInteractionController.CompletionHandler = { [weak self] _, completed, error in
            self?.finish(completed, error == nil ? nil : "打印未完成，原记录仍在，请重试。")
        }
        let shown: Bool
        if UIDevice.current.userInterfaceIdiom == .pad {
            shown = printer.present(from: CGRect(x: owner.view.bounds.midX, y: owner.view.bounds.midY, width: 1, height: 1), in: owner.view, animated: true, completionHandler: handler)
        } else { shown = printer.present(animated: true, completionHandler: handler) }
        if !shown { finish(false, "无法打开系统打印，请改用导出文件后分享。") }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(false, "打印准备未完成，原记录仍在，请重试。")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(false, "打印准备未完成，原记录仍在，请重试。")
    }
    private func finish(_ completed: Bool, _ error: String?) {
        guard !finished else { return }
        finished = true
        timeout?.cancel()
        page.removeFromSuperview()
        completion(completed, error)
    }
}
