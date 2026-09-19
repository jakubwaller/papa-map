import Foundation
import CoreLocation

// "Which changing table is nearest and can this reader use it" — asked once
// by Siri and once by the Control Center button, and answered here for both.
// What the two share is the lookup, not the words: Siri says the name and the
// distance out loud, the control only wants the pin, so the four outcomes
// below are what each of them branches on. The rule itself does not move —
// TableStore.nearest over `usable`, the pipeline's `status` read and never
// re-derived.
//
// Main actor, because LocationOnce is: CLLocationManager delivers its
// delegate calls on the run loop of the thread that made it. Both callers run
// in the app process — Siri performs its intent there, and the control's
// intent gets there through `openAppWhenRun` — which is also the only place
// iOS lets a when-in-use permission be asked for.
public enum NearestLookup {
    public enum Outcome {
        case found(Nearest)
        case noData      // the app has never shared its dataset: nothing to search
        case noLocation  // refused, or no fix inside LocationOnce's timeout
        case noneUsable  // tables and a position, but none this reader can use
    }

    @MainActor
    public static func run(mode: String) async -> Outcome {
        let tables = TableStore.load()
        guard !tables.isEmpty else { return .noData }
        guard let loc = await LocationOnce().request() else { return .noLocation }
        guard let hit = TableStore.nearest(to: loc, mode: mode, in: tables) else { return .noneUsable }
        return .found(hit)
    }
}
