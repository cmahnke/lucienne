import { test, expect, Page } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

// Rotation regression coverage. The renderer must operate completely on every
// tile group per layout: no state (rotation, clip) may leak from the previous
// layout into the next one, unrotated tiles must not move when a rotation
// changes, and rotated tiles must keep their grid cell (the rotation
// compensation has to land the clipped content exactly in the cell).

interface TileSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  clip: { x: number; y: number; width: number; height: number; degrees: number } | null;
  clipped: { x: number; y: number; width: number; height: number };
}

async function snapshotWorld(page: Page): Promise<TileSnapshot[]> {
  return page.evaluate(() => {
    const renderer = (
      document.querySelector(".output-viewer") as unknown as {
        osdRenderer?: {
          viewer: {
            world: {
              getItemCount: () => number;
              getItemAt: (index: number) =>
                | {
                    getBounds: () => { x: number; y: number; width: number; height: number };
                    getRotation: () => number;
                    getClip: () => { x: number; y: number; width: number; height: number; degrees: number } | null;
                    getClippedBounds: () => { x: number; y: number; width: number; height: number };
                  }
                | undefined;
            };
          };
        };
      }
    ).osdRenderer;
    const world = renderer!.viewer.world;
    const tiles: TileSnapshot[] = [];
    for (let i = 0; i < world.getItemCount(); i++) {
      const tile = world.getItemAt(i);
      if (tile === undefined) {
        continue;
      }
      const b = tile.getBounds();
      const clip = tile.getClip();
      const clipped = tile.getClippedBounds();
      tiles.push({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        rotation: tile.getRotation(),
        clip: clip ? { x: clip.x, y: clip.y, width: clip.width, height: clip.height, degrees: clip.degrees } : null,
        clipped: { x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height }
      });
    }
    return tiles;
  });
}

async function rotate(page: Page, selector: string, degree: number) {
  await page.locator(selector).evaluate((el, d) => {
    el.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree: d } }));
  }, degree);
  // Wait for the relayout to settle
  await page.waitForTimeout(400);
}

