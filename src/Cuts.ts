import { Line, Rect } from "fabric";
import { FabricOverlay } from "openseadragon-fabric-overlay";

import type { CutNotifyFunction, CutNotification, CutJSON, CutJSONLD } from "./types";
import { CutPosition, CutPositionUtil } from "./types";

export type CutType = "cut" | "offset" | "rotation";

export class Cuts {
  overlay: FabricOverlay;
  width: number;
  height: number;
  shapes: { [key in CutPosition]?: [Line, Rect] } = {};
  positions: { [key in CutPosition]?: number | undefined };
  offsets: { [key in CutPosition]?: number } = {};
  rotations: { [key in CutPosition]?: number } = {};
  changeCallback: CutNotifyFunction[];
  _url: URL;
  _show: boolean = false;
  lastAxis: CutPosition | undefined;

  constructor(positions: CutPosition[], overlay: FabricOverlay, url?: URL) {
    this.positions = {};
    this.overlay = overlay;
    if (url !== undefined) {
      this.url = url;
    }

    this.initCutShapes(positions);
  }

  initCutShapes(positions: CutPosition[]) {
    positions.forEach((position) => {
      const line = this.createLine();
      line.visible = false;
      const cover = this.createCover();
      cover.visible = false;
      this.shapes[position] = [line, cover];
      this.positions[position] = undefined;
    });
  }

  set url(url: URL) {
    this._url = url;
  }

  get url(): string {
    if (this._url !== undefined) {
      return this._url.toString();
    }
    return "";
  }

  get cutPostions() {
    return Object.keys(this.shapes) as unknown as CutPosition[];
  }

  get calculatedWidth(): number {
    let width = this.width;
    if (CutPosition.Left in this.positions && this.positions[CutPosition.Left] !== undefined) {
      width = width - this.positions[CutPosition.Left];
    }
    if (CutPosition.Right in this.positions && this.positions[CutPosition.Right] !== undefined) {
      width = width - (this.width - this.positions[CutPosition.Right]);
    }
    return width;
  }

  get calculatedHeight(): number {
    let height = this.height;
    if (CutPosition.Top in this.positions && this.positions[CutPosition.Top] !== undefined) {
      height = height - this.positions[CutPosition.Top];
    }
    if (CutPosition.Bottom in this.positions && this.positions[CutPosition.Bottom] !== undefined) {
      height = height - (this.width - this.positions[CutPosition.Bottom]);
    }
    return height;
  }

  getPosition(position: CutPosition): number {
    let val: number;
    if (this.positions[position] !== undefined) {
      val = this.positions[position];
    } else if (this.positions[position] === undefined && position == CutPosition.Right) {
      val = this.width;
    } else if (this.positions[position] === undefined && position == CutPosition.Left) {
      val = 0;
    } else if (this.positions[position] === undefined && position == CutPosition.Bottom) {
      val = this.height;
    } else if (this.positions[position] === undefined && position == CutPosition.Top) {
      val = 0;
    } else {
      throw new Error("Unknown CutPosition, this should never happen!");
    }
    return val;
  }

