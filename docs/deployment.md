# Deployment

Authorized account: `aibysid`. Repository: `aibysid/pulse` (public). Pages URL: https://aibysid.github.io/pulse/ . The user explicitly authorized GitHub credentials for building and hosting.

`.github/workflows/pages.yml` pins tested action commits. Main pushes and dispatch build with Node 22.23.3 and `npm ci`, run lint, typecheck, units, asset checks, build and deterministic Chromium browser tests. Pull requests run checks but do not deploy. Build permissions are contents:read. Deployment has pages:write and id-token:write, the `github-pages` environment, and workflow concurrency cancellation.

Pages source is GitHub Actions. `vite.config.ts` uses `/pulse/`; all owned assets use the matching base. Routes are hashes. A deep shared link works on refresh without special 404 behavior.

For rollback, revert the bad main commit and let the same checked workflow deploy. A build alone is not production verification: use the live URL, verify asset loads, provider fetches, a landmark, model outputs, actual waveform decoding and a mobile layout. The acceptance report records the verification scope and any remaining checks.
