import XCTest
@testable import HooohoRecords

final class CapturePermissionsTests: XCTestCase {
    func testExistingOSGrantSurvivesANewCoordinatorAndRevocationIsRespected() {
        var state = CaptureAuthorization.allowed
        var requests = 0
        let make = { CapturePermissions(status: { _ in state }, request: { _, _ in requests += 1 }) }
        make().authorize([.microphone]) { XCTAssertTrue($0) }
        make().authorize([.microphone]) { XCTAssertTrue($0) }
        state = .denied
        make().authorize([.microphone]) { XCTAssertFalse($0) }
        XCTAssertEqual(requests, 0)
    }

    func testFirstRequestIsCoalescedAndSubsequentUseDoesNotPromptAgain() {
        var state = CaptureAuthorization.undetermined
        var requests = 0, completed = 0
        var finish: CapturePermissions.Completion?
        let permissions = CapturePermissions(status: { _ in state }, request: { _, completion in requests += 1; finish = completion })
        permissions.authorize([.microphone]) { XCTAssertTrue($0); completed += 1 }
        permissions.authorize([.microphone]) { XCTAssertTrue($0); completed += 1 }
        XCTAssertEqual(requests, 1)
        XCTAssertEqual(completed, 0)
        state = .allowed
        finish?(true)
        XCTAssertEqual(completed, 2)
        permissions.authorize([.microphone]) { XCTAssertTrue($0); completed += 1 }
        XCTAssertEqual(requests, 1)
        XCTAssertEqual(completed, 3)
    }

    func testCombinedCaptureRequiresBothPermissionsAndDenialDoesNotGrant() {
        var states: [CaptureResource: CaptureAuthorization] = [.microphone: .allowed, .camera: .undetermined]
        var requested: [CaptureResource] = []
        let permissions = CapturePermissions(status: { states[$0] ?? .denied }, request: { resource, completion in requested.append(resource); states[resource] = .denied; completion(false) })
        permissions.authorize([.microphone, .camera]) { XCTAssertFalse($0) }
        permissions.authorize([.camera]) { XCTAssertFalse($0) }
        XCTAssertEqual(requested, [.camera])
    }
}
