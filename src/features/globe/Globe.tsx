import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { lookup } from "../../science/model";
import { distance } from "../../science/geometry";
import { asset } from "../../data/config";
import { vector, circle, rad } from "../../science/geometry";
import type { Event, Receiver, Station, Model } from "../../data/types";
type Land = { type: string; coordinates: number[][][] | number[][][][] };
export type GlobeProps = {
  events: Event[];
  selected: Event | null;
  receiver: Receiver;
  stations: Station[];
  contours: number[][];
  surface: number | null;
  grid: boolean;
  pick: boolean;
  focus: boolean;
  zoom: number;
  onSelect: (e: Event) => void;
  onReceiver: (r: Receiver) => void;
  onReady: (canvas: HTMLCanvasElement) => void;
  onFallbackReady?: () => void;
  model: Model | null;
  elapsed: number;
  forceFallback?: boolean;
};
function LandLines({
  onTexture,
}: {
  onTexture: (texture: THREE.CanvasTexture) => void;
}) {
  const [land, setLand] = useState<Land[]>([]);
  useEffect(() => {
    let mounted = true;
    fetch(asset("land.geojson"))
      .then((r) => r.json())
      .then(
        (x) =>
          mounted &&
          setLand(x.features.map((f: { geometry: Land }) => f.geometry)),
      )
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!land.length) return;
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0d2840";
    ctx.fillRect(0, 0, 2048, 1024);
    ctx.fillStyle = "#284e60";
    for (const g of land) {
      const polygons =
        g.type === "Polygon"
          ? [g.coordinates as number[][][]]
          : (g.coordinates as number[][][][]);
      for (const poly of polygons) {
        ctx.beginPath();
        for (const ring of poly) {
          ring.forEach((p, i) => {
            const x = ((p[0] + 180) / 360) * 2048,
              y = ((90 - p[1]) / 180) * 1024;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
        }
        ctx.fill("evenodd");
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    onTexture(texture);
    return () => texture.dispose();
  }, [land, onTexture]);
  const lines = useMemo(
    () =>
      land
        .flatMap((g) =>
          g.type === "Polygon"
            ? [g.coordinates as number[][][]]
            : (g.coordinates as number[][][][]),
        )
        .flatMap((poly) =>
          poly.map((ring) => ring.map((p) => vector(p[1], p[0], 1.002))),
        ),
    [land],
  );
  const geometry = useMemo(() => {
    const positions = lines.flatMap((ring) =>
      ring.slice(1).flatMap((point, i) => [...ring[i], ...point]),
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [lines]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#588297" transparent opacity={0.65} />
    </lineSegments>
  );
}

function Markers({
  events,
  selected,
  onSelect,
}: Pick<GlobeProps, "events" | "selected" | "onSelect">) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (!ref.current) return;
    events.forEach((e, i) => {
      dummy.position.set(...vector(e.latitudeDeg, e.longitudeDeg, 1.013));
      const size =
        0.008 + Math.max(0, Math.min(9.5, e.magnitude ?? 2.5) - 2.5) * 0.0015;
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(
        i,
        new THREE.Color(
          e.id === selected?.id
            ? "#ff806f"
            : e.magnitude === null
              ? "#b7c4d8"
              : "#f4ba62",
        ),
      );
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [events, selected, dummy]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, events.length]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
          const event = events[e.instanceId],
            p = new THREE.Vector3(
              ...vector(event.latitudeDeg, event.longitudeDeg),
            );
          if (p.dot(camera.position) > 1.01) onSelect(event);
        }
      }}
    >
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
function VisibleLabel({
  lat,
  lon,
  children,
}: {
  lat: number;
  lon: number;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const previous = useRef(false);
  useFrame(({ camera }) => {
    const next =
      new THREE.Vector3(...vector(lat, lon)).dot(camera.position) > 1.02;
    if (next !== previous.current) {
      previous.current = next;
      setVisible(next);
    }
  });
  return (
    <group position={vector(lat, lon, 1.025)}>
      {visible && (
        <Html
          center
          distanceFactor={1.8}
          style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
        >
          <div className="globe-label">{children}</div>
        </Html>
      )}
    </group>
  );
}
function Scene(p: GlobeProps) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const dragging = useRef(false);
  const target = useRef(new THREE.Vector3(...vector(15, 80, 3.1)));
  useEffect(() => {
    const context = gl.getContext();
    const ext = context.getExtension("WEBGL_debug_renderer_info");
    if (
      ext &&
      /SwiftShader|llvmpipe|Software/i.test(
        String(context.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
      )
    )
      gl.setPixelRatio(1);
    p.onReady(gl.domElement);
    const lost = (e: globalThis.Event) => {
      e.preventDefault();
      gl.domElement.dispatchEvent(
        new CustomEvent("pulse-lost", { bubbles: true }),
      );
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, p.onReady]);
  useEffect(() => {
    const e = p.selected;
    target.current.set(
      ...vector(
        p.focus && e ? e.latitudeDeg : 15,
        p.focus && e ? e.longitudeDeg : 80,
        Math.max(1.8, 3.1 - p.zoom * 0.25),
      ),
    );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      camera.position.copy(target.current);
    invalidate();
  }, [p.selected?.id, p.focus, p.zoom, camera]);
  useFrame((_, dt) => {
    if (document.hidden || dragging.current) return;
    const gap = camera.position.distanceTo(target.current);
    if (gap > 0.001) {
      camera.position.lerp(target.current, Math.min(1, dt * 20));
      controls.current?.update();
      invalidate();
    }
  });
  const grid = useMemo(() => {
    const a: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30)
      a.push(
        Array.from({ length: 129 }, (_, i) =>
          vector(lat, (i / 128) * 360, 1.001),
        ),
      );
    for (let lon = 0; lon < 180; lon += 30)
      a.push(
        Array.from({ length: 129 }, (_, i) =>
          vector((i / 128) * 360 - 180, lon, 1.001),
        ),
      );
    return a;
  }, []);
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 3, 5]} intensity={2.5} />
      <mesh
        onClick={(e) => {
          if (!p.pick) return;
          e.stopPropagation();
          const v = e.point.clone().normalize();
          p.onReceiver({
            id: "coordinate",
            name: "Globe receiver",
            lat: Math.asin(v.y) / rad,
            lon: Math.atan2(-v.z, v.x) / rad,
          });
        }}
      >
        <sphereGeometry args={[1, 96, 64]} />
        <meshPhongMaterial
          key={texture?.uuid ?? "ocean"}
          color={texture ? "#ffffff" : "#102b43"}
          map={texture}
          shininess={6}
        />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[1, 64, 48]} />
        <meshBasicMaterial
          color="#4186a3"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>
      <LandLines onTexture={setTexture} />
      {p.grid &&
        grid.map((pts, i) => (
          <Line key={i} points={pts} color="#2a4c62" lineWidth={0.5} />
        ))}
      <Markers events={p.events} selected={p.selected} onSelect={p.onSelect} />
      {p.selected && (
        <>
          <VisibleLabel
            lat={p.selected.latitudeDeg}
            lon={p.selected.longitudeDeg}
          >
            <span className="event-color">
              ● M{p.selected.magnitude?.toFixed(1) ?? "?"}
            </span>
          </VisibleLabel>
          <mesh
            position={vector(
              p.selected.latitudeDeg,
              p.selected.longitudeDeg,
              1.018,
            )}
          >
            <sphereGeometry args={[0.025, 24, 16]} />
            <meshBasicMaterial
              color="#ff806f"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
          {p.contours.flatMap((degrees, k) =>
            degrees.map((d, i) => (
              <Line
                key={`${k}-${i}`}
                points={circle(
                  p.selected!.latitudeDeg,
                  p.selected!.longitudeDeg,
                  d,
                  innerWidth < 768 ? 96 : 256,
                )}
                color={k === 0 ? "#55d6f0" : "#f4ba62"}
                lineWidth={1.5}
                dashed={k === 1}
                dashSize={0.025}
                gapSize={0.018}
              />
            )),
          )}
          {p.surface !== null && (
            <Line
              points={circle(
                p.selected.latitudeDeg,
                p.selected.longitudeDeg,
                p.surface,
              )}
              color="#c2a3ff"
              dashed
              dashSize={0.02}
              gapSize={0.03}
            />
          )}
        </>
      )}
      <mesh position={vector(p.receiver.lat, p.receiver.lon, 1.018)}>
        <sphereGeometry args={[0.011, 16, 12]} />
        <meshBasicMaterial color="#f3f6fc" />
      </mesh>
      <VisibleLabel lat={p.receiver.lat} lon={p.receiver.lon}>
        {p.receiver.name}
      </VisibleLabel>
      {p.stations.map((s) => (
        <mesh
          key={s.station}
          position={vector(s.lat, s.lon, 1.012)}
          onClick={(e) => {
            e.stopPropagation();
            p.onReceiver({
              id: s.network + "." + s.station,
              name: s.network + "." + s.station,
              lat: s.lat,
              lon: s.lon,
              station: s,
            });
          }}
        >
          <coneGeometry args={[0.007, 0.02, 3]} />
          <meshBasicMaterial
            color={
              p.selected &&
              lookup(
                p.model,
                p.selected.depthKm,
                distance(
                  p.selected.latitudeDeg,
                  p.selected.longitudeDeg,
                  s.lat,
                  s.lon,
                ).degrees,
                "P",
              ).seconds !== null &&
              p.elapsed >
                lookup(
                  p.model,
                  p.selected.depthKm,
                  distance(
                    p.selected.latitudeDeg,
                    p.selected.longitudeDeg,
                    s.lat,
                    s.lon,
                  ).degrees,
                  "P",
                ).seconds!
                ? "#55d6f0"
                : "#8be0b1"
            }
          />
        </mesh>
      ))}
      <OrbitControls
        ref={controls}
        enablePan={false}
        minDistance={1.6}
        maxDistance={5}
        enableDamping={false}
        onStart={() => {
          dragging.current = true;
          target.current.copy(camera.position);
        }}
        onEnd={() => {
          dragging.current = false;
          target.current.copy(camera.position);
        }}
      />
    </>
  );
}
function MapFallback(p: GlobeProps) {
  useEffect(() => p.onFallbackReady?.(), [p.onFallbackReady]);
  const [land, setLand] = useState<Land[]>([]);
  useEffect(() => {
    fetch(asset("land.geojson"))
      .then((r) => r.json())
      .then((x) =>
        setLand(x.features.map((f: { geometry: Land }) => f.geometry)),
      )
      .catch(() => {});
  }, []);
  const x = (lon: number) => (lon + 180) * 2,
    y = (lat: number) => (90 - lat) * 2;
  const projected = (degrees: number) => {
    if (!p.selected) return "";
    let last = 0;
    return circle(p.selected.latitudeDeg, p.selected.longitudeDeg, degrees)
      .map((v, i) => {
        const lat = Math.asin(v[1] / 1.008) / rad,
          lon = Math.atan2(-v[2], v[0]) / rad;
        const px = x(lon),
          py = y(lat),
          command = i && Math.abs(px - last) < 360 ? "L" : "M";
        last = px;
        return `${command}${px},${py}`;
      })
      .join(" ");
  };
  return (
    <div className="fallback">
      <p>3D view unavailable · accessible 2D map</p>
      <svg
        viewBox="0 0 720 360"
        role="img"
        aria-label="Earthquake map"
        onClick={(e) => {
          if (!p.pick) return;
          const r = e.currentTarget.getBoundingClientRect();
          p.onReceiver({
            id: "coordinate",
            name: "Map receiver",
            lat: 90 - ((e.clientY - r.top) / r.height) * 180,
            lon: ((e.clientX - r.left) / r.width) * 360 - 180,
          });
        }}
      >
        <rect width="720" height="360" fill="#102b43" />
        {land
          .flatMap((g) =>
            g.type === "Polygon"
              ? [g.coordinates as number[][][]]
              : (g.coordinates as number[][][][]),
          )
          .flatMap((poly) =>
            poly.map((ring, i) => (
              <path
                key={ring[0].join(",") + i}
                d={
                  ring
                    .map((v, j) => `${j ? "L" : "M"}${x(v[0])},${y(v[1])}`)
                    .join(" ") + "Z"
                }
                fill="#25485a"
                stroke="#588297"
                strokeWidth=".4"
              />
            )),
          )}
        {p.grid &&
          Array.from({ length: 11 }, (_, i) => (
            <line
              key={`grid${i}`}
              x1={(i + 1) * 60}
              x2={(i + 1) * 60}
              y1="0"
              y2="360"
              stroke="#2b4c62"
              strokeWidth=".5"
            />
          ))}
        {p.contours.flatMap((rings, k) =>
          rings.map((d, i) => (
            <path
              key={`c${k}-${i}`}
              d={projected(d)}
              fill="none"
              stroke={k ? "#f4ba62" : "#55d6f0"}
              strokeWidth="1.5"
              strokeDasharray={k ? "5 4" : undefined}
            />
          )),
        )}
        {p.surface !== null && (
          <path
            d={projected(p.surface)}
            fill="none"
            stroke="#c2a3ff"
            strokeDasharray="4 4"
          />
        )}
        {p.events.map((e) => (
          <circle
            key={e.id}
            cx={x(e.longitudeDeg)}
            cy={y(e.latitudeDeg)}
            r={e.id === p.selected?.id ? 5 : 3}
            fill="#ff806f"
            role="button"
            tabIndex={0}
            aria-label={e.place}
            onKeyDown={(k) => {
              if (k.key === "Enter") p.onSelect(e);
            }}
            onClick={(k) => {
              k.stopPropagation();
              p.onSelect(e);
            }}
          />
        ))}
        <circle
          cx={x(p.receiver.lon)}
          cy={y(p.receiver.lat)}
          r="4"
          fill="white"
        />
      </svg>
    </div>
  );
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function Globe(p: GlobeProps) {
  const [lost, setLost] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current,
      fn = () => setLost(true);
    el?.addEventListener("pulse-lost", fn);
    return () => el?.removeEventListener("pulse-lost", fn);
  }, []);
  const can = useMemo(() => {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }, []);
  return (
    <div
      className="globe-canvas"
      ref={wrap}
      role="img"
      aria-label="Rotatable Earth showing earthquake observations and modeled arrival contours. Use the event list and receiver form for keyboard access."
    >
      {!can || lost || p.forceFallback ? (
        <MapFallback {...p} />
      ) : (
        <Boundary fallback={<MapFallback {...p} />}>
          <Canvas
            dpr={[1, innerWidth < 768 ? 1.25 : 1.5]}
            camera={{ position: vector(15, 80, 3.1), fov: 43 }}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
            frameloop="demand"
          >
            <Scene {...p} />
          </Canvas>
        </Boundary>
      )}
    </div>
  );
}
