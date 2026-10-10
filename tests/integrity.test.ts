import { it, expect, vi } from "vitest";
import { verifiedFile } from "../src/science/model";
import { request, ProviderError } from "../src/data/providers";
import type { Manifest } from "../src/data/types";
it("rejects a tampered downloaded scientific asset", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])));
  const m = {
    files: { "times.bin": { bytes: 4, sha256: "0".repeat(64) } },
  } as unknown as Manifest;
  await expect(verifiedFile(m, "times.bin")).rejects.toThrow("checksum");
  spy.mockRestore();
});
it("fails safely on missing scientific assets", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 404 }));
  await expect(
    verifiedFile({ files: {} } as Manifest, "times.bin"),
  ).rejects.toThrow("unavailable");
  spy.mockRestore();
});
it("caps external concurrency at two and deduplicates requests", async () => {
  let active = 0,
    max = 0,
    calls = 0;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;
    max = Math.max(max, ++active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return new Response("ok");
  });
  const urls = ["a", "b", "c", "d"].map(
    (id) => "https://earthquake.usgs.gov/test/" + id,
  );
  await Promise.all([...urls.map((url) => request(url)), request(urls[0])]);
  expect(max).toBe(2);
  expect(calls).toBe(4);
  spy.mockRestore();
});
it("honors exposed Retry After and rejects unsupported hosts", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "600" } }),
    );
  try {
    await request("https://earthquake.usgs.gov/test/rate");
    throw Error("Expected error");
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    expect((e as ProviderError).retryAfter).toBe(600000);
  }
  await expect(request("https://evil.example/")).rejects.toThrow("not allowed");
  spy.mockRestore();
});
