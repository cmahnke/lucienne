import { test, expect, Page } from "@playwright/test";
import { loadTestImage, downloadCutJson, openApp } from "./helpers/app";
import { IMAGE_SERVICE_URL } from "./fixtures/mock";

interface CutJSONLD {
  body: { value: string };
  target: { selector: { value: string } };
}

async function setRange(page: Page, selector: string, value: number) {
  await page.locator(selector).evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test.describe("offset (shifts) mode", () => {
  test("enables and shows the offset sliders after the image is loaded", async ({ page }) => {
    await openApp(page);
    // The demo page enables shifts mode, the container carries the CSS hook
    await expect(page.locator("#generator")).toHaveClass(/shifts/);

    await expect(page.locator("input.offset-x")).toBeDisabled();
    await loadTestImage(page);

    const offsetX = page.locator("input.offset-x");
    const offsetY = page.locator("input.offset-y");
    await expect(offsetX).toBeEnabled();
    await expect(offsetY).toBeEnabled();
    await expect(offsetX).toBeVisible();
    await expect(offsetY).toBeVisible();
    // Range covers half the image size in both directions
    await expect(offsetX).toHaveAttribute("min", "-256");
    await expect(offsetX).toHaveAttribute("max", "256");
    await expect(offsetY).toHaveAttribute("min", "-256");
    await expect(offsetY).toHaveAttribute("max", "256");
  });

  test("positive horizontal offset updates the pattern x attribute", async ({ page }) => {
    await loadTestImage(page);

    await setRange(page, "input.offset-x", 100);

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain('x="100"');
  });

  test("negative horizontal offset exports a signed x attribute", async ({ page }) => {
    await loadTestImage(page);

    await setRange(page, "input.offset-x", -100);

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain('x="-100"');
  });

  test("vertical offset updates the pattern y attribute", async ({ page }) => {
    await loadTestImage(page);

    await setRange(page, "input.offset-y", 75);

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain('y="75"');
  });

  test("combined offsets render without breaking the layout", async ({ page }) => {
    await loadTestImage(page);

    await setRange(page, "input.offset-x", 120);
    await setRange(page, "input.offset-y", -80);

    // Both viewers are still alive after the relayout with both axes offset
    await expect(page.locator(".cutting-table-viewer canvas").first()).toBeVisible();
    await expect(page.locator(".output-viewer canvas").first()).toBeVisible();

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain('x="120"');
    expect(json.body.value).toContain('y="-80"');
    expect(json.target.selector.value).toBe("xywh=0,0,512,512");
  });

  test("rotated tiles shift with their rows", async ({ page }) => {
    await loadTestImage(page);

    // Rotate alternating tiles via the rotation knob (90 degrees), then apply
    // a horizontal offset: the rotated tiles must move with their row. This
    // used to break because the offset magnitude was derived via
    // imageToViewportRectangle, which bakes the tile rotation into the
    // rectangle (OpenSeadragon swaps width/height for rotated rects) and
    // collapsed the shift to 0 for 90 degree rotated tiles.
    await page.locator("rotating-input.rotation-x").evaluate((el) => {
      el.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree: 90 } }));
    });
    await setRange(page, "input.offset-x", 100);
    await page.waitForTimeout(600);

    const rowTiles = await page.evaluate(() => {
      const renderer = (
        document.querySelector(".output-viewer") as unknown as {
          osdRenderer?: {
            viewer: {
              world: {
                getItemCount: () => number;
                getItemAt: (index: number) => { getBounds: () => { x: number }; getRotation: () => number } | undefined;
              };
            };
          };
        }
      ).osdRenderer;
      const world = renderer!.viewer.world;
      const columns: (number | undefined)[] = [];
      // World row 4 is the second visible row (margin width 2); even columns
      // stay unrotated, odd columns are rotated by the knob
      for (let i = 0; i < world.getItemCount(); i++) {
        const tile = world.getItemAt(i);
        if (tile === undefined || Math.floor(i / 8) !== 4) {
          continue;
        }
        columns[i % 8] = tile.getBounds().x;
      }
      return { unrotated0: columns[2], rotated1: columns[3], unrotated2: columns[4] };
    });

    // Same row, so all tiles share the strip phase: the rotated tile must sit
    // exactly one tile width right of the first unrotated one. Comparing
    // against the unrotated spacing keeps the assertion scale-free.
    expect(rowTiles.unrotated0).toBeDefined();
    expect(rowTiles.rotated1).toBeDefined();
    expect(rowTiles.unrotated2).toBeDefined();
    const spacing = (rowTiles.unrotated2! - rowTiles.unrotated0!) / 2;
    expect(rowTiles.rotated1! - rowTiles.unrotated0!).toBeCloseTo(spacing, 6);
  });

  test("combined offsets leave no uncovered area when edge tiles disappear", async ({ page }) => {
    await loadTestImage(page);

    // Both offsets push edge tiles to arbitrary positions; a tile at the
    // visual edge can end up entirely outside the configured area. The
    // wedge filler must compensate: every sample point of the configured
    // area has to be covered by some tile's drawn (clipped) bounds. This
    // check is deliberately independent of the renderer's own coverage
    // bookkeeping - it re-derives everything from the live OpenSeadragon
    // state.
    await setRange(page, "input.offset-x", 220);
    await setRange(page, "input.offset-y", -180);
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      const renderer = (
        document.querySelector(".output-viewer") as unknown as {
          osdRenderer?: {
            viewer: {
              world: {
                getItemCount: () => number;
                getItemAt: (index: number) =>
                  | {
                      getClippedBounds: () => { x: number; y: number; width: number; height: number };
                      getRotation: () => number;
                    }
                  | undefined;
              };
            };
          };
        }
      ).osdRenderer;
      const world = renderer!.viewer.world;
      const rects: { x: number; y: number; width: number; height: number }[] = [];
      let scale = 0;
      for (let i = 0; i < world.getItemCount(); i++) {
        const tile = world.getItemAt(i);
        if (tile === undefined) {
          continue;
        }
        const cb = tile.getClippedBounds();
        if (cb.width > 0 && cb.height > 0) {
          rects.push({ x: cb.x, y: cb.y, width: cb.width, height: cb.height });
          if (tile.getRotation() === 0 && cb.width === cb.height) {
            // The widest square drawn region of an unrotated tile is one full
            // cell (512 image units); fillers and trimmed tiles are smaller
            scale = Math.max(scale, cb.width / 512);
          }
        }
      }
      const cell = 512 * scale;
      const crop = 4 * cell;
      // Sample the configured area uniformly: the quarter cell centers and
      // corners of a 16x16 grid per tile cell
      const steps = 64;
      let uncovered = 0;
      for (let sy = 0; sy < steps; sy++) {
        for (let sx = 0; sx < steps; sx++) {
          const px = ((sx + 0.5) / steps) * crop;
          const py = ((sy + 0.5) / steps) * crop;
          const covered = rects.some((rect) => px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height);
          if (!covered) {
            uncovered++;
          }
        }
      }
      return { uncovered, samples: steps * steps, rects: rects.length };
    });

    expect(result.rects).toBeGreaterThan(0);
    expect(result.uncovered).toBe(0);
  });

  test("uploaded offsets are applied to the sliders", async ({ page }) => {
    await loadTestImage(page);

    const cutJson = JSON.stringify({
      url: IMAGE_SERVICE_URL,
      width: 512,
      height: 512,
      offsets: { Right: 120, Top: -40 }
    });

    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], "cuts.json", { type: "application/json" }));
      return dt;
    }, cutJson);

    await page.dispatchEvent(".input-area", "drop", { dataTransfer });

    // updateControls maps offsets to the native range inputs (Left/Top are
    // negative internally, the sliders show their inverted value)
    const offsetX = page.locator("input.offset-x");
    const offsetY = page.locator("input.offset-y");
    await expect(offsetX).toHaveValue("120", { timeout: 30_000 });
    await expect(offsetY).toHaveValue("40", { timeout: 30_000 });
  });
});
