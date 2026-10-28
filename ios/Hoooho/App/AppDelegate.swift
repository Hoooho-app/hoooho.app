import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = AppAppearance.paperBackground
        #if DEBUG
        let unitTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil || NSClassFromString("XCTestCase") != nil
        window.rootViewController = unitTests ? UIViewController() : WebViewController()
        #else
        window.rootViewController = WebViewController()
        #endif
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
    func applicationWillResignActive(_ application: UIApplication) {
        // Keep the WebKit store and current page intact. The existing web recorder
        // owns cancellation/checkpointing on visibility changes.
    }
}
