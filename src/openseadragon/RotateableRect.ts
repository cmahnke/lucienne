import OpenSeadragon from "openseadragon";

export class RotateableRect extends OpenSeadragon.Rect {
  _xNoRotate: number;
  _yNoRotate: number;
  _widthNoRotate: number;
  _heightNoRotate: number;
  _degreesNoRotate: number = 0;
  _rotationPoint: OpenSeadragon.Point | undefined;

  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0, degrees: number = 0) {
    super(x, y, width, height, degrees);
    this._xNoRotate = x;
    this._yNoRotate = y;
    this._widthNoRotate = width;
    this._heightNoRotate = height;
    this._degreesNoRotate = degrees;
  }

  rotate(degree: number, pivot?: OpenSeadragon.Point | undefined): OpenSeadragon.Rect {
    super.rotate(degree, pivot);
    if (this._degreesNoRotate == 0) {
      this._degreesNoRotate = degree;
    } else {
      degree = degree % 360;
      if (degree < 0) {
        degree += 360;
      }
      this._degreesNoRotate = degree;
    }
    return this;
  }

  /*
  set x(x:number) {
    throw new Error("Don't set properties directly use 'setXNoRotate'");
  }

  set y(y:number) {
    throw new Error("Don't set properties directly use 'setYNoRotate'");
  }

  set width(width: number) {
    throw new Error("Don't set properties directly use 'setWidthNoRotate'");
  }

  set height(height: number ) {
    throw new Error("Don't set properties directly use 'setHeightNoRotate'");
  }

  set degrees(degrees:number) {
    throw new Error("Don't set properties directly use 'setDegreesNoRotate'");
  }
*/
  setXNoRotate(x: number) {
    this._xNoRotate = x;
    this._updateRotation();
  }

  setYNoRotate(y: number) {
    this._yNoRotate = y;
    this._updateRotation();
  }

  setWidthNoRotate(width: number) {
    this._widthNoRotate = width;
    this._updateRotation();
  }

  setHeightNoRotate(height: number) {
    this._widthNoRotate = height;
    this._updateRotation();
  }

  setDegreesNoRotate(height: number) {
    this._degreesNoRotate = height;
    this._updateRotation();
  }

  set rotationPoint(rotationPoint: OpenSeadragon.Point) {
    this._rotationPoint = rotationPoint;
  }

  get rotationPoint(): OpenSeadragon.Point {
    if (this._rotationPoint === undefined) {
      return this.getCenter();
    } else {
      return this._rotationPoint;
    }
  }

  _updateRotation() {
    if (RotateableRect._isRotated(this._degreesNoRotate)) {
      this.x = this._yNoRotate;
      this.y = this._xNoRotate;
      this.width = this._heightNoRotate;
      this.height = this._widthNoRotate;
    } else {
      this.x = this._xNoRotate;
      this.y = this._yNoRotate;
      this.width = this._widthNoRotate;
      this.height = this._heightNoRotate;
    }
  }

  clone() {
    const clone = new RotateableRect(this.x, this.y, this.width, this.height, this.degrees);
    clone._xNoRotate = this._xNoRotate;
    clone._yNoRotate = this._yNoRotate;
    clone._widthNoRotate = this._widthNoRotate;
    clone._heightNoRotate = this._heightNoRotate;
    clone._degreesNoRotate = this._degreesNoRotate;
    clone._rotationPoint = this._rotationPoint;

    return clone;
  }

  static _isRotated(degree: number, tolerance: number = 45): boolean {
    const isVertical = Math.abs(degree - 90) <= tolerance || Math.abs(degree - 270) <= tolerance;
    return !isVertical;
  }

  static fromRect(rect: OpenSeadragon.Rect): RotateableRect {
    return new RotateableRect(rect.x, rect.y, rect.width, rect.height, rect.degrees);
  }
}
