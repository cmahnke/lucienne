import OpenSeadragon from "openseadragon";

export class HideRect extends OpenSeadragon.Rect {
  constructor(tiledImage: OpenSeadragon.TiledImage | number, y?: number, width?: number, height?: number, degrees?: number) {
    let x;
    if (tiledImage instanceof OpenSeadragon.TiledImage) {
      x = tiledImage.getContentSize().x;
      y = tiledImage.getContentSize().y;
      width = 0;
      height = 0;
      degrees = tiledImage.getRotation();
    } else {
      x = tiledImage;
    }
    super(x, y, width, height, degrees);
  }

  clone(): HideRect {
    return new HideRect(this.x, this.y, this.width, this.height, this.degrees);
  }

  static isHidden(tiledImage: OpenSeadragon.TiledImage): boolean {
    const clip = tiledImage.getClip();
    if (clip === null) {
      return false;
    }
    const x = tiledImage.getContentSize().x;
    const y = tiledImage.getContentSize().y;
    const degrees = tiledImage.getRotation();
    if (clip.x != x || clip.y != y || clip.width != 0 || clip.height != 0 || clip.degrees != degrees) {
      return false;
    }

    return true;
  }
}
