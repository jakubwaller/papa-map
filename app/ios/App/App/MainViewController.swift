import UIKit
import Capacitor
import DeclaredAgeRange

// Main.storyboard points its one view controller here so the app's own
// plugin is registered on the bridge before the page loads.
class MainViewController: CAPBridgeViewController {
    private var askedAgeRange = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PapaMapSharePlugin())
    }

    // California's AB 1043 (from 2027-01-01) has an app ask the OS for the user's age range
    // when it is launched. PapaMap has no accounts and nothing age-gated, so the answer is
    // dropped unread: not stored, not sent, not shown. It is asked only where Apple says the
    // person is required to share (`declaredAgeRangeRequired`, iOS 26.4), the counterpart of
    // Play's mandatory sharing on Android. Unlike Play, Apple documents no silent route:
    // `requestAgeRange` presents a system sheet, there too. Asked once, after the view is on
    // screen (the sheet needs it in a window), and the flag because that sheet's own
    // dismissal brings viewDidAppear back. Async, and every failure ends in the one debug line.
    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !askedAgeRange else { return }
        askedAgeRange = true
        guard #available(iOS 26.4, *) else { return }
        Task {
            var outcome = "not required"
            do {
                let service = AgeRangeService.shared
                if try await service.requiredRegulatoryFeatures.contains(.declaredAgeRangeRequired) {
                    // AB 1043's four brackets; where a law applies the system uses its own.
                    _ = try await service.requestAgeRange(ageGates: 13, 16, 18, in: self)
                    outcome = "answered"
                }
            } catch {
                outcome = "failed: \(error)"
            }
            CAPLog.print("PapaMap age range asked: \(outcome)")
        }
    }
}
