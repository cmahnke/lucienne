import OpenSeadragon from "openseadragon";
import type { IIIFImageStub } from "../types";

export class IIIFTileSourceSpecifier {
  tileSource: IIIFImageStub;

  constructor(source: IIIFImageStub) {
    this.tileSource = source;
  }

  static wrap(
    source: IIIFImageStub | OpenSeadragon.TiledImage | (IIIFImageStub | OpenSeadragon.TiledImage)[]
  ): OpenSeadragon.TileSourceSpecifier | OpenSeadragon.TileSourceSpecifier[] {
    if (Array.isArray(source)) {
      return source.map((s) => IIIFTileSourceSpecifier.wrap(s) as OpenSeadragon.TileSourceSpecifier);
    }
    if (source instanceof OpenSeadragon.TiledImage) {
      return { tileSource: source.source } as OpenSeadragon.TileSourceSpecifier;
    }
    return { tileSource: source } as OpenSeadragon.TileSourceSpecifier;
  }
}
