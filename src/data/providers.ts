import type { Event, Station } from "./types";
export function safeUrl(s: unknown, host = "earthquake.usgs.gov") {
  try {
    const u = new URL(String(s));
    return u.protocol === "https:" && u.hostname === host ? u.href : null;
  } catch {
    return null;
  }
}
export function normalize(
  raw: unknown,
  provenance: Event["provenance"] = "live",
  fetchedAtMs = Date.now(),
): { events: Event[]; skipped: number; generated: number } {
  const data = raw as {
    type: string;
    features: unknown[];
    metadata?: { generated: number };
  };
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw Error("Data could not be read");
  let skipped = 0;
  const events: Event[] = [];
  for (const item of data.features.slice(0, 2000)) {
    const f = item as {
      id: string;
      properties: Record<string, unknown>;
      geometry: { coordinates: number[] };
    };
    const p = f?.properties,
      c = f?.geometry?.coordinates;
    if (
      !p ||
      p.type !== "earthquake" ||
      !validId(f.id) ||
      !c ||
      !Number.isFinite(c[0]) ||
      !Number.isFinite(c[1]) ||
      Math.abs(c[0]) > 180 ||
      Math.abs(c[1]) > 90 ||
      !Number.isFinite(p.time)
    ) {
      skipped++;
      continue;
    }
    events.push({
      id: f.id,
      originMs: Number(p.time),
      updatedMs:
        typeof p.updated === "number" && Number.isFinite(p.updated)
          ? p.updated
          : null,
      latitudeDeg: c[1],
      longitudeDeg: c[0],
      depthKm: Number.isFinite(c[2]) ? c[2] : null,
      magnitude:
        typeof p.mag === "number" && Number.isFinite(p.mag) ? p.mag : null,
      magnitudeType: typeof p.magType === "string" ? p.magType : null,
      place: typeof p.place === "string" ? p.place : "Location not supplied",
      reviewStatus: typeof p.status === "string" ? p.status : null,
      sourceUrl:
        safeUrl(p.url) ??
        `https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}`,
      detailUrl: safeUrl(p.detail),
      fetchedAtMs,
      provenance,
    });
  }
  return {
    events,
    skipped,
    generated: Number.isFinite(data.metadata?.generated)
      ? Number(data.metadata?.generated)
      : fetchedAtMs,
  };
}
export const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export class ProviderError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status = 0, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
let active = 0;
const queue: (() => void)[] = [];
const inflight = new Map<string, Promise<Response>>();
export async function request(url: string, signal?: AbortSignal, wave = false) {
  if (!safeUrl(url) && !safeUrl(url, "service.earthscope.org"))
    throw Error("Provider not allowed");
  if (!wave && inflight.has(url)) return (await inflight.get(url)!).clone();
  const run = (async () => {
    if (active >= 2) await new Promise<void>((r) => queue.push(r));
    if (signal?.aborted) {
      queue.shift()?.();
      throw new DOMException("Aborted", "AbortError");
    }
    active++;
    try {
      const local = AbortSignal.timeout(wave ? 25000 : 15000);
      const response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        signal: signal ? AbortSignal.any([signal, local]) : local,
      });
      if (!response.ok && response.status !== 204) {
        const retry = response.headers.get("Retry-After");
        throw new ProviderError(
          `Provider returned ${response.status}`,
          response.status,
          retry ? Number(retry) * 1000 || Date.parse(retry) - Date.now() : 0,
        );
      }
      return response;
    } finally {
      active--;
      queue.shift()?.();
    }
  })();
  if (!wave) inflight.set(url, run);
  try {
    return wave ? await run : (await run).clone();
  } finally {
    inflight.delete(url);
  }
}
export async function detail(id: string, signal?: AbortSignal) {
  if (!validId(id)) throw Error("Invalid event ID");
  const r = await request(
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${encodeURIComponent(id)}`,
    signal,
  );
  const f = await r.json();
  return normalize({ type: "FeatureCollection", features: [f] }, "historical")
    .events[0];
}
export function parseTable(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const header =
    lines
      .shift()
      ?.replace(/^#/, "")
      .split("|")
      .map((s) => s.trim()) ?? [];
  return lines
    .filter((s) => s && !s.startsWith("#"))
    .map((s) =>
      Object.fromEntries(s.split("|").map((v, i) => [header[i], v.trim()])),
    );
}
export const epochValid = (start: string, end: string, time: number) =>
  Date.parse(start) <= time && (!end || Date.parse(end) >= time);
export function parseStations(text: string, time: number) {
  const map = new Map<string, Station>();
  for (const p of parseTable(text)) {
    const lat = Number(p.Latitude),
      lon = Number(p.Longitude);
    if (
      p.Network !== "IU" ||
      !/^[A-Z0-9]{1,8}$/.test(p.Station) ||
      !epochValid(p.StartTime, p.EndTime, time) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    const key = p.Network + "." + p.Station;
    const station = {
      network: p.Network,
      station: p.Station,
      lat,
      lon,
      elevation: Number(p.Elevation),
      name: p.SiteName,
      start: p.StartTime,
      end: p.EndTime,
    };
    if (
      !map.has(key) ||
      Date.parse(map.get(key)!.start) < Date.parse(station.start)
    )
      map.set(key, station);
  }
  return [...map.values()];
}
export function chooseChannel(text: string, start: number, end: number) {
  const rows = parseTable(text).filter(
    (p) =>
      ["BHZ", "HHZ"].includes(p.Channel) &&
      (p.Location === "" || /^[A-Z0-9]{1,2}$/.test(p.Location)) &&
      epochValid(p.StartTime, p.EndTime, start) &&
      epochValid(p.StartTime, p.EndTime, end),
  );
  const rank = (p: Record<string, string>) =>
    (p.Channel === "BHZ" ? 0 : 100) +
    (p.Location === "00" ? 0 : p.Location === "" ? 1 : 2);
  return (
    rows.sort(
      (a, b) => rank(a) - rank(b) || a.Location.localeCompare(b.Location),
    )[0] ?? null
  );
}
export async function readBounded(r: Response, limit = 5242880) {
  const reader = r.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("Recording exceeds 5 MiB limit");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return bytes.buffer;
}
export function historyParams(
  start: string,
  end: string,
  mag: number,
  sort: string,
  center?: { lat: number; lon: number; radius: number },
) {
  const a = Date.parse(start),
    b = Date.parse(end + "T23:59:59Z");
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a > b ||
    a < Date.UTC(1900, 0, 1) ||
    b > Date.now() + 86400000 ||
    mag < 0 ||
    mag > 10
  )
    throw Error(
      "Enter valid UTC dates from 1900 through today and magnitude 0–10.",
    );
  if (mag < 4.5 && b - a > 31 * 86400000)
    throw Error("Below M4.5, limit the search to 31 days.");
  if (b - a > 126 * 365.25 * 86400000)
    throw Error("Limit search to 126 years.");
  const params = new URLSearchParams({
    format: "geojson",
    eventtype: "earthquake",
    limit: "2000",
    starttime: start,
    endtime: end + "T23:59:59",
    minmagnitude: String(mag),
    orderby: sort === "magnitude" ? "magnitude" : "time",
  });
  if (center) {
    if (
      Math.abs(center.lat) > 90 ||
      Math.abs(center.lon) > 180 ||
      center.radius <= 0 ||
      center.radius > 20000 ||
      Object.values(center).some((v) => !Number.isFinite(v))
    )
      throw Error("Invalid center or radius.");
    params.set("latitude", String(center.lat));
    params.set("longitude", String(center.lon));
    params.set("maxradiuskm", String(center.radius));
  }
  return params;
}
