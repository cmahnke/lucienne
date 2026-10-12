import { test, expect, Page } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

interface OutputState {
  loaded: boolean;
  items: number;
  type: string | undefined;
  width: number | undefined;
  height: number | undefined;
  clip: { x: number; y: number; width: number; height: number } | null;
  status: string;
}

async function outputState(page: Page): Promise<OutputState> {
  return page.evaluate(() => {
    const renderer = (document.querySelector(".output-viewer") as unknown as { osdRenderer?: Record<string, never> | any }).osdRenderer;
    if (renderer === undefined) {
      return { loaded: false, items: 0, type: undefined, width: undefined, height: undefined, clip: null, status: "" };
    }
    const clipRect = renderer.clipRect;
    return {
      loaded: renderer._loaded === true,
      items: renderer.viewer.world.getItemCount(),
      type: renderer._source?.type,
      width: renderer._source?.width,
      height: renderer._source?.height,
      clip: clipRect ? { x: clipRect.x, y: clipRect.y, width: clipRect.width, height: clipRect.height } : null,
      status: document.querySelector(".status-container")?.textContent ?? ""
    };
  });
}

async function waitForLoaded(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector(".output-viewer") as unknown as { osdRenderer?: { _loaded?: boolean } }).osdRenderer?._loaded === true,
    undefined,
    { timeout: 30_000 }
  );
}

// Samples the configured 4x4 area (the visible grid of repeat cells around the
// world origin, the margin ring is hidden) and counts sample points that no
// drawn tile covers. Mirrors the approach of the offsets coverage test.
async function uncoveredSamples(page: Page) {
  return page.evaluate(() => {
    const renderer = (document.querySelector(".output-viewer") as unknown as { osdRenderer?: any }).osdRenderer;
    const world = renderer.viewer.world;
    const rects: { x: number; y: number; width: number; height: number }[] = [];
    let cellWidth = 0;
    let cellHeight = 0;
    for (let i = 0; i < world.getItemCount(); i++) {
      const tile = world.getItemAt(i);
      if (tile === undefined) {
        continue;
      }
      const bounds = tile.getClippedBounds();
      if (bounds.width > 0 && bounds.height > 0) {
        rects.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
        if (tile.getRotation() === 0) {
          cellWidth = Math.max(cellWidth, bounds.width);
          cellHeight = Math.max(cellHeight, bounds.height);
        }
      }
    }
    if (cellWidth === 0 || cellHeight === 0) {
      return { uncovered: -1, samples: 0, rects: rects.length };
    }
    const crop = { width: 4 * cellWidth, height: 4 * cellHeight };
    const steps = 32;
    let uncovered = 0;
    for (let sy = 0; sy < steps; sy++) {
      for (let sx = 0; sx < steps; sx++) {
        const px = ((sx + 0.5) / steps) * crop.width;
        const py = ((sy + 0.5) / steps) * crop.height;
        const covered = rects.some((rect) => px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height);
        if (!covered) {
          uncovered++;
        }
      }
    }
    return { uncovered, samples: steps * steps, rects: rects.length };
  });
}

test.describe("easter egg", () => {
  test("Escape renders the carpet as a seamless wallpaper grid", async ({ page }) => {
    await loadTestImage(page);

    await page.keyboard.press("Escape");

    await waitForLoaded(page);
    const state = await outputState(page);
    expect(state.type).toBe("image");
    expect(state.width).toBe(840);
    expect(state.height).toBe(600);
    expect(state.clip).toEqual({ x: 0, y: 0, width: 840, height: 600 });
    expect(state.items).toBeGreaterThan(0);
    expect(state.status).toBe("");

    await expect(page.locator(".cutting-table-viewer canvas").first()).toBeVisible();
    await expect(page.locator(".output-viewer canvas").first()).toBeVisible();
    await expect(page.locator("#downloadJSON")).not.toHaveClass(/disabled/);
    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("max", 840);
    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("max", 600);

    const coverage = await uncoveredSamples(page);
    expect(coverage.rects).toBeGreaterThan(0);
    expect(coverage.uncovered).toBe(0);
  });

  test("Escape again restores the IIIF image and its transformation", async ({ page }) => {
    await loadTestImage(page);

    await page.keyboard.press("Escape");
    await waitForLoaded(page);

    await page.keyboard.press("Escape");
    await waitForLoaded(page);

    const state = await outputState(page);
    expect(state.type).toBe("ImageService3");
    expect(state.width).toBe(512);
    expect(state.height).toBe(512);
    expect(state.clip).toEqual({ x: 0, y: 0, width: 512, height: 512 });
    expect(state.status).toBe("");

    const coverage = await uncoveredSamples(page);
    expect(coverage.uncovered).toBe(0);

    // The restored output reacts to the cut controls again instead of being
    // stuck in the state the egg left behind
    await page.locator("dual-range-slider.cut-x").locator("#slider-min").fill("100");
    await expect.poll(async () => (await outputState(page)).clip?.x).toBe(100);
  });

  test("the cut is preserved proportionally across the toggle", async ({ page }) => {
    await loadTestImage(page);

    const cutX = page.locator("dual-range-slider.cut-x");
    const cutY = page.locator("dual-range-slider.cut-y");
    await cutX.locator("#slider-min").fill("50");
    await cutX.locator("#slider-max").fill("450");
    await cutY.locator("#slider-min").fill("100");
    await cutY.locator("#slider-max").fill("400");
    await expect.poll(async () => (await outputState(page)).clip).toEqual({ x: 50, y: 100, width: 400, height: 300 });

    await page.keyboard.press("Escape");
    await waitForLoaded(page);
    // 50/512*840=82, 100/512*600=117, 450/512*840=738, 400/512*600=469
    await expect.poll(async () => (await outputState(page)).clip).toEqual({ x: 82, y: 117, width: 656, height: 352 });
    await expect(cutX).toHaveAttribute("value-min", "82");
    await expect(cutX).toHaveAttribute("value-max", "738");
    await expect(cutY).toHaveAttribute("value-min", "117");
    await expect(cutY).toHaveAttribute("value-max", "469");

    await page.keyboard.press("Escape");
    await waitForLoaded(page);
    await expect.poll(async () => (await outputState(page)).clip).toEqual({ x: 50, y: 100, width: 400, height: 300 });
    await expect(cutX).toHaveAttribute("value-min", "50");
    await expect(cutX).toHaveAttribute("value-max", "450");
  });

  test("a toggle during a load is queued and applied", async ({ page }) => {
    await loadTestImage(page);

    await page.keyboard.press("Escape");
    // Second press while the carpet load is still in flight: it must not be
    // lost, applied twice, or leave an error behind
    await page.keyboard.press("Escape");

    await expect.poll(async () => (await outputState(page)).type, { timeout: 15_000 }).toBe("ImageService3");
    // The type flips the moment the source is assigned; the tiles and the
    // layout still have to finish loading afterwards
    await waitForLoaded(page);
    const state = await outputState(page);
    expect(state.loaded).toBe(true);
    expect(state.clip).toEqual({ x: 0, y: 0, width: 512, height: 512 });
    expect(state.status).toBe("");

    const coverage = await uncoveredSamples(page);
    expect(coverage.uncovered).toBe(0);
  });
});