  square(): boolean {
    const changes: { position: CutPosition; value: number }[] = [];
    if (this.lastAxis === undefined) {
      if (this.height > this.width) {
        changes.push({ position: CutPosition.Bottom, value: this.width });
      } else if (this.height < this.width) {
        changes.push({ position: CutPosition.Right, value: this.height });
      }
    } else {
      const width = this.calculatedWidth;
      const height = this.calculatedHeight;
      if (height == width) {
        return false;
      }
      let side;

      if (this.lastAxis == CutPosition.Left || this.lastAxis == CutPosition.Right) {
        side = width;
        if (this.height < side) {
          side = this.height;
        }
        if (this.lastAxis == CutPosition.Left && this.width - this.getPosition(CutPosition.Left) < side) {
          side = this.width - this.getPosition(CutPosition.Left);
        }
        if (this.lastAxis == CutPosition.Right && this.getPosition(CutPosition.Right) < side) {
          side = this.getPosition(CutPosition.Right);
        }
      } else if (this.lastAxis == CutPosition.Top || this.lastAxis == CutPosition.Bottom) {
        side = height;
        if (this.width < side) {
          side = this.width;
        }
        if (this.lastAxis == CutPosition.Top && this.width - this.getPosition(CutPosition.Top) < side) {
          side = this.width - this.getPosition(CutPosition.Top);
        }
        if (this.lastAxis == CutPosition.Bottom && this.getPosition(CutPosition.Bottom) < side) {
          side = this.getPosition(CutPosition.Bottom);
        }
      } else {
        if (this.height > this.width) {
          side = this.width;
        } else {
          side = this.height;
        }
      }

      if (this.lastAxis == CutPosition.Left || this.lastAxis == CutPosition.Right) {
        if (this.lastAxis == CutPosition.Left) {
          changes.push({ position: CutPosition.Right, value: this.getPosition(CutPosition.Left) + side });
        } else if (this.lastAxis == CutPosition.Right) {
          changes.push({ position: CutPosition.Left, value: this.getPosition(CutPosition.Right) - side });
        }
        if (this.getPosition(CutPosition.Top) + side <= this.height) {
          changes.push({ position: CutPosition.Bottom, value: this.getPosition(CutPosition.Top) + side });
        } else {
          changes.push({ position: CutPosition.Bottom, value: this.height });
          changes.push({ position: CutPosition.Top, value: this.height - side });
        }
      } else if (this.lastAxis == CutPosition.Top || this.lastAxis == CutPosition.Bottom) {
        if (this.lastAxis == CutPosition.Top) {
          changes.push({ position: CutPosition.Bottom, value: this.getPosition(CutPosition.Top) + side });
        } else if (this.lastAxis == CutPosition.Bottom) {
          changes.push({ position: CutPosition.Top, value: this.getPosition(CutPosition.Bottom) - side });
        }
        if (this.getPosition(CutPosition.Left) + side <= this.width) {
          changes.push({ position: CutPosition.Right, value: this.getPosition(CutPosition.Left) + side });
        } else {
          changes.push({ position: CutPosition.Right, value: this.width });
          changes.push({ position: CutPosition.Left, value: this.width - side });
        }
      }
    }

    if (changes.length) {
      changes.forEach((change) => {
        this.update(change.position, change.value);
      });
      return true;
    }
    return false;
  }

  createLine(width: number = 5): Line {
    const line = new Line([0, 0, 0, 0], {
      strokeWidth: width,
      stroke: "red",
      hasControls: false,
      visible: false
    });
    this.overlay.fabricCanvas().add(line);
    return line;
  }

  createCover(opacity: number = 0.4, fill: string = "white"): Rect {
    const rect = new Rect({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      strokeWidth: 0,
      hasControls: false,
      opacity: opacity,
      fill: fill,
      visible: false
    });
    this.overlay.fabricCanvas().add(rect);
    return rect;
  }

  allPositions(): { [key in CutPosition]?: number } {
    const allPositions = Object.values(CutPosition)
      .filter((value) => typeof value === "number")
      .map((value) => value as number);
    const all: { [key in CutPosition]?: number } = {}; //= this.positions;
    allPositions.forEach((position) => {
      if (!(position in this.positions) || this.positions[position as CutPosition] === undefined) {
        if (position == CutPosition.Top) {
          all[position] = 0;
        } else if (position == CutPosition.Bottom) {
          if (this.height !== undefined) {
            all[position] = this.height;
          } else {
            all[position] = 0;
          }
        } else if (position == CutPosition.Right) {
          if (this.width !== undefined) {
            all[position] = this.width;
          } else {
            all[position] = 0;
          }
        } else if (position == CutPosition.Left) {
          all[position] = 0;
        }
      } else {
        all[position as CutPosition] = this.positions[position as CutPosition];
      }
    });
    return all;
  }

