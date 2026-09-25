package de.papamap.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

// The dataset as the widget sees it: the compact rows web/native.js writes
// through PapaMapSharePlugin, plus the reader's two settings. The Android
// twin of TableStore.swift, with the app's own files dir in place of the App
// Group container — the widget is drawn by the app's own process here, so
// there is nothing to share across.
public final class TableStore {
    private TableStore() {}

    static final String DATASET_FILE = "tables.json";
    private static final String PREFS = "papamap";
    static final String MODE_KEY = "mode";   // "papa" | "mama"
    static final String LANG_KEY = "lang";   // "de" | "en" (anything else reads as en)

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String mode(Context c) {
        return "mama".equals(prefs(c).getString(MODE_KEY, "papa")) ? "mama" : "papa";
    }

    public static String lang(Context c) {
        return "de".equals(prefs(c).getString(LANG_KEY, "en")) ? "de" : "en";
    }

    // Written beside the old copy and renamed over it, so the widget never
    // reads half a file.
    // synchronized: every writeDataset call runs on a thread of its own, and two
    // that overlap (boot's applyDataset and watchRefresh's, or two quick taps on
    // the wheelchair chip) would otherwise interleave their bytes in the one
    // .new file. Serialized, each write lands whole — though a monitor is not
    // fair, so two calls started within microseconds may land in either order.
    public static synchronized void save(Context c, String json) throws IOException {
        File dir = c.getFilesDir();
        File tmp = new File(dir, DATASET_FILE + ".new");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(new File(dir, DATASET_FILE))) throw new IOException("rename failed");
    }

    // Empty on any failure: no dataset reads as "open the app once".
    public static List<Tables.Table> load(Context c) {
        File f = new File(c.getFilesDir(), DATASET_FILE);
        if (!f.isFile()) return Collections.emptyList();
        try {
            JSONArray rows = new JSONArray(read(f));
            List<Tables.Table> out = new ArrayList<>(rows.length());
            for (int i = 0; i < rows.length(); i++) {
                JSONArray r = rows.optJSONArray(i);
                if (r == null || r.length() < 5) continue;
                out.add(new Tables.Table(r.getDouble(0), r.getDouble(1), r.getString(2),
                        r.optString(3, ""), r.optString(4, ""), r.optBoolean(5, false)));
            }
            return out;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    // java.nio.file is API 26; the app starts at 24.
    private static String read(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) f.length());
            byte[] buf = new byte[64 * 1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
