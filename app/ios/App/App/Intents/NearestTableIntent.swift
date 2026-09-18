import AppIntents
import CoreLocation

// "Hey Siri, nearest changing table in PapaMap" — and the same in Spotlight
// and the Shortcuts app. Answers in words with the name and the distance and
// opens the pin in the app on tap. Nothing is sent anywhere: the dataset is
// the copy the app shared (TableStore), the position is the phone's.
@available(iOS 18.0, *)
struct NearestTableIntent: AppIntent {
    static var title: LocalizedStringResource = "Nearest changing table"
    static var description = IntentDescription("Finds the nearest changing table you can actually reach.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & OpensIntent {
        let lang = TableStore.lang
        let tables = TableStore.load()
        guard !tables.isEmpty else {
            return .result(opensIntent: OpenTableIntent(),
                           dialog: IntentDialog(stringLiteral: L.noData(lang: lang)))
        }
        guard let loc = await LocationOnce().request() else {
            return .result(opensIntent: OpenTableIntent(),
                           dialog: IntentDialog(stringLiteral: L.noLocation(lang: lang)))
        }
        guard let hit = TableStore.nearest(to: loc, mode: TableStore.mode, in: tables) else {
            return .result(opensIntent: OpenTableIntent(),
                           dialog: IntentDialog(stringLiteral: L.none(lang: lang)))
        }
        return .result(opensIntent: OpenTableIntent(link: hit.table.deepLink),
                       dialog: IntentDialog(stringLiteral: L.nearestFound(hit, mode: TableStore.mode, lang: lang)))
    }
}

// What the tap on that answer runs. It is an intent of the app's own rather
// than an `OpenURLIntent` because `OpenURLIntent` is the universal-link API:
// given `papamap://table?osm=…` it foregrounds the app and drops the URL, and
// the page is never told which table Siri found (PendingTable has the whole
// account). This runs in the app process — that is what `openAppWhenRun`
// buys — and leaves the deep link in the hand-over slot, which
// PapaMapSharePlugin delivers as an opened URL on whichever comes first: its
// own signal, the first page of a cold start, or the app coming to the front.
// No link means there was nothing to open and the app simply comes up: the
// three answers that only apologise.
@available(iOS 18.0, *)
struct OpenTableIntent: AppIntent {
    static var title: LocalizedStringResource = "Open changing table"
    // Deprecated in iOS 26 for `supportedModes = .foreground`, which needs
    // iOS 26; the app's floor is 18, and 26 maps this onto the new mode.
    static var openAppWhenRun: Bool = true
    // Not an action to build shortcuts out of — it is the tap on the answer.
    static var isDiscoverable: Bool = false

    @Parameter(title: "Table link") var link: String?

    init() {}
    init(link: URL?) { self.link = link?.absoluteString }

    func perform() async throws -> some IntentResult {
        if let link, let url = URL(string: link) { PendingTable.store(url) }
        return .result()
    }
}

@available(iOS 18.0, *)
struct PapaMapShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: NearestTableIntent(),
            phrases: [
                "Nearest changing table in \(.applicationName)",
                "Where can I change the baby in \(.applicationName)",
                "Find a changing table in \(.applicationName)",
            ],
            shortTitle: "Nearest changing table",
            systemImageName: "figure.and.child.holdinghands"
        )
    }
}
