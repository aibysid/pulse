# Architecture

The static React/TypeScript/Vite build is published at `/pulse/`. Hash routes require no rewrite server. React state separates normalized event observations, selected inspection object, receiver, wall clock, replay elapsed time and route. Provider strings render as text; no provider HTML is interpreted.

`src/data` contains configuration, normalization, provider safety, request concurrency and export helpers. `src/science` contains spherical geometry, verified table loading, interpolation and a dedicated contour/arrival worker. `src/features/globe` uses Three.js/React Three Fiber, local Natural Earth geometry and a locally generated texture. Event markers are instanced. Ray views and waveform tools load separately; miniSEED uses a decoding worker and an on-demand main-thread fallback.

The scientific payload is about 1 MiB. It loads after the shell, with SHA-256 and byte-length checks. Earth textures and geometry are local; screenshot export cannot be tainted by remote textures. Waveform services are never requested continuously. Request concurrency is capped at two; superseded feeds and history requests are aborted.

A selected event survives feed replacement. Revisions of origin/depth pause replay and recompute model outputs while preserving elapsed seconds. Playback uses performance.now; hidden tabs pause. Feed refresh uses Date.now with cooldown and positive jitter. Provider failure cannot create an observation or change the mathematical model.

No server, authentication, analytics, service worker, archive ingestion or remote font is used. Code notices and numerical/data notices are separate. CSP is a meta policy (Pages does not supply configurable server headers). Styles permit inline declarations because the WebGL/DOM label libraries need them; scripts and workers remain local. Connect hosts are USGS and EarthScope only.
