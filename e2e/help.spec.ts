import { test, expect } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

// The help screen explains the controls. The language follows the detected
// browser language (i18next LanguageDetector): English is the fallback,
// German is used for de locales.
test.describe("help screen", () => {
  test("help button opens the dialog in the detected language (English default)", async ({ page }) => {
    await loadTestImage(page);

    const helpButton = page.locator(".help-button");
    await expect(helpButton).toBeVisible();
    await expect(helpButton).toHaveAttribute("title", "Help");

    await helpButton.click();
    const dialog = page.locator(".help-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toHaveText("Controls");
    await expect(dialog.locator(".help-list li")).toHaveCount(9);
    await expect(dialog.locator(".help-list li").first()).toContainText("Grid size");
    await expect(dialog.locator(".help-list li").nth(2)).toContainText("Offset sliders");

    await dialog.locator(".help-close").click();
    await expect(dialog).not.toBeVisible();
  });

  test.describe("german locale", () => {
    test.use({ locale: "de-DE" });

    test("help content is translated to German for de locales", async ({ page }) => {
      await loadTestImage(page);

      const helpButton = page.locator(".help-button");
      await expect(helpButton).toHaveAttribute("title", "Hilfe");

      await helpButton.click();
      const dialog = page.locator(".help-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("h2")).toHaveText("Steuerung");
      await expect(dialog.locator(".help-list li").first()).toContainText("Rastergröße");
      await expect(dialog.locator(".help-list li").nth(2)).toContainText("Versatz-Regler");
      await expect(dialog.locator(".help-close")).toHaveText("Schließen");
    });
  });
});
