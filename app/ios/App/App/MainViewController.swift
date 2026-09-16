import UIKit
import Capacitor

// Main.storyboard points its one view controller here so the app's own
// plugin is registered on the bridge before the page loads.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PapaMapSharePlugin())
    }
}