  getLine(position: CutPosition): Line | undefined {
    if (position in this.positions && this.shapes[position] !== undefined) {
      return this.shapes[position][0];
    }
    return undefined;
  }

  getCover(position: CutPosition): Rect | undefined {
    if (position in this.positions && this.shapes[position] !== undefined) {
      return this.shapes[position][1];
    }
    return undefined;
  }

  setLineWidth(position: CutPosition, width: number) {
    if (position in this.positions && this.shapes[position] !== undefined) {
      this.shapes[position][0].set({
        strokeWidth: width
      });
      this.shapes[position][0].setCoords();
      this.shapes[position][0].canvas?.renderAll();
    }
  }

  setVisibility(show?: boolean) {
    if (show === undefined) {
      show = !this._show;
    }
    if (this.shapes !== undefined) {
      const validPositions = Object.keys(this.shapes) as unknown as CutPosition[];
      validPositions.forEach((position: CutPosition) => {
        if (this.shapes[position] !== undefined) {
          this.shapes[position][0].visible = show;
          this.shapes[position][1].visible = show;
          this.shapes[position][1].canvas?.renderAll();
        }
      });
    }
    this._show = show;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const validPositions = Object.keys(this.positions) as unknown as CutPosition[];
    validPositions.forEach((position: CutPosition) => {
      if (this.shapes[position] === undefined) {
        return;
      }

      const line = this.shapes[position][0];
      const cover = this.shapes[position][1];

      if (position == CutPosition.Top) {
        line.set({
          x1: 0,
          y1: 0,
          x2: width,
          y2: 0
        });
        cover.set({
          left: 0,
          top: 0,
          width: width,
          height: 0
        });
      } else if (position == CutPosition.Bottom) {
        line.set({
          x1: 0,
          y1: height,
          x2: width,
          y2: height
        });
        cover.set({
          left: 0,
          top: height,
          width: width,
          height: height
        });
      } else if (position == CutPosition.Right) {
        line.set({
          x1: width,
          y1: 0,
          x2: width,
          y2: height
        });
        cover.set({
          left: width,
          top: 0,
          width: width,
          height: height
        });
      } else if (position == CutPosition.Left) {
        line.set({
          x1: 0,
          y1: 0,
          x2: 0,
          y2: height
        });
        cover.set({
          left: 0,
          top: 0,
          width: 0,
          height: height
        });
      } else {
        throw new Error("Not a valid position");
      }
      line.setCoords();
      cover.setCoords();
      line.canvas?.renderAll();
    });
  }

  set offsetX(offset: number) {
    if (offset < 0) {
      this.offsets[CutPosition.Left] = offset;
      if (CutPosition.Right in this.offsets) {
        delete this.offsets[CutPosition.Right];
      }
      this.lastAxis = CutPosition.Left;
    } else if (offset > 0) {
      this.offsets[CutPosition.Right] = offset;
      if (CutPosition.Left in this.offsets) {
        delete this.offsets[CutPosition.Left];
      }
      this.lastAxis = CutPosition.Right;
    }
    if (offset != 0) {
      this.notify();
    }
  }

  set offsetY(offset: number) {
    if (offset < 0) {
      this.offsets[CutPosition.Top] = offset;
      if (CutPosition.Bottom in this.offsets) {
        delete this.offsets[CutPosition.Bottom];
      }
      this.lastAxis = CutPosition.Top;
    } else if (offset > 0) {
      this.offsets[CutPosition.Bottom] = offset;
      if (CutPosition.Top in this.offsets) {
        delete this.offsets[CutPosition.Top];
      }
      this.lastAxis = CutPosition.Bottom;
    }
    if (offset != 0) {
      this.notify();
    }
  }

