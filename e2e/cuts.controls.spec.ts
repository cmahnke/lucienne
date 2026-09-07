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
    // Without cuts the clip rect covers the full image (Right/Bottom default
    // to the image dimensions)
    expect(json.body.value).toContain('<rect x="0" y="0" width="512" height="512"');
  });

  test("vertical cut slider updates the top and bottom cuts", async ({ page }) => {
    await loadTestImage(page);

    const cutY = page.locator("dual-range-slider.cut-y");
    await cutY.locator("#slider-min").fill("100");
    await cutY.locator("#slider-max").fill("400");

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    // The SVG clip rect spans from the top cut to the explicitly set bottom
    // cut (only an UNSET bottom would default to the image height)
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

    // Drag the handle from the top (0 degrees) to the right (90 degrees):
    // programmatic value writes no longer dispatch "degreeChange" (see N2),
    // so the component is driven through its real user interaction
    const circle = page.locator("rotating-input.rotation-y .circle");
    await circle.scrollIntoViewIfNeeded();
    const box = await circle.boundingBox();
    if (box === null) {
      throw new Error("Rotation circle is not visible");
    }
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const radius = box.width / 2;

    await page.mouse.move(centerX, centerY - radius);
    await page.mouse.down();
    await page.mouse.move(centerX + radius, centerY, { steps: 5 });
    await page.mouse.up();

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
