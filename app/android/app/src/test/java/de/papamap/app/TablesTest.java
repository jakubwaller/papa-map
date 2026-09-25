package de.papamap.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

// The widget's rule held to the map's: nearestUsable in datasource.js and
// TableStore.swift answer these the same way.
public class TablesTest {
    private static final Tables.Table WOMEN = new Tables.Table(53.5600, 9.9600, "female_only", "Near", "https://www.openstreetmap.org/node/1");
    private static final Tables.Table OPEN = new Tables.Table(53.5700, 9.9600, "accessible", "Far", "https://www.openstreetmap.org/node/2");
    private static final Tables.Table GREY = new Tables.Table(53.5601, 9.9600, "unknown", "", "https://www.openstreetmap.org/node/3");
    private static final List<Tables.Table> ALL = Arrays.asList(WOMEN, OPEN, GREY);

    @Test
    public void papaSkipsTheWomensRoomAndTheUnrecorded() {
        assertEquals(OPEN, Tables.nearest(53.5600, 9.9600, "papa", ALL).table);
    }

    @Test
    public void mamaTakesAnyRecordedRoomButNotTheUnrecorded() {
        assertEquals(WOMEN, Tables.nearest(53.5600, 9.9600, "mama", ALL).table);
    }

    @Test
    public void nothingUsableIsNull() {
        assertNull(Tables.nearest(53.56, 9.96, "papa", Arrays.asList(WOMEN, GREY)));
        assertNull(Tables.nearest(53.56, 9.96, "papa", Collections.emptyList()));
    }

    @Test
    public void distanceIsHaversine() {
        // 0.01° of latitude is 1111.95 m on the 6371 km sphere.
        assertEquals(1111.95, Tables.nearest(53.5600, 9.9600, "papa", ALL).metres, 0.01);
    }

    @Test
    public void distancesReadLikeTheIosWidget() {
        assertEquals("240 m", Tables.formatDistance(240.4, "en"));
        assertEquals("999 m", Tables.formatDistance(999.4, "de"));
        assertEquals("1.1 km", Tables.formatDistance(1111.95, "en"));
        assertEquals("1,1 km", Tables.formatDistance(1111.95, "de"));
    }

    @Test
    public void pinColoursFollowTheReading() {
        assertEquals(0xFFD55E00, WOMEN.color("papa"));
        assertEquals(0xFF009E73, WOMEN.color("mama"));
        assertEquals(0xFF3D4247, GREY.color("papa"));
        assertEquals(0xFFE69F00, GREY.color("mama"));
    }
}
