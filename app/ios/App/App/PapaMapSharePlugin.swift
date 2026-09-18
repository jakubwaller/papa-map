import Foundation
import Capacitor
import WidgetKit

// The app's own plugin: what web/native.js calls to hand the widget and the
// Siri shortcut what they need. Two methods, both write-only into the App
// Group container; nothing comes back to the page, and nothing leaves the
// phone. Registered in MainViewController, not by macro: an app-target
// plugin has no package for the Capacitor CLI to discover.
@objc(PapaMapSharePlugin)
public class PapaMapSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PapaMapSharePlugin"
    public let jsName = "PapaMapShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeDataset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSettings", returnType: CAPPluginReturnPromise),
    ]

    @objc func writeDataset(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json missing"); return }
        do {
            try TableStore.save(json: json)
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } catch {
            call.reject("could not write the dataset: \(error.localizedDescription)")
        }
    }

    @objc func setSettings(_ call: CAPPluginCall) {
        let d = PapaMap.defaults
        if let mode = call.getString("mode") { d?.set(mode, forKey: PapaMap.modeKey) }
        if let lang = call.getString("lang") { d?.set(lang, forKey: PapaMap.langKey) }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
