import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("keyboard-accessible shell has no serious accessibility violations", async ({
  page,
}) => {
  await page.route("https://earthquake.usgs.gov/**", (r) =>
    r.fulfill({
      json: {
        type: "FeatureCollection",
        features: [],
        metadata: { generated: Date.now() },
      },
    }),
  );
  await page.goto("");
  await expect(
    page.getByText("No earthquakes match these filters."),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.filter(
      (x) => x.impact === "serious" || x.impact === "critical",
    ),
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(["A", "BUTTON", "SELECT", "INPUT"]).toContain(
    await page.evaluate(() => document.activeElement?.tagName),
  );
});