  set rotateX(deg: number) {
    if (this.rotations[CutPosition.Right] != deg) {
      this.rotations[CutPosition.Right] = deg;
      this.notify();
    }
  }

  set rotateY(deg: number) {
    if (this.rotations[CutPosition.Bottom] != deg) {
      this.rotations[CutPosition.Bottom] = deg;
      this.notify();
    }
  }

  update(position: CutPosition, pos: number): void {
    if (this.shapes[position] === undefined) {
      return;
    }
    if (this.positions[position] == pos) {
      return;
    }
    //Sanity check
    if (
      position == CutPosition.Bottom &&
      CutPosition.Top in this.positions &&
      this.positions[CutPosition.Top] !== undefined &&
      this.positions[CutPosition.Top] > pos
    ) {
      this.positions[CutPosition.Top] = pos;
    } else if (
      position == CutPosition.Top &&
      CutPosition.Bottom in this.positions &&
      this.positions[CutPosition.Bottom] !== undefined &&
      this.positions[CutPosition.Bottom] > pos
    ) {
      this.positions[CutPosition.Bottom] = pos;
    } else if (
      position == CutPosition.Right &&
      CutPosition.Left in this.positions &&
      this.positions[CutPosition.Left] !== undefined &&
      this.positions[CutPosition.Left] > pos
    ) {
      this.positions[CutPosition.Left] = pos;
    } else if (
      position == CutPosition.Left &&
      CutPosition.Right in this.positions &&
      this.positions[CutPosition.Right] !== undefined &&
      this.positions[CutPosition.Right] < pos
    ) {
      this.positions[CutPosition.Right] = pos;
    }
    this.positions[position] = pos;

    const line = this.shapes[position][0];
    const cover = this.shapes[position][1];

    //Update shapes (line and rect)
    if (position == CutPosition.Bottom || position == CutPosition.Top) {
      line.set({
        x1: 0,
        y1: pos,
        x2: this.width,
        y2: pos
      });
      if (position == CutPosition.Bottom) {
        cover.set({
          left: 0,
          top: pos,
          width: this.width,
          height: this.height - pos
        });
      } else {
        cover.set({
          left: 0,
          top: 0,
          width: this.width,
          height: pos
        });
      }
    } else if (position == CutPosition.Right || position == CutPosition.Left) {
      line.set({
        x1: pos,
        y1: 0,
        x2: pos,
        y2: this.height
      });
      if (position == CutPosition.Right) {
        cover.set({
          left: pos,
          top: 0,
          width: this.width - pos,
          height: this.height
        });
      } else {
        cover.set({
          left: 0,
          top: 0,
          width: pos,
          height: this.height
        });
      }
    } else {
      throw new Error("THis should never happen!");
    }
    this.lastAxis = position;
    line.setCoords();
    cover.setCoords();
    line.canvas?.renderAll();
    this.notify();
  }

  set callback(func: CutNotifyFunction) {
    this.changeCallback = [];
    this.changeCallback.push(func);
  }

  addCallback(func: CutNotifyFunction): void {
    if (this.changeCallback !== undefined) {
      this.changeCallback = [];
    }
    this.changeCallback.push(func);
  }

  notify(): void {
    if (this.changeCallback !== undefined) {
      this.changeCallback.forEach((fn) => {
        const notification: CutNotification = [{}];
        notification[0] = this.allPositions();

        if (this.offsets !== undefined) {
          notification[1] = this.offsets;
        }
        if (this.rotations !== undefined) {
          notification[2] = this.rotations;
        }
        fn(notification);
      });
    }
  }

  static expandPositions(cutPostions: { [key in CutPosition]?: number }, all: boolean = false): { [key: string]: number } {
    const positions: { [key: string]: number } = {};
    let validPositions: CutPosition[];
    if (!all) {
      validPositions = Object.keys(cutPostions) as unknown as CutPosition[];
    } else {
      validPositions = Object.keys(CutPosition) as unknown as CutPosition[];
    }
    validPositions.forEach((key: CutPosition) => {
      if (key in cutPostions && cutPostions[key] !== undefined) {
        positions[CutPositionUtil.toString(key)] = cutPostions[key];
      } else {
        positions[CutPositionUtil.toString(key)] = 0;
      }
    });
    return positions;
  }

