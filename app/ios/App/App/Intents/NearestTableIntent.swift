import AppIntents
import CoreLocation

// "Hey Siri, nearest changing table in PapaMap" — and the same in Spotlight
// and the Shortcuts app. Answers in words with the name and the distance and
// opens the pin in the app on tap. Nothing is sent anywhere: the dataset is
// the copy the app shared (TableStore), the position is the phone's.
@available(iOS 16.0, *)
struct NearestTableIntent: AppIntent {
    static var title: LocalizedStringResource = "Nearest changing table"
    static var description = IntentDescription("Finds the nearest changing table you can actually reach.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & OpensIntent {
        let lang = TableStore.lang
        let tables = TableStore.load()
        guard !tables.isEmpty else {
            return .result(opensIntent: OpenURLIntent(URL(string: "papamap://open")!),
                           dialog: IntentDialog(stringLiteral: L.noData(lang: lang)))
        }
        guard let loc = await LocationOnce().request() else {
            return .result(opensIntent: OpenURLIntent(URL(string: "papamap://open")!),
                           dialog: IntentDialog(stringLiteral: L.noLocation(lang: lang)))
        }
        guard let hit = TableStore.nearest(to: loc, mode: TableStore.mode, in: tables) else {
            return .result(opensIntent: OpenURLIntent(URL(string: "papamap://open")!),
                           dialog: IntentDialog(stringLiteral: L.none(lang: lang)))
        }
        let url = hit.table.deepLink ?? URL(string: "papamap://open")!
        return .result(opensIntent: OpenURLIntent(url),
                       dialog: IntentDialog(stringLiteral: L.nearestFound(hit, mode: TableStore.mode, lang: lang)))
    }
}

@available(iOS 16.0, *)
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
