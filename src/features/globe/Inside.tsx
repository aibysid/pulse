import { useEffect, useState, useMemo } from "react";
import { loadModel, verifiedFile } from "../../science/model";
import type { Ray } from "../../data/types";
export default function Inside({
  onBack,
  initialScenario,
  onScenario,
}: {
  onBack: () => void;
  initialScenario?: string | null;
  onScenario?: (id: string) => void;
}) {
  const [rays, setRays] = useState<Ray[]>([]),
    [index, setIndex] = useState(0),
    [time, setTime] = useState(0),
    [play, setPlay] = useState(false),
    [error, setError] = useState(""),
    [boundaries, setBoundaries] = useState({
      moho: 35,
      coreMantle: 2889,
      innerCore: 5153.9,
    });
  useEffect(() => {
    loadModel()
      .then(async (m) => {
        const bytes = await verifiedFile(m.manifest, "rays.json");
        const r = JSON.parse(new TextDecoder().decode(bytes));
        setRays(r);
        const i = r.findIndex((x: Ray) => x.id === initialScenario);
        setIndex(Math.max(0, i));
        setBoundaries(m.manifest.boundaries);
      })
      .catch(() => setError("Reference ray assets unavailable."));
  }, [initialScenario]);
  const ray = rays[index];
  useEffect(() => {
    if (ray) onScenario?.(ray.id);
  }, [ray?.id, onScenario]);
  useEffect(() => {
    if (!play || !ray) return;
    let last = performance.now();
    let id = 0;
    const step = () => {
      const now = performance.now();
      if (document.hidden) {
        setPlay(false);
        return;
      }
      setTime((t) => {
        const v = t + ((now - last) / 1000) * 30;
        if (v >= ray.travelSeconds) {
          setPlay(false);
          return ray.travelSeconds;
        }
        return v;
      });
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [play, ray]);
  const point = (s: number[]) => {
    const r = ((6371 - s[2]) / 6371) * 210;
    return [260 + r * Math.sin(s[1]), 260 - r * Math.cos(s[1])];
  };
  const path = useMemo(
    () =>
      ray?.path
        .map((s, i) => `${i ? "L" : "M"}${point(s).join(",")}`)
        .join(" "),
    [ray],
  );
  let bead: number[] | undefined;
  if (ray) {
    const i = ray.path.findIndex((s) => s[0] >= time);
    if (i > 0) {
      const a = ray.path[i - 1],
        b = ray.path[i],
        f = (time - a[0]) / (b[0] - a[0]);
      bead = point(a.map((v, j) => v + (b[j] - v) * f));
    } else bead = point(ray.path[Math.max(0, i)]);
  }
  return (
    <div className="inside-view">
      <div className="section-heading">
        <span className="eyebrow">EARTH STRUCTURE / IASP91</span>
        <h1>Reference ray scenario</h1>
        <p>See how seismic waves bend and convert through Earth.</p>
      </div>
      <svg
        viewBox="0 0 520 520"
        role="img"
        aria-label="IASP91 Earth cross section with stored TauP reference ray"
      >
        <circle cx="260" cy="260" r="210" fill="#263f54" stroke="#588297" />
        <circle
          cx="260"
          cy="260"
          r={((6371 - boundaries.moho) / 6371) * 210}
          fill="#172d42"
          stroke="#7f9ab1"
        />
        <circle
          cx="260"
          cy="260"
          r={((6371 - boundaries.coreMantle) / 6371) * 210}
          fill="#58442e"
          stroke="#f4ba62"
        />
        <circle
          cx="260"
          cy="260"
          r={((6371 - boundaries.innerCore) / 6371) * 210}
          fill="#a17d4b"
          stroke="#ead3a9"
        />
        <path d="M274 52 L309 39" fill="none" stroke="#b7c4d8" />
        <text x="313" y="43">
          Crust
        </text>
        <text x="274" y="125">
          Mantle
        </text>
        <text x="274" y="180">
          Liquid outer core
        </text>
        <text x="240" y="265">
          Inner core
        </text>
        {path &&
          ray?.path.slice(1).map((sample, i) => {
            const previous = ray.path[i],
              a = point(previous),
              b = point(sample);
            const depth = (sample[2] + previous[2]) / 2;
            const core =
              depth >= boundaries.coreMantle && depth < boundaries.innerCore;
            return (
              <path
                key={i}
                d={`M${a.join(",")}L${b.join(",")}`}
                fill="none"
                stroke={
                  ray.phase.includes("S") && !core ? "#f4ba62" : "#55d6f0"
                }
                strokeWidth="2.5"
              />
            );
          })}
        {ray?.phase.includes("K") && (
          <text x="180" y="230" fill="#55d6f0">
            K · compression
          </text>
        )}
        {bead && <circle cx={bead[0]} cy={bead[1]} r="5" fill="white" />}
      </svg>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <label>
            Reference ray
            <select
              value={index}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setTime(0);
                setPlay(false);
              }}
            >
              {rays.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.phase} · {r.distanceDeg}° · ray {i + 1}
                </option>
              ))}
            </select>
          </label>
          {ray && (
            <>
              <p>
                Source depth {ray.sourceDepthKm} km · angular distance{" "}
                {ray.distanceDeg}°<br />
                Scenario travel time {ray.travelSeconds.toFixed(1)} seconds
              </p>
              <label>
                Ray time
                <input
                  type="range"
                  min="0"
                  max={ray.travelSeconds}
                  step="1"
                  value={time}
                  onChange={(e) => {
                    setTime(Number(e.target.value));
                    setPlay(false);
                  }}
                />
              </label>
              <button
                disabled={
                  matchMedia("(prefers-reduced-motion: reduce)").matches
                }
                onClick={() => setPlay(!play)}
              >
                {play ? "Pause ray" : "Animate reference ray"}
              </button>
            </>
          )}
        </>
      )}
      <p>
        P is compression; S is shear. S cannot travel through the liquid outer
        core as shear. In SKS,{" "}
        <strong>K is a compressional leg in the outer core</strong>; the wave
        converts back to shear in the mantle.
      </p>
      <p className="muted">
        These stored TauP paths explain reference scenarios. They are
        independent of the selected earthquake and its replay clock.
      </p>
      <button onClick={onBack}>Back to event inspector</button>
    </div>
  );
}
