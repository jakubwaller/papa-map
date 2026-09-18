import Foundation
import CoreLocation

// The dataset as the widget and the Siri shortcut see it: the compact rows
// web/native.js writes through PapaMapSharePlugin into the App Group
// container, plus the reader's two settings. Shared between the app target
// and the widget extension (both compile this file). Classification stays
// in the pipeline: `status` is read, never derived, and "usable" is the same
// rule as datasource.js's nearestUsable — a father needs an accessible room,
// a mother any recorded room.
public enum PapaMap {
    public static let appGroup = "group.de.papamap.app"
    public static let datasetFile = "tables.json"
    public static let modeKey = "mode"      // "papa" | "mama"
    public static let langKey = "lang"      // "de" | "en" (anything else reads as en)
    public static let pendingTableKey = "pendingTable"  // the Siri hand-over, see PendingTable

    public static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }
    public static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}

public struct Table: Equatable {
    public let lat: Double
    public let lon: Double
    public let status: String     // accessible | female_only | unknown
    public let name: String
    public let osmUrl: String

    public func usable(mode: String) -> Bool {
        mode == "mama" ? status != "unknown" : status == "accessible"
    }

    // The pin's colour in the reader's reading, as the map paints it.
    public func colorHex(mode: String) -> String {
        switch status {
        case "accessible": return "#009e73"
        case "female_only": return mode == "mama" ? "#009e73" : "#d55e00"
        default: return mode == "mama" ? "#e69f00" : "#3d4247"   // BUCKET_COLOR.ask, datasource.js
        }
    }

    public var deepLink: URL? {
        var c = URLComponents(string: "papamap://table")
        c?.queryItems = [URLQueryItem(name: "osm", value: osmUrl)]
        return c?.url
    }
}

public struct Nearest {
    public let table: Table
    public let metres: Double
}

public enum TableStore {
    public static func load() -> [Table] {
        guard let url = PapaMap.container?.appendingPathComponent(PapaMap.datasetFile),
              let data = try? Data(contentsOf: url),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[Any]] else { return [] }
        return rows.compactMap { r in
            guard r.count >= 5, let lat = r[0] as? Double, let lon = r[1] as? Double,
                  let status = r[2] as? String, let name = r[3] as? String,
                  let osm = r[4] as? String else { return nil }
            return Table(lat: lat, lon: lon, status: status, name: name, osmUrl: osm)
        }
    }

    public static func save(json: String) throws {
        guard let dir = PapaMap.container else { throw NSError(domain: "PapaMap", code: 1) }
        guard let data = json.data(using: .utf8) else { throw NSError(domain: "PapaMap", code: 2) }
        try data.write(to: dir.appendingPathComponent(PapaMap.datasetFile), options: .atomic)
    }

    public static var mode: String { PapaMap.defaults?.string(forKey: PapaMap.modeKey) ?? "papa" }
    public static var lang: String { PapaMap.defaults?.string(forKey: PapaMap.langKey) == "de" ? "de" : "en" }

    public static func nearest(to loc: CLLocation, mode: String, in tables: [Table]) -> Nearest? {
        var best: Nearest?
        for t in tables where t.usable(mode: mode) {
            let d = loc.distance(from: CLLocation(latitude: t.lat, longitude: t.lon))
            if best == nil || d < best!.metres { best = Nearest(table: t, metres: d) }
        }
        return best
    }

    public static func formatDistance(_ m: Double, lang: String) -> String {
        if m < 1000 { return "\(Int(m.rounded())) m" }
        let km = (m / 100).rounded() / 10
        return lang == "de" ? String(format: "%.1f km", km).replacingOccurrences(of: ".", with: ",")
                            : String(format: "%.1f km", km)
    }
}

// The hand-over from a tapped Siri answer to the page, and nothing else.
//
// `OpenURLIntent` is the universal-link API: handed the app's own
// `papamap://` URL it brings the app to the front and drops the URL, so
// `application(_:open:)` never fires and Capacitor's `appUrlOpen` never
// hears of the table (TestFlight build 20: the widget's pin opened, Siri's
// did not). `OpenTableIntent` runs in the app process instead and leaves the
// deep link here; `PapaMapSharePlugin` takes it out and posts it as an
// opened URL, the very path the widget's tap already takes.
//
// Transient by construction, because a slot that outlives its tap is a map
// that jumps to yesterday's table: one value, read once and removed whatever
// its age, and ignored when it is older than `maxAge`. Only `papamap:` URLs
// go in, so nothing else can be handed to the page through it.
public enum PendingTable {
    public static let maxAge: TimeInterval = 120
    private static let urlKey = "url", atKey = "at"

    public static func store(_ url: URL, now: Date = Date()) {
        guard url.scheme == "papamap" else { return }
        PapaMap.defaults?.set([urlKey: url.absoluteString, atKey: now.timeIntervalSince1970],
                              forKey: PapaMap.pendingTableKey)
        NotificationCenter.default.post(name: .papaMapPendingTable, object: nil)
    }

    public static func consume(now: Date = Date()) -> URL? {
        guard let defaults = PapaMap.defaults else { return nil }
        let row = defaults.dictionary(forKey: PapaMap.pendingTableKey)
        defaults.removeObject(forKey: PapaMap.pendingTableKey)
        guard let row, let string = row[urlKey] as? String, let at = row[atKey] as? Double,
              now.timeIntervalSince1970 - at < maxAge,
              let url = URL(string: string), url.scheme == "papamap" else { return nil }
        return url
    }
}

public extension Notification.Name {
    // Posted in the app process the moment a tapped answer stores its table:
    // the app may already be running, with nothing else about to happen.
    static let papaMapPendingTable = Notification.Name("PapaMapPendingTableNotification")
}

// The two languages the phone-side text speaks. The map speaks thirty-two;
// the widget and the shortcut show a name and a distance, and these few
// words follow the map's language when it is German and read English
// otherwise — the same fallback the App Store listing will have.
public enum L {
    public static func nearestFound(_ n: Nearest, mode: String, lang: String) -> String {
        let dist = TableStore.formatDistance(n.metres, lang: lang)
        let name = n.table.name.isEmpty ? (lang == "de" ? "Wickeltisch" : "Changing table") : n.table.name
        return lang == "de" ? "\(name), \(dist) entfernt" : "\(name), \(dist) away"
    }
    public static func none(lang: String) -> String {
        lang == "de" ? "Kein erreichbarer Wickeltisch in den Daten" : "No reachable changing table in the data"
    }
    public static func noData(lang: String) -> String {
        lang == "de" ? "PapaMap einmal öffnen, dann liegen die Tische auf dem Handy"
                     : "Open PapaMap once so the tables are on the phone"
    }
    public static func noLocation(lang: String) -> String {
        lang == "de" ? "Kein Standort — PapaMap braucht ihn nur auf dem Handy"
                     : "No location — PapaMap only needs it on the phone"
    }
    public static func title(lang: String) -> String {
        lang == "de" ? "Nächster Wickeltisch" : "Nearest changing table"
    }
}
