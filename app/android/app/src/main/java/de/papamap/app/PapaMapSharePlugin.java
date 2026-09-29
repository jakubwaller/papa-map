package de.papamap.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

// The app's own plugin, under the same name and with the same three methods as
// PapaMapSharePlugin.swift, so web/native.js hands the widget its tables the
// same way on both platforms. All are write-only: two write what the widget
// reads, the third asks the store to show its rating sheet. Nothing comes back
// to the page, and nothing leaves the phone. Registered in MainActivity: an
// app's own plugin has no package for the Capacitor CLI to discover.
//
// iOS's third job, carrying a tapped Siri answer back to the page, has no
// Android counterpart: the widget's and the shortcut's taps are ordinary
// papamap:// intents, which reach the page through App's `appUrlOpen`.
@CapacitorPlugin(name = "PapaMapShare")
public class PapaMapSharePlugin extends Plugin {

    // The file write is a couple of megabytes; off the bridge's thread, which
    // every other plugin call waits behind.
    @PluginMethod
    public void writeDataset(PluginCall call) {
        String json = call.getString("json");
        if (json == null) { call.reject("json missing"); return; }
        new Thread(() -> {
            try {
                TableStore.save(getContext(), json);
                NearestWidget.refresh(getContext());
                call.resolve();
            } catch (Exception e) {
                call.reject("could not write the dataset: " + e.getMessage());
            }
        }, "papamap-share").start();
    }

    @PluginMethod
    public void setSettings(PluginCall call) {
        android.content.SharedPreferences.Editor e = TableStore.prefs(getContext()).edit();
        String mode = call.getString("mode"), lang = call.getString("lang");
        if (mode != null) e.putString(TableStore.MODE_KEY, mode);
        if (lang != null) e.putString(TableStore.LANG_KEY, lang);
        e.apply();
        NearestWidget.refresh(getContext());
        call.resolve();
    }

    // Google Play In-App Review, asked once after the reader's third answer.
    // Play rate-limits the sheet and says nothing about whether it showed, and
    // it only appears in a copy installed from Google Play — a sideloaded or
    // debug build resolves quietly without one.
    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(task -> {
            if (task.isSuccessful() && getActivity() != null) {
                manager.launchReviewFlow(getActivity(), task.getResult()).addOnCompleteListener(done -> call.resolve());
            } else {
                call.resolve();
            }
        });
    }
}
