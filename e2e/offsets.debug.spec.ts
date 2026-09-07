import fs from "node:fs";
import { test } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

// Dumps the CHILD renderer geometry (the one used for downloads) and saves
// its canvas content to diagnose the download rendering.
test.skip(!process.env.CAPTURE_OFFSETS, "diagnostics only");

test("dump child renderer", async ({ page }) => {
  page.on("console", (msg) => {
    if (msg.text().startsWith("[child]")) console.log(msg.text().slice(0, 300));
  });
  await loadTestImage(page, "/?patterned=1");
  await page.locator("input.offset-y").evaluate((el) => {
    (el as HTMLInputElement).value = "-100";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(800);

  await page.evaluate(async () => {
    const renderer = (document.querySelector(".output-viewer") as unknown as { osdRenderer?: any }).osdRenderer;
    const child = await renderer.renderImage(1920, 1080);
    const world = child.world;
    const lines: string[] = [];
    for (let i = 0; i < world.getItemCount(); i++) {
      const ti = world.getItemAt(i)!;
      const b = ti.getBounds();
      const c = ti.getClip();
      const r = Math.floor(i / 8);
      const col = i % 8;
      lines.push(
        `[child] r=${r} c=${col} pos=(${b.x.toFixed(0)},${b.y.toFixed(0)}) clip=${c ? `${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.width.toFixed(0)}x${c.height.toFixed(0)}` : "null"}`
      );
    }
    const canvas = child.drawer.canvas as HTMLCanvasElement;
    const dataUrlBefore = canvas.toDataURL("image/png");
    await new Promise((r) => setTimeout(r, 500));
    const dataUrlAfter = canvas.toDataURL("image/png");
    lines.push(`[child] canvasChanged=${dataUrlBefore !== dataUrlAfter} beforeLen=${dataUrlBefore.length} afterLen=${dataUrlAfter.length}`);
    (window as unknown as { __childCanvas: string }).__childCanvas = dataUrlAfter;
    lines.push(`[child] canvas ${canvas.width}x${canvas.height}, drawn tiles: ${world.getItemCount()}`);
    console.log(lines.join("\n"));
    console.log(
      `[child] canvasChanged=${dataUrlBefore !== dataUrlAfter} beforeLen=${dataUrlBefore.length} afterLen=${dataUrlAfter.length}`
    );
  });

  const dataUrl = await page.evaluate(() => (window as unknown as { __childCanvas: string }).__childCanvas);
  fs.mkdirSync("test-results/offset-screenshots", { recursive: true });
  fs.writeFileSync("test-results/offset-screenshots/debug-child-canvas.png", Buffer.from(dataUrl.split(",")[1], "base64"));
});
