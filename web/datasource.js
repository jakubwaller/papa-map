// Pure data functions for PapaMap — no DOM, no fetch, unit-tested via node --test.
// Input shape: the pipeline's GeoJSON per the data contract in CONTRACT.md.

// Every status the pipeline can emit, in legend order. Also the stable key set
// for countsByStatus, so the UI can render zero badges.
export const STATUSES = ["accessible", "female_only", "unknown"];

// Flatten the pipeline FeatureCollection into plain {lon, lat, ...props} objects.
// Tolerates a missing/empty/malformed collection by returning [] — the UI shows
// a "no data" message instead of crashing. Features without a usable Point
// geometry are skipped; an unrecognized status degrades to "unknown". idx is
// the object's position in the returned array: the map layer carries only idx
// and clicks look the full object up again.
export function loadFeatures(fc) {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out = [];
  for (const f of fc.features) {
    const coords = f && f.geometry && f.geometry.type === "Point"
      ? f.geometry.coordinates : null;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const p = f.properties || {};
    out.push({
      idx: out.length,
      lon: coords[0],
      lat: coords[1],
      name: p.name ?? null,
      amenity: p.amenity ?? null,
      changing_table: p.changing_table ?? null,
      location_raw: p.location_raw ?? null,
      status: STATUSES.includes(p.status) ? p.status : "unknown",
      fee: p.fee ?? null,
      opening_hours: p.opening_hours ?? null,
      osm_url: p.osm_url ?? null,
      mapcomplete_url: p.mapcomplete_url ?? null,
    });
  }
  return out;
}

// Keep only features whose status is in `visible` (a Set or array of statuses).
export function filterByStatus(features, visible) {
  const set = visible instanceof Set ? visible : new Set(visible);
  return features.filter((f) => set.has(f.status));
}

// { accessible: n, female_only: n, unknown: n } — always all three keys.
export function countsByStatus(features) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const f of features) counts[f.status] += 1;
  return counts;
}

// ?bbox=minLon,minLat,maxLon,maxLat — how the Bundesland pages link into the
// map, so "Hessen auf der Karte öffnen" opens on Hessen instead of the
// Germany+Denmark home view. Returns MapLibre's [[w,s],[e,n]] or null; anything
// malformed degrades to the home view, because handing fitBounds a NaN or an
// inverted box produces a broken camera the user can't recover from.
export function parseBbox(value) {
  const parts = String(value ?? "").split(",");
  if (parts.length !== 4) return null;
  const [w, s, e, n] = parts.map(Number);
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (w < -180 || e > 180 || s < -90 || n > 90) return null;
  if (w >= e || s >= n) return null;   // empty or inverted
  return [[w, s], [e, n]];
}

// Deep links for the "add a place" flow, built from the current map view.
// Coordinates are clamped to 5 decimals (~1 m) so the URLs stay readable;
// zoom is rounded and floored at the editors' useful minimum, because handing
// MapComplete or iD a country-level zoom just strands the user in the clouds.
export function mapCompleteAddUrl(lon, lat, zoom) {
  const z = Math.max(14, Math.round(zoom));
  return `https://mapcomplete.org/toilets?z=${z}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
}

export function osmEditUrl(lon, lat, zoom) {
  const z = Math.max(17, Math.round(zoom));
  return `https://www.openstreetmap.org/edit#map=${z}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
}

// Rebuild a FeatureCollection for the map source. Properties carry only
// {idx, status}: status drives the data-driven circle color, idx the click
// lookup. "unknown" features are emitted last so their grey circles draw on
// top of the others — the untagged rooms are the call to action.
export function toFeatureCollection(features) {
  const ordered = [...features].sort(
    (a, b) => (a.status === "unknown") - (b.status === "unknown"));
  return {
    type: "FeatureCollection",
    features: ordered.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      properties: { idx: f.idx, status: f.status },
    })),
  };
}
