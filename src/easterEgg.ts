import { CutPosition } from "./types";
import type { CuttingTable } from "./CuttingTable";
import type { IIIFImageStub } from "./types";

type GridSize = { width: number; height: number };
type CutRegion = GridSize & { left: number; top: number; right: number; bottom: number };

// Ported from https://coolbutuseless.github.io/package/minisvg/articles/carpet-01.html

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
    const pts = [0, 60, 120, 180, 240, 300, 360].map((a) => {
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

  createSource(): IIIFImageStub & { type: "image"; url: string } {
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
  let previousCut: CutRegion | undefined;
  let active = false;
  let pending = false;
  let pendingTimeout: number | undefined;

  const snapshotCut = (): CutRegion | undefined => {
    const cuts = table.cuts;
    if (cuts === undefined || cuts.width === undefined || cuts.height === undefined) {
      return undefined;
    }
    return {
      width: cuts.width,
      height: cuts.height,
      left: cuts.getPosition(CutPosition.Left),
      top: cuts.getPosition(CutPosition.Top),
      right: cuts.getPosition(CutPosition.Right),
      bottom: cuts.getPosition(CutPosition.Bottom)
    };
  };

  const applyMappedCut = (target: GridSize, snapshot: CutRegion) => {
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const left = clamp(Math.round((snapshot.left / snapshot.width) * target.width), 0, target.width - 1);
    const top = clamp(Math.round((snapshot.top / snapshot.height) * target.height), 0, target.height - 1);
    const right = clamp(Math.round((snapshot.right / snapshot.width) * target.width), left + 1, target.width);
    const bottom = clamp(Math.round((snapshot.bottom / snapshot.height) * target.height), top + 1, target.height);
    if (left === 0 && top === 0 && right === target.width && bottom === target.height) {
      return;
    }
    const cuts = table.cuts;
    if (cuts === undefined) {
      return;
    }
    cuts.update(CutPosition.Left, left);
    cuts.update(CutPosition.Top, top);
    cuts.update(CutPosition.Right, right);
    cuts.update(CutPosition.Bottom, bottom);
    table.updateControls();
  };

  const applyCutAfterLoad = (target: GridSize, snapshot: CutRegion) => {
    // updateLines() re-initializes the cuts when the new source appears in the
    // viewer, so the mapped cut has to be applied after that
    table.viewer?.world.addOnceHandler("add-item", () => {
      applyMappedCut(target, snapshot);
    });
  };

  const runToggle = () => {
    if (active) {
      const source = previousSource;
      const url = previousUrl;
      const cut = previousCut;
      active = false;
      previousSource = undefined;
      previousUrl = undefined;
      previousCut = undefined;
      if (source === undefined) {
        return;
      }
      table.imageService = source;
      if (url !== undefined) {
        table.imageServiceUrl = url;
      }
      if (cut !== undefined) {
        applyCutAfterLoad({ width: source.width, height: source.height }, cut);
      }
    } else {
      const current = table.renderer?._source;
      if (current === undefined) {
        return;
      }
      previousSource = current;
      previousUrl = table.imageServiceUrl;
      const cut = snapshotCut();
      previousCut = cut;
      active = true;
      const source = egg.createSource();
      table.imageService = source;
      table.imageServiceUrl = new URL(egg.toDataUri());
      if (cut !== undefined) {
        applyCutAfterLoad({ width: source.width, height: source.height }, cut);
      }
    }
  };

  const runPendingToggle = () => {
    if (pendingTimeout !== undefined) {
      window.clearTimeout(pendingTimeout);
      pendingTimeout = undefined;
    }
    if (!pending) {
      return;
    }
    pending = false;
    runToggle();
  };

  // A load reports back through the renderer's source-loaded event, the
  // timeout is a safety net for a failing load so a queued toggle can never
  // wedge the control
  const queueToggle = () => {
    pending = true;
    table.renderer?.viewer?.addOnceHandler("source-loaded", runPendingToggle);
    pendingTimeout = window.setTimeout(runPendingToggle, 5000);
  };

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

    if (table.renderer !== undefined && table.renderer._source !== undefined && !table.renderer.loaded) {
      // A load is still in flight: queue the toggle so two loads don't
      // interleave
      queueToggle();
      return;
    }
    runToggle();
  });
}
