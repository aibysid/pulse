# Operating runbook

The recurring cost ledger is Pages **$0**, USGS public APIs **$0**, EarthScope public data **$0**, local assets **$0**. No subscribed service, billing account, paid API, storage provider or server exists. Provider rules and free limits can change. There is no automatic paid fallback.

## Provider outage (R01)

Keep the last successful observations in memory and label them stale/unavailable. Three consecutive retryable failures suspend automatic requests; explicit Retry remains available after the manual cooldown. Retry delays are 60, 120 and 300 seconds with positive jitter, honoring larger exposed Retry-After. Schema/4xx failures do not retry automatically. Hidden, offline and historical replay clients do not poll. Use the dated historical references and recorded evidence when a provider is unavailable. Never relabel reference snapshots as current observations.

If the service contract changes, update the direct adapter and affected fixtures. Do not add a relay or paid proxy. A station/waveform failure leaves earthquake exploration and model calculations usable.

## Broken release (R02)

Revert the responsible commit on main, confirm checks, and redeploy through the existing workflow. Record release, failure, fix and acceptance criterion. Keep asset checksums aligned with exact bytes; do not bypass integrity checking to clear an error.

## Usage limits (R03)

Inspect static payload and provider request rates. Reduce owned asset weight and nonessential assets first. If a provider restricts this integration, leave a visible unavailable state. A new paid fallback requires a new budget decision. GitHub Pages is an educational public static deployment, not a commercial SaaS stack.

## Maintenance (R04)

Developer-initiated upgrades only. On dependency/model changes run relevant tests, numerical validation and source/license updates. No scheduled data ingestion or cloud cron exists. Optionally recheck provider CORS, station epochs and a dated trace manually. Do not claim guaranteed upstream uptime.
