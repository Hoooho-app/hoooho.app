import AVFoundation
import Foundation

enum CaptureResource: Hashable { case microphone, camera }
enum CaptureAuthorization: Equatable { case allowed, denied, undetermined }

/// Read OS authorization on every request. No local flag can override revocation.
final class CapturePermissions {
    typealias Completion = (Bool) -> Void
    private let status: (CaptureResource) -> CaptureAuthorization
    private let request: (CaptureResource, @escaping Completion) -> Void
    private var pending: [CaptureResource: [Completion]] = [:]

    init(status: @escaping (CaptureResource) -> CaptureAuthorization,
         request: @escaping (CaptureResource, @escaping Completion) -> Void) {
        self.status = status
        self.request = request
    }

    static func system() -> CapturePermissions {
        CapturePermissions(status: { resource in
            switch AVCaptureDevice.authorizationStatus(for: resource == .microphone ? .audio : .video) {
            case .authorized: return .allowed
            case .notDetermined: return .undetermined
            case .denied, .restricted: return .denied
            @unknown default: return .denied
            }
        }, request: { resource, completion in
            AVCaptureDevice.requestAccess(for: resource == .microphone ? .audio : .video) { allowed in
                DispatchQueue.main.async { completion(allowed) }
            }
        })
    }

    func authorize(_ resources: [CaptureResource], completion: @escaping Completion) {
        guard let first = resources.first else { completion(true); return }
        authorize(first) { [weak self] allowed in
            guard allowed, let self else { completion(false); return }
            self.authorize(Array(resources.dropFirst()), completion: completion)
        }
    }

    private func authorize(_ resource: CaptureResource, completion: @escaping Completion) {
        switch status(resource) {
        case .allowed: completion(true)
        case .denied: completion(false)
        case .undetermined:
            if pending[resource] != nil { pending[resource]?.append(completion); return }
            pending[resource] = [completion]
            request(resource) { [weak self] allowed in
                guard let self else { completion(false); return }
                let callbacks = self.pending.removeValue(forKey: resource) ?? []
                let current = allowed && self.status(resource) == .allowed
                callbacks.forEach { $0(current) }
            }
        }
    }
}
