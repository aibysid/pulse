# Third party notices

Authored application code: MIT (LICENSE). Dependency licenses remain with their packages and their source repositories. Exact installed package versions are in package-lock.json.

- React / React DOM: Meta and contributors, MIT.
- Three.js: three.js authors, MIT.
- React Three Fiber / Drei: pmndrs contributors, MIT.
- Vite: Vite contributors, MIT.
- Seisplotjs: Philip Crotwell and contributors, MIT. Used for miniSEED parsing and decompression; https://github.com/crotwell/seisplotjs . Retain installed package license.
- ObsPy/TauP: ObsPy Development Team; LGPL-3.0. Development-time numerical generation only; https://github.com/obspy/obspy . TauP methodology credits Crotwell, Owens and Ritsema (1999). IASP91 credits Kennett and Engdahl (1991).
- Natural Earth: public domain land data; https://www.naturalearthdata.com/about/terms-of-use/ . Credit retained despite no attribution requirement.
- USGS: public earthquake catalog observations and derived snapshots. Independent educational use; no endorsement or seal.
- IU Global Seismographic Network: station metadata and 2011 ANMO recording delivered by EarthScope. Acknowledge IU GSN, USGS and EarthScope Data Services. Data are scientific observations, not Pulse-authored material.

The MIT license does not relicense dependencies or third-party data. Generated numerical results have their own model provenance and checksums. Package license texts are enumerated in `docs/dependency_licenses.json`.

- GeoNames: CC BY 4.0 coordinate reference dataset, https://www.geonames.org/ . The 12 city presets are representative points reviewed against the downloaded gazetteer; exact source identifiers are in cities.json.
