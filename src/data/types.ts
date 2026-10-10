export type Event = {
  id: string;
  originMs: number;
  updatedMs: number | null;
  latitudeDeg: number;
  longitudeDeg: number;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string | null;
  place: string;
  reviewStatus: string | null;
  sourceUrl: string;
  detailUrl: string | null;
  fetchedAtMs: number;
  provenance: "live" | "historical" | "referenceSnapshot";
};
export type Receiver = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  station?: Station;
};
export type Station = {
  network: string;
  station: string;
  lat: number;
  lon: number;
  elevation: number;
  name: string;
  start: string;
  end: string;
};
export type Arrival = {
  family: "P" | "S";
  phase: string | null;
  seconds: number | null;
  bound: number | null;
  availability:
    | "valid"
    | "noPhase"
    | "unsupportedDepth"
    | "unvalidatedCell"
    | "unavailable";
};
export type Model = {
  manifest: Manifest;
  times: Float32Array;
  phases: Uint8Array;
  bounds: Float32Array;
};
export type Manifest = {
  schemaVersion: number;
  modelVersion: string;
  depths: number[];
  distances: number[];
  boundaries: { moho: number; coreMantle: number; innerCore: number };
  files: Record<string, { sha256: string; bytes: number }>;
};
export type Ray = {
  id: string;
  phase: string;
  sourceDepthKm: number;
  distanceDeg: number;
  travelSeconds: number;
  path: number[][];
};
