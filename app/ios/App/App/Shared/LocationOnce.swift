import Foundation
import CoreLocation

// One position, once, for the shortcut: CoreLocation's delegate API wrapped
// in an async call. The app's when-in-use permission covers it; the
// shortcut runs in the app's process. The fix is used for one distance
// calculation and dropped, as on the map.
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?

    func request() async -> CLLocation? {
        await withCheckedContinuation { cont in
            continuation = cont
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            if let cached = manager.location, -cached.timestamp.timeIntervalSinceNow < 120 {
                finish(cached); return
            }
            manager.requestLocation()
        }
    }

    private func finish(_ loc: CLLocation?) {
        continuation?.resume(returning: loc)
        continuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finish(locations.last)
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(manager.location)
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        } else if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            finish(nil)
        }
    }
}
