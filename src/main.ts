import { CuttingTable } from "./CuttingTable";

let urls: URL | { url: string; label: string }[] = [
  { url: "https://vorsatzpapier.projektemacher.org/patterns/collection.json", label: "Sammlung Vorsatzpapier" }
];

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("url")) {
  const u = urlParams.get("url");
  if (u !== null) {
    urls = new URL(u);
  }
}

const generatorElement = document.querySelector<HTMLDivElement>("#generator")!;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const cuttingTable = new CuttingTable(generatorElement, true, true, true, true, urls, false);
