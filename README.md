# Pulse

Pulse is a public educational earthquake explorer: USGS observations, a local 3D Earth, historical replay, IASP91 direct-arrival estimates, reference interior rays, and on-demand EarthScope recordings. It does not provide earthquake warnings or predictions.

Live: https://aibysid.github.io/pulse/

Source: https://github.com/aibysid/pulse

## Build and develop

Use Node **22.23.3** and npm. A normal build needs no Python, keys, account, database, or environment file.

```sh
nvm install
nvm use
npm ci
npm run dev        # http://127.0.0.1:5173/pulse/
npm run checks     # lint, TypeScript, unit tests, asset integrity
npm run build
npm run preview    # http://127.0.0.1:4173/pulse/
npx playwright install chromium
npm run test:e2e
```

Defaults: Live, past 24 hours, M4.5+, New Delhi receiver, stationary camera, stations off, surface reference off. USGS refresh is at most once per minute; history and waveforms require explicit requests. All observations and waveforms remain in memory. Only visitor preferences use localStorage.

## Explore

Select an earthquake; choose a city, coordinates or IU station; inspect approximate direct P and S arrivals. Replay starts paused at the true origin, with a 90-minute range and 1/10/30/60x speeds. Explore history has bounded submitted queries and four verified landmark snapshots. Inside Earth shows independent reference ray scenarios. Recorded evidence offers a requested station recording and a dated 2011 Tohoku reference recording.

Hash routes and query state make paused replays shareable. Screenshot and JSON exports stay on the device. Add `?fallback=1` before a hash to exercise the accessible 2D map.

## Science limitations

IASP91 is a one-dimensional model, not a detector. Cards select only earliest p/P or s/S. Unsupported depths and rejected phase-boundary cells display no estimate. Missing direct S does not mean no seismic signals or no risk. Numerical interpolation validation is agreement with TauP, not real-world accuracy. Interior reference paths are not solutions for the selected event. Surface propagation is separately labeled illustrative fixed-speed geometry.

## Operations and notices

Public GitHub Pages, USGS and EarthScope are the only runtime services; no subscriptions or billing accounts. Free limits and upstream availability still apply. Authored code is MIT. Natural Earth geometry is public domain. ObsPy TauP method is LGPL-3.0. IU/GSN recordings and metadata require source acknowledgment. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [provenance](public/assets/provenance.json), [science](docs/science.md), [data sources](docs/data_sources.md), [deployment](docs/deployment.md), [runbook](docs/runbook.md), and the [acceptance report](docs/acceptance_report.md).

Browser target: current and previous desktop Chrome/Edge/Firefox/Safari, current mobile Safari/Chrome. Automated Chromium, Firefox and WebKit desktop and emulated mobile results are recorded separately from physical-device validation.