test.describe("rotation", () => {
  test("rotating does not move unrotated tiles", async ({ page }) => {
    await loadTestImage(page);

    const before = await snapshotWorld(page);
    await rotate(page, "rotating-input.rotation-x", 90);
    const after = await snapshotWorld(page);

    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      // Only tiles that render (a non-empty clip) and stay unrotated must be
      // untouched - hidden spare tiles may be redeployed as wedge fillers
      const renders = before[i].clip !== null && before[i].clip!.width > 0 && before[i].clip!.height > 0;
      if (renders && after[i].rotation === 0 && before[i].rotation === 0) {
        expect(after[i].x).toBeCloseTo(before[i].x, 6);
        expect(after[i].y).toBeCloseTo(before[i].y, 6);
        expect(after[i].clip).toEqual(before[i].clip);
      }
    }
  });

  test("layout is stateless: rotating and reverting restores the original state", async ({ page }) => {
    await loadTestImage(page);

    const original = await snapshotWorld(page);
    await rotate(page, "rotating-input.rotation-x", 90);
    await rotate(page, "rotating-input.rotation-x", 0);
    const restored = await snapshotWorld(page);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      if (Math.abs(restored[i].x - original[i].x) > 1) {
        console.log(
          `[mismatch] i=${i} orig=(${original[i].x.toFixed(0)},${original[i].y.toFixed(0)} rot=${original[i].rotation} clip=${JSON.stringify(original[i].clip && [original[i].clip.x, original[i].clip.y, original[i].clip.width, original[i].clip.height])}) restored=(${restored[i].x.toFixed(0)},${restored[i].y.toFixed(0)} rot=${restored[i].rotation})`
        );
      }
      expect(restored[i].x).toBeCloseTo(original[i].x, 6);
      expect(restored[i].y).toBeCloseTo(original[i].y, 6);
      expect(restored[i].rotation).toBe(original[i].rotation);
      expect(restored[i].clip).toEqual(original[i].clip);
    }
  });

  test("repeated relayouts do not erode tiles", async ({ page }) => {
    await loadTestImage(page);

    // Trigger relayouts by re-setting the same offset: the first application
    // legitimately shifts the strips, so the reference state is taken after
    // it. Every further identical layout must produce the exact same state -
    // a layout that re-trims the previous layout's clips would erode them
    // further every time.
    const setOffset = async () => {
      await page.locator("input.offset-x").evaluate((el) => {
        (el as HTMLInputElement).value = "50";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(300);
    };
    await setOffset();
    const original = await snapshotWorld(page);
    await setOffset();
    await setOffset();
    const after = await snapshotWorld(page);

    expect(after.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      // Spare tiles (hidden in the original state) may be redeployed as
      // wedge fillers, which legitimately repositions them - only tiles
      // that rendered in the original state must stay stable
      if (original[i].clip !== null && original[i].clip!.width > 0 && original[i].clip!.height > 0) {
        expect(after[i].x).toBeCloseTo(original[i].x, 6);
        expect(after[i].y).toBeCloseTo(original[i].y, 6);
        expect(after[i].clip).toEqual(original[i].clip);
      }
    }
  });

  test("rotated tiles keep their grid cells", async ({ page }) => {
    await loadTestImage(page);

    await rotate(page, "rotating-input.rotation-x", 90);

    // With a full-image cut the drawn region of every visible tile must sit
    // exactly on its grid cell - this is what the rotation compensation is
    // responsible for
    const tiles = await snapshotWorld(page);
    const cells = tiles.filter((tile) => tile.clipped.width > 0);
    expect(cells.length).toBeGreaterThan(0);
    const cellWidth = cells[0].clipped.width;
    const cellHeight = cells[0].clipped.height;
    for (const tile of cells) {
      expect(tile.clipped.width).toBeCloseTo(cellWidth, 3);
      expect(tile.clipped.height).toBeCloseTo(cellHeight, 3);
      // The clipped bounds must sit on the regular lattice
      const column = Math.round(tile.clipped.x / cellWidth);
      const row = Math.round(tile.clipped.y / cellHeight);
      expect(tile.clipped.x).toBeCloseTo(column * cellWidth, 3);
      expect(tile.clipped.y).toBeCloseTo(row * cellHeight, 3);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(row).toBeGreaterThanOrEqual(0);
    }
  });

  test("rotated tiles keep their grid cells with a partial cut region", async ({ page }) => {
    await loadTestImage(page);

    // A cut region smaller than the image leaves margins around the clip -
    // the rotation compensation then has real work to do (with a full-image
    // clip all margins are zero and the compensation is a no-op). The cut is
    // x=0, y=100, 512x300 here.
    const cutY = page.locator("dual-range-slider.cut-y");
    await cutY.locator("#slider-min").fill("100");
    await cutY.locator("#slider-max").fill("400");

    await rotate(page, "rotating-input.rotation-x", 90);

    const tiles = await snapshotWorld(page);
    // Viewport scale from an unrotated tile: the world rect covers the whole
    // 512x512 mock image
    const unrotated = tiles.find((tile) => tile.rotation === 0 && tile.width > 0)!;
    const scale = unrotated.width / 512;
    const cellWidth = 512 * scale;
    const cellHeight = 300 * scale;
    const cropWidth = 4 * cellWidth;
    const cropHeight = 4 * cellHeight;
    // The clip center relative to the tile's world origin
    const clipCenterX = (0 + 512 / 2) * scale;
    const clipCenterY = (100 + 300 / 2) * scale;
    expect(cellHeight).toBeLessThan(cellWidth);

    let checked = 0;
    for (let index = 0; index < tiles.length; index++) {
      const tile = tiles[index];
      if (tile.clipped.width <= 0) {
        continue;
      }
      const row = Math.floor(index / 8) - 2;
      const column = (index % 8) - 2;
      // The drawn region must never stick out of the configured area
      expect(tile.clipped.x).toBeGreaterThanOrEqual(-0.5);
      expect(tile.clipped.y).toBeGreaterThanOrEqual(-0.5);
      expect(tile.clipped.x + tile.clipped.width).toBeLessThanOrEqual(cropWidth + 0.5);
      expect(tile.clipped.y + tile.clipped.height).toBeLessThanOrEqual(cropHeight + 0.5);
      // Untrimmed tiles (their clip is still the untouched cut region) must
      // center their drawn content exactly where the unrotated tiles do -
      // rotated and unrotated tiles must align. Tiles at the crop boundary
      // are trimmed on one side, which legitimately moves their drawn
      // center; with a non-square cut the rotated content also sticks out
      // symmetrically and gets trimmed.
      const clip = tile.clip;
      const untrimmed =
        clip !== null &&
        Math.abs(clip.x - 0) < 0.5 &&
        Math.abs(clip.y - 100) < 0.5 &&
        Math.abs(clip.width - 512) < 0.5 &&
        Math.abs(clip.height - 300) < 0.5;
      if (untrimmed) {
        const expectedCenterX = column * cellWidth + clipCenterX;
        const expectedCenterY = row * cellHeight + clipCenterY;
        const centerX = tile.clipped.x + tile.clipped.width / 2;
        const centerY = tile.clipped.y + tile.clipped.height / 2;
        if (Math.abs(centerY - expectedCenterY) > 0.5 || Math.abs(centerX - expectedCenterX) > 0.5) {
          console.log(
            `[center] i=${index} r=${row} c=${column} rot=${tile.rotation} drawn=(${tile.clipped.x.toFixed(2)},${tile.clipped.y.toFixed(2)} ${tile.clipped.width.toFixed(2)}x${tile.clipped.height.toFixed(2)}) expected=(${expectedCenterX.toFixed(2)},${expectedCenterY.toFixed(2)}) clip=${JSON.stringify(tile.clip && [tile.clip.x, tile.clip.y, tile.clip.width, tile.clip.height])}`
          );
        }
        expect(centerX).toBeCloseTo(expectedCenterX, 3);
        expect(centerY).toBeCloseTo(expectedCenterY, 3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
