import { IconDropdownSelect } from "./components/IconDropdownSelect";

export type IIIFSelect = {
  type: IIIFType;
  entries: Array<IIIFEntry | IIIFImageEntry>;
  element?: HTMLSelectElement | HTMLLabelElement | IconDropdownSelect;
  label?: HTMLLabelElement;
  source?: URL;
};

export type IIIFType = "Collection" | "Manifest" | "Image";

export type IIIFEntry = {
  label: string;
  id: string;
  thumbnail?: URL;
};

type Dimensions = {
  height: number;
  width: number;
  aspectRatio?: number;
};

export type IIIFImageEntry = IIIFEntry & Dimensions;

export type IIIFImageStub = {
  width: number;
  height: number;
  "@context": string;
  //tileSource: string;
};

export enum CutPosition {
  Top = 0,
  Bottom = 1,
  Left = 2,
  Right = 3
}

export class CutPositionUtil {
  public static toString(position: CutPosition): string {
    return CutPosition[position];
  }

  public static fromString(position: string): CutPosition | undefined {
    const positions = Object.keys(CutPosition) as unknown as CutPosition[];
    let ret;
    positions.forEach((key: CutPosition) => {
      if (typeof CutPosition[key] === "string" && position.toLowerCase() == CutPosition[key].toLowerCase()) {
        ret = key;
      }
    });
    return ret;
  }
}
// cuts, offsets, rotations
export type CutNotification = [
  { [key in CutPosition]?: number | undefined },
  { [key in CutPosition]?: number }?,
  { [key in CutPosition]?: number }?
];
export type CutNotifyFunction = (notifiction: CutNotification) => void;

export type CutJSON = {
  url: string;
  width: number;
  height: number;
  cuts?: { [key: string]: number };
  offsets?: { [key: string]: number };
  rotations?: { [key: string]: number };
};

export type CutJSONLD = {
  id: string;
  type: "Annotation" | string;
  motivation: "editing" | string;
  body: {
    id: string;
    type: "Dataset" | "Image" | string;
    value: { [key: string]: { [key: string]: number } } | string;
  };
  target: {
    source: string;
    type: "SpecificResource" | string;
    selector: {
      type: string;
      conformsTo?: string;
      value: string;
    };
  };
};
