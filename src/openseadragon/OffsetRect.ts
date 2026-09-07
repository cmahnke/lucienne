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

  static viewportScale(tile: OpenSeadragon.TiledImage): number {
    // The tile's uniform image-to-viewport scale, rotation-independent: for
    // 90/270 degree rotated tiles the world width corresponds to the content
    // height instead of the content width
    const rotation = ((tile.getRotation() % 360) + 360) % 360;
    const content = tile.getContentSize();
    const bounds = tile.getBounds();
    const imageWidth = rotation % 180 === 0 ? content.x : content.y;
    return bounds.width / imageWidth;
  }

  calculateX(reference?: OpenSeadragon.TiledImage): number {
    if (reference === undefined && this.reference !== undefined) {
      reference = this.reference;
    }
    if (reference !== undefined) {
      // Deliberately not using imageToViewportRectangle here: it bakes the
      // tile rotation into the rectangle (OpenSeadragon normalizes rotated
      // rectangles by swapping width and height), which made the offset
      // magnitude collapse to 0 for 90/270 degree rotated tiles - the
      // strips they belong to shifted while these tiles stayed behind.
      const scale = OffsetRect.viewportScale(reference);
      if (this.horizontal !== undefined && this.horizontal == CutPosition.Left) {
        return -1 * this.width * scale;
      }
      return this.width * scale;
    }
    return 0;
  }

  calculateY(reference?: OpenSeadragon.TiledImage): number {
    if (reference === undefined && this.reference !== undefined) {
      reference = this.reference;
    }
    if (reference !== undefined) {
      // See calculateX for why the scale is computed manually
      const scale = OffsetRect.viewportScale(reference);
      if (this.vertical !== undefined && this.vertical == CutPosition.Top) {
        return -1 * this.height * scale;
      }
      return this.height * scale;
    }
    return 0;
  }

  static fromRect(rect: OpenSeadragon.Rect): OffsetRect {
    return new OffsetRect(rect.x, rect.y, rect.width, rect.height, rect.degrees);
  }
}
