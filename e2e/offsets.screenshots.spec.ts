import { test, Page } from "@playwright/test";
import { loadTestImage } from "./helpers/app";
import fs from "node:fs/promises";

// Not part of the regular suite: run with `CAPTURE_OFFSETS=1 npx playwright test e2e/offsets.screenshots.spec.ts`
// to capture patterned tile screenshots of the output viewer at different
// offset settings for visual verification of the crop behavior. Also captures
// actual downloads to verify the output is clipped to the configured
// dimensions. Each case reloads the page for a clean model state. The rot*
// cases additionally rotate alternating tiles via the rotation knob to verify
// that offsets and rotations compose (the rotated tiles must shift with their
// rows/columns and the crop clip must trim the correct clip sides).
test.skip(!process.env.CAPTURE_OFFSETS, "run with CAPTURE_OFFSETS=1 to capture offset screenshots");

const outDir = "test-results/offset-screenshots";

const cases: { name: string; x: number; y: number; grid?: [number, number]; rot?: number }[] = [
  { name: "0-baseline", x: 0, y: 0 },
  { name: "x100", x: 100, y: 0 },
  { name: "x-100", x: -100, y: 0 },
  { name: "y100", x: 0, y: 100 },
  { name: "y-100", x: 0, y: -100 },
  { name: "combined", x: 120, y: -80 },
  { name: "large", x: 200, y: 150 },
  { name: "edge-disappear", x: 220, y: -180 },
  { name: "extreme", x: 256, y: -256 },
  { name: "grid6-extreme", x: 256, y: -256, grid: [6, 6] },
  { name: "rot90-baseline", x: 0, y: 0, rot: 90 },
  { name: "rot90-x100", x: 100, y: 0, rot: 90 },
  { name: "rot90-y100", x: 0, y: 100, rot: 90 },
  { name: "rot90-combined", x: 120, y: -80, rot: 90 }
];

async function setRange(page: Page, selector: string, value: number) {
  await page.locator(selector).evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function captureDownload(page: Page, name: string) {
  await page.waitForTimeout(1500);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("offscreencanvas-download .download-button").click()]);
  await download.saveAs(`${outDir}/download-${name}.png`);
}

for (const entry of cases) {
  test(`capture ${entry.name}`, async ({ page }) => {
    await loadTestImage(page, "/?patterned=1");
    await fs.mkdir(outDir, { recursive: true });

    if (entry.grid) {
      await page.locator("grid-size-selector #widthInput").fill(String(entry.grid[0]));
      await page.locator("grid-size-selector #heightInput").fill(String(entry.grid[1]));
      await page.locator("grid-size-selector .update-button").click();
    }
    if (entry.rot !== undefined) {
      // The rotation knobs are RotatingInput components: dispatching
      // degreeChange is what a user drag produces
      await page.locator(`rotating-input.rotation-x`).evaluate((el, degree) => {
        el.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree } }));
      }, entry.rot);
    }
    if (entry.x !== 0) await setRange(page, "input.offset-x", entry.x);
    if (entry.y !== 0) await setRange(page, "input.offset-y", entry.y);
    // Wait for the relayout to settle
    await page.waitForTimeout(800);

    const viewer = page.locator(".output-viewer");
    await viewer.screenshot({ path: `${outDir}/${entry.name}.png` });
    await captureDownload(page, entry.name);
  });
}
