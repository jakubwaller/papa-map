package de.papamap.app;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.tasks.Tasks;
import com.google.android.play.agesignals.AgeSignalsAccessRequest;
import com.google.android.play.agesignals.AgeSignalsAccessResult;
import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.AgeSignalsResult;
import com.google.android.play.agesignals.ApplicableAgeFeaturesRequest;
import com.google.android.play.agesignals.model.AgeSignalsStatus;
import com.google.android.play.agesignals.model.ApplicableAgeFeature;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super: the bridge is built there, with the plugins it knows.
        registerPlugin(PapaMapSharePlugin.class);
        super.onCreate(savedInstanceState);
        askAgeSignal();
    }

    // California's AB 1043 (from 2027-01-01) and Brazil's Digital ECA have an app ask the
    // store for an age signal when it is launched. PapaMap has no accounts and nothing
    // age-gated, so the answer is dropped unread: not stored, not sent, not shown. It is asked
    // only where Play says sharing is mandatory, because there the setting is a fixed "Always
    // share" and Play shows no prompt; anywhere else the same call can put Play's age-sharing
    // prompt in front of the reader. Async throughout, and every failure (no Play Store, a
    // sideloaded copy, an old Play) ends in the one debug line.
    private void askAgeSignal() {
        try {
            AgeSignalsManager m = AgeSignalsManagerFactory.create(getApplicationContext());
            m.getApplicableAgeFeatures(ApplicableAgeFeaturesRequest.builder().build())
                    .onSuccessTask(f -> f.features().contains(ApplicableAgeFeature.MANDATORY_SHARING)
                            ? m.requestAgeSignalsAccess(AgeSignalsAccessRequest.builder().setActivity(this).build())
                            : Tasks.<AgeSignalsAccessResult>forCanceled())
                    .onSuccessTask(a -> Integer.valueOf(AgeSignalsStatus.SHARED).equals(a.ageSignalsStatus())
                            ? m.checkAgeSignals(AgeSignalsRequest.builder().build())
                            : Tasks.<AgeSignalsResult>forCanceled())
                    .addOnCompleteListener(t -> Log.d("PapaMap", "age signal asked: " + (t.isSuccessful() ? "answered" : "none")));
        } catch (RuntimeException e) {
            Log.d("PapaMap", "age signal unavailable: " + e);
        }
    }
}
