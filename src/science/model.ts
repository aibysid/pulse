import { asset } from "../data/config";
import type { Arrival, Manifest, Model } from "../data/types";
let promise: Promise<Model> | undefined;
export async function verifiedFile(manifest: Manifest, name: string) {
  const r = await fetch(asset(`model/${name}`));
  if (!r.ok) throw Error("Model asset unavailable");
  const b = await r.arrayBuffer();
  const expected = manifest.files[name];
  if (
    !expected ||
    b.byteLength !== expected.bytes ||
    b.byteLength > 8 * 1024 * 1024
  )
    throw Error("Invalid model size");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== expected.sha256) throw Error("Model checksum failed");
  return b;
}
export function loadModel() {
  return (promise ??= (async () => {
    const r = await fetch(asset("model/manifest.json"));
    if (!r.ok) throw Error("Model unavailable");
    const manifest: Manifest = await r.json();
    if (
      manifest.schemaVersion !== 1 ||
      manifest.depths.length !== 71 ||
      manifest.distances.length !== 721
    )
      throw Error("Unsupported model");
    const times = await verifiedFile(manifest, "times.bin");
    const phases = await verifiedFile(manifest, "phases.bin");
    const bounds = await verifiedFile(manifest, "bounds.bin");
    return {
      manifest,
      times: new Float32Array(times),
      phases: new Uint8Array(phases),
      bounds: new Float32Array(bounds),
    };
  })());
}
export function lookup(
  m: Model | null,
  depth: number | null,
  deg: number,
  family: "P" | "S",
): Arrival {
  const k = family === "P" ? 0 : 1;
  const result: Arrival = {
    family,
    phase: null,
    seconds: null,
    bound: null,
    availability: "unavailable",
  };
  if (
    depth === null ||
    !Number.isFinite(depth) ||
    depth < 0 ||
    depth > 700 ||
    !Number.isFinite(deg) ||
    deg < 0 ||
    deg > 180
  )
    return { ...result, availability: "unsupportedDepth" };
  if (!m) return result;
  const z = depth / 10,
    d = deg * 4;
  const node = (i: number, j: number) => (i * 721 + j) * 2 + k;
  const exactZ = Math.abs(z - Math.round(z)) < 1e-7,
    exactD = Math.abs(d - Math.round(d)) < 1e-7;
  const phase = (p: number) => (p === 1 ? (k ? "s" : "p") : k ? "S" : "P");
  if (exactZ && exactD) {
    const n = node(Math.round(z), Math.round(d));
    return m.phases[n]
      ? {
          ...result,
          availability: "valid",
          seconds: m.times[n],
          phase: phase(m.phases[n]),
          bound: 0,
        }
      : { ...result, availability: "noPhase" };
  }
  const i = Math.min(69, Math.floor(z)),
    j = Math.min(719, Math.floor(d)),
    a = z - i,
    b = d - j;
  const indices = [
    node(i, j),
    node(i, j + 1),
    node(i + 1, j),
    node(i + 1, j + 1),
  ];
  if (indices.every((n) => !m.phases[n]))
    return { ...result, availability: "noPhase" };
  const bound = m.bounds[(i * 720 + j) * 2 + k];
  if (
    bound < 0 ||
    indices.some((n) => !m.phases[n] || m.phases[n] !== m.phases[indices[0]])
  )
    return { ...result, availability: "unvalidatedCell" };
  const vals = indices.map((n) => m.times[n]);
  return {
    ...result,
    availability: "valid",
    seconds:
      (1 - a) * ((1 - b) * vals[0] + b * vals[1]) +
      a * ((1 - b) * vals[2] + b * vals[3]),
    phase: phase(m.phases[indices[0]]),
    bound,
  };
}
export function crossings(
  m: Model | null,
  depth: number | null,
  seconds: number,
  family: "P" | "S",
) {
  if (!m || depth === null || seconds < 0) return [];
  const out: number[] = [];
  for (let j = 0; j < 720; j++) {
    const a = lookup(m, depth, j * 0.25, family),
      b = lookup(m, depth, (j + 1) * 0.25, family),
      mid = lookup(m, depth, (j + 0.5) * 0.25, family);
    if (
      a.seconds === null ||
      b.seconds === null ||
      mid.seconds === null ||
      a.phase !== b.phase
    )
      continue;
    if (
      (seconds - a.seconds) * (seconds - b.seconds) <= 0 &&
      a.seconds !== b.seconds
    ) {
      out.push((j + (seconds - a.seconds) / (b.seconds - a.seconds)) * 0.25);
    }
  }
  return out;
}
