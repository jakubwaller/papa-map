package de.papamap.app;

import java.util.List;
import java.util.Locale;

// The widget's arithmetic, and nothing that needs Android: the Java twin of
// TableStore.swift's Table, nearest and formatDistance, so a plain JUnit test
// can hold it to the same answers. Classification stays in the pipeline:
// `status` is read, never derived, and "usable" is datasource.js's
// nearestUsable — a father needs an accessible room, a mother any recorded
// room that is not the men's alone (CONTRACT v50). The rows arrive already
// narrowed by the wheelchair chip (app.js, shareTables), so the chip never
// has to be known here.
public final class Tables {
    private Tables() {}

    public static final class Table {
        public final double lat, lon;
        public final String status;   // accessible | female_only | unknown
        public final String name;
        public final String osmUrl;
        // The men's room alone (CONTRACT v50): accessible to a father, not to a
        // mother. The sixth column; a row written by an older app has five.
        public final boolean menOnly;

        public Table(double lat, double lon, String status, String name, String osmUrl) {
            this(lat, lon, status, name, osmUrl, false);
        }

        public Table(double lat, double lon, String status, String name, String osmUrl, boolean menOnly) {
            this.lat = lat;
            this.lon = lon;
            this.status = status;
            this.name = name;
            this.osmUrl = osmUrl;
            this.menOnly = menOnly;
        }

        public boolean usable(String mode) {
            return "mama".equals(mode) ? !"unknown".equals(status) && !menOnly : "accessible".equals(status);
        }

        // The pin's colour in the reader's reading, as the map paints it
        // (BUCKET_COLOR in datasource.js).
        public int color(String mode) {
            boolean mama = "mama".equals(mode);
            switch (status) {
                case "accessible": return mama && menOnly ? 0xFFD55E00 : 0xFF009E73;
                case "female_only": return mama ? 0xFF009E73 : 0xFFD55E00;
                default: return mama ? 0xFFE69F00 : 0xFF3D4247;
            }
        }
    }

    public static final class Nearest {
        public final Table table;
        public final double metres;

        Nearest(Table table, double metres) {
            this.table = table;
            this.metres = metres;
        }
    }

    public static Nearest nearest(double lat, double lon, String mode, List<Table> tables) {
        Nearest best = null;
        for (Table t : tables) {
            if (!t.usable(mode)) continue;
            double d = metres(lat, lon, t.lat, t.lon);
            if (best == null || d < best.metres) best = new Nearest(t, d);
        }
        return best;
    }

    // Haversine on a 6371 km sphere, the same as datasource.js. Good to well
    // under a metre at the distances a widget shows.
    static double metres(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    public static String formatDistance(double m, String lang) {
        if (m < 1000) return Math.round(m) + " m";
        String km = String.format(Locale.ROOT, "%.1f km", Math.round(m / 100) / 10.0);
        return "de".equals(lang) ? km.replace('.', ',') : km;
    }
}
