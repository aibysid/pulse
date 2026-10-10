import { describe, it, expect } from "vitest";
import {
  normalize,
  historyParams,
  epochValid,
  chooseChannel,
  readBounded,
  validId,
  safeUrl,
} from "../src/data/providers";
import { distance, circle } from "../src/science/geometry";
import { lookup, crossings } from "../src/science/model";
import { parseShare } from "../src/app/share";
import { envelope, segmentIssues } from "../src/features/stations/decode";
import fs from "node:fs";
import type { Model, Manifest } from "../src/data/types";
const feature = {
  id: "test001",
  geometry: { coordinates: [140, 35, 30] },
  properties: {
    type: "earthquake",
    time: 100000,
    mag: 5.2,
    magType: "mb",
    place: "Test region",
    updated: 200000,
    status: "reviewed",
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/test001",
  },
};
const collection = (features: unknown[]) => ({
  type: "FeatureCollection",
  features,
  metadata: { generated: 300000 },
});
describe("observations", () => {
  it("preserves units, time and provenance", () => {
    const e = normalize(collection([feature]), "historical", 400000).events[0];
    expect(e.latitudeDeg).toBe(35);
    expect(e.originMs).toBe(100000);
    expect(e.magnitudeType).toBe("mb");
    expect(e.provenance).toBe("historical");
  });
  it("retains null and negative depths while rejecting corrupt coordinates", () => {
    const result = normalize(
      collection([
        {
          ...feature,
          properties: { ...feature.properties, mag: null },
          geometry: { coordinates: [140, 35, -2] },
        },
        { ...feature, geometry: { coordinates: [400, 35, 2] } },
        {
          ...feature,
          properties: { ...feature.properties, type: "quarry blast" },
        },
      ]),
    );
    expect(result.events[0].magnitude).toBeNull();
    expect(result.events[0].depthKm).toBe(-2);
    expect(result.skipped).toBe(2);
  });
  it("rejects invalid schema and unsafe links", () => {
    expect(() => normalize({})).toThrow();
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(validId("../evil")).toBe(false);
    expect(normalize(collection([])).events).toEqual([]);
  });
});
describe("geometry", () => {
  it("handles coincidence, poles, wraparound and antipodes", () => {
    expect(distance(0, 0, 0, 0).km).toBe(0);
    expect(distance(0, 0, 0, 180).degrees).toBe(180);
    expect(distance(0, 179, 0, -179).degrees).toBeCloseTo(2);
    expect(distance(90, 10, 90, 40).km).toBeCloseTo(0);
  });
  it("keeps circles on the sphere with no spikes", () => {
    for (const lat of [0, 90, -90])
      for (const angle of [0, 60, 180]) {
        const ring = circle(lat, 179, angle);
        expect(ring).toHaveLength(257);
        ring.forEach((p) => expect(Math.hypot(...p)).toBeCloseTo(1.008));
      }
  });
});
describe("bounded provider queries", () => {
  it("restricts long low magnitude queries and counts", () => {
    expect(() =>
      historyParams("1900-01-01", "2020-01-01", 2, "time"),
    ).toThrow();
    const q = historyParams("2011-03-10", "2011-03-12", 8, "magnitude");
    expect(q.get("limit")).toBe("2000");
    expect(q.get("eventtype")).toBe("earthquake");
  });
  it("validates station epochs and deterministic channel preference", () => {
    expect(
      epochValid("2000-01-01", "2010-01-01", Date.parse("2011-01-01")),
    ).toBe(false);
    expect(epochValid("2000-01-01", "", Date.parse("2011-01-01"))).toBe(true);
    const text =
      "#Network|Station|Location|Channel|StartTime|EndTime\nIU|ANMO||BHZ|2000-01-01|\nIU|ANMO|00|BHZ|2000-01-01|\nIU|ANMO|00|HHZ|2000-01-01|";
    expect(
      chooseChannel(text, Date.parse("2011-01-01"), Date.parse("2011-01-02"))
        ?.Location,
    ).toBe("00");
  });
  it("enforces streaming payload size and empty responses", async () => {
    await expect(
      readBounded(new Response(new Uint8Array(100)), 50),
    ).rejects.toThrow();
    expect(
      (await readBounded(new Response(null, { status: 204 }))).byteLength,
    ).toBe(0);
  });
});
describe("sharing", () => {
  it("restores paused replay settings and rejects unsafe values", () => {
    const s = parseShare(
      "#/live?mode=replay&event=us123&lat=90&lon=180&t=99999&speed=60",
    );
    expect(s.elapsed).toBe(5400);
    expect(s.receiver?.lat).toBe(90);
    expect(
      parseShare("#/live?lat=999&lon=0&event=../x&speed=9").warning,
    ).not.toBe("");
  });
  it("resolves city coordinates locally", () =>
    expect(parseShare("#/history?receiver=city:new-delhi").receiver?.lon).toBe(
      77.209,
    ));
});
describe("waveform", () => {
  it("retains envelope spikes and identifies gaps and overlaps", () => {
    expect(envelope([0, 0, 100, -50, 0, 0], 1)[0]).toMatchObject({
      min: -50,
      max: 100,
    });
    const segments = [
      { start: 0, rate: 1, samples: [1, 2] },
      { start: 5000, rate: 1, samples: [1, 2] },
      { start: 5000, rate: 1, samples: [1] },
    ];
    expect(segmentIssues(segments)).toEqual({ gaps: 1, overlaps: 1 });
  });
});
const load = (): Model => {
  const b = "public/assets/model/";
  const manifest = JSON.parse(
    fs.readFileSync(b + "manifest.json", "utf8"),
  ) as Manifest;
  const arr = (name: string) => {
    const buffer = fs.readFileSync(b + name);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  };
  return {
    manifest,
    times: new Float32Array(arr("times.bin")),
    phases: new Uint8Array(arr("phases.bin")),
    bounds: new Float32Array(arr("bounds.bin")),
  };
};
describe("validated IASP91 model", () => {
  it("supports reference nodes and refuses unsupported depths and shadow paths", () => {
    const m = load();
    expect(lookup(m, 30, 60, "P").seconds).toBeGreaterThan(500);
    expect(lookup(m, 30, 60, "S").seconds).toBeGreaterThan(900);
    expect(lookup(m, -1, 60, "P").availability).toBe("unsupportedDepth");
    expect(lookup(m, 701, 60, "P").seconds).toBeNull();
    expect(lookup(m, 30, 150, "S").availability).toBe("noPhase");
    expect(lookup(null, 30, 60, "P").availability).toBe("unavailable");
  });
  it("crossings agree with accepted direct arrival functions", () => {
    const m = load(),
      arrival = lookup(m, 30, 60, "P");
    const result = crossings(m, 30, arrival.seconds!, "P");
    expect(result.some((v) => Math.abs(v - 60) < 0.26)).toBe(true);
  });
  it("never interpolates rejected cells", () => {
    const m = load();
    const n = m.bounds.findIndex((v) => v < 0);
    const k = n % 2,
      j = Math.floor(n / 2) % 720,
      i = Math.floor(n / 1440);
    expect(
      lookup(m, i * 10 + 5, (j + 0.5) * 0.25, k ? "S" : "P").seconds,
    ).toBeNull();
  });
});

