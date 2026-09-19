import Foundation
import UIKit
import Capacitor
import WidgetKit

// The app's own plugin: what web/native.js calls to hand the widget and the
// Siri shortcut what they need. Two methods, both write-only into the App
// Group container; nothing comes back to the page, and nothing leaves the
// phone. Registered in MainViewController, not by macro: an app-target
// plugin has no package for the Capacitor CLI to discover.
//
// It carries one thing the other way: the table a tapped Siri answer left in
// PendingTable, posted as an opened URL so it arrives at the page down the
// widget's own path — App's `appUrlOpen`, which web/native.js already reads.
@objc(PapaMapSharePlugin)
public class PapaMapSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PapaMapSharePlugin"
    public let jsName = "PapaMapShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeDataset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSettings", returnType: CAPPluginReturnPromise),
    ]
    private var observers: [NSObjectProtocol] = []

    // Three moments, because which one comes first depends on whether the app
    // was already running when the answer was tapped, and none of them is
    // reliably last. `consume()` hands the table out once, so the other two
    // find nothing. Nothing is done here at load time: a plugin's `load` runs
    // while the bridge is still being built, and this posts to another plugin.
    override public func load() {
        for name in [Notification.Name.papaMapPendingTable,
                     Notification.Name.capacitorViewDidAppear,
                     UIApplication.didBecomeActiveNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.deliverPendingTable()
            })
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }

    // App's own listener retains the event until the page asks for it
    // (`retainUntilConsumed`), so a cold start that arrives here before the
    // WebView has run a line of JavaScript still opens the pin.
    private func deliverPendingTable() {
        guard let url = PendingTable.consume() else { return }
        NotificationCenter.default.post(name: .capacitorOpenURL, object: ["url": url])
    }

    // Everything outside the app that shows what was just written. The widget
    // has a timeline and would come round by itself in the end; the Control
    // Center button has nothing of the kind — its label is whatever the system
    // last drew, in whichever language was set then — so it is asked for by
    // name, and the name is the app's to know as well (PapaMap.controlKind).
    private func reloadSurfaces() {
        WidgetCenter.shared.reloadAllTimelines()
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadControls(ofKind: PapaMap.controlKind) }
    }

    @objc func writeDataset(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json missing"); return }
        do {
            try TableStore.save(json: json)
            reloadSurfaces()
            call.resolve()
        } catch {
            call.reject("could not write the dataset: \(error.localizedDescription)")
        }
    }

    @objc func setSettings(_ call: CAPPluginCall) {
        let d = PapaMap.defaults
        if let mode = call.getString("mode") { d?.set(mode, forKey: PapaMap.modeKey) }
        if let lang = call.getString("lang") { d?.set(lang, forKey: PapaMap.langKey) }
        reloadSurfaces()
        call.resolve()
    }
}
