package de.papamap.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super: the bridge is built there, with the plugins it knows.
        registerPlugin(PapaMapSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
