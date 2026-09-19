import AppIntents

// What the Control Center button does when it is tapped — and with it the
// Lock Screen button and the Action button, because one control on iOS 18 is
// all three surfaces.
//
// It runs in the app, not in the widget extension, and `openAppWhenRun` is
// what makes iOS launch PapaMap and perform it there. That matters twice: a
// position may only be asked for by an app in the foreground — a control's
// own process is handed a cached fix at best and can put up no permission
// dialog — and the app has to come up anyway, since the point of the tap is
// to stand in front of the pin.
//
// The table then reaches the page exactly as a tapped Siri answer's does:
// PendingTable holds it for the single read PapaMapSharePlugin makes, and the
// page sees the widget's own `papamap://table?osm=…` open-URL event. Nothing
// in web/ knows this control exists.
//
// Every other outcome ends the same way: nothing in the slot, and the app
// opens on the map as the reader left it. No dataset yet, location refused,
// nothing usable within reach — opening PapaMap is still an answer, and a
// control that did nothing at all would read as broken.
@available(iOS 18.0, *)
struct OpenNearestTableIntent: AppIntent {
    static var title: LocalizedStringResource = "Open the nearest changing table"
    static var description = IntentDescription("Opens PapaMap on the nearest changing table you can actually reach.")
    // Deprecated in iOS 26 for `supportedModes = .foreground`, which needs
    // iOS 26; 26 maps this onto the new mode (as for OpenTableIntent).
    static var openAppWhenRun: Bool = true
    // Not an action to build shortcuts out of: NearestTableIntent is the one
    // that belongs in Shortcuts, in Spotlight and on the Action button's
    // shortcut list, and it answers in words as well. This one is the tap.
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        if case .found(let hit) = await NearestLookup.run(mode: TableStore.mode),
           let link = hit.table.deepLink {
            PendingTable.store(link)
        }
        return .result()
    }
}
