import { CuttingTable } from "./CuttingTable";

let urls: URL | { url: string; label: string }[] = [
  { url: "https://vorsatzpapier.projektemacher.org/patterns/collection.json", label: "Sammlung Vorsatzpapier" }
];

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("url")) {
  const u = urlParams.get("url");
  if (u !== null) {
    try {
      urls = new URL(u);
    } catch (error) {
      // Keep the default collection instead of failing with an uncaught URIError
      console.error(`Invalid "url" query parameter ignored: ${u}`, error);
    }
  }
}

const generatorElement = document.querySelector<HTMLDivElement>("#generator")!;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const cuttingTable = new CuttingTable(generatorElement, true, true, true, true, urls, true);
