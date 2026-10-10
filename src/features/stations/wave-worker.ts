import { decode } from "./decode";
self.onmessage = async (e) => {
  try {
    self.postMessage({ segments: await decode(e.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
