import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { asset, cities, config } from "../data/config";
import type { Event, Receiver, Station, Model, Arrival } from "../data/types";
import {
  detail,
  normalize,
  request,
  ProviderError,
  parseStations,
  historyParams,
} from "../data/providers";
import { distance } from "../science/geometry";
import { loadModel, lookup } from "../science/model";
import { parseShare, shareUrl } from "./share";
import { download, utc } from "../data/export";
const Globe = lazy(() => import("../features/globe/Globe"));
const Inside = lazy(() => import("../features/globe/Inside"));
const Waveform = lazy(() => import("../features/stations/Waveform"));
type Landmark = { name: string; retrievedAt: string; feature: unknown };
const initial = parseShare(location.hash);
const duration = (s: number) => {
  const n = Math.max(0, Math.round(Math.abs(s)));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
};
const pref = (k: string) => {
  try {
    return localStorage.getItem("pulse:" + k);
  } catch {
    return null;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem("pulse:" + k, v);
  } catch {
    /* storage unavailable */
  }
};
export default function App() {
  const [route, setRoute] = useState(initial.route),
    [scenario, setScenario] = useState(initial.scenario ?? undefined),
    [mode, setMode] = useState<"live" | "replay">(initial.mode),
    [events, setEvents] = useState<Event[]>([]),
    [historicalEvents, setHistoricalEvents] = useState<Event[]>([]),
    [selected, setSelected] = useState<Event | null>(null),
    [receiver, setReceiver] = useState<Receiver>(
      initial.receiver ??
        cities.find((c) => c.id === pref("city")) ??
        cities[0],
    ),
    [period, setPeriod] = useState("day"),
    [minMag, setMinMag] = useState(4.5),
    [filter, setFilter] = useState(""),
    [sort, setSort] = useState("time"),
    [generated, setGenerated] = useState(0),
    [fetched, setFetched] = useState(0),
    [loading, setLoading] = useState(true),
    [feedError, setFeedError] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [now, setNow] = useState(Date.now()),
    [elapsed, setElapsed] = useState(initial.elapsed),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(initial.speed),
    [model, setModel] = useState<Model | null>(null),
    [modelError, setModelError] = useState(""),
    [contours, setContours] = useState<number[][]>([[], []]),
    [grid, setGrid] = useState(true),
    [stationEnabled, setStationEnabled] = useState(pref("stations") === "true"),
    [stations, setStations] = useState<Station[]>([]),
    [stationStatus, setStationStatus] = useState(""),
    [surface, setSurface] = useState(false),
    [pick, setPick] = useState(false),
    [focus, setFocus] = useState(false),
    [zoom, setZoom] = useState(0),
    [sceneReady, setSceneReady] = useState(false),
    [landmarks, setLandmarks] = useState<Landmark[]>([]),
    [notice, setNotice] = useState(initial.warning),
    [tab, setTab] = useState("events"),
    [sheet, setSheet] = useState("half"),
    [wave, setWave] = useState(false),
    [hint, setHint] = useState(pref("hint") !== "dismissed"),
    [hstart, setHstart] = useState(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [hend, setHend] = useState(new Date().toISOString().slice(0, 10)),
    [hmag, setHmag] = useState(6),
    [hcenter, setHcenter] = useState(false),
    [hlat, setHlat] = useState(""),
    [hlon, setHlon] = useState(""),
    [hradius, setHradius] = useState("1000"),
    [historyLoading, setHistoryLoading] = useState(false),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState(""),
    [coordError, setCoordError] = useState(""),
    [citySearch, setCitySearch] = useState("");
  const canvas = useRef<HTMLCanvasElement | null>(null),
    lastAttempt = useRef(0),
    failures = useRef(0),
    retryAt = useRef(0),
    feedAbort = useRef<AbortController | null>(null),
    historyAbort = useRef<AbortController | null>(null),
    worker = useRef<Worker | null>(null),
    seq = useRef(0),
    sharedLoaded = useRef(false),
    historyCache = useRef(new Map<string, ReturnType<typeof normalize>>()),
    stationCache = useRef(new Map<string, { time: number; data: Station[] }>());
  const selectedRef = useRef(selected),
    modeRef = useRef(mode);
  selectedRef.current = selected;
  modeRef.current = mode;
  const navigate = (next: string) => {
    setRoute(next);
    history.replaceState(null, "", `#${next}`);
    setTab("events");
  };
  const choose = useCallback((e: Event, replay = false) => {
    setSelected(e);
    setFocus(true);
    setPlaying(false);
    setElapsed(0);
    setWave(false);
    if (replay || modeRef.current === "replay") setMode("replay");
    setTab("details");
  }, []);
  const feed = useCallback(
    async (manual = false) => {
      if (document.hidden || !navigator.onLine || modeRef.current !== "live")
        return;
      const time = Date.now();
      if (!manual && time - lastAttempt.current < 60000) return;
      if (manual && time - lastAttempt.current < 15000) return;
      if (!manual && (failures.current >= 3 || time < retryAt.current)) return;
      lastAttempt.current = time;
      feedAbort.current?.abort();
      const controller = new AbortController();
      feedAbort.current = controller;
      setLoading(true);
      try {
        const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMag === 2.5 ? "2.5" : "4.5"}_${period}.geojson`;
        const r = await request(url, controller.signal);
        const data = normalize(await r.json());
        setEvents(data.events);
        setGenerated(data.generated);
        setFetched(Date.now());
        setFeedError("");
        failures.current = 0;
        retryAt.current = 0;
        const current = selectedRef.current;
        if (!current && !initial.eventId) {
          const newest = [...data.events]
            .filter((e) => e.magnitude !== null && e.magnitude >= minMag)
            .sort((a, b) => b.originMs - a.originMs)[0];
          if (newest) setSelected(newest);
        } else if (current) {
          const updated = data.events.find((e) => e.id === current.id);
          if (updated && updated.updatedMs !== current.updatedMs) {
            setSelected(updated);
            if (
              updated.originMs !== current.originMs ||
              updated.depthKm !== current.depthKm
            ) {
              setNotice("Updated event data · model recalculated");
              setPlaying(false);
            }
          }
        }
        if (data.skipped)
          setNotice(
            `${data.skipped} malformed or non-earthquake records skipped.`,
          );
      } catch (error) {
        if (controller.signal.aborted) return;
        failures.current++;
        const p = error as ProviderError;
        const retryable = !p.status || p.status === 429 || p.status >= 500;
        retryAt.current = retryable
          ? Date.now() +
            Math.max(
              [60000, 120000, 300000][Math.min(2, failures.current - 1)] *
                (1 + Math.random() * 0.1),
              p.retryAfter || 0,
            )
          : Infinity;
        if (!retryable) failures.current = 3;
        setFeedError(
          "USGS source unavailable. Last observations are retained; Retry or explore a historical reference.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [period, minMag],
  );
  useEffect(() => {
    lastAttempt.current = 0;
    failures.current = 0;
    retryAt.current = 0;
  }, [period, minMag]);
  useEffect(() => {
    if (route === "/history" || mode !== "live") return;
    void feed();
    const timer = setInterval(
      () => {
        if (Date.now() - lastAttempt.current >= 60000) void feed();
      },
      60000 + Math.random() * 6000,
    );
    const visibility = () => {
      if (!document.hidden && Date.now() - lastAttempt.current >= 60000)
        void feed();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      feedAbort.current?.abort();
    };
  }, [feed, mode, route]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const net = () => setOnline(navigator.onLine);
    addEventListener("online", net);
    addEventListener("offline", net);
    const hash = () => {
      const state = parseShare(location.hash);
      setRoute(state.route);
    };
    addEventListener("hashchange", hash);
    return () => {
      clearInterval(timer);
      removeEventListener("online", net);
      removeEventListener("offline", net);
      removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    let active = true;
    loadModel()
      .then((m) => {
        if (!active) return;
        setModel(m);
        const w = new Worker(new URL("../science/worker.ts", import.meta.url), {
          type: "module",
        });
        w.postMessage({ type: "init", model: m });
        w.onmessage = (e) => {
          if (e.data.id === seq.current) setContours(e.data.contours);
        };
        worker.current = w;
      })
      .catch((e) => setModelError(e.message));
    fetch(asset("landmarks.json"))
      .then((r) => r.json())
      .then((x) => active && setLandmarks(x))
      .catch(() => setNotice("Historical references unavailable."));
    return () => {
      active = false;
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    if (!initial.eventId || sharedLoaded.current || !landmarks.length) return;
    sharedLoaded.current = true;
    detail(initial.eventId)
      .then((e) => {
        if (!e) throw Error();
        setSelected(e);
        setFocus(true);
      })
      .catch(() => {
        const snap = landmarks.find(
          (l) => (l.feature as { id: string }).id === initial.eventId,
        );
        if (snap)
          setSelected(
            normalize(
              { type: "FeatureCollection", features: [snap.feature] },
              "referenceSnapshot",
              Date.parse(snap.retrievedAt),
            ).events[0],
          );
        else
          setNotice(
            "Shared event unavailable. Explore current observations or a reference.",
          );
      });
  }, [landmarks]);
  useEffect(() => {
    if (!playing || mode !== "replay") return;
    let last = performance.now(),
      lastRender = last,
      frame = 0;
    const tick = () => {
      const time = performance.now();
      if (document.hidden) {
        setPlaying(false);
        return;
      }
      if (time - lastRender >= 100) {
        const delta = (time - last) / 1000;
        setElapsed((t) => {
          const next = t + delta * speed;
          if (next >= 5400) {
            setPlaying(false);
            return 5400;
          }
          return next;
        });
        last = time;
        lastRender = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [playing, mode, speed]);
  const activeClock =
    mode === "replay" && selected ? selected.originMs + elapsed * 1000 : now;
  const seconds = selected ? (activeClock - selected.originMs) / 1000 : 0;
  const geo = selected
    ? distance(
        selected.latitudeDeg,
        selected.longitudeDeg,
        receiver.lat,
        receiver.lon,
      )
    : { degrees: 0, km: 0 };
  const arrivals = useMemo(
    () =>
      ["P", "S"].map((f) =>
        lookup(model, selected?.depthKm ?? null, geo.degrees, f as "P" | "S"),
      ),
    [model, selected?.depthKm, geo.degrees],
  );
  useEffect(() => {
    if (!selected || !model) return;
    const id = ++seq.current;
    worker.current?.postMessage({
      type: "compute",
      id,
      depth: selected.depthKm,
      degrees: geo.degrees,
      elapsed: Math.floor(seconds),
    });
  }, [
    model,
    selected?.id,
    selected?.depthKm,
    geo.degrees,
    Math.floor(seconds),
  ]);
  useEffect(() => {
    if (!stationEnabled && !initial.receiver?.id.includes(".")) return;
    const controller = new AbortController();
    const time = selected?.originMs ?? Date.now();
    const epoch = new Date(time).toISOString();
    const key = `IU:${epoch}`;
    const cached = stationCache.current.get(key);
    if (cached && Date.now() - cached.time < 21600000) {
      setStations(cached.data);
      return;
    }
    setStationStatus("Loading station epochs…");
    const params = new URLSearchParams({
      net: "IU",
      level: "station",
      format: "text",
      startbefore: epoch,
      endafter: epoch,
    });
    request(
      `https://service.earthscope.org/fdsnws/station/1/query?${params}`,
      controller.signal,
    )
      .then((r) => r.text())
      .then((text) => {
        let data = parseStations(text, time);
        if (data.length > 200) {
          data = data
            .sort(
              (a, b) =>
                distance(
                  selected?.latitudeDeg ?? 0,
                  selected?.longitudeDeg ?? 0,
                  a.lat,
                  a.lon,
                ).km -
                distance(
                  selected?.latitudeDeg ?? 0,
                  selected?.longitudeDeg ?? 0,
                  b.lat,
                  b.lon,
                ).km,
            )
            .slice(0, 200);
          setStationStatus("Nearest 200 station subset");
        } else
          setStationStatus(
            `${data.length} IU stations · metadata, not online status`,
          );
        stationCache.current.set(key, { time: Date.now(), data });
        setStations(data);
        if (
          initial.receiver?.id.includes(".") &&
          receiver.name === "Coordinate receiver"
        ) {
          const station = data.find(
            (s) => s.network + "." + s.station === initial.receiver?.id,
          );
          if (station)
            setReceiver({
              id: initial.receiver.id,
              name: initial.receiver.id,
              lat: station.lat,
              lon: station.lon,
              station,
            });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStationStatus("Station metadata unavailable");
      });
    return () => controller.abort();
  }, [stationEnabled, selected?.id]);
  const setRecv = (r: Receiver) => {
    setReceiver(r);
    setPick(false);
    if (cities.some((c) => c.id === r.id)) save("city", r.id);
    setCoordError("");
  };
  const landmark = async (l: Landmark) => {
    const snap = normalize(
      { type: "FeatureCollection", features: [l.feature] },
      "referenceSnapshot",
      Date.parse(l.retrievedAt),
    ).events[0];
    choose(snap, true);
    setHistoricalEvents((previous) => [
      snap,
      ...previous.filter((e) => e.id !== snap.id),
    ]);
    setRoute("/history");
    setNotice(
      `Dated USGS reference · retrieved ${utc(Date.parse(l.retrievedAt))}`,
    );
    try {
      const fresh = await detail(snap.id);
      if (fresh) {
        setSelected(fresh);
        setNotice("Historical USGS event · fresh catalog detail");
      }
    } catch {
      /* dated snapshot is already displayed */
    }
  };
  const search = async () => {
    setHistoryLoading(true);
    setNotice("");
    historyAbort.current?.abort();
    historyAbort.current = new AbortController();
    try {
      const params = historyParams(
        hstart,
        hend,
        hmag,
        sort,
        hcenter
          ? { lat: Number(hlat), lon: Number(hlon), radius: Number(hradius) }
          : undefined,
      );
      const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
      let result = historyCache.current.get(url);
      if (!result) {
        result = normalize(
          await (await request(url, historyAbort.current.signal)).json(),
          "historical",
        );
        historyCache.current.set(url, result);
        if (historyCache.current.size > 10)
          historyCache.current.delete(
            historyCache.current.keys().next().value!,
          );
      }
      setHistoricalEvents(result.events);
      setMode("replay");
      setPlaying(false);
      setGenerated(result.generated);
      setFetched(Date.now());
      if (result.events[0]) choose(result.events[0], true);
      setNotice(
        result.events.length === 2000
          ? "Results may be truncated; narrow your search."
          : `${result.events.length} historical results`,
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  };
  const listed = route === "/history" ? historicalEvents : events;
  const visible = useMemo(
    () =>
      listed
        .filter(
          (e) =>
            e.magnitude !== null &&
            e.magnitude >= (route === "/history" ? hmag : minMag) &&
            (e.place + " " + e.id).toLowerCase().includes(filter.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "magnitude"
            ? (b.magnitude ?? -1) - (a.magnitude ?? -1)
            : sort === "depth"
              ? (b.depthKm ?? -1) - (a.depthKm ?? -1)
              : b.originMs - a.originMs,
        ),
    [listed, minMag, hmag, route, filter, sort],
  );
  const ready = useCallback((c: HTMLCanvasElement) => {
    canvas.current = c;
    setSceneReady(true);
  }, []);
  const fallbackReady = useCallback(() => {
    canvas.current = null;
    setSceneReady(true);
  }, []);
  const copy = async () => {
    if (!selected) return;
    const url = shareUrl(
      route,
      selected.id,
      receiver,
      mode,
      seconds,
      speed,
      scenario,
    );
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Paused replay link copied.");
    } catch {
      setNotice(`Share link: ${url}`);
    }
  };
  const exportJson = () => {
    if (selected)
      download(
        new Blob(
          [
            JSON.stringify(
              {
                schemaVersion: 1,
                observation: selected,
                receiver,
                model: {
                  name: model?.manifest.modelVersion ?? "unavailable",
                  arrivals,
                },
                mode,
                activeClockMs: activeClock,
                exportedAt: utc(Date.now()),
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "pulse-event.json",
      );
  };
  const screenshot = () => {
    if (!selected) return;
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 1050;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, c.width, c.height);
    if (canvas.current) ctx.drawImage(canvas.current, 200, 0, 1000, 710);
    else {
      ctx.fillStyle = "#102b43";
      ctx.fillRect(80, 100, 1240, 550);
      ctx.fillStyle = "#ff806f";
      ctx.beginPath();
      ctx.arc(
        80 + ((selected.longitudeDeg + 180) / 360) * 1240,
        100 + ((90 - selected.latitudeDeg) / 180) * 550,
        8,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = "#101827";
    ctx.fillRect(0, 710, 1400, 340);
    ctx.fillStyle = "#f3f6fc";
    ctx.font = "bold 30px system-ui";
    ctx.fillText(
      `PULSE · M${selected.magnitude ?? "?"} · ${selected.place}`,
      40,
      758,
      1320,
    );
    ctx.font = "18px system-ui";
    const lines = [
      `Event ${selected.id} · depth ${selected.depthKm ?? "unknown"} km · Origin ${utc(selected.originMs)}`,
      `${mode.toUpperCase()} · active clock ${utc(activeClock)} · Receiver ${receiver.name} (${receiver.lat}, ${receiver.lon})`,
      "IASP91 approximate direct arrivals · model output, not an alert",
      ...arrivals.map(
        (a) =>
          `${a.family}: ${a.seconds === null ? a.availability : `≈ ${Math.round(a.seconds)} seconds · ${utc(selected.originMs + a.seconds * 1000)}`}`,
      ),
      "Sources: USGS observations · Natural Earth basemap · ObsPy TauP / IASP91",
      `Export UTC ${utc(Date.now())} · provenance ${selected.provenance}`,
    ];
    lines.forEach((s, i) => ctx.fillText(s, 40, 800 + i * 30, 1320));
    c.toBlob((b) => b && download(b, "pulse-earthquake.png"));
  };
  const returnLive = () => {
    setMode("live");
    setPlaying(false);
    navigate("/live");
  };
  const status = !online
    ? "Offline"
    : feedError
      ? "Source unavailable"
      : loading
        ? "Retrieving observations"
        : generated && now - generated > 300000
          ? "Stale feed"
          : "Feed updated";
  function arrivalCard(a: Arrival) {
    const delta =
      a.seconds === null
        ? null
        : (selected!.originMs + a.seconds * 1000 - activeClock) / 1000;
    const unavailable =
      a.availability === "unsupportedDepth"
        ? "Model unavailable for this depth"
        : a.availability === "noPhase"
          ? `No direct ${a.family} arrival in this model and scope`
          : a.availability === "unvalidatedCell"
            ? "Model unavailable near a phase boundary"
            : "Modeled features unavailable";
    return (
      <div className={`arrival ${a.family.toLowerCase()}`} key={a.family}>
        <div>
          <strong>
            {a.family} <small>/ Approximate {a.phase ?? ""}</small>
          </strong>
          <span>{a.seconds === null ? "—" : `≈ ${duration(a.seconds)}`}</span>
        </div>
        {delta === null ? (
          <p>{unavailable}</p>
        ) : (
          <>
            <p>
              {delta > 0 ? "Arrives in" : "Modeled arrival passed"}{" "}
              <strong>{duration(delta)}</strong>
              {delta <= 0 ? " ago" : ""}
            </p>
            <small>{utc(selected!.originMs + a.seconds! * 1000)}</small>
          </>
        )}
      </div>
    );
  }
  return (
    <>
      <header className="header">
        <a
          className="brand"
          href="#/live"
          onClick={() => navigate("/live")}
          aria-label="Pulse live"
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" />
            <path
              d="M5 16h6l3-7 4 14 3-7h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          PULSE
        </a>
        <nav aria-label="Main">
          <button
            className={route === "/live" ? "active" : ""}
            onClick={returnLive}
          >
            Live
          </button>
          <button
            className={route === "/history" ? "active" : ""}
            onClick={() => navigate("/history")}
          >
            Explore history
          </button>
        </nav>
        <span className={`mode-badge ${mode}`}>
          {mode === "live"
            ? "● LIVE"
            : `REPLAY · ${playing ? "PLAYING" : "PAUSED"}`}
        </span>
        <time className="header-clock">
          {new Date(now).toISOString().slice(11, 19)} UTC
        </time>
        <button onClick={() => navigate("/about")}>Sources</button>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {route === "/about" ? (
        <main className="about">
          <span className="eyebrow">OBSERVATION / MODEL / REFERENCE</span>
          <h1>Sources & methodology</h1>
          <p>
            Pulse is an independent educational earthquake explorer. It does not
            predict earthquakes, shaking intensity, or tsunami arrival, and it
            does not provide early warnings.
          </p>
          <h2>Three different kinds of evidence</h2>
          <div className="about-grid">
            <article>
              <h3>Observed</h3>
              <p>
                Earthquake records are USGS catalog observations. IU station
                epochs and requested raw recordings come from EarthScope. A
                catalog record can be revised. Station metadata does not
                establish recording availability.
              </p>
            </article>
            <article>
              <h3>Modeled</h3>
              <p>
                Approximate direct arrivals use{" "}
                {model?.manifest.modelVersion ?? "IASP91 / ObsPy TauP"}. We
                select the earliest p/P and s/S families at zero receiver
                elevation. No PKP, Pdiff, or SKS arrival is substituted into a
                direct P or S card.
              </p>
            </article>
            <article>
              <h3>Reference</h3>
              <p>
                Interior rays are separately generated scenarios. Dated USGS
                snapshots and the Tohoku miniSEED recording remain dated
                references whenever displayed. They are never labeled live.
              </p>
            </article>
          </div>
          <h2>Numerical scope</h2>
          <p>
            Earth radius is 6371 km. Tables cover depth 0–700 km and distance
            0–180°. Accepted cells match TauP within two seconds in the
            committed validation samples. Phase identity and ray parameter
            checks reject boundary cells. This numerical agreement is not an
            accuracy guarantee for the real Earth: local geology, elevation and
            lateral velocity variations are omitted. Contours are equal modeled
            arrival-time loci.
          </p>
          <p>
            No direct S arrival does not imply no seismic signals or no risk.
            The optional surface ring is an illustrative fixed speed of 3.5
            km/s, not a Love or Rayleigh solution.
          </p>
          <h2>Data and code</h2>
          <ul>
            <li>
              <a
                href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php"
                target="_blank"
                rel="noreferrer"
              >
                USGS summary feeds
              </a>{" "}
              and{" "}
              <a
                href="https://earthquake.usgs.gov/fdsnws/event/1/"
                target="_blank"
                rel="noreferrer"
              >
                event catalog
              </a>
            </li>
            <li>
              <a
                href="https://service.earthscope.org/fdsnws/"
                target="_blank"
                rel="noreferrer"
              >
                EarthScope FDSN station and dataselect services
              </a>{" "}
              · IU Global Seismographic Network, operated by USGS and partners
            </li>
            <li>
              <a
                href="https://docs.obspy.org/packages/obspy.taup.html"
                target="_blank"
                rel="noreferrer"
              >
                ObsPy TauP
              </a>{" "}
              · IASP91 (Kennett & Engdahl 1991) · LGPL-3.0
            </li>
            <li>Natural Earth 110m land · public domain · local geometry</li>
            <li>
              <a
                href="https://www.geonames.org/"
                target="_blank"
                rel="noreferrer"
              >
                GeoNames
              </a>{" "}
              · CC BY representative city coordinate review
            </li>
            <li>Seisplotjs 3.2.7 miniSEED decoder · MIT</li>
            <li>
              <a
                href="https://github.com/aibysid/pulse"
                target="_blank"
                rel="noreferrer"
              >
                Source repository
              </a>{" "}
              · MIT authored code
            </li>
          </ul>
          <p>
            No accounts, analytics, ads, paid services, or server proxy.
            Preferences alone are saved in your browser.
          </p>
          <button
            onClick={() => {
              for (const key of ["city", "stations", "hint"])
                localStorage.removeItem("pulse:" + key);
              setNotice("Pulse preferences cleared.");
            }}
          >
            Reset preferences
          </button>
          <button onClick={() => navigate("/live")}>Back to explorer</button>
        </main>
      ) : (
        <main className={`workspace sheet-${sheet} tab-${tab}`}>
          <div className="mobile-tabs">
            <button
              onClick={() => {
                setTab("events");
                setSheet("half");
              }}
            >
              Events
            </button>
            <button
              onClick={() => {
                setTab("details");
                setSheet("half");
              }}
            >
              Details
            </button>
            <button
              onClick={() => {
                setTab("receiver");
                setSheet("half");
              }}
            >
              Receiver
            </button>
            <button
              aria-label="Change sheet height"
              onClick={() =>
                setSheet(
                  sheet === "half"
                    ? "expanded"
                    : sheet === "expanded"
                      ? "collapsed"
                      : "half",
                )
              }
            >
              {sheet === "expanded" ? "↓" : "↑"}
            </button>
          </div>
          <aside className="event-rail" aria-label="Earthquake events">
            <div className="rail-title">
              <span className="eyebrow">GLOBAL ACTIVITY</span>
              <h1>
                Earthquakes <span>{visible.length}</span>
              </h1>
            </div>
            {route === "/history" ? (
              <>
                <div className="landmarks">
                  <span className="eyebrow">LANDMARK REPLAYS</span>
                  {landmarks.map((l) => (
                    <button key={l.name} onClick={() => landmark(l)}>
                      <span>{l.name}</span>
                      <span>↗</span>
                    </button>
                  ))}
                </div>
                <form
                  className="history-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search();
                  }}
                >
                  <label>
                    Start UTC date
                    <input
                      type="date"
                      value={hstart}
                      min="1900-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setHstart(e.target.value)}
                    />
                  </label>
                  <label>
                    End UTC date
                    <input
                      type="date"
                      value={hend}
                      min="1900-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setHend(e.target.value)}
                    />
                  </label>
                  <label>
                    Minimum magnitude
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step=".1"
                      value={hmag}
                      onChange={(e) => setHmag(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={hcenter}
                      onChange={(e) => setHcenter(e.target.checked)}
                    />{" "}
                    Search near coordinates
                  </label>
                  {hcenter && (
                    <>
                      <input
                        aria-label="History latitude"
                        placeholder="Latitude"
                        required
                        value={hlat}
                        onChange={(e) => setHlat(e.target.value)}
                      />
                      <input
                        aria-label="History longitude"
                        placeholder="Longitude"
                        required
                        value={hlon}
                        onChange={(e) => setHlon(e.target.value)}
                      />
                      <input
                        aria-label="Radius kilometers"
                        type="number"
                        value={hradius}
                        onChange={(e) => setHradius(e.target.value)}
                      />
                    </>
                  )}
                  <button className="primary" disabled={historyLoading}>
                    {historyLoading ? "Searching…" : "Search catalog"}
                  </button>
                </form>
              </>
            ) : (
              <div className="filter-row">
                <label>
                  Period
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="hour">1 hour</option>
                    <option value="day">24 hours</option>
                    <option value="week">7 days</option>
                    <option value="month">30 days</option>
                  </select>
                </label>
                <label>
                  Magnitude
                  <select
                    value={minMag}
                    onChange={(e) => setMinMag(Number(e.target.value))}
                  >
                    <option value={2.5}>M2.5+</option>
                    <option value={4.5}>M4.5+</option>
                    <option value={6}>M6.0+</option>
                  </select>
                </label>
              </div>
            )}
            <label className="search-label">
              <span className="sr-only">Filter places or event IDs</span>
              <input
                placeholder="Search places or event IDs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <div className="sort-row">
              <small>
                {visible.length} filtered / {listed.length} returned
              </small>
              <select
                aria-label="Sort events"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="time">Newest</option>
                <option value="magnitude">Largest</option>
                {route !== "/history" && <option value="depth">Deepest</option>}
              </select>
            </div>
            <div className="event-list">
              {loading && route !== "/history" && events.length === 0 ? (
                <p className="muted">Retrieving USGS observations…</p>
              ) : visible.length === 0 ? (
                <div className="empty">
                  <p>
                    {route === "/history"
                      ? "Submit a search or choose a landmark replay."
                      : "No earthquakes match these filters."}
                  </p>
                  <button
                    onClick={() => {
                      setMinMag(4.5);
                      setFilter("");
                      setPeriod("day");
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                visible.map((e) => (
                  <button
                    key={e.id}
                    className={`event-row ${selected?.id === e.id ? "selected" : ""}`}
                    onClick={() => choose(e, route === "/history")}
                    aria-pressed={selected?.id === e.id}
                  >
                    <span className="event-mag">
                      {e.magnitude === null
                        ? "M?"
                        : `M${e.magnitude.toFixed(1)}`}
                    </span>
                    <span className="event-summary">
                      <strong>{e.place}</strong>
                      {e.provenance === "live" &&
                        Date.now() - e.fetchedAtMs < 65000 &&
                        e.originMs > e.fetchedAtMs - 60000 && (
                          <small className="healthy">New</small>
                        )}
                      <small>
                        {new Date(e.originMs).toISOString().slice(11, 16)} UTC ·{" "}
                        {e.depthKm === null
                          ? "Unknown depth"
                          : `${e.depthKm.toFixed(1)} km`}
                      </small>
                      {selected?.id === e.id && (
                        <small className="selected-text">
                          Selected{" "}
                          {mode === "replay" ? "for replay" : "observation"}
                        </small>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
            <footer className="feed-status">
              <span className={feedError || !online ? "warning" : "healthy"}>
                ● {status}
              </span>
              {generated > 0 && <small>{utc(generated)}</small>}
              {feedError && <p>{feedError}</p>}
              <button
                disabled={now - lastAttempt.current < 15000}
                onClick={() => {
                  failures.current = 0;
                  retryAt.current = 0;
                  void feed(true);
                }}
              >
                Refresh / Retry
              </button>
              <small>Retrieved {fetched ? utc(fetched) : "—"}</small>
              <small>Observations: USGS · not alerts</small>
            </footer>
          </aside>
          <section className="stage" aria-label="Earth explorer">
            {route === "/inside" ? (
              <Suspense fallback={<p>Loading reference rays…</p>}>
                <Inside
                  onBack={() => navigate("/live")}
                  initialScenario={scenario}
                  onScenario={setScenario}
                />
              </Suspense>
            ) : (
              <>
                <div className="stage-heading">
                  <span className="eyebrow">EARTHQUAKE OBSERVATIONS</span>
                  <h2>A planet in motion.</h2>
                  <p>
                    {mode === "replay"
                      ? "Historical replay · origin-based model time"
                      : "Explore the latest reported seismic activity"}
                  </p>
                </div>
                <Suspense
                  fallback={<div className="globe-loading">Loading Earth…</div>}
                >
                  <Globe
                    events={
                      selected && !visible.some((e) => e.id === selected.id)
                        ? [selected, ...visible]
                        : visible
                    }
                    selected={selected}
                    receiver={receiver}
                    stations={stationEnabled ? stations : []}
                    contours={contours}
                    surface={
                      surface && seconds >= 0 && seconds * 3.5 < Math.PI * 6371
                        ? (((seconds * 3.5) / 6371) * 180) / Math.PI
                        : null
                    }
                    model={model}
                    elapsed={seconds}
                    grid={grid}
                    pick={pick}
                    focus={focus}
                    zoom={zoom}
                    onSelect={choose}
                    onReceiver={setRecv}
                    onReady={ready}
                    onFallbackReady={fallbackReady}
                    forceFallback={new URLSearchParams(location.search).has(
                      "fallback",
                    )}
                  />
                </Suspense>
                {hint && (
                  <div className="hint">
                    Drag to rotate · scroll to zoom · select an earthquake
                    <button
                      aria-label="Dismiss globe hint"
                      onClick={() => {
                        setHint(false);
                        save("hint", "dismissed");
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="globe-tools">
                  <button
                    onClick={() => {
                      setFocus(false);
                      setZoom(0);
                    }}
                    title="Reset view"
                  >
                    Reset view
                  </button>
                  <button
                    onClick={() => {
                      setFocus(true);
                      setZoom(Math.min(4, zoom + 1));
                    }}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    onClick={() => {
                      setFocus(true);
                      setZoom(Math.max(-4, zoom - 1));
                    }}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    aria-pressed={stationEnabled}
                    onClick={() => {
                      setStationEnabled(!stationEnabled);
                      save("stations", String(!stationEnabled));
                    }}
                  >
                    Stations
                  </button>
                  <button aria-pressed={grid} onClick={() => setGrid(!grid)}>
                    Grid
                  </button>
                  <button
                    aria-label="Inside Earth"
                    onClick={() => navigate("/inside")}
                  >
                    <span className="full-label">Inside Earth</span>
                    <span className="compact-label" aria-hidden="true">
                      Earth
                    </span>
                  </button>
                  <button
                    disabled={!selected || !sceneReady}
                    aria-label="Screenshot"
                    onClick={screenshot}
                  >
                    <span className="full-label">Screenshot</span>
                    <span className="compact-label" aria-hidden="true">
                      PNG
                    </span>
                  </button>
                </div>
                <div className="legend">
                  <strong>Modeled arrivals</strong>
                  <span className="p-color">━ P · direct compression</span>
                  <span className="s-color">┄ S · direct shear</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={surface}
                      onChange={(e) => setSurface(e.target.checked)}
                    />{" "}
                    Illustrative surface · 3.5 km/s
                  </label>
                </div>
                {stationEnabled && (
                  <p className="station-status">{stationStatus}</p>
                )}
                {modelError && (
                  <p className="model-error" role="status">
                    Model assets unavailable · observations remain usable
                  </p>
                )}
              </>
            )}
            <div className="replay-dock">
              <div className="transport">
                <button
                  className="play"
                  disabled={!selected}
                  onClick={() => {
                    if (mode === "live") {
                      setMode("replay");
                      setElapsed(0);
                    }
                    setPlaying(!playing);
                  }}
                  aria-label={playing ? "Pause replay" : "Play replay"}
                >
                  {playing ? "Ⅱ" : "▶"}{" "}
                  <span>{playing ? "Pause" : "Play"}</span>
                </button>
                <div>
                  <span className="eyebrow">
                    {mode === "live" ? "LIVE CLOCK" : "REPLAY MODEL TIME"}
                  </span>
                  <strong>
                    {mode === "live"
                      ? new Date(activeClock).toISOString().slice(11, 19)
                      : duration(elapsed)}{" "}
                    <small>{mode === "live" ? "UTC" : "/ 90:00"}</small>
                  </strong>
                </div>
                <select
                  aria-label="Replay speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {config.replaySpeeds.map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setMode("replay");
                    setElapsed(0);
                    setPlaying(false);
                  }}
                  disabled={!selected}
                >
                  Reset
                </button>
                <button onClick={returnLive}>Return to Live</button>
              </div>
              <input
                aria-label="Replay elapsed seconds"
                type="range"
                min="0"
                max="5400"
                step="1"
                value={
                  mode === "replay"
                    ? elapsed
                    : Math.min(5400, Math.max(0, seconds))
                }
                disabled={!selected}
                onKeyDown={(e) => {
                  if (e.key === "PageUp" || e.key === "PageDown") {
                    e.preventDefault();
                    setMode("replay");
                    setPlaying(false);
                    setElapsed(
                      Math.min(
                        5400,
                        Math.max(0, elapsed + (e.key === "PageUp" ? 60 : -60)),
                      ),
                    );
                  }
                }}
                onChange={(e) => {
                  setMode("replay");
                  setPlaying(false);
                  setElapsed(Number(e.target.value));
                }}
              />
            </div>
          </section>
          <aside className="inspector" aria-label="Event details">
            <span className="eyebrow">SELECTED OBSERVATION</span>
            {!selected ? (
              <>
                <h2>Select an earthquake</h2>
                <p>
                  Choose an observation from the list or globe. Historical
                  references are available in Explore history.
                </p>
              </>
            ) : (
              <>
                <div className="detail-mag">
                  M{selected.magnitude?.toFixed(1) ?? "?"}{" "}
                  <small>
                    {selected.magnitudeType ?? "Unknown magnitude type"}
                  </small>
                </div>
                <h2>{selected.place}</h2>
                <p className="origin">
                  {utc(selected.originMs)}
                  <br />
                  <span>
                    {mode === "live"
                      ? `${duration((now - selected.originMs) / 1000)} ago`
                      : "Historical origin · Replay"}
                  </span>
                </p>
                <div className="detail-stats">
                  <div>
                    <span>Depth</span>
                    <strong>
                      {selected.depthKm === null
                        ? "Unknown"
                        : `${selected.depthKm.toFixed(1)} km`}
                    </strong>
                  </div>
                  <div>
                    <span>Catalog status</span>
                    <strong>{selected.reviewStatus ?? "Not supplied"}</strong>
                  </div>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setMode("replay");
                    setElapsed(0);
                    setPlaying(false);
                  }}
                >
                  Replay this earthquake
                </button>
                {selected.provenance === "referenceSnapshot" && (
                  <p className="warning">
                    Dated reference snapshot · retrieved{" "}
                    {utc(selected.fetchedAtMs)}
                  </p>
                )}
                <section className="receiver">
                  <div className="section-label">
                    <h3>Receiver</h3>
                    <span>Representative point</span>
                  </div>
                  <input
                    aria-label="Search receiver cities"
                    placeholder="Search a city"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                  />
                  <select
                    aria-label="Receiver city"
                    value={
                      cities.some((c) => c.id === receiver.id)
                        ? receiver.id
                        : ""
                    }
                    onChange={(e) => {
                      const c = cities.find((v) => v.id === e.target.value);
                      if (c) setRecv(c);
                    }}
                  >
                    <option value="" disabled>
                      {receiver.name}
                    </option>
                    {cities
                      .filter((c) =>
                        c.name.toLowerCase().includes(citySearch.toLowerCase()),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <p>
                    {geo.degrees.toFixed(2)}° ·{" "}
                    {Math.round(geo.km).toLocaleString()} km from epicenter
                  </p>
                  <details open={tab === "receiver"}>
                    <summary>Coordinates & stations</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const a = Number(lat),
                          b = Number(lon);
                        if (!lat || !Number.isFinite(a) || Math.abs(a) > 90) {
                          setCoordError("Latitude must be between −90 and 90.");
                          return;
                        }
                        if (!lon || !Number.isFinite(b) || Math.abs(b) > 180) {
                          setCoordError(
                            "Longitude must be between −180 and 180.",
                          );
                          return;
                        }
                        setRecv({
                          id: "coordinate",
                          name: "Coordinate receiver",
                          lat: a,
                          lon: b,
                        });
                      }}
                    >
                      <div className="filter-row">
                        <label>
                          Latitude
                          <input
                            value={lat}
                            onChange={(e) => setLat(e.target.value)}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Longitude
                          <input
                            value={lon}
                            onChange={(e) => setLon(e.target.value)}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                      <button>Apply coordinates</button>
                      {coordError && <p role="alert">{coordError}</p>}
                    </form>
                    <button aria-pressed={pick} onClick={() => setPick(!pick)}>
                      {pick
                        ? "Click globe to set receiver"
                        : "Pick receiver on globe"}
                    </button>
                    <select
                      aria-label="Station receiver"
                      value={receiver.station ? receiver.id : ""}
                      onChange={(e) => {
                        const s = stations.find(
                          (s) => s.network + "." + s.station === e.target.value,
                        );
                        if (s)
                          setRecv({
                            id: e.target.value,
                            name: e.target.value,
                            lat: s.lat,
                            lon: s.lon,
                            station: s,
                          });
                      }}
                    >
                      <option value="">Choose IU station</option>
                      {stations.map((s) => (
                        <option
                          key={s.station}
                          value={s.network + "." + s.station}
                        >
                          {s.network}.{s.station} · {s.name}
                        </option>
                      ))}
                    </select>
                    {!stationEnabled && (
                      <button onClick={() => setStationEnabled(true)}>
                        Load station subset
                      </button>
                    )}
                    {receiver.station && (
                      <p>
                        Epoch: {receiver.station.start} —{" "}
                        {receiver.station.end || "open"}
                        <br />
                        Predicted states only; metadata is not recording
                        evidence.
                      </p>
                    )}
                  </details>
                </section>
                <div className="section-label">
                  <h3>
                    {mode === "replay"
                      ? "Replay model time"
                      : "Estimated UTC arrival"}
                  </h3>
                  <span>IASP91</span>
                </div>
                {arrivals.map(arrivalCard)}
                <p className="science-note">
                  These are approximate travel times from a one dimensional
                  Earth model, not alerts or confirmed detections. Actual travel
                  times and recordings can differ.
                </p>
                <details>
                  <summary>Sources & technical details</summary>
                  <p>
                    Event {selected.id}
                    <br />
                    {selected.latitudeDeg.toFixed(4)}°,{" "}
                    {selected.longitudeDeg.toFixed(4)}°<br />
                    Updated{" "}
                    {selected.updatedMs
                      ? utc(selected.updatedMs)
                      : "Not supplied"}
                    <br />
                    Retrieved {utc(selected.fetchedAtMs)}
                    <br />
                    Provenance {selected.provenance}
                    <br />
                    Direct scope: earliest p/P and s/S · receiver elevation zero
                  </p>
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    USGS event record ↗
                  </a>
                </details>
                <div className="button-row">
                  <button onClick={copy}>Copy share link</button>
                  <button onClick={exportJson}>Export JSON</button>
                </div>
                <button onClick={() => setWave(!wave)}>
                  {wave
                    ? "Close recorded evidence"
                    : "Inspect recorded evidence"}
                </button>
                {wave && (
                  <Suspense fallback={<p>Loading waveform viewer…</p>}>
                    <Waveform
                      event={selected}
                      receiver={receiver}
                      arrivals={arrivals}
                    />
                  </Suspense>
                )}
              </>
            )}
          </aside>
        </main>
      )}
      <div className="sr-only" aria-live="polite">
        {selected
          ? `Selected ${selected.place}, magnitude ${selected.magnitude ?? "unknown"}`
          : ""}
      </div>
    </>
  );
}
