import { test, expect } from "@playwright/test";
import { loadTestImage, downloadCutJson } from "./helpers/app";

// The downloaded document is a Web Annotation (CutJSONLD) whose body contains
// an SVG pattern built from the current cut positions (Cuts.ts:570-625)
interface CutJSONLD {
  type: string;
  motivation: string;
  body: { type: string; value: string };
  target: { source: string; selector: { type: string; value: string } };
}

test.describe("cut controls", () => {
  test("downloads the initial JSONLD document", async ({ page }) => {
    await loadTestImage(page);

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.type).toBe("Annotation");
    expect(json.motivation).toBe("editing");
    expect(json.body.type).toBe("Dataset");
    expect(json.target.source).toBe("https://iiif.test/image/info.json");
    expect(json.target.selector.value).toBe("xywh=0,0,512,512");
    // Without cuts the clip rect covers nothing yet
    expect(json.body.value).toContain('<rect x="0" y="0" width="0" height="0"');
  });

  test("vertical cut slider updates the top and bottom cuts", async ({ page }) => {
    await loadTestImage(page);

    const cutY = page.locator("dual-range-slider.cut-y");
    await cutY.locator("#slider-min").fill("100");
    await cutY.locator("#slider-max").fill("400");

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    // The SVG clip rect spans from the top to the bottom cut
    expect(json.body.value).toContain('y="100"');
    expect(json.body.value).toContain('height="300"');
    expect(json.target.selector.value).toBe("xywh=0,0,512,512");
  });

  test("horizontal cut slider updates the left cut", async ({ page }) => {
    await loadTestImage(page);

    const cutX = page.locator("dual-range-slider.cut-x");
    await cutX.locator("#slider-min").fill("50");

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain('x="50"');
  });

  test("rotation control updates the SVG transform", async ({ page }) => {
    await loadTestImage(page);

    // Setting the value property dispatches a "degreeChange" event on the
    // host element, which the cutting table maps to cuts.rotateY
    await page.locator("rotating-input.rotation-y").evaluate((el: HTMLElement) => {
      (el as unknown as { value: number }).value = 90;
    });

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.body.value).toContain("rotate(90");
  });

  test("ruler checkbox toggles the cut visibility", async ({ page }) => {
    await loadTestImage(page);

    const rulers = page.locator("input.box.rulers");
    await expect(rulers).toBeChecked();
    await rulers.uncheck();
    await expect(rulers).not.toBeChecked();

    // Toggling back on restores the initial state for the next assertions
    await rulers.check();
    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(json.type).toBe("Annotation");
  });
});
