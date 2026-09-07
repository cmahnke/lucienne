import type { Page, Route } from "@playwright/test";
import { createTestTile } from "./png.mjs";

export const COLLECTION_URL = "https://vorsatzpapier.projektemacher.org/patterns/collection.json";
export const IMAGE_SERVICE = "https://iiif.test/image";
export const IMAGE_SERVICE_URL = `${IMAGE_SERVICE}/info.json`;
export const MANIFEST_URL = "https://iiif.test/manifest-one.json";

function fixture(route: Route, path: string, contentType = "application/ld+json") {
  return route.fulfill({ status: 200, contentType, path });
}

/**
 * Mocks all IIIF network traffic the app performs during the tests.
 * Registers a catch-all that aborts every request which is not served by the
 * local vite dev server or by one of the more specific mock routes below, so
 * no real network access is needed.
 */
export async function mockIIIF(page: Page) {
  const tile = createTestTile();
  const thumbnail = createTestTile(64, 64, [102, 153, 204]);

  // Lowest precedence: pass through the dev server, block everything external
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return route.continue();
    }
    return route.abort();
  });
  // The default collection URL hardcoded in src/main.ts
  await page.route(COLLECTION_URL, (route) => fixture(route, "e2e/fixtures/collection.json"));
  await page.route("https://iiif.test/manifest-*.json", (route) => fixture(route, "e2e/fixtures/manifest.json"));
  // IIIF tiles (lowest specificity of the concrete mocks, must be registered
  // before the exact info.json route below - Playwright gives precedence to
  // the most recently registered route)
  await page.route(`${IMAGE_SERVICE}/**`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: tile }));
  // IIIF image service: the bare service URL answers 404 (like real image
  // servers), the app then retries with the /info.json suffix
  await page.route(IMAGE_SERVICE_URL, (route) => fixture(route, "e2e/fixtures/info.json"));
  await page.route("https://iiif.test/thumb.jpg", (route) => route.fulfill({ status: 200, contentType: "image/png", body: thumbnail }));
}