  toJSON(): CutJSON {
    const json: CutJSON = {
      url: this.url,
      width: this.width,
      height: this.height
    };
    const cuts = Cuts.expandPositions(this.positions);
    if (this.positions !== undefined && Object.keys(cuts).length) {
      json["cuts"] = cuts;
    }
    const offsets = Cuts.expandPositions(this.offsets);
    if (this.offsets !== undefined && Object.keys(offsets).length) {
      json["offsets"] = offsets;
    }
    const rotations = Cuts.expandPositions(this.rotations);
    if (this.rotations !== undefined && Object.keys(rotations).length) {
      json["rotations"] = rotations;
    }
    return json;
  }

  toJSONLD(): CutJSONLD {
    const fragSelector = `xywh=0,0,${this.width},${this.height}`;
    const json: CutJSONLD = {
      id: "",
      motivation: "editing",
      type: "Annotation",
      body: {
        type: "Dataset",
        id: "",
        value: {}
      },
      target: {
        source: this.url,
        type: "SpecificResource",
        selector: {
          type: "FragmentSelector",
          value: fragSelector
        }
      }
    };

    const value: { [key: string]: { [key: string]: number } } = {};

    const cuts = Cuts.expandPositions(this.positions, true);
    if (this.positions !== undefined && Object.keys(cuts).length) {
      value.cuts = cuts;
    }
    const offsets = Cuts.expandPositions(this.offsets, true);
    if (this.offsets !== undefined && Object.keys(offsets).length) {
      value.offsets = offsets;
    }
    const rotations = Cuts.expandPositions(this.rotations, true);
    if (this.rotations !== undefined && Object.keys(rotations).length) {
      value.rotations = rotations;
    }
    json.body.value = value;

    let rotation = "";
    if ("Bottom" in rotations && rotations.Bottom !== 0) {
      rotation += ` rotate(${rotations.Bottom}, ${Math.ceil(this.width / 2)}, ${this.height})`;
    }
    if ("Right" in rotations && rotations.Right !== 0) {
      rotation += ` rotate(${rotations.Right}, ${this.width}, ${Math.ceil(this.height / 2)})`;
    }

    let svgPattern = `
    <pattern id="pattern" width="${this.width}" height="${this.height}" x="${offsets.Right}" y="${offsets.Bottom}">
      <clipPath id="cuts">
        <rect x="${cuts.Left}" y="${cuts.Top}" width="${cuts.Right - cuts.Left}" height="${cuts.Bottom - cuts.Top}" transform="${rotation}" />
      </clipPath>
    </pattern>`;
    svgPattern = svgPattern.replace(/\n|\r/g, "");
    json.body.value = svgPattern;

    return json;
  }

  loadJSON(json: CutJSON) {
    this.url = new URL(json.url);
    this.width = json.width;
    this.height = json.height;
    this.initCutShapes(this.cutPostions);
    this.setSize(this.width, this.height);

    if ("cuts" in json && json.cuts !== undefined) {
      Object.keys(json.cuts).forEach((key: string) => {
        const typedKey = CutPositionUtil.fromString(key);
        if (typedKey !== undefined && json.cuts !== undefined && json.cuts[key] !== undefined) {
          this.positions[typedKey] = json.cuts[key];
        }
      });
    }
    if ("offsets" in json && json.offsets !== undefined) {
      Object.keys(json.offsets).forEach((key: string) => {
        const typedKey = CutPositionUtil.fromString(key);
        if (typedKey !== undefined && json.offsets !== undefined && json.offsets[key] !== undefined) {
          this.offsets[typedKey] = json.offsets[key];
        }
      });
    }
    if ("rotations" in json && json.rotations !== undefined) {
      Object.keys(json.rotations).forEach((key: string) => {
        const typedKey = CutPositionUtil.fromString(key);
        if (typedKey !== undefined && json.rotations !== undefined && json.rotations[key] !== undefined) {
          this.rotations[typedKey] = json.rotations[key];
        }
      });
    }

    this.setVisibility(true);
    this.notify();
  }

