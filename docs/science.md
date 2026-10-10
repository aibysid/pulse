# Science

Pulse uses ObsPy 1.5.0 TauPyModel `iasp91`, based on Kennett and Engdahl (1991), with spherical radius 6371 km and surface receiver elevation zero. Direct P = earliest p/P; direct S = earliest s/S. Depth domain is 0–700 km; distance domain is 0–180 degrees. No core, diffracted or reflected phase is substituted into a direct card.

## Regenerate

Use Python 3.13. The pinned dependency file records the complete tested environment.

```sh
python3.13 -m venv .venv
. .venv/bin/activate
pip install -r science/requirements-science.txt
python science/generate_tables.py
python science/validate_tables.py
```

The generator initializes one TauPyModel per numerical process, writes 10-km depth and 0.25-degree distance nodes and checks candidate cells at center plus four edge midpoints. Branch continuity checks use phase identity and bounded ray parameter variation. Missing-phase, phase-switch and discontinuity cells are rejected, not interpolated. The current smooth candidate cells all passed with maximum sampled error 0.355 s; therefore no local refinement was necessary. The implementation intentionally exposes rejected boundary cells. Files contain Float32 seconds, phase identity bytes, and accepted cell error bounds. Exact valid stored nodes can still be queried next to rejected cells.

`validate_tables.py` checks every checksum and 500 additional seeded random locations against fresh TauP computations. 468 accepted phase samples had maximum difference 0.128 s. This finite validation evidence does not establish a mathematical bound at all real-valued positions or observational accuracy. The released numerical agreement threshold is two seconds. Asset SHA-256 validation occurs again in CI and in the browser before use.

Generation took 325 seconds with eight local processes on an Apple Silicon host. Five-point validation covered 133315 queries; 51975 phase cells were accepted and 48825 rejected (including no-phase domain). Asset bytes, percentiles, source model checksum and exact generation command are in the model manifest and validation report. Normal web builds consume checked-in files and do not regenerate science assets.

Contours invert each connected accepted interval independently; no monotonic global inversion or constant body-wave speed is used. Stable orthogonal vector bases generate small circles at poles and across the date line. Contours end when the supported arrival function has no crossing. The optional 3.5 km/s surface ring is illustrative and ends at the antipode.

Reference rays are stored cumulative TauP paths: 30 km at 60° P/S, 150° PKP branches and 110° SKS branches. Bead position interpolates cumulative time. Boundary depths come from the IASP91 manifest. K denotes compression in the liquid outer core. The selected earthquake origin is not attached to a reference path.
