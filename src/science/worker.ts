import { crossings, lookup } from "./model";
import type { Model } from "../data/types";
let model: Model | null = null;
self.onmessage = (e) => {
  const x = e.data;
  if (x.type === "init") {
    model = x.model;
    return;
  }
  if (x.type === "compute")
    self.postMessage({
      id: x.id,
      arrivals: ["P", "S"].map((f) =>
        lookup(model, x.depth, x.degrees, f as "P" | "S"),
      ),
      contours: ["P", "S"].map((f) =>
        crossings(model, x.depth, x.elapsed, f as "P" | "S"),
      ),
    });
};
