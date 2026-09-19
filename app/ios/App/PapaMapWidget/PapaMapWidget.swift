import WidgetKit
import SwiftUI
import CoreLocation

// The home-screen widget: the nearest changing table the reader can reach,
// with its distance and the pin's colour, refreshed every half hour and
// whenever the app shares a fresh dataset. Tapping opens the pin in the
// app. Location comes from CoreLocation inside the extension
// (NSWidgetWantsLocation in its Info.plist; the app's permission covers it)
// and is used for one distance calculation, never stored or sent.

struct NearestEntry: TimelineEntry {
    let date: Date
    let nearest: Nearest?
    let state: State
    let mode: String
    let lang: String
    enum State { case ok, noData, noLocation, none }
}

struct NearestProvider: TimelineProvider {
    func placeholder(in context: Context) -> NearestEntry {
        NearestEntry(date: .now,
                     nearest: Nearest(table: Table(lat: 0, lon: 0, status: "accessible", name: "Elbphilharmonie", osmUrl: ""), metres: 240),
                     state: .ok, mode: "papa", lang: TableStore.lang)
    }

    func getSnapshot(in context: Context, completion: @escaping (NearestEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : compute())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NearestEntry>) -> Void) {
        let entry = compute()
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func compute() -> NearestEntry {
        let mode = TableStore.mode, lang = TableStore.lang
        let tables = TableStore.load()
        guard !tables.isEmpty else {
            return NearestEntry(date: .now, nearest: nil, state: .noData, mode: mode, lang: lang)
        }
        let manager = CLLocationManager()
        guard let loc = manager.location else {
            return NearestEntry(date: .now, nearest: nil, state: .noLocation, mode: mode, lang: lang)
        }
        guard let hit = TableStore.nearest(to: loc, mode: mode, in: tables) else {
            return NearestEntry(date: .now, nearest: nil, state: .none, mode: mode, lang: lang)
        }
        return NearestEntry(date: .now, nearest: hit, state: .ok, mode: mode, lang: lang)
    }
}

struct NearestView: View {
    let entry: NearestEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "figure.and.child.holdinghands").font(.caption)
                Text(L.title(lang: entry.lang)).font(.caption).fontWeight(.semibold)
                Spacer(minLength: 0)
            }
            .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            switch entry.state {
            case .ok:
                if let n = entry.nearest {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Circle().fill(Color(hex: n.table.colorHex(mode: entry.mode))).frame(width: 10, height: 10)
                        Text(TableStore.formatDistance(n.metres, lang: entry.lang))
                            .font(.title2).fontWeight(.bold).minimumScaleFactor(0.7)
                    }
                    Text(n.table.name.isEmpty ? (entry.lang == "de" ? "Wickeltisch" : "Changing table") : n.table.name)
                        .font(.footnote).lineLimit(family == .systemSmall ? 2 : 1)
                }
            case .noData: Text(L.noData(lang: entry.lang)).font(.footnote)
            case .noLocation: Text(L.noLocation(lang: entry.lang)).font(.footnote)
            case .none: Text(L.none(lang: entry.lang)).font(.footnote)
            }
        }
        .padding(family == .systemSmall ? 2 : 4)
        .widgetURL(entry.nearest?.table.deepLink ?? URL(string: "papamap://open"))
        .containerBackground(for: .widget) { Color(hex: "#f2f5f3") }
    }
}

struct LockView: View {
    let entry: NearestEntry
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "figure.and.child.holdinghands")
            VStack(alignment: .leading, spacing: 1) {
                Text(L.title(lang: entry.lang)).font(.caption2).foregroundStyle(.secondary)
                if let n = entry.nearest, entry.state == .ok {
                    Text("\(TableStore.formatDistance(n.metres, lang: entry.lang)) · \(n.table.name.isEmpty ? "—" : n.table.name)")
                        .font(.footnote).fontWeight(.semibold).lineLimit(1)
                } else {
                    Text(entry.state == .noData ? L.noData(lang: entry.lang)
                         : entry.state == .noLocation ? L.noLocation(lang: entry.lang)
                         : L.none(lang: entry.lang))
                        .font(.footnote).lineLimit(2)
                }
            }
        }
        .widgetURL(entry.nearest?.table.deepLink ?? URL(string: "papamap://open"))
        .containerBackground(for: .widget) { Color.clear }
    }
}

struct PapaMapWidget: Widget {
    let kind = "PapaMapNearest"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NearestProvider()) { entry in
            FamilyView(entry: entry)
        }
        .configurationDisplayName(Text(verbatim: TableStore.lang == "de" ? "Nächster Wickeltisch" : "Nearest changing table"))
        .description(Text(verbatim: TableStore.lang == "de"
            ? "Der nächste Wickeltisch, den du auch erreichst, mit Fußweg."
            : "The nearest changing table you can actually reach, with the distance."))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// One view per family: the lock-screen rectangle is a line, the home-screen
// sizes a card.
struct FamilyView: View {
    let entry: NearestEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        if family == .accessoryRectangular { LockView(entry: entry) } else { NearestView(entry: entry) }
    }
}

@main
struct PapaMapWidgetBundle: WidgetBundle {
    var body: some Widget {
        PapaMapWidget()
        // Controls arrived in iOS 18. The project's floor is 18 as well, so
        // the guard is what says which feature that floor is for — and the
        // one thing that keeps the home-screen widget shipping if it is ever
        // lowered again, because an unguarded control would take the whole
        // bundle down with it on an older phone.
        if #available(iOS 18.0, *) {
            NearestTableControl()
        }
    }
}

extension Color {
    init(hex: String) {
        var s = hex; if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
