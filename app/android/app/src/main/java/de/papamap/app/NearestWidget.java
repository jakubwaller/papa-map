package de.papamap.app;

import android.Manifest;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import java.util.List;

// The home-screen widget: the nearest changing table the reader can reach,
// its distance and its pin's colour — the Android twin of PapaMapWidget.swift,
// over the same compact rows (TableStore) and the same rule (Tables).
//
// The position is the phone's last known one, read and dropped, never stored:
// a widget cannot ask for a fresh fix, and on Android 10 and later an app
// that is not on screen may be given none at all without the background
// location permission, which PapaMap does not ask for. So "no position" is an
// ordinary state here, not an error: the widget then offers the search itself,
// and a tap opens the app on papamap://nearest, which runs the map's own
// "nearest" button with a fresh fix. A fix older than half an hour counts as
// none — a distance quietly hours old is worse than no distance.
public class NearestWidget extends AppWidgetProvider {
    static final long MAX_FIX_AGE_MS = 30 * 60 * 1000L;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        // Parsing the tables is a couple of megabytes of JSON: off the main
        // thread, with the broadcast held open until it is done.
        final PendingResult result = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                RemoteViews views = render(app);
                for (int id : ids) manager.updateAppWidget(id, views);
            } finally {
                result.finish();
            }
        }, "papamap-widget").start();
    }

    // What the app calls after every dataset write and settings change.
    static void refresh(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        int[] ids = m.getAppWidgetIds(new ComponentName(context, NearestWidget.class));
        if (ids.length == 0) return;
        Intent i = new Intent(context, NearestWidget.class)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(i);
    }

    static RemoteViews render(Context c) {
        String mode = TableStore.mode(c), lang = TableStore.lang(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_nearest);
        v.setTextViewText(R.id.widget_title, Words.title(lang));

        List<Tables.Table> tables = TableStore.load(c);
        Location loc = tables.isEmpty() ? null : lastFix(c);
        Tables.Nearest hit = loc == null ? null
                : Tables.nearest(loc.getLatitude(), loc.getLongitude(), mode, tables);

        String link;
        if (hit != null) {
            v.setViewVisibility(R.id.widget_row, View.VISIBLE);
            v.setViewVisibility(R.id.widget_name, View.VISIBLE);
            v.setViewVisibility(R.id.widget_note, View.GONE);
            v.setInt(R.id.widget_dot, "setColorFilter", hit.table.color(mode));
            v.setTextViewText(R.id.widget_distance, Tables.formatDistance(hit.metres, lang));
            v.setTextViewText(R.id.widget_name, hit.table.name.isEmpty() ? Words.unnamed(lang) : hit.table.name);
            link = "papamap://table?osm=" + Uri.encode(hit.table.osmUrl);
        } else {
            v.setViewVisibility(R.id.widget_row, View.GONE);
            v.setViewVisibility(R.id.widget_name, View.GONE);
            v.setViewVisibility(R.id.widget_note, View.VISIBLE);
            if (tables.isEmpty()) {
                v.setTextViewText(R.id.widget_note, Words.noData(lang));
                link = "papamap://open";
            } else if (loc == null) {
                v.setTextViewText(R.id.widget_note, Words.tapToFind(lang));
                link = "papamap://nearest";
            } else {
                v.setTextViewText(R.id.widget_note, Words.none(lang));
                link = "papamap://open";
            }
        }

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(link))
                .setClass(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    // The freshest last known position any provider holds, or null: no
    // permission, none recorded, or too old. Never a request for a new one.
    static Location lastFix(Context c) {
        if (c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        Location best = null;
        for (String p : lm.getProviders(true)) {
            try {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getElapsedRealtimeNanos() > best.getElapsedRealtimeNanos())) best = l;
            } catch (SecurityException e) {
                // Android 10+ with the app in the background: as good as no fix.
            }
        }
        if (best == null) return null;
        long ageMs = (SystemClock.elapsedRealtimeNanos() - best.getElapsedRealtimeNanos()) / 1_000_000L;
        return ageMs <= MAX_FIX_AGE_MS ? best : null;
    }

    // The widget's few words, in the map's language when it is German and in
    // English otherwise — the same two as iOS (TableStore.swift, L).
    static final class Words {
        static String title(String lang) {
            return "de".equals(lang) ? "Nächster Wickeltisch" : "Nearest changing table";
        }
        static String unnamed(String lang) {
            return "de".equals(lang) ? "Wickeltisch" : "Changing table";
        }
        static String noData(String lang) {
            return "de".equals(lang) ? "PapaMap einmal öffnen, dann liegen die Tische auf dem Handy"
                                     : "Open PapaMap once so the tables are on the phone";
        }
        static String tapToFind(String lang) {
            return "de".equals(lang) ? "Tippen, und PapaMap sucht ihn" : "Tap and PapaMap finds it";
        }
        static String none(String lang) {
            return "de".equals(lang) ? "Kein erreichbarer Wickeltisch in den Daten"
                                     : "No reachable changing table in the data";
        }
    }
}