  loadJSONLD(json: CutJSONLD) {
    const dimensions = json.target.selector.value.split("=")[1].split(",");

    const cutJson: CutJSON = {
      url: json.target.source,
      width: Number(dimensions[2]),
      height: Number(dimensions[3])
    };
    if (typeof json.body.value !== "string" && "cuts" in json.body.value) {
      cutJson.cuts = json.body.value.cuts;
    }
    if (typeof json.body.value !== "string" && "offsets" in json.body.value) {
      cutJson.offsets = json.body.value.offsets;
    }
    if (typeof json.body.value !== "string" && "rotations" in json.body.value) {
      cutJson.rotations = json.body.value.rotations;
    }
    if (typeof json.body.value === "string") {
      const parser = new DOMParser();
      const svg = parser.parseFromString(json.body.value, "image/svg+xml");
      const patternElement = svg.querySelector("pattern")!;
      const offsets: { [key: string]: number } = {};
      if (patternElement.hasAttribute("x") && patternElement.getAttribute("x") !== "0") {
        offsets.Right = Number(patternElement.getAttribute("x"));
      }
      if (patternElement.hasAttribute("y") && patternElement.getAttribute("y") !== "0") {
        offsets.Bottom = Number(patternElement.getAttribute("y"));
      }
      if (Object.keys(offsets).length) {
        cutJson.offsets = offsets;
      }
      const rectElement = svg.querySelector("rect")!;
      const cuts: { [key: string]: number } = { Left: 0, Top: 0, Right: Number(dimensions[2]), Bottom: Number(dimensions[3]) };
      if (rectElement.hasAttribute("x") && rectElement.getAttribute("x") !== "0") {
        cuts.Left = Number(rectElement.getAttribute("x"));
      }
      if (rectElement.hasAttribute("y") && rectElement.getAttribute("y") !== "0") {
        cuts.Top = Number(rectElement.getAttribute("y"));
      }
      if (rectElement.hasAttribute("width") && rectElement.getAttribute("width") !== "0") {
        cuts.Right = Number(rectElement.getAttribute("x")) + Number(rectElement.getAttribute("width"));
      }
      if (rectElement.hasAttribute("height") && rectElement.getAttribute("height") !== "0") {
        cuts.Bottom = Number(rectElement.getAttribute("y")) + Number(rectElement.getAttribute("height"));
      }
      if (Object.keys(cuts).length) {
        cutJson.cuts = cuts;
      }
      const rotations: { [key: string]: number } = {};
      if (rectElement.hasAttribute("transform") && rectElement.getAttribute("transform") !== "") {
        const transform = rectElement.getAttribute("transform")!;
        const re: RegExp = /rotate\((.*?)\)/g;
        let match: RegExpExecArray | null;
        //let rotationStr = [];
        while ((match = re.exec(transform))) {
          //rotationStr.push(match[1]);
          if (match.length < 2) {
            continue;
          }
          const rotValues = match[1].split(",").map((item: string) => {
            return item.trim();
          });
          if (rotValues[0] !== "0") {
            if (rotValues[1] == dimensions[2]) {
              rotations.Right = Number(rotValues[0]);
            } else if (rotValues[2] == dimensions[3]) {
              rotations.Bottom = Number(rotValues[0]);
            }
          }
        }
      }
      if (Object.keys(rotations).length) {
        cutJson.rotations = rotations;
      }
    }

    this.loadJSON(cutJson);
  }
}
