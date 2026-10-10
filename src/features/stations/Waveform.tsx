import { useEffect, useRef, useState } from "react";
import { asset } from "../../data/config";
import { chooseChannel, request, readBounded } from "../../data/providers";
import type { Event, Receiver, Arrival } from "../../data/types";
import { decode, envelope, segmentIssues, type Segment } from "./decode";
import { utc, download } from "../../data/export";
async function workerDecode(buffer: ArrayBuffer) {
  const worker = new Worker(new URL("./wave-worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    return await new Promise<Segment[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("Decoder timeout")), 20000);
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        if (e.data.error) reject(Error(e.data.error));
        else resolve(e.data.segments);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        reject(Error("Decoder worker unavailable"));
      };
      const copy = buffer.slice(0);
      worker.postMessage(copy, [copy]);
    });
  } catch {
    return decode(buffer);
  } finally {
    worker.terminate();
  }
}
export default function Waveform({
  event,
  receiver,
  arrivals,
}: {
  event: Event | null;
  receiver: Receiver;
  arrivals: Arrival[];
}) {
  const [segments, setSegments] = useState<Segment[]>([]),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [metadata, setMetadata] = useState<{
      source: string;
      start: number;
      end: number;
      fetched: number;
      channel: string;
      reference: boolean;
      windowLabel: string;
    } | null>(null),
    [mean, setMean] = useState(false),
    [blob, setBlob] = useState<Blob | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    abort.current?.abort();
    setSegments([]);
    setMetadata(null);
    setBlob(null);
    setStatus("");
  }, [event?.id, receiver.id]);
  const load = async (reference = false) => {
    setBusy(true);
    setStatus("Loading recorded samples…");
    setSegments([]);
    setBlob(null);
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    try {
      let bytes: ArrayBuffer, meta: NonNullable<typeof metadata>;
      if (reference) {
        const m = await fetch(asset("reference-waveform.json")).then((r) =>
          r.json(),
        );
        const r = await fetch(asset("reference.mseed"));
        bytes = await readBounded(r);
        meta = {
          source: m.sourceUrl,
          start: Date.parse(m.start),
          end: Date.parse(m.end),
          fetched: Date.parse(m.retrievedAt),
          channel: "IU.ANMO.00.BHZ",
          reference: true,
          windowLabel: "Dated reference window",
        };
      } else {
        if (!event || !receiver.station) throw Error("Choose a station first.");
        const p = arrivals[0].seconds;
        const start = event.originMs + (p === null ? 0 : p - 300) * 1000,
          end = Math.min(Date.now(), start + 1200000);
        if (start >= Date.now())
          throw Error("Recording not yet available. Reload manually later.");
        const station = receiver.station;
        const channelUrl = `https://service.earthscope.org/fdsnws/station/1/query?net=IU&sta=${station.station}&cha=BHZ,HHZ&level=channel&format=text&starttime=${new Date(start).toISOString()}&endtime=${new Date(end).toISOString()}`;
        const channel = chooseChannel(
          await (await request(channelUrl, controller.signal)).text(),
          start,
          end,
        );
        if (!channel)
          throw Error("No vertical channel covers this time window.");
        const source = `https://service.earthscope.org/fdsnws/dataselect/1/query?net=IU&sta=${station.station}&loc=${channel.Location || "--"}&cha=${channel.Channel}&starttime=${new Date(start).toISOString()}&endtime=${new Date(end).toISOString()}`;
        meta = {
          source,
          start,
          end,
          fetched: Date.now(),
          channel: `IU.${station.station}.${channel.Location || "--"}.${channel.Channel}`,
          reference: false,
          windowLabel:
            p === null
              ? "Origin to origin + 20 minutes (no direct P estimate)"
              : "5 minutes before through 15 minutes after modeled direct P",
        };
        setMetadata(meta);
        const r = await request(source, controller.signal, true);
        if (r.status === 204)
          throw Error("No recording returned for this channel and time.");
        bytes = await readBounded(r);
      }
      setMetadata(meta);
      const decoded = await workerDecode(bytes);
      setSegments(decoded);
      setBlob(new Blob([bytes], { type: "application/vnd.fdsn.mseed" }));
      setStatus(
        `${decoded.length} recorded segments · ${segmentIssues(decoded).gaps} gaps · ${segmentIssues(decoded).overlaps} overlaps`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el || !metadata || !segments.length) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const w = 900,
      h = 260;
    el.width = w;
    el.height = h;
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2b3b52";
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(45, 30 + i * 45);
      ctx.lineTo(w - 20, 30 + i * 45);
      ctx.stroke();
    }
    const offsets = segments.map((s) =>
      mean ? s.samples.reduce((a, b) => a + b, 0) / s.samples.length : 0,
    );
    let scale = 1;
    segments.forEach((s, i) =>
      s.samples.forEach((v) => {
        scale = Math.max(scale, Math.abs(v - offsets[i]));
      }),
    );
    ctx.strokeStyle = "#8be0b1";
    segments.forEach((s, j) => {
      ctx.beginPath();
      for (const v of envelope(s.samples, w)) {
        const x =
          45 +
          ((s.start + (v.i / s.rate) * 1000 - metadata.start) /
            (metadata.end - metadata.start)) *
            (w - 65);
        ctx.moveTo(x, 125 - ((v.min - offsets[j]) / scale) * 90);
        ctx.lineTo(x, 125 - ((v.max - offsets[j]) / scale) * 90);
      }
      ctx.stroke();
    });
    if (event && !metadata.reference)
      arrivals.forEach((a, i) => {
        if (a.seconds === null) return;
        const time = event.originMs + a.seconds * 1000;
        if (time < metadata.start || time > metadata.end) return;
        const x =
          45 +
          ((time - metadata.start) / (metadata.end - metadata.start)) *
            (w - 65);
        ctx.strokeStyle = i ? "#f4ba62" : "#55d6f0";
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, 220);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(`Modeled ${a.family}`, x + 4, 18);
      });
    ctx.fillStyle = "#b7c4d8";
    ctx.font = "12px system-ui";
    for (let i = 0; i < 3; i++)
      ctx.fillText(
        new Date(metadata.start + ((metadata.end - metadata.start) * i) / 2)
          .toISOString()
          .slice(11, 19) + " UTC",
        45 + ((w - 130) * i) / 2,
        250,
      );
    ctx.fillText(`±${Math.round(scale)} counts`, 50, 40);
  }, [segments, metadata, arrivals, event, mean]);
  return (
    <section className="waveform">
      <h2>Recorded evidence</h2>
      <p>
        Archive recordings are observations. A modeled station arrival is a
        prediction, not a detection.
      </p>
      <div className="button-row">
        <button
          disabled={busy || !receiver.station || !event}
          onClick={() => load()}
        >
          Load {receiver.station ? receiver.name : "station"} recording
        </button>
        <button disabled={busy} onClick={() => load(true)}>
          Dated Tohoku reference
        </button>
      </div>
      <p role="status">{status}</p>
      {metadata && (
        <>
          <strong>
            {metadata.reference
              ? "Dated reference recording · 2011 Tohoku"
              : "On demand archive recording"}{" "}
            · {metadata.channel}
          </strong>
          <p>
            {metadata.windowLabel}
            <br />
            {utc(metadata.start)} — {utc(metadata.end)}
            <br />
            Fetched {utc(metadata.fetched)} · EarthScope
          </p>
          <a href={metadata.source} target="_blank" rel="noreferrer">
            Exact archive request ↗
          </a>
        </>
      )}
      {segments.length > 0 && (
        <>
          <canvas
            ref={canvas}
            aria-label="Recorded waveform in raw instrument counts against UTC time"
          />
          <p>
            Raw instrument counts · sampling rates{" "}
            {Array.from(new Set(segments.map((s) => s.rate))).join(", ")} Hz.
            Gaps break the trace; overlaps are retained.
          </p>
          <label>
            <input
              type="checkbox"
              checked={mean}
              onChange={(e) => setMean(e.target.checked)}
            />{" "}
            Remove segment mean (display only)
          </label>
          <button
            onClick={() => blob && download(blob, "pulse-recording.mseed")}
          >
            Download original miniSEED
          </button>
        </>
      )}
    </section>
  );
}
