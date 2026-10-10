# Acceptance report

Build date: 10 October 2026. Owner: aibysid. This report distinguishes implemented functionality, automated fixture coverage, real browser-provider checks, and unperformed physical-device validation. It does not claim complete WCAG certification or a complete previous-stable/physical-device matrix.

## Automated and numerical evidence

- `npm run checks`: lint, TypeScript, 21 deterministic unit tests and all asset checks pass.
- Nine browser journeys pass in Chromium 156, Firefox 157 and WebKit 27.2 (27 engine runs). Tests exercise replay, receiver selection, shared hash refresh, JSON/PNG exports, hidden-tab pause, missing recording, outage, mobile width and serious/critical axe checks on the accessible shell.
- Real bundled 2011 miniSEED decoding is tested in both the unit suite and browsers; no generated sample substitute is used.
- Numerical validation: 133315 center/edge queries; 51975 accepted phase cells; maximum sampled error 0.355 s. Seed 91: 500 additional locations, 468 accepted phase samples, maximum error 0.128 s. Manifest checksums and missing/tampered asset behavior are tested. Exact stored reference nodes are compared with independent TauP fixtures.
- Initial browser shell is visible with slow-4G/4x-CPU emulation. Published owned assets remain under 20 MiB; numerical payload is about 1 MiB, below the 8-MiB model target. Detailed measured browser metadata is in `evidence/performance.json`.

## Requirement matrix

| ID | Status and evidence |
| --- | --- |
| A01 | Passed: locked npm install, checks, build and preview, no environment keys. |
| A02 | Passed: actual M4.5/day feed, source timestamps, no fabricated observations. |
| A03 | Implemented and tested: local filters/sorts, selected list/marker state. |
| A04 | Unit coverage: null magnitude/depth, invalid geometry, non-earthquake; revisions pause/recompute in implementation. |
| A05 | Unit geometry cases and browser city/station selection; coordinate validation and globe/map picking implemented. |
| A06 | Origin seconds/milliseconds arithmetic is separated from active clock; browser arrival displays and export evidence. |
| A07 | Browser play/pause/reset/scrub/speed and hidden pause; performance.now replay, 90-minute stop and live reset implemented. |
| A08 | Unit bounded history validation; submitted-only queries, 2000 cap and truncation notice implemented. |
| A09 | Passed: four actual bounded USGS queries, verified IDs/snapshots and browser Tohoku replay. |
| A10 | Passed in committed numerical validation samples; finite sampling is not a mathematical universal error proof. |
| A11 | Unit unsupported depths, absent phases, rejected cells, missing and tampered assets; explicit UI states. |
| A12 | Unit spherical circles at poles/date line/antipode and contour lookup crossings; no interpolation across rejected cells. |
| A13 | TauP-generated P/S/PKP/SKS ray assets, cumulative-time bead, manifest boundaries and K core compression label. |
| A14 | Unit epoch/channel rules and browser station selection; actual historical station/channel requests succeed. |
| A15 | Passed: real dated reference and direct on-demand IU.ANMO recording display raw counts/UTC with modeled overlays. |
| A16 | Unit corrupt bytes, streaming cap, gaps/overlaps and envelope spikes; browser 204 path; distinct future/no-channel failure paths implemented. |
| A17 | Browser 429 outage and safe empty shell; offline/stale/CORS/timeout source states implemented. |
| A18 | Unit two-request concurrency, deduplication, host restrictions and Retry-After; cooldown/backoff/foreground policy implemented. Full long-duration polling soak was not performed. |
| A19 | Passed: shared paused replay refresh and malformed coordinate input. City/station/coordinate schema is validated. |
| A20 | Passed: JSON schema separates observations/model; PNG magic bytes and manual readable label overlay checks. |
| A21 | Shell axe has no serious/critical violations; keyboard, responsive fallback and reduced-motion behavior tested/implemented. Full assistive-technology audit remains unperformed. |
| A22 | Partial validation: desktop and mobile emulation screenshots, no horizontal overflow; asset budgets pass. Physical midrange mobile FPS, integrated-GPU FPS, prior-stable browser versions, and comprehensive memory/latency certification remain unperformed. |
| A23 | Production check is recorded in `evidence/production-providers.json` after Pages deploy; the workflow's terminal deployment and actual origin are required evidence. |
| A24 | Passed: MIT authored license, third-party notices, checksummed nested manifests, source links, README, architecture/science/source/deployment/runbook docs and $0 recurring cost ledger. |

## Functional scope

F01–F08: live observations, bounded filters/details, city/station/coordinate receivers, origin replay, history, evidence and local sharing/export. F09–F13: local Earth geometry, approximate P/S cards, history constraints, landmarks and deterministic transport. F14–F17: independent reference rays, station epochs and actual miniSEED evidence with graceful failure. F18–F20: safe hash state and local PNG/JSON/miniSEED export.

S01–S08 use consistent geometry, direct phase scope, correct timestamp units, independent contour crossings, separately labeled surface reference and validated stored TauP assets. N01–N04 cover semantic alternate access, graceful WebGL fallback, local assets and provenance; remaining certification coverage is listed above. D01–D06 use the public static Pages workflow; R01–R04 are documented in the runbook.

## Real provider checks

Local browser origin checks returned HTTP 200 for the live GeoJSON, bounded historical GeoJSON, historical IU station text, ANMO channel text and dataselect miniSEED. The direct viewer decoded 98 segments at 20 Hz with zero disclosed gaps/overlaps for its requested Tohoku/ANMO window. Exact URLs, returned types, byte counts, dates and viewer labels are recorded in the evidence files. Server-side success alone is not used as CORS evidence.

## Known limitations and remaining certification

The application is educational. Missing direct phases and conservative boundary-cell rejection reduce model coverage by design. It has no early warning, risk/damage estimate, station online guarantee, instrument response correction or signal picking. Third-party archive access can fail and is shown explicitly.

Automated browser engine runs and mobile emulation do not constitute all physical devices, prior-stable versions, or full WCAG 2.2 AA conformance. A22's complete hardware benchmark matrix and comprehensive manual assistive-technology checks remain release-certification work; they are not concealed as passed. The source and deployed application are usable while those checks remain open.
