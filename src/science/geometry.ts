export const rad = Math.PI / 180;
export function vector(
  lat: number,
  lon: number,
  r = 1,
): [number, number, number] {
  return [
    r * Math.cos(lat * rad) * Math.cos(lon * rad),
    r * Math.sin(lat * rad),
    -r * Math.cos(lat * rad) * Math.sin(lon * rad),
  ];
}
export function distance(lat: number, lon: number, rlat: number, rlon: number) {
  const a = vector(lat, lon),
    b = vector(rlat, rlon);
  const angle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        a.reduce((s, v, i) => s + v * b[i], 0),
      ),
    ),
  );
  return { degrees: angle / rad, km: angle * 6371 };
}
export function circle(
  lat: number,
  lon: number,
  degrees: number,
  count = 256,
): [number, number, number][] {
  const n = vector(lat, lon);
  const h = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [
    n[1] * h[2] - n[2] * h[1],
    n[2] * h[0] - n[0] * h[2],
    n[0] * h[1] - n[1] * h[0],
  ];
  const len = Math.hypot(...u);
  u = u.map((v) => v / len);
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = (i / count) * Math.PI * 2;
    return n.map(
      (x, j) =>
        1.008 *
        (x * Math.cos(degrees * rad) +
          Math.sin(degrees * rad) * (u[j] * Math.cos(t) + v[j] * Math.sin(t))),
    ) as [number, number, number];
  });
}
