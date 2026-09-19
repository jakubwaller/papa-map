import AppIntents
import SwiftUI
import WidgetKit

// The Control Center button (iOS 18): one tap and the app stands on the pin
// of the nearest table the reader can reach. A control added to Control
// Center can also be dragged onto the Lock Screen and bound to the Action
// button, so this one declaration is all three — the nappy emergency that the
// home screen is too many taps away for.
//
// It shows a symbol and a name and no distance, on purpose. A control's label
// is drawn by the system whenever Control Center is pulled down, from a
// process that gets no fresh fix: a number quietly hours old is worse than no
// number. The distance belongs to the widget, which has a timeline to keep it
// honest. The work happens in OpenNearestTableIntent, in the app.
//
// The words follow the map's language out of the App Group, as the widget's
// gallery entry does — English until PapaMap has been opened once and said
// otherwise. They are read when the system draws the button, and it draws it
// when it pleases, so PapaMapSharePlugin asks for this kind to be reloaded as
// the page hands a language over: without that the button would keep
// yesterday's word until something else happened to redraw it.
@available(iOS 18.0, *)
struct NearestTableControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: PapaMap.controlKind) {
            ControlWidgetButton(action: OpenNearestTableIntent()) {
                Label(L.title(lang: TableStore.lang), systemImage: "figure.and.child.holdinghands")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: L.title(lang: TableStore.lang)))
        .description(LocalizedStringResource(stringLiteral: L.controlHint(lang: TableStore.lang)))
    }
}
