import { test, expect, Page } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

interface DragTick {
  zoom: number;
  centerX: number;
  centerY: number;
  overlap: number;
  status: string;
}

// Drives one offset slider through a drag-like sweep, sampling the output
// viewer state after every tick: viewport framing, pairwise overlap of drawn
// tiles and filler deployments. Fillers use a plain OpenSeadragon.Rect clip
// while regular tiles use RotateableRect (hidden ones HideRect).
async function sweepOffset(page: Page, selector: string, values: number[]) {
  return page.evaluate(
    async (args: { selector: string; values: number[] }) => {
      const renderer = (document.querySelector(".output-viewer") as unknown as { osdRenderer?: any }).osdRenderer;
      const viewer = renderer.viewer;
      const input = document.querySelector(args.selector) as HTMLInputElement;
      const ticks: { zoom: number; centerX: number; centerY: number; overlap: number; fillers: number }[] = [];
      for (const value of args.values) {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const world = viewer.world;
        const rects: { x: number; y: number; width: number; height: number }[] = [];
        let fillers = 0;
        for (let i = 0; i < world.getItemCount(); i++) {
          const tile = world.getItemAt(i);
          if (tile === undefined) {
            continue;
          }
          const clip = tile.getClip();
          const drawn = tile.getClippedBounds();
          if (clip === null || clip.width <= 0 || clip.height <= 0 || drawn.width <= 0 || drawn.height <= 0) {
            continue;
          }
          if (clip.constructor.name !== "RotateableRect") {
            fillers++;
          }
          rects.push({ x: drawn.x, y: drawn.y, width: drawn.width, height: drawn.height });
        }
        let overlap = 0;
        for (let a = 0; a < rects.length; a++) {
          for (let b = a + 1; b < rects.length; b++) {
            const ix0 = Math.max(rects[a].x, rects[b].x);
            const iy0 = Math.max(rects[a].y, rects[b].y);
            const ix1 = Math.min(rects[a].x + rects[a].width, rects[b].x + rects[b].width);
            const iy1 = Math.min(rects[a].y + rects[a].height, rects[b].y + rects[b].height);
            if (ix1 > ix0 && iy1 > iy0) {
              overlap += (ix1 - ix0) * (iy1 - iy0);
            }
          }
        }
        const center = viewer.viewport.getCenter();
        ticks.push({ zoom: viewer.viewport.getZoom(), centerX: center.x, centerY: center.y, overlap, fillers });
      }
      return { ticks, status: document.querySelector(".status-container")?.textContent ?? "" };
    },
    { selector, values }
  );
}

async function setupCut(page: Page) {
  await loadTestImage(page);
  await page.locator("dual-range-slider.cut-x").locator("#slider-min").fill("50");
  await page.locator("dual-range-slider.cut-x").locator("#slider-max").fill("450");
  await page.locator("dual-range-slider.cut-y").locator("#slider-min").fill("100");
  await page.locator("dual-range-slider.cut-y").locator("#slider-max").fill("400");
  await page.waitForTimeout(500);
}

test.describe("offset slider stability", () => {
  for (const axis of ["x", "y"] as const) {
    test(`dragging offset-${axis} keeps framing stable with no overlapping tiles`, async ({ page }) => {
      await setupCut(page);
      const values: number[] = [];
      for (let v = 0; v <= 200; v += 10) {
        values.push(v);
      }
      const { ticks, status } = await sweepOffset(page, `input.offset-${axis}`, values);
      expect(ticks.length).toBe(values.length);
      expect(status).toBe("");

      // The configured crop never changes during an offset drag, so the
      // viewport fit must be bit-identical on every tick: any deviation is
      // a visible jump. Fillers may legitimately deploy for genuine gaps,
      // but they must land exactly on the gap - never overlap real content.
      const first = ticks[0];
      for (const tick of ticks) {
        expect(tick.zoom).toBe(first.zoom);
        expect(tick.centerX).toBe(first.centerX);
        expect(tick.centerY).toBe(first.centerY);
        expect(tick.overlap).toBe(0);
      }
    });
  }
});
