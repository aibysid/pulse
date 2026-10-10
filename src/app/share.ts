import { cities } from "../data/config";
import { validId } from "../data/providers";
import type { Receiver } from "../data/types";
export function parseShare(hash: string) {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const p = new URLSearchParams(query);
  let warning = "";
  const mode = p.get("mode") === "replay" ? "replay" : "live";
  const id = p.get("event");
  if (id && !validId(id)) warning = "Invalid shared event ignored.";
  let receiver: Receiver | undefined;
  const choice = p.get("receiver");
  if (choice?.startsWith("city:"))
    receiver = cities.find((c) => c.id === choice.slice(5));
  if (!receiver && (p.has("lat") || p.has("lon"))) {
    const lat = Number(p.get("lat")),
      lon = Number(p.get("lon"));
    if (
      p.has("lat") &&
      p.has("lon") &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    )
      receiver = {
        id: choice?.startsWith("station:") ? choice.slice(8) : "coordinate",
        name: "Coordinate receiver",
        lat,
        lon,
      };
    else warning = "Invalid shared coordinates ignored.";
  }
  const t = Number(p.get("t") ?? 0);
  const speed = Number(p.get("speed") ?? 30);
  if (!Number.isFinite(t) || ![1, 10, 30, 60].includes(speed))
    warning = "Invalid replay settings ignored.";
  return {
    route: ["/live", "/history", "/inside", "/about"].includes(path)
      ? path
      : "/live",
    mode: mode as "live" | "replay",
    eventId: validId(id) ? id : null,
    receiver,
    elapsed: Number.isFinite(t) ? Math.max(0, Math.min(5400, t)) : 0,
    speed: [1, 10, 30, 60].includes(speed) ? speed : 30,
    scenario: p.get("scenario"),
    warning,
  };
}
export function shareUrl(
  route: string,
  eventId: string,
  receiver: Receiver,
  mode: string,
  t: number,
  speed: number,
  scenario?: string,
) {
  const p = new URLSearchParams({
    mode,
    event: eventId,
    receiver: receiver.station
      ? `station:${receiver.id}`
      : cities.some((c) => c.id === receiver.id)
        ? `city:${receiver.id}`
        : "coordinate",
    lat: String(receiver.lat),
    lon: String(receiver.lon),
    t: String(Math.round(t)),
    speed: String(speed),
    view: route === "/inside" ? "inside" : "globe",
  });
  if (scenario) p.set("scenario", scenario);
  return `${location.origin}${location.pathname}#${route}?${p}`;
}
