import OpenSeadragon from "openseadragon";
import { CutPosition } from "../types";

export class OffsetRect extends OpenSeadragon.Rect {
  _horizontal: CutPosition;
  _vertical: CutPosition;
  reference: OpenSeadragon.TiledImage;

  constructor(
    x: number = 0,
    y: number = 0,
    width: number = 0,
    height: number = 0,
    degrees: number = 0,
    horizontal?: CutPosition,
    vertical?: CutPosition
  ) {
    super(x, y, width, height, degrees);
    if (horizontal !== undefined) {
      this._horizontal = horizontal;
    }
    if (vertical !== undefined) {
      this._vertical = vertical;
    }
  }

  set horizontal(horizontal: CutPosition) {
    this._horizontal = horizontal;
  }
  get horizontal(): CutPosition {
    return this._horizontal;
  }

  set vertical(vertical: CutPosition) {
    this._vertical = vertical;
  }
  get vertical(): CutPosition {
    return this._vertical;
  }

  calculateX(reference?: OpenSeadragon.TiledImage): number {
    if (reference === undefined && this.reference !== undefined) {
      reference = this.reference;
    }
    if (reference !== undefined) {
      const width = this.reference.imageToViewportRectangle(this).width;
      if (this.horizontal !== undefined && this.horizontal == CutPosition.Left) {
        return -1 * width;
      }
      return width;
    }
    return 0;
  }

  calculateY(reference?: OpenSeadragon.TiledImage): number {
    if (reference === undefined && this.reference !== undefined) {
      reference = this.reference;
    }
    if (reference !== undefined) {
      const height = this.reference.imageToViewportRectangle(this).height;
      if (this.vertical !== undefined && this.vertical == CutPosition.Top) {
        return -1 * height;
      }
      return height;
    }
    return 0;
  }

  static fromRect(rect: OpenSeadragon.Rect): OffsetRect {
    return new OffsetRect(rect.x, rect.y, rect.width, rect.height, rect.degrees);
  }
}
