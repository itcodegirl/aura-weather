/**
 * The map under the radar.
 *
 * ## Why this moved out of the component
 *
 * On 2026-09-18 the deployed app's radar was covered in "API KEY REQUIRED ·
 * carto.com/basemaps/apikey", repeated diagonally across every tile. CARTO
 * had begun gating its Positron raster basemap behind a key, and Aura
 * requests it without one. The failure is invisible to a health check: the
 * tile still returns HTTP 200 with a valid PNG body — the watermark IS the
 * image. Only rendering it shows the problem.
 *
 * Both CARTO variants are gated, so swapping `light_all` for `dark_all` is
 * not a fix. That was checked by rendering both.
 *
 * ## Why OpenStreetMap
 *
 * It is the one candidate whose terms were read rather than assumed. The
 * OSMF tile usage policy welcomes "creative uses", requires visible licence
 * attribution that is not hidden behind a toggle, and forbids bulk download
 * or prefetching of tiles. Aura satisfies all three: one basemap layer at
 * one centre, attribution already rendered beneath the map, and the tile
 * preloading in RadarMap applies to RainViewer's radar frames, never to the
 * basemap.
 *
 * Esri's Gray Canvas renders clean and keyless and would suit the dark shell
 * better — but its terms could not be retrieved, and shipping a basemap on
 * an unverified licence is the kind of claim this app exists not to make.
 * If those terms are checked and they permit it, only this file changes.
 *
 * ## Why it is filtered rather than restyled
 *
 * OSM's standard raster is a road map: green parks, red motorways, dense
 * labels. Under RainViewer's blue-to-magenta echoes that competes for the
 * same attention the precipitation needs. The panel desaturates and darkens
 * the basemap in CSS (`.radar-map .leaflet-tile-pane`), which changes how
 * the tile is displayed in the browser and never modifies, stores or
 * redistributes it.
 */

/**
 * Tile template for the basemap beneath the radar.
 *
 * No `{s}` subdomain placeholder: the OSMF policy asks clients not to spread
 * load across a.b.c hostnames, and modern browsers are no longer limited to
 * six connections per host in a way that would justify it.
 *
 * No `{r}` retina suffix either — the standard OSM layer serves 256px tiles
 * only, and requesting `@2x` returns a 404, which Leaflet renders as a gap.
 */
export const BASE_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Required attribution, rendered in Leaflet's own control.
 *
 * The OSMF policy is explicit that this must be visible on the map and not
 * hidden beneath UI or behind a toggle, so it stays in the map's attribution
 * control rather than moving to the panel's footnote line.
 */
export const BASE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The zoom ceiling the standard OSM layer serves. */
export const BASE_MAX_ZOOM = 19;
