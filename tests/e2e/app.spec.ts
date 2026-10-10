import { test, expect } from "@playwright/test";
import fs from "node:fs";
const refs = JSON.parse(
  fs.readFileSync("public/assets/landmarks.json", "utf8"),
);
const feature = refs[3].feature;
const feed = {
  type: "FeatureCollection",
  metadata: { generated: Date.now() },
  features: [
    {
      ...feature,
      properties: {
        ...feature.properties,
        time: Date.now() - 100000,
        type: "earthquake",
      },
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route("https://earthquake.usgs.gov/**", (r) =>
    r.fulfill({
      json: r.request().url().includes("eventid=") ? feature : feed,
    }),
  );
});
test("live observations, replay, receiver and sharing", async ({ page }) => {
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: "Earthquakes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replay this earthquake" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replay this earthquake" }).click();
  await expect(
    page.getByText("REPLAY · PAUSED", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("slider", { name: "Replay elapsed seconds" })
    .fill("120");
  await page
    .getByRole("combobox", { name: "Receiver city" })
    .selectOption("tokyo");
  await expect(page.getByText("120", { exact: true })).toHaveCount(0);
  await expect(page.locator(".arrival").first()).toContainText("Approximate");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Replay elapsed seconds" }),
  ).toHaveValue("0");
});
test("landmarks, inside rays and recorded reference", async ({ page }) => {
  await page.goto("");
  await page.getByRole("button", { name: "Explore history" }).click();
  await page.getByRole("button", { name: "2011 Tohoku" }).click();
  await expect(
    page.getByText("REPLAY · PAUSED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inside Earth", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reference ray scenario" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to event inspector" }).click();
  await page.getByRole("button", { name: "Inspect recorded evidence" }).click();
  await page.getByRole("button", { name: "Dated Tohoku reference" }).click();
  await expect(page.getByText(/recorded segments/)).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Download original miniSEED" }),
  ).toBeVisible();
});
test("fallback preserves arrivals and mobile does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("?fallback=1");
  await expect(
    page.getByText("3D view unavailable · accessible 2D map"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replay this earthquake" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("provider failure is recoverable without fabricated observations", async ({
  page,
}) => {
  await page.route("https://earthquake.usgs.gov/**", (r) =>
    r.fulfill({ status: 429, headers: { "Retry-After": "120" } }),
  );
  await page.goto("");
  await expect(
    page.getByText("USGS source unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".event-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Explore history" }).click();
  await expect(page.getByRole("button", { name: "1960 Chile" })).toBeVisible();
});

test("shared replay survives refresh and invalid coordinates remain safe", async ({
  page,
}) => {
  await page.goto(
    `#/live?mode=replay&event=${feature.id}&receiver=city:tokyo&t=120&speed=60`,
  );
  await expect(
    page.getByRole("slider", { name: "Replay elapsed seconds" }),
  ).toHaveValue("120");
  await expect(
    page.getByRole("combobox", { name: "Receiver city" }),
  ).toHaveValue("tokyo");
  await expect(
    page.getByText("REPLAY · PAUSED", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("slider", { name: "Replay elapsed seconds" }),
  ).toHaveValue("120");
  await page.goto("#/live?lat=999&lon=0");
  await page.reload();
  await expect(
    page.getByText("Invalid shared coordinates ignored."),
  ).toBeVisible();
});
test("exports separate observation and model with UTC labels", async ({
  page,
}) => {
  await page.goto("");
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const json = JSON.parse(
    fs.readFileSync((await (await jsonDownload).path())!, "utf8"),
  );
  expect(json.observation.id).toBe(feature.id);
  expect(json.model.name).toContain("IASP91");
  expect(json.exportedAt).toContain("UTC");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Screenshot", exact: true }).click();
  const bytes = fs.readFileSync((await (await pngDownload).path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
});
test("playback uses origin and pauses on hidden tab", async ({ page }) => {
  await page.goto("");
  await page.getByRole("button", { name: "Replay this earthquake" }).click();
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByText("REPLAY · PLAYING", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByText("REPLAY · PAUSED", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    }),
  );
  await page.getByRole("button", { name: "Return to Live" }).click();
  await expect(page.locator(".mode-badge")).toHaveText("● LIVE");
});
test("station epoch selection and 204 no-recording path", async ({ page }) => {
  await page.route("https://earthquake.usgs.gov/**", (r) =>
    r.fulfill({
      json: {
        ...feed,
        features: [
          {
            ...feature,
            properties: { ...feature.properties, time: Date.now() - 3600000 },
          },
        ],
      },
    }),
  );
  await page.route("https://service.earthscope.org/**", (r) => {
    const url = r.request().url();
    if (url.includes("dataselect")) return r.fulfill({ status: 204 });
    if (url.includes("level=channel"))
      return r.fulfill({
        body: "#Network|Station|Location|Channel|Latitude|Longitude|Elevation|Depth|Azimuth|Dip|SensorDescription|Scale|ScaleFreq|ScaleUnits|SampleRate|StartTime|EndTime\nIU|ANMO|00|BHZ|34.9459|-106.4572|1820|0|0|-90|STS|1|1|M/S|20|2000-01-01|",
      });
    return r.fulfill({
      body: "#Network|Station|Latitude|Longitude|Elevation|SiteName|StartTime|EndTime\nIU|ANMO|34.9459|-106.4572|1820|Albuquerque|2000-01-01|",
    });
  });
  await page.goto("");
  await page.getByRole("button", { name: "Stations", exact: true }).click();
  await page.getByText("Coordinates & stations", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Station receiver" })
    .selectOption("IU.ANMO");
  await page.getByRole("button", { name: "Inspect recorded evidence" }).click();
  await page.getByRole("button", { name: "Load IU.ANMO recording" }).click();
  await expect(
    page.getByText("No recording returned for this channel and time."),
  ).toBeVisible();
});
