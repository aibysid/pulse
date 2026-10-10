export type Segment = { start: number; rate: number; samples: number[] };
export async function decode(buffer: ArrayBuffer): Promise<Segment[]> {
  // The maintained package's utility module registers a debug element even in its node-only entry.
  if (typeof HTMLElement === "undefined")
    Object.assign(globalThis, {
      HTMLElement: class {},
      customElements: {
        define() {},
        get() {
          return undefined;
        },
      },
    });
  const { miniseed } = await import("seisplotjs/nodeonly");
  const records = miniseed.parseDataRecords(buffer);
  if (!records.length) throw Error("No decodable miniSEED records");
  const segments = records.map((r) => ({
    start: r.header.startTime.toMillis(),
    rate: r.header.sampleRate,
    samples: Array.from(r.decompress()),
  }));
  if (segments.some((s) => !s.rate || s.samples.length === 0))
    throw Error("Unsupported or empty recording");
  return segments.sort((a, b) => a.start - b.start);
}
export function envelope(samples: number[], pixels: number) {
  const stride = Math.max(1, Math.ceil(samples.length / pixels));
  const out: { i: number; min: number; max: number }[] = [];
  for (let i = 0; i < samples.length; i += stride) {
    let min = Infinity,
      max = -Infinity;
    for (let j = i; j < Math.min(i + stride, samples.length); j++) {
      min = Math.min(min, samples[j]);
      max = Math.max(max, samples[j]);
    }
    out.push({ i, min, max });
  }
  return out;
}
export function segmentIssues(segments: Segment[]) {
  let gaps = 0,
    overlaps = 0;
  for (let i = 1; i < segments.length; i++) {
    const end =
      segments[i - 1].start +
      (segments[i - 1].samples.length / segments[i - 1].rate) * 1000;
    const delta = segments[i].start - end;
    if (delta > 1000 / segments[i - 1].rate) gaps++;
    if (delta < -1000 / segments[i - 1].rate) overlaps++;
  }
  return { gaps, overlaps };
}
