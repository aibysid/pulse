# Data sources

USGS summary observations: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{2.5|4.5}_{hour|day|week|month}.geojson`. M6 uses the selected 4.5 feed and a local filter. Only one feed refreshes, with 60-second minimum spacing and positive jitter. Feed `metadata.generated` determines freshness. Fetch completion is separately recorded.

Explicit history: `https://earthquake.usgs.gov/fdsnws/event/1/query`, with format=geojson, eventtype=earthquake, limit=2000. Below M4.5 the range is at most 31 days; the UI boundary is 1900 and 126 years. Exactly 2000 results warns of truncation. This is not a completeness claim about the historical catalog.

The four snapshots in `public/assets/landmarks.json` were resolved using their recorded bounded date/region queries. Each contains provider ID, true origin, coordinates, depth, magnitude type, source link, query and retrieval timestamp. Selection attempts fresh detail and falls back visibly to the dated snapshot.

IU metadata: `https://service.earthscope.org/fdsnws/station/1/query`, level=station, format=text. Epochs must cover the selected origin; results are deduplicated and bounded to 200 stations, nearest first if needed. Channel requests are station-specific: BHZ, then HHZ, location 00, blank, then lexical order, with coverage for the full recording window.

Recordings: `https://service.earthscope.org/fdsnws/dataselect/1/query`. One channel, 20 minutes around modeled P (five before, fifteen after); without a modeled P, origin through twenty minutes. Future endpoints clamp to now. Payload streaming stops above 5 MiB. Raw miniSEED is decoded locally with seisplotjs; unsupported records fail explicitly. Gaps are retained, overlaps disclosed, variable rates preserved, and per-pixel min/max envelopes retain spikes. Optional mean removal is display-only; units remain raw instrument counts.

Bundled evidence is **IU.ANMO.00.BHZ, 2011-03-11 05:55–06:15 UTC**, associated with the Tohoku event. The original 51200-byte miniSEED, source request, retrieval date and checksum are retained. It is a dated recording, never live. Credit the Global Seismographic Network (IU), USGS and EarthScope Data Services.

Cities are representative central coordinates, not the visitor location: New Delhi, Bengaluru, London, Tokyo, New York, Los Angeles, Santiago, Jakarta, Wellington, Istanbul, Mexico City and Cape Town. The exact presets and coordinate-source notice are in `cities.json`. No geolocation or remote geocoding is requested.

Natural Earth 110m land is public domain and locally bundled. Provenance entries record source, processing, retrieval, checksum and notice. Generated model binary/ray checksums are in their nested model manifest.
