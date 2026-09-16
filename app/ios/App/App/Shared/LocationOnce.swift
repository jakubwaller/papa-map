import Foundation
import CoreLocation

// One position, once, for the shortcut: CoreLocation's delegate API wrapped
// in an async call. The app's when-in-use permission covers it; the
// shortcut runs in the app's process. The fix is used for one distance
// calculation and dropped, as on the map.
//
// Main actor: CLLocationManager delivers its delegate calls on the run loop
// of the thread that created it, and a cooperative-pool thread has none.
// The timeout makes sure Siri gets an answer even when no fix ever comes
// (permission dialog never answered, no GPS indoors); it answers with the
// last known position, or nothing.
@MainActor
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?
    private var timeout: Task<Void, Never>?

    func request(seconds: Double = 8) async -> CLLocation? {
        await withCheckedContinuation { cont in
            continuation = cont
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            if let cached = manager.location, -cached.timestamp.timeIntervalSinceNow < 120 {
                finish(cached); return
            }
            timeout = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                self?.finish(self?.manager.location)
            }
            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()   // the fix follows in didChangeAuthorization
            case .denied, .restricted:
                finish(nil)
            default:
                manager.requestLocation()
            }
        }
    }

    private func finish(_ loc: CLLocation?) {
        timeout?.cancel()
        timeout = nil
        continuation?.resume(returning: loc)
        continuation = nil
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in self.finish(locations.last) }
    }
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(manager.location) }
    }
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard self.continuation != nil else { return }
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                manager.requestLocation()
            } else if status == .denied || status == .restricted {
                self.finish(nil)
            }
        }
    }
}