describe("recorded evidence decoder", () => {
  it("decodes the real bundled Tohoku miniSEED without synthetic samples", async () => {
    const { decode } = await import("../src/features/stations/decode");
    const b = fs.readFileSync("public/assets/reference.mseed");
    const segments = await decode(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    );
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].rate).toBe(20);
    expect(segments[0].start).toBeGreaterThan(
      Date.parse("2011-03-11T05:54:00Z"),
    );
    expect(segments[0].samples.some((v) => v !== 0)).toBe(true);
  });
  it("rejects corrupt miniSEED", async () => {
    const { decode } = await import("../src/features/stations/decode");
    await expect(decode(new ArrayBuffer(128))).rejects.toThrow();
  });
});

describe("TauP reference fixtures", () => {
  it("matches exact stored nodes and preserves missing phases", () => {
    const m = load();
    const fixtures = JSON.parse(
      fs.readFileSync("science/reference-fixtures.json", "utf8"),
    ) as {
      depthKm: number;
      distanceDeg: number;
      arrivals: { phase: string; seconds: number }[];
    }[];
    for (const f of fixtures.filter(
      (f) => f.depthKm % 10 === 0 && (f.distanceDeg * 4) % 1 === 0,
    )) {
      for (const family of ["P", "S"] as const) {
        const reference = f.arrivals.find((a) =>
          (family === "P" ? ["p", "P"] : ["s", "S"]).includes(a.phase),
        );
        const result = lookup(m, f.depthKm, f.distanceDeg, family);
        if (reference) {
          expect(result.seconds).toBeCloseTo(reference.seconds, 2);
          expect(result.phase).toBe(reference.phase);
        } else expect(result.seconds).toBeNull();
      }
    }
  });
});
