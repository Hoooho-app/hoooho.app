import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.97, green: 0.97, blue: 0.95, alpha: 1)
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
