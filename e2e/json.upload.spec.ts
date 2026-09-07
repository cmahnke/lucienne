import { test, expect, Page } from "@playwright/test";
import { loadTestImage, downloadCutJson } from "./helpers/app";
import { IMAGE_SERVICE_URL } from "./fixtures/mock";

interface CutJSONLD {
  body: { value: string; cuts?: { [key: string]: number }; offsets?: { [key: string]: number }; rotations?: { [key: string]: number } };
  target: { source: string; selector: { value: string } };
}

async function dropJson(page: Page, content: string) {
  const dataTransfer = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], "cuts.json", { type: "application/json" }));
    return dt;
  }, content);
  await page.dispatchEvent(".input-area", "drop", { dataTransfer });
}

test.describe("JSON upload", () => {
  test("applies uploaded cut definitions to the controls", async ({ page }) => {
    await loadTestImage(page);

    const cutJson = JSON.stringify({
      url: IMAGE_SERVICE_URL,
      width: 512,
      height: 512,
      cuts: { Top: 100, Bottom: 400 }
    });

    await dropJson(page, cutJson);

    // The tile-loaded handler applies the JSON and syncs the controls
    // (CuttingTable.dropHandler -> cuts.loadJSON -> updateControls)
    const cutY = page.locator("dual-range-slider.cut-y");
    await expect(cutY).toHaveAttribute("value-min", "100", { timeout: 30_000 });
    await expect(cutY).toHaveAttribute("value-max", "400", { timeout: 30_000 });

    // The URL input now shows the image service URL from the JSON
    await expect(page.locator("#collection-url")).toHaveValue(IMAGE_SERVICE_URL);

    // No error message was displayed
    await expect(page.locator(".status-container")).toBeEmpty();
  });

  test("shows an error for non-JSON files", async ({ page }) => {
    await loadTestImage(page);

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["not json"], "cuts.txt", { type: "text/plain" }));
      return dt;
    });

    await page.dispatchEvent(".input-area", "drop", { dataTransfer });

    await expect(page.locator(".status-container")).toContainText("JSON could not be loaded");
    await expect(page.locator(".status-container")).toContainText("File is not a JSON");
  });

  test("applies uploaded offsets and rotations", async ({ page }) => {
    await loadTestImage(page);

    const cutJson = JSON.stringify({
      url: IMAGE_SERVICE_URL,
      width: 512,
      height: 512,
      offsets: { Right: 120, Top: -40 },
      rotations: { Right: 90 }
    });

    await dropJson(page, cutJson);

    const offsetX = page.locator("input.offset-x");
    const offsetY = page.locator("input.offset-y");
    await expect(offsetX).toHaveValue("120", { timeout: 30_000 });
    await expect(offsetY).toHaveValue("40", { timeout: 30_000 });
  });

  test("exports offsets, cuts and rotations in the downloaded JSON", async ({ page }) => {
    await loadTestImage(page);

    await page.locator("dual-range-slider.cut-y").evaluate((el) => {
      el.setAttribute("value-min", "100");
      el.setAttribute("value-max", "400");
      el.dispatchEvent(new CustomEvent("input", { detail: { min: 100, max: 400 } }));
    });
    await page.locator("input.offset-x").evaluate((el) => {
      (el as HTMLInputElement).value = "150";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("rotating-input.rotation-x").evaluate((el) => {
      el.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree: 90 } }));
    });
    await page.waitForTimeout(400);

    const json = (await downloadCutJson(page)) as unknown as CutJSONLD;
    // The structured state must ride along the SVG pattern (body.value)
    expect(json.body.cuts).toEqual({ Left: 0, Top: 100, Right: 512, Bottom: 400 });
    expect(json.body.offsets).toEqual({ Right: 150 });
    expect(json.body.rotations).toEqual({ Right: 90 });
    // The SVG pattern stays the body value for pattern consumers
    expect(typeof json.body.value).toBe("string");
    expect(json.body.value).toContain("<pattern");
    expect(json.target.selector.value).toBe("xywh=0,0,512,512");
  });

  test("re-importing the downloaded JSON restores the state", async ({ page }) => {
    await loadTestImage(page);

    await page.locator("dual-range-slider.cut-y").evaluate((el) => {
      el.setAttribute("value-min", "80");
      el.setAttribute("value-max", "430");
      el.dispatchEvent(new CustomEvent("input", { detail: { min: 80, max: 430 } }));
    });
    await page.locator("input.offset-x").evaluate((el) => {
      (el as HTMLInputElement).value = "150";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("input.offset-y").evaluate((el) => {
      (el as HTMLInputElement).value = "-70";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("rotating-input.rotation-x").evaluate((el) => {
      el.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree: 90 } }));
    });
    await page.waitForTimeout(400);

    const first = (await downloadCutJson(page)) as unknown as CutJSONLD;
    // Drop the downloaded document back onto the page (as a fresh file)
    await dropJson(page, JSON.stringify(first));
    await page.waitForTimeout(1500);

    const second = (await downloadCutJson(page)) as unknown as CutJSONLD;
    expect(second.body.cuts).toEqual(first.body.cuts);
    expect(second.body.offsets).toEqual(first.body.offsets);
    expect(second.body.rotations).toEqual(first.body.rotations);
    expect(second.target.selector.value).toBe(first.target.selector.value);
    expect(second.target.source).toBe(first.target.source);
  });

  test("shows an error for a JSONLD without a fragment selector", async ({ page }) => {
    await loadTestImage(page);

    const invalid = JSON.stringify({
      id: "",
      type: "Annotation",
      motivation: "editing",
      body: { type: "Dataset", id: "", value: "" },
      target: { source: IMAGE_SERVICE_URL, type: "SpecificResource", selector: { type: "FragmentSelector", value: "" } }
    });

    await dropJson(page, invalid);

    await expect(page.locator(".status-container")).toContainText("JSON could not be loaded", { timeout: 30_000 });
    await expect(page.locator(".status-container")).toContainText("Invalid JSONLD");
  });
});
