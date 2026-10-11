import type { CuttingTable } from "./CuttingTable";
import type { IIIFImageStub } from "./types";

type EasterEggTileSource = IIIFImageStub & {
  type: "image";
  url: string;
};

class EasterEggSVG {
  private sw = 20;
  private h = this.sw * 10;
  private w = this.sw * 7;
  private red = "rgb(152,31,36)";
  private orange = "rgb(223,95,24)";

  get width(): number {
    return 6 * this.w;
  }

  get height(): number {
    return 3 * this.h;
  }

  private hex(cx: number, cy: number, r: number): string {
    const pts = [0, 60, 120, 180, 240, 300, 360].map(a => {
      const rad = (Math.PI / 180) * a;
      const x = Math.round((cx + r * Math.sin(rad)) * 100) / 100;
      const y = Math.round((cy + r * Math.cos(rad)) * 100) / 100;
      return `${x},${y}`;
    });
    return pts.join(" ");
  }

  private polygon(points: string, fill: string): string {
    return `<polygon points="${points}" fill="${fill}" />`;
  }

  private line(x1: number, y1: number, x2: number, y2: number, strokeWidth?: number): string {
    const sw = strokeWidth ? ` stroke-width="${strokeWidth}"` : "";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${sw} />`;
  }

  private buildMotif(): string {
    const { w, h, sw, red } = this;

    const shapes = [
      this.polygon(this.hex(w / 2, h / 2, sw * 2), red),
      this.polygon(this.hex(0, h - sw, sw * 2), red),
      this.polygon(this.hex(w, h - sw, sw * 2), red),
      this.polygon(this.hex(0, -sw, sw * 2), red),
      this.polygon(this.hex(w, -sw, sw * 2), red),
      this.polygon(this.hex(0, -sw, sw * 4), "none"),
      this.polygon(this.hex(w, -sw, sw * 4), "none"),
      this.line(w / 2, h - sw * 3, w / 2, h, sw + 2),
      this.line(0, h - sw * 7, 0, h - sw * 3),
      this.line(w, h - sw * 7, w, h - sw * 3)
    ].join("\n      ");

    return `
    <pattern id="motif" width="${w}" height="${h}" patternUnits="userSpaceOnUse">
      <g stroke-width="${sw}" stroke="black">
      ${shapes}
      </g>
    </pattern>`;
  }

  render(): string {
    const { orange } = this;

    return `<svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
   <rect x="0" y="0" width="100%" height="100%" fill="${orange}" />
   <defs>${this.buildMotif()}
   </defs>
   <rect x="0" y="0" width="100%" height="100%" fill="url(#motif)" />
</svg>`;
  }

  toDataUri(): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(this.render());
  }

  createSource(): EasterEggTileSource {
    return {
      "@context": "http://iiif.io/api/image/3/context.json",
      type: "image",
      url: this.toDataUri(),
      width: this.width,
      height: this.height
    };
  }
}

export function installEasterEgg(table: CuttingTable) {
  const egg = new EasterEggSVG();
  let previousSource: IIIFImageStub | undefined;
  let previousUrl: URL | undefined;
  let active = false;

  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }
    const dialog = table.container.querySelector<HTMLDialogElement>("dialog[open]");
    if (dialog !== null) {
      return;
    }
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("input, textarea, select") !== null) {
        return;
      }
      const otherGenerator = target.closest<HTMLElement>(".lucienne");
      if (otherGenerator !== null && otherGenerator !== table.container) {
        return;
      }
    }

    if (active) {
      active = false;
      const source = previousSource;
      const url = previousUrl;
      previousSource = undefined;
      previousUrl = undefined;
      if (source !== undefined) {
        table.imageService = source;
      }
      if (url !== undefined) {
        table.imageServiceUrl = url;
      }
      return;
    }

    const currentSource = table.renderer?._source;
    if (currentSource === undefined) {
      return;
    }
    previousSource = currentSource;
    previousUrl = table.imageServiceUrl;
    active = true;
    table.imageService = egg.createSource();
    table.imageServiceUrl = new URL(egg.toDataUri());
  });
}
