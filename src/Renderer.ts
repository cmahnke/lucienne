import OpenSeadragon from "openseadragon";
import { ImageResolutionSelect } from "./components/ImageResolutionSelect";
import { CanvasDownloadButton } from "./components/CanvasDownloadButton";
import { GridSizeSelector } from "./components/GridSizeSelector";
import { CutPosition } from "./types";
import { OffsetRect } from "./openseadragon/OffsetRect";
import { RotateableRect } from "./openseadragon/RotateableRect";
import { HideRect } from "./openseadragon/HideRect";
import { IIIFTileSourceSpecifier } from "./openseadragon/IIIFTileSourceSpecifier";
import type { CutNotification, IIIFImageStub } from "./types";
import { equals } from "./util/util";
import i18next from "i18next";

export class Renderer {
  //Element identifiers / classes / selectors
  static defaultSelector: string = ".texture-container";
  static rendererViewerSelector = ".output-viewer";
  static _debugId = "debug";
  static _rendererContainer = "hidden-renderer-container";

  element: HTMLElement;
  _source: IIIFImageStub | undefined;
  viewer: OpenSeadragon.Viewer | undefined;
  viewerElement: HTMLElement;
  _gridSelector: boolean;
  _download: boolean;
  _controls: boolean;
  clipRect: OpenSeadragon.Rect | undefined;
  _offsets: { [key in CutPosition]?: number } | undefined;
  _rotations: { [key in CutPosition]?: number } | undefined;
  _rows: number;
  _columns: number;
  _loaded: boolean = false;
  resolutionSelect: ImageResolutionSelect | null | undefined;
  downloadButton: CanvasDownloadButton | null | undefined;
  gridSizeSelect: GridSizeSelector | null | undefined;
  _margins: boolean = true;
  _marginWidth = 1;
  defaultExportDimensions: [number, number] = [1920, 1080];
  _notificationQueue: CutNotification[] = [];
  _debug: boolean = false;
  fitPreview: boolean = true;
  statusContainer: HTMLDivElement | null;
  _debugOverlays: Map<OpenSeadragon.TiledImage, { element: HTMLElement; location: OpenSeadragon.Rect }[]>;
  renderTimeout: number = 3000;

  constructor(
    element: HTMLElement,
    columns: number = 4,
    rows: number = 4,
    gridSelector: boolean = true,
    download: boolean = true,
    controls: boolean = true,
    source?: IIIFImageStub,
    width?: number,
    height?: number
  ) {
    if (element !== undefined) {
      this.element = element;
    } else {
      this.element = document.querySelector<HTMLDivElement>(Renderer.defaultSelector)!;
    }

    this.setSize(columns, rows);
    this._gridSelector = gridSelector;
    this._download = download;
    this._controls = controls;

    Renderer.setupHTML(this.element, controls, width, height);
    this.viewerElement = this.element.querySelector(Renderer.rendererViewerSelector)!;

    this.viewer = this.setupViewer(this.viewerElement);

    if (source !== undefined) {
      this.source = source;
    }

    if (this.element !== null) {
      this.addControls(this.viewerElement, this.defaultExportDimensions[0], this.defaultExportDimensions[1]);
    }
  }

  clear() {
    this._source = undefined;
    this.clipRect = undefined;
    this._offsets = undefined;
    if (this.viewer !== undefined) {
      this._clearTiles();
      this.viewer.close();
      this._loaded = false;
    }
  }

  _clearTiles() {
    if (this.viewer !== undefined) {
      this.viewer.world.removeAll();
      for (let i = 0; i < (this.viewer.world.getItemCount() as number); i++) {
        this.viewer.world.removeItem(this.viewer.world.getItemAt(i));
      }
    }
  }

  static _loadTiles(
    viewer: OpenSeadragon.Viewer,
    source: IIIFImageStub | OpenSeadragon.TiledImage[],
    count: number
  ): Promise<boolean | string> {
    return new Promise((resolve, reject) => {
      let tilesLoaded = 0;
      const sources: (IIIFImageStub | OpenSeadragon.TiledImage)[] = [];
      if (Array.isArray(source)) {
        throw new Error("Handling of TiledImage array not implemented!");
      } else {
        for (let i = 0; i < count; i++) {
          sources.push(source);
        }
      }

      //let allTilesLoaded = false;
      const errorHandler: OpenSeadragon.EventHandler<OpenSeadragon.TileLoadFailedEvent> = (error) => {
        reject(`Failed to load TiledImage: ${error.message}`);
      };
      const tileLoadedHandler: OpenSeadragon.EventHandler<OpenSeadragon.TileLoadedEvent> = () => {
        tilesLoaded++;
        checkAllTilesLoaded();
      };

      const checkAllTilesLoaded = () => {
        if (tilesLoaded === sources.length) {
          viewer.removeHandler("tile-load-failed", errorHandler);
          viewer.removeHandler("tile-loaded", tileLoadedHandler);
          //allTilesLoaded = true;
          resolve(true); // Resolve the Promise when all tiles are loaded
        }
      };

      viewer.addHandler("tile-loaded", tileLoadedHandler);
      viewer.addHandler("tile-load-failed", errorHandler);
      viewer.open(IIIFTileSourceSpecifier.wrap(sources));
    });
  }

  set source(json: IIIFImageStub) {
    if (this.viewer === undefined) {
      throw new Error("Result viewer element is null!");
    }
    this._source = json;
    this._loaded = false;

    if (this.clipRect === undefined) {
      this.clipRect = new OpenSeadragon.Rect(0, 0, json.width, json.height);
    }

    const columns = this._columns;
    const rows = this._rows;

    this._clearTiles();
    Renderer._loadTiles(this.viewer, this._source, columns * rows).then((result) => {
      if (typeof result === "boolean" && result) {
        this.viewer?.world.arrange({ rows: this._rows, columns: this._columns, tileMargin: 0, immediately: true });
        if (!this._notificationQueue.length) {
          // Removing the call to this.preview() breaks the image downloader. Maybe hoth methods can be merged
          this.preview();
          this.layout(true);
        } else {
          this._notificationQueue.forEach((notification: CutNotification) => {
            this.notify(notification);
          });
        }
        this.viewer?.raiseEvent("source-loaded");
        this._loaded = true;
        this.preview();
        this.enableControls();
      } else {
        if (typeof result === "boolean") {
          throw new Error(`Failed to load TiledImage for unknown reasons`);
        } else {
          throw new Error(result);
        }
      }
    });
  }

  get width(): number | undefined {
    if (this._source !== undefined) {
      return this._source.width;
    }
    return undefined;
  }

  get height(): number | undefined {
    if (this._source !== undefined) {
      return this._source.height;
    }
    return undefined;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  set debug(debug: boolean) {
    this._debug = debug;
    if (this._debug) {
      this._debugOverlays = new Map<OpenSeadragon.TiledImage, { element: HTMLElement; location: OpenSeadragon.Rect }[]>();
    }
  }

  set margins(margins: boolean) {
    this._margins = margins;
    this.setSize(this.columns, this.rows);
  }

  set offsets(offsets: { [key in CutPosition]?: number }) {
    if (Renderer.validateSidedVariations(offsets, "rotation")) {
      this._offsets = offsets;
    }
  }

  set rotations(rotations: { [key in CutPosition]?: number }) {
    if (Renderer.validateSidedVariations(rotations, "rotation")) {
      this._rotations = rotations;
    }
  }

  get rows(): number {
    if (this._margins) {
      return this._rows - this._marginWidth * 2;
    }
    return this._rows;
  }
  get columns(): number {
    if (this._margins) {
      return this._columns - this._marginWidth * 2;
    }
    return this._columns;
  }

  setSize(columns: number, rows: number, callback?: () => void): void {
    if (this._margins) {
      if (columns > rows) {
        this._marginWidth = Math.floor(columns / 2);
      } else {
        this._marginWidth = Math.floor(rows / 2);
      }

      columns = columns + this._marginWidth * 2;
      rows = rows + this._marginWidth * 2;
    }
    if (this.viewer !== undefined && callback !== undefined) {
      this.viewer.addOnceHandler("source-loaded", callback);
      this.viewer.raiseEvent("grid-size-changed");
    }

    if (this._columns != columns || this._rows != rows) {
      this._columns = columns;
      this._rows = rows;

      //This triggers reinitialization
      if (this._source !== undefined) {
        this.source = this._source;
      }
    }
  }

  enableControls() {
    if (this.gridSizeSelect !== undefined && this.gridSizeSelect !== null) {
      this.gridSizeSelect.removeAttribute("disabled");
    }
    if (this.resolutionSelect !== undefined && this.resolutionSelect !== null) {
      this.resolutionSelect.removeAttribute("disabled");
    }
    if (this.downloadButton !== undefined && this.downloadButton !== null) {
      this.downloadButton.removeAttribute("disabled");
    }

    this.viewerElement.querySelector<Element>(".zoomin")?.classList.remove("disabled");
    this.viewerElement.querySelector<Element>(".zoomout")?.classList.remove("disabled");
    this.viewerElement.querySelector<Element>(".fullscreen")?.classList.remove("disabled");
    this.viewerElement.querySelector<HTMLElement>(".fullwidth")?.classList.remove("disabled");
  }

  static validateSidedVariations(variation: { [key in CutPosition]?: number }, type: string): boolean {
    if (variation === undefined) {
      return false;
    }

    if (
      CutPosition.Left in variation &&
      variation[CutPosition.Left] !== undefined &&
      CutPosition.Right &&
      variation[CutPosition.Right] !== undefined
    ) {
      if (variation[CutPosition.Left] != 0 && variation[CutPosition.Right] != 0) {
        console.error(`Different ${type} for left (${variation[CutPosition.Left]}) and right (${variation[CutPosition.Right]}) sides`);
      }
    }

    if (
      CutPosition.Top in variation &&
      variation[CutPosition.Top] !== undefined &&
      CutPosition.Bottom &&
      variation[CutPosition.Bottom] !== undefined
    ) {
      if (variation[CutPosition.Top] != 0 && variation[CutPosition.Bottom] != 0) {
        console.error(`Different ${type} for top (${variation[CutPosition.Top]}) and bottom (${variation[CutPosition.Bottom]}) sides`);
        return false;
      }
    }
    return true;
  }

  static setupHTML(element: HTMLElement, controls: boolean = true, width?: number, height?: number): void {
    let controlsHTML = `
        <i class="controls button zoomin disabled"></i>
        <i class="controls button zoomout disabled"></i>
        <i class="controls button fullscreen disabled"></i>
        <i class="controls button fullwidth disabled"></i>`;
    if (!controls) {
      controlsHTML = "";
    }
    let style = "";
    if (width !== undefined && height !== undefined) {
      style = `width: ${width}px; height: ${height}px`;
    }
    element.innerHTML = `
      <div class="output-viewer" style="${style}">
        ${controlsHTML}
      </div>
    `;
  }

  setupViewer(element?: HTMLElement) {
    if (element !== undefined) {
      element = this.viewerElement;
    }

    if (element !== null && element !== undefined) {
      let options: OpenSeadragon.Options = {
        element: element,
        collectionMode: true,
        preserveViewport: true,
        /*
        visibilityRatio: 1,
        minZoomLevel: 0.5,
        defaultZoomLevel: 0.5,
        */
        gestureSettingsMouse: { clickToZoom: false },
        showHomeControl: false,
        autoHideControls: false,
        collectionTileMargin: 0,
        collectionRows: this._rows,
        collectionColumns: this._columns,
        crossOriginPolicy: "Anonymous",
        drawer: "canvas",
        debug: this._debug
      };

      if (this._controls) {
        options = {
          ...options,
          zoomInButton: this.element.querySelector<Element>(".zoomin")!,
          zoomOutButton: this.element.querySelector<Element>(".zoomout")!,
          fullPageButton: this.element.querySelector<Element>(".fullscreen")!
        };
      } else {
        options = {
          ...options,
          showNavigationControl: false,
          showZoomControl: false,
          showHomeControl: false,
          showFullPageControl: false,
          showSequenceControl: false
        };
      }

      const fullwidthButton = this.element.querySelector<HTMLElement>(".fullwidth")!;
      if (fullwidthButton !== undefined && fullwidthButton !== null) {
        fullwidthButton.addEventListener("click", () => {
          if (this._loaded) {
            if (this.viewer !== undefined) {
              Renderer.fitToWidth(this.viewer, false, undefined, true);
            }
          }
        });
      }
      return OpenSeadragon(options);
    } else {
      throw new Error("Result viewer element is null!");
    }
  }

  preview(
    left: number = 0,
    top: number = 0,
    right?: number,
    bottom?: number,
    immediately: boolean = true,
    offsets?: { [key in CutPosition]?: number },
    rotations?: { [key in CutPosition]?: number }
  ) {
    if (this.viewer === undefined) {
      throw new Error("Result viewer not initialized");
    }

    if (right === undefined && bottom === undefined) {
      right = this.width;
      bottom = this.height;
    }
    if (
      left === undefined ||
      top === undefined ||
      right == undefined ||
      bottom === undefined ||
      this.viewer.world.getItemCount() === undefined
    ) {
      throw new Error("Can't clip image, some dimensions aren't defined");
    }

    const itemCount = this.viewer.world.getItemCount();
    for (let i = 0; i < itemCount; i++) {
      const tiledImage: OpenSeadragon.TiledImage | undefined = this.viewer.world.getItemAt(i);
      if (tiledImage !== undefined) {
        if (this.clipRect === undefined) {
          throw new Error("Clip rect is empty!");
        } else {
          this.clipRect.x = left;
          this.clipRect.y = top;
          this.clipRect.width = right - left;
          this.clipRect.height = bottom - top;
        }
        tiledImage.setClip(RotateableRect.fromRect(this.clipRect));
      } else {
        throw new Error("Couldn't generate clip mask, no images found!");
      }
    }
    if (offsets !== undefined) {
      this.offsets = offsets;
    }
    if (rotations !== undefined) {
      this.rotations = rotations;
    }
    this.layout(immediately);
    if (this.downloadButton !== undefined && this.downloadButton !== null) {
      this.downloadButton.disabled = false;
    }
    if (this.fitPreview) {
      Renderer.fitToWidth(this.viewer, true, undefined, false, true);
    }
  }

  static createOffsetRect(offsets: { [key in CutPosition]?: number }, reference: OpenSeadragon.TiledImage): OffsetRect | undefined {
    let width = 0,
      height = 0,
      horizontal: CutPosition | undefined,
      vertical: CutPosition | undefined;
    if (CutPosition.Left in offsets && offsets[CutPosition.Left] != undefined) {
      width = offsets[CutPosition.Left];
      horizontal = CutPosition.Left;
    }
    if (CutPosition.Right in offsets && offsets[CutPosition.Right] != undefined) {
      width = offsets[CutPosition.Right];
      horizontal = CutPosition.Right;
    }
    if (CutPosition.Top in offsets && offsets[CutPosition.Top] != undefined) {
      height = offsets[CutPosition.Top];
      vertical = CutPosition.Top;
    }
    if (CutPosition.Bottom in offsets && offsets[CutPosition.Bottom] != undefined) {
      height = offsets[CutPosition.Bottom];
      vertical = CutPosition.Bottom;
    }
    if (width != 0 || height != 0) {
      const offsetRect = new OffsetRect(0, 0, width, height, undefined, horizontal, vertical);
      offsetRect.reference = reference;
      return offsetRect;
    }
    return undefined;
  }

  layout(immediately: boolean = true) {
    // Inline functions
    const raiseFinished: () => void = () => {
      this.viewer?.raiseEvent("layout-finish", { eventSource: this.viewer });
    };

    //Variables
    const columns = this._columns;
    const rows = this._rows;
    const margins = this._margins;
    const marginWidth = this._marginWidth;
    let visibleColumns = columns;
    let visibleRows = rows;

    if (margins) {
      visibleColumns = columns - this._marginWidth * 2;
      visibleRows = rows - this._marginWidth * 2;
    }
    if (!immediately) {
      this.viewer?.addHandler("animation-finish", raiseFinished.bind(this));
    }
    // TODO: Check if this event si still acted on.
    this.viewer?.raiseEvent("start-layout", { eventSource: this.viewer });
    let pos = -1;

    if (this.clipRect === undefined || this.viewer === undefined) {
      throw new Error("Clip rect or viewer is not defined");
    }
    this.viewer.world.arrange({ rows: rows, columns: columns, tileMargin: 0, immediately: true });
    const referenceImage: OpenSeadragon.TiledImage | undefined = this.viewer.world.getItemAt(0);
    referenceImage.setPosition(new OpenSeadragon.Point(0, 0), immediately);
    const transformedClipRect = referenceImage.imageToViewportRectangle(this.clipRect);

    if (referenceImage === undefined) {
      throw new Error("Couldn't get first tiled image!");
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        //Variables
        pos++;

        let row = r;
        let column = c;
        let x = 0,
          y = 0;
        let width = 0,
          height = 0;
        const tiledImage: OpenSeadragon.TiledImage | undefined = this.viewer.world.getItemAt(pos);

        //const hideRect = new RotateableRect(tiledImage.getContentSize().x, tiledImage.getContentSize().y, 0, 0, tiledImage.getRotation());
        const hideRect = new HideRect(tiledImage);

        //Sanity checks
        if (tiledImage === undefined || referenceImage === undefined || this.clipRect === undefined) {
          throw new Error("Required variables are not defined");
        }

        //expectedSize = new OpenSeadragon.Rect(0, 0, transformedClipRect.width * visibleColumns, transformedClipRect.height * visibleRows);
        let offsetRect;
        if (this._offsets != undefined) {
          offsetRect = Renderer.createOffsetRect(this._offsets, tiledImage);
        }

        //initial position
        width = transformedClipRect.width;
        height = transformedClipRect.height;

        /*
         * Margins might be more then 1 tile in with or height see `marginWidth`
         * c < marginWidth or r < marginWidth are the first margin rows or columns
         * c >= columns - marginWidth or r >= rows - marginWidth are the last margin rows or columns
         */
        if (margins) {
          if (c < marginWidth || c >= columns - marginWidth || r < marginWidth || r >= rows - marginWidth) {
            tiledImage.setClip(hideRect.clone());
          }
          column = c - marginWidth;
          row = r - marginWidth;
        }

        // This will be triggered, when called without calling this.preview() first
        if (tiledImage.getClip() === null) {
          throw new Error("TiledImage has no clipings!");
        }

        x = (c - marginWidth) * width;
        y = (r - marginWidth) * height;
        //console.log(`${c},${r}`, tiledImage.getClip());

        // Rotations
        if (this._rotations !== undefined && Object.keys(this._rotations).length) {
          const imageCenter: (image: OpenSeadragon.TiledImage) => OpenSeadragon.Point = (image: OpenSeadragon.TiledImage) => {
            const dimensions = image.getContentSize();
            return new OpenSeadragon.Rect(0, 0, dimensions.x, dimensions.y).getCenter();
          };

          //TODO: Rotating back results in wrong width and height
          let rowEven = false,
            columnEven = false;
          if (r % 2 == 0 && (!margins || (margins && marginWidth % 2 == 0))) {
            rowEven = true;
          } else if (r % 2 == 1 && margins && marginWidth % 2 == 1) {
            rowEven = true;
          }
          if (c % 2 == 0 && (!margins || (margins && marginWidth % 2 == 0))) {
            columnEven = true;
          } else if (c % 2 == 1 && margins && marginWidth % 2 == 1) {
            columnEven = true;
          }

          const clipRotationPoint = this.clipRect.getCenter();

          let rotation = NaN;
          //Bottom knob
          if (CutPosition.Right in this._rotations && this._rotations[CutPosition.Right] !== undefined && rowEven && !columnEven) {
            rotation = this._rotations[CutPosition.Right];
          }
          //Right knob
          if (CutPosition.Bottom in this._rotations && this._rotations[CutPosition.Bottom] !== undefined && columnEven && !rowEven) {
            rotation = this._rotations[CutPosition.Bottom];
          }
          if (
            CutPosition.Right in this._rotations &&
            this._rotations[CutPosition.Right] !== undefined &&
            CutPosition.Bottom in this._rotations &&
            this._rotations[CutPosition.Bottom] !== undefined
          ) {
            if (rowEven && !columnEven && columnEven && !rowEven) {
              rotation = this._rotations[CutPosition.Right] + this._rotations[CutPosition.Bottom];
            }
          }
          if (rotation == 360) {
            rotation = NaN;
          }

          if (!isNaN(rotation) && !HideRect.isHidden(tiledImage)) {
            const initialClip = tiledImage.getClip();
            const rotatedClip = tiledImage.getClip();
            if (initialClip === null || rotatedClip === null) {
              throw new Error("tiled image has no clip for rotation");
            }

            rotatedClip.rotate(rotation, clipRotationPoint);
            //This is just a ugly hack
            if (rotation == 0 || rotation == 180) {
              tiledImage.setWidth(referenceImage.getBounds().width, true);
            } else {
              tiledImage.setHeight(referenceImage.getBounds().height, true);
              const ratio = tiledImage._worldWidthCurrent / tiledImage.source.dimensions.x;

              const clipCenterX = this.clipRect.x + this.clipRect.width / 2;
              const clipCenterY = this.clipRect.y + this.clipRect.height / 2;
              const imageCenterX = tiledImage.source.dimensions.x / 2;
              const imageCenterY = tiledImage.source.dimensions.y / 2;
              const imageMarginLeft = this.clipRect.x;
              const imageMarginRight = tiledImage.source.dimensions.x - (this.clipRect.x + this.clipRect.width);
              const imageMarginTop = this.clipRect.y;
              const imageMarginBottom = tiledImage.source.dimensions.y - (this.clipRect.y + this.clipRect.height);
              const topClip = clipCenterY - clipCenterX;

              if (this.clipRect.height - this.clipRect.y > this.clipRect.width - this.clipRect.x) {
                rotatedClip.y = rotatedClip.y / 2 + (this.clipRect.height - this.clipRect.y) / 2 - rotatedClip.width / 2;
              }
              //rotatedClip.height = Math.min(this.clipRect.width, rotatedClip.height - rotatedClip.y);
              rotatedClip.height = this.clipRect.width;
              //rotatedClip.width = Math.min(this.clipRect.width, this.clipRect.height - rotatedClip.y);
              /*
              if (this.clipRect.height - this.clipRect.y < this.clipRect.width) {
                rotatedClip.width = this.clipRect.height;
              }
              */
              //rotatedClip.width = Math.min(this.clipRect.width, this.clipRect.height - this.clipRect.y);

              let rotatedMarginBottom;
              let rotatedMarginTop;

              //TODO: Check if this is still needed
              if (rotation == 90) {
                rotatedMarginBottom = tiledImage.source.dimensions.x - (this.clipRect.x + this.clipRect.width);
                rotatedMarginTop = this.clipRect.x;
              } else if (rotation == 270) {
                rotatedMarginTop = tiledImage.source.dimensions.x - (this.clipRect.x + this.clipRect.width);
                rotatedMarginBottom = this.clipRect.x;
              }

              console.log(
                `Margins left ${imageMarginLeft} right ${imageMarginRight} top ${imageMarginTop} bottom ${imageMarginBottom} : ${imageMarginTop * 0.5 + imageMarginBottom * 0.5} `
              );

              //Working for changing X
              //let rotationOffsetX = clipCenterY - imageCenterY - imageMarginLeft * 0.5 + imageMarginRight * 0.5;
              //let rotationOffsetY = clipCenterX - imageCenterX - imageMarginTop * 0.5 + imageMarginBottom * 0.5;

              //TODO: rotatedClip.y need to be accounted for as well

              const rotationOffsetX = clipCenterY - imageCenterY - imageMarginLeft * 0.5 + imageMarginRight * 0.5 + imageMarginBottom;
              let rotationOffsetY = clipCenterX - imageCenterX - imageMarginTop * 0.5 + imageMarginBottom * 0.5; // +

              if (this.clipRect.height - this.clipRect.y < this.clipRect.width - this.clipRect.x) {
                // hight is smaller then width, use hight to set max width of rotated tile
                const correctionY = this.clipRect.width - this.clipRect.x - (this.clipRect.height - this.clipRect.y);
                rotatedClip.width = this.clipRect.height - this.clipRect.y;
                rotationOffsetY = rotationOffsetY - correctionY / 2;
                console.log(
                  `Less height (${this.clipRect.height - this.clipRect.y}) then width (${this.clipRect.width - this.clipRect.x}), using ${this.clipRect.height - this.clipRect.y}`
                );
              }

              //imageMarginLeft * 0.5 + imageMarginRight * 0.5;
              console.log(`offset Y ${rotationOffsetY} X ${rotationOffsetX}`);

              x = x - ratio * rotationOffsetX;
              y = y - ratio * rotationOffsetY;

              console.log("Rotations", `${c},${r}`, `source width ${tiledImage.source.dimensions.x} clip width ${this.clipRect.width}`);

              const offsetPoint = new OpenSeadragon.Point(
                initialClip.width / 2 - rotatedClip.width / 2,
                initialClip.height / 2 - rotatedClip.height / 2
              );
            }
            //tiledImage.setClip(null);
            tiledImage.setRotationPoint(
              new OpenSeadragon.Rect(0, 0, tiledImage.getContentSize().x, tiledImage.getContentSize().y).getCenter()
            );
            tiledImage.setRotation(rotation, immediately);
            tiledImage.setClip(rotatedClip);
          }
        }

        if (offsetRect !== undefined) {
          //Vertical shifts
          if (offsetRect.height > 0) {
            const shift = offsetRect.calculateY(referenceImage) * column;
            y = y + shift;
          } else if (offsetRect.height < 0) {
            const shift = offsetRect.calculateY(referenceImage) * column;
            y = y - shift;
          }
          //Vertical overlaps
          if (column == 0 && offsetRect.width < 0) {
            const borderClip = tiledImage.getClip()!.clone();
            const imageCoordShift = offsetRect.width * row * -1;
            borderClip.width = borderClip.width - imageCoordShift;
            borderClip.x = borderClip.x + imageCoordShift;
            tiledImage.setClip(borderClip);
          }
          if (column == visibleColumns - 1 && offsetRect.width > 0) {
            const borderClip = tiledImage.getClip()!.clone();
            const imageCoordShift = offsetRect.width * row;
            borderClip.width = borderClip.width - imageCoordShift;
            tiledImage.setClip(borderClip);
          }
          // Horizontal shifts
          if (offsetRect.width > 0) {
            const shift = offsetRect.calculateX(referenceImage) * row;
            x = x + shift;
          } else if (offsetRect.width < 0) {
            const shift = offsetRect.calculateX(referenceImage) * row;
            x = x - shift;
          }
          // Horizontal overlaps
          if (row == 0 && offsetRect.height < 0) {
            //column > 0 &&
            const borderClip = tiledImage.getClip()!.clone();
            const imageCoordShift = offsetRect.height * column * -1;
            borderClip.height = borderClip.height - imageCoordShift;
            borderClip.y = borderClip.y + imageCoordShift;
            tiledImage.setClip(borderClip);
          }
          if (row == visibleRows - 1 && offsetRect.height > 0) {
            const borderClip = tiledImage.getClip()!.clone();
            const imageCoordShift = offsetRect.height * column;
            borderClip.height = borderClip.height - imageCoordShift;
            tiledImage.setClip(borderClip);
          }

          const imageCoordShiftX = offsetRect.width * row;
          const imageCoordShiftY = offsetRect.height * column;

          const checkModifiedClip: (tiledImage: OpenSeadragon.TiledImage) => OpenSeadragon.Rect | RotateableRect | HideRect = (
            tiledImage: OpenSeadragon.TiledImage
          ) => {
            if (
              HideRect.isHidden(tiledImage)
              // tiledImage.getClip() !== null &&
              // tiledImage.getContentSize().x == tiledImage.getClip()!.x &&
              // tiledImage.getContentSize().y == tiledImage.getClip()!.y &&
              // this.clipRect !== undefined
            ) {
              return this.clipRect!.clone();
            } else {
              return tiledImage.getClip()! as RotateableRect;
            }
          };

          const marginPos: (curPos: number, dimension: number) => number = (curPos, dimension) => {
            if (curPos < marginWidth) {
              return marginWidth - curPos;
            } else if (curPos >= dimension + marginWidth) {
              return curPos - (marginWidth + dimension) + 1;
            }
            return NaN;
          };

          /*
          const generateArray: (num: number) => number[] = (num: number) => {
            if (typeof num !== "number" || !Number.isInteger(num) || num <= 0) {
              return [];
            }
            const result: number[] = [];
            for (let i = num; i >= 1; i--) {
              result.push(i);
            }
            return result;
          };
          */

          if (margins && (c < marginWidth || c >= columns - marginWidth || r < marginWidth || r >= rows - marginWidth)) {
            if (c < marginWidth && offsetRect.width > 0) {
              // Bottom slider right
              const borderClip = checkModifiedClip(tiledImage);

              //shift in current tile
              if (
                marginPos(c, visibleColumns) * this.clipRect.width > imageCoordShiftX &&
                (marginPos(c, visibleColumns) - 1) * this.clipRect.width < imageCoordShiftX
              ) {
                borderClip.x = borderClip.width + (marginPos(c, visibleColumns) - 1) * borderClip.width - imageCoordShiftX;
                borderClip.width = borderClip.width - (marginPos(c, visibleColumns) - 1) * borderClip.width + imageCoordShiftX;
                // shift smaller the current tile
              } else if (marginPos(c, visibleColumns) * this.clipRect.width > imageCoordShiftX) {
                borderClip.width = hideRect.width;
                borderClip.x = hideRect.x;
                //shift larger
              } else {
                borderClip.width = this.clipRect.width;
                borderClip.x = this.clipRect.x;
              }
              tiledImage.setClip(borderClip);
            }

            if (c >= columns - marginWidth && offsetRect.width < 0) {
              // Bottom slider left
              const borderClip = checkModifiedClip(tiledImage);

              //shift in current tile
              if (
                marginPos(c, visibleColumns) * this.clipRect.width > imageCoordShiftX * -1 &&
                (marginPos(c, visibleColumns) - 1) * this.clipRect.width < imageCoordShiftX * -1
              ) {
                borderClip.width = (imageCoordShiftX + (marginPos(c, visibleColumns) - 1) * borderClip.width) * -1;
                // shift smaller the current tile
              } else if (marginPos(c, visibleColumns) * this.clipRect.width > imageCoordShiftX * -1) {
                borderClip.width = hideRect.width;
                //shift larger
              } else {
                borderClip.width = this.clipRect.width;
              }
              tiledImage.setClip(borderClip);
            }

            if (r < marginWidth && offsetRect.height > 0) {
              //right slider down
              const borderClip = checkModifiedClip(tiledImage);

              //shift in current tile
              if (
                marginPos(r, visibleRows) * this.clipRect.height > imageCoordShiftY &&
                (marginPos(r, visibleRows) - 1) * this.clipRect.height < imageCoordShiftY
              ) {
                //borderClip.y = borderClip.height + (marginPos(r, visibleRows) - 1) * borderClip.height - imageCoordShiftY;
                borderClip.y = borderClip.height + (marginPos(r, visibleRows) - 1) * borderClip.height - imageCoordShiftY;
                borderClip.height = borderClip.height - (marginPos(r, visibleRows) - 1) * borderClip.height + imageCoordShiftY;
                // shift smaller the current tile
              } else if (marginPos(r, visibleRows) * this.clipRect.height > imageCoordShiftY) {
                borderClip.height = hideRect.height;
                borderClip.y = hideRect.y;
                //shift larger
              } else {
                borderClip.height = this.clipRect.height;
                borderClip.y = this.clipRect.y;
              }

              tiledImage.setClip(borderClip);
            }

            if (r >= rows - marginWidth && offsetRect.height < 0) {
              //right slider up
              const borderClip = checkModifiedClip(tiledImage);

              //shift in current tile
              if (
                marginPos(r, visibleRows) * this.clipRect.height > imageCoordShiftY * -1 &&
                (marginPos(r, visibleRows) - 1) * this.clipRect.height < imageCoordShiftY * -1
              ) {
                borderClip.height = (imageCoordShiftY + (marginPos(r, visibleRows) - 1) * borderClip.height) * -1;
                // shift smaller the current tile
              } else if (marginPos(r, visibleRows) * this.clipRect.height > imageCoordShiftY * -1) {
                borderClip.height = hideRect.height;
                //shift larger
              } else {
                borderClip.height = this.clipRect.height;
              }

              tiledImage.setClip(borderClip);
            }

            //Fix clippins at the edges, each for offest postions
            if ((r < marginWidth || r >= rows - marginWidth) && offsetRect.width != 0 && offsetRect.height == 0) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.y = borderClip.height + (marginPos(r, visibleRows) - 1) * borderClip.height - imageCoordShiftY;
              tiledImage.setClip(borderClip);
            } else if ((c < marginWidth || c >= rows - marginWidth) && offsetRect.height != 0 && offsetRect.width == 0) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.x = borderClip.width + (marginPos(c, visibleColumns) - 1) * borderClip.width - imageCoordShiftX;
              tiledImage.setClip(borderClip);
            }

            //TODO: Finish this
            if (offsetRect.width != 0 && offsetRect.height != 0) {
              //TODO Fix issues at the edges when using both offset directions
              if ((c < marginWidth || c >= rows - marginWidth) && (r < marginWidth || r >= rows - marginWidth)) {
                const borderClip = checkModifiedClip(tiledImage);
                /*
                borderClip.x = this.clipRect.x
                borderClip.y = this.clipRect.y
                borderClip.width
                borderClip.height
                */
                borderClip.y = borderClip.height + (marginPos(r, visibleRows) - 1) * borderClip.height - imageCoordShiftY;
                borderClip.x = borderClip.width + (marginPos(c, visibleColumns) - 1) * borderClip.width - imageCoordShiftX;

                borderClip.width = (imageCoordShiftX + (marginPos(c, visibleColumns) - 1) * borderClip.width) * -1;
                borderClip.height = borderClip.height - (marginPos(r, visibleRows) - 1) * borderClip.height + imageCoordShiftY;

                tiledImage.setClip(borderClip);
              }
            }

            //tiledImage.setClip(borderClip);
          }

          // TODO: Inset clipping not working with cuts yet, if inset can cover more then one tile
          const shiftTilesX = Math.ceil(
            ((marginWidth + visibleColumns) * offsetRect.width * Math.sign(offsetRect.width)) / this.clipRect.width
          );
          if (shiftTilesX > marginWidth && (c == columns - shiftTilesX - 1 || c == shiftTilesX)) {
            if (c == shiftTilesX && imageCoordShiftX * -1 > this.clipRect.width) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.width = borderClip.width - (this.clipRect.width + imageCoordShiftX) * -1;
              borderClip.x = borderClip.x + (this.clipRect.width + imageCoordShiftX) * -1;
              tiledImage.setClip(borderClip);
            }
            if (c == columns - shiftTilesX - 1 && imageCoordShiftX > this.clipRect.width) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.width = this.clipRect.width - (imageCoordShiftX - this.clipRect.width);
              tiledImage.setClip(borderClip);
            }
          }

          const shiftTilesY = Math.ceil(
            ((marginWidth + visibleRows) * offsetRect.height * Math.sign(offsetRect.height)) / this.clipRect.height
          );
          if (shiftTilesY > marginWidth && (r == rows - shiftTilesY - 1 || r == shiftTilesY)) {
            if (r == shiftTilesY && imageCoordShiftY * -1 > this.clipRect.height) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.height = borderClip.height - (this.clipRect.height + imageCoordShiftX) * -1;
              borderClip.y = borderClip.y + (this.clipRect.height + imageCoordShiftY) * -1;
              tiledImage.setClip(borderClip);
            } else if (r == rows - shiftTilesY - 1 && imageCoordShiftY > this.clipRect.height) {
              const borderClip = checkModifiedClip(tiledImage);
              borderClip.height = this.clipRect.height - (imageCoordShiftY - this.clipRect.height);
              tiledImage.setClip(borderClip);
            }
          }
          //console.log(`${c},${r}`, generateArray(shiftTilesX - marginWidth), generateArray(shiftTilesY - marginWidth));
        }

        tiledImage.setPosition(new OpenSeadragon.Point(x, y), immediately);
        //console.log("final rotation point", `${c}, ${r}`, tiledImage._getRotationPoint(true), tiledImage.getBounds());

        let debugText = `${c}, ${r} (${column}, ${row})`;
        if (tiledImage === referenceImage) {
          debugText = "Reference " + debugText;
        }
        this.debugOverlay(debugText, tiledImage, true);
      }
    }

    this.viewer.world.setAutoRefigureSizes(true);
    if (immediately) {
      raiseFinished.bind(this)();
    }
  }

  private debugOverlay(content: string, image: OpenSeadragon.TiledImage, clip: boolean = false): void {
    if (!this._debug || this._debugOverlays === undefined) {
      return;
    }

    if (this._debugOverlays.has(image)) {
      const overlays = this._debugOverlays.get(image)!;
      overlays[0].element.innerHTML = content;
      this.viewer?.getOverlayById(overlays[0].element).update(image.getBounds(true), undefined);
      if (overlays[1] !== undefined && clip && image.getClip() !== null) {
        this.viewer?.getOverlayById(overlays[1].element).update(image.imageToViewportRectangle(image.getClip()!), undefined);
      }
    } else {
      //const position = image.getBounds(true);
      const labelElem = document.createElement("div");
      labelElem.id = "debug-overlay" + Math.random().toString(16).slice(2);
      labelElem.className = "debug-overlay";
      labelElem.innerHTML = content;
      labelElem.dataset.content = content;
      labelElem.style.fontSize = "2em";
      labelElem.style.color = "red";
      labelElem.style.alignItems = "center";
      labelElem.style.justifyContent = "canter";
      labelElem.style.display = "flex";
      labelElem.style.textAlign = "center";
      labelElem.style.border = "2px solid red";
      const overlay: { element: HTMLElement; location: OpenSeadragon.Rect } = {
        element: labelElem,
        location: image.getBounds(true)
      };
      this.viewer?.addOverlay(overlay.element, overlay.location);

      let clipOverlay: { element: HTMLElement; location: OpenSeadragon.Rect };
      if (clip && image.getClip() !== null) {
        const clipElem = document.createElement("div");
        clipElem.id = "debug-overlay" + Math.random().toString(16).slice(2);
        clipElem.className = "debug-overlay";
        clipElem.classList.add("clip");
        clipElem.dataset.content = content;
        clipElem.style.border = "1px dashed green";
        clipOverlay = {
          element: clipElem,
          location: image.imageToViewportRectangle(image.getClip()!)
        };
        this.viewer?.addOverlay(clipOverlay.element, clipOverlay.location);
        this._debugOverlays.set(image, [overlay, clipOverlay]);
      } else {
        this._debugOverlays.set(image, [overlay]);
      }
    }
  }

  static fitToWidth(
    viewer: OpenSeadragon.Viewer,
    immediately: boolean = true,
    clipRect?: OffsetRect,
    fitTop: boolean = false,
    fitHeight: boolean = false
  ) {
    if (viewer !== undefined && viewer.world.getItemCount() > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < viewer.world.getItemCount(); i++) {
        const tiledImage = viewer.world.getItemAt(i);
        const bounds = tiledImage.getBounds();

        if (tiledImage.getClip() !== null) {
          if (tiledImage.getContentSize().x == tiledImage.getClip()!.x && tiledImage.getContentSize().y == tiledImage.getClip()!.y) {
            continue;
          }

          minX = Math.min(minX, tiledImage.imageToViewportRectangle(tiledImage.getClip()!).x);
          maxX = Math.max(
            maxX,
            tiledImage.imageToViewportRectangle(tiledImage.getClip()!).x + tiledImage.imageToViewportRectangle(tiledImage.getClip()!).width
          );
          maxY = Math.max(
            maxY,
            tiledImage.imageToViewportRectangle(tiledImage.getClip()!).y + tiledImage.imageToViewportRectangle(tiledImage.getClip()!).height
          );
          //maxX = Math.max(maxX, bounds.x + tiledImage.imageToViewportRectangle(tiledImage.getClip()!).width);
          //maxY = Math.max(maxY, bounds.y + tiledImage.imageToViewportRectangle(tiledImage.getClip()!).height);
          minY = Math.min(minY, tiledImage.imageToViewportRectangle(tiledImage.getClip()!).y);
        } else {
          minX = Math.min(minX, bounds.x);
          maxX = Math.max(maxX, bounds.x + bounds.width);
          maxY = Math.max(maxY, bounds.y + bounds.height);
          minY = Math.min(minY, bounds.y);
        }
      }

      const combinedWidth = maxX - minX;
      const combinedHeight = maxY - minY;

      if (combinedWidth > 0 || combinedHeight > 0) {
        let targetZoom: number;
        let combinedCenterX: number;
        let combinedCenterY: number;

        if (fitHeight) {
          if (combinedHeight === 0) {
            console.warn("Cannot fit to height when combined height is zero.");
            return;
          }
          const containerHeight = viewer.viewport.getContainerSize().y;
          targetZoom = containerHeight / viewer.viewport.getContainerSize().x / combinedHeight;

          combinedCenterX = minX + combinedWidth / 2;
          combinedCenterY = minY + combinedHeight / 2;
          viewer.viewport.zoomTo(targetZoom, undefined, immediately);
          viewer.viewport.panTo(new OpenSeadragon.Point(combinedCenterX, combinedCenterY), immediately);
        } else {
          // Fit to width logic
          if (combinedWidth === 0) {
            console.warn("Cannot fit to width when combined width is zero.");
          }
          targetZoom = 1.0 / combinedWidth;
          combinedCenterX = minX + combinedWidth / 2;
          viewer.viewport.zoomTo(targetZoom, undefined, immediately);
          viewer.viewport.panTo(new OpenSeadragon.Point(combinedCenterX, viewer.viewport.getCenter().y), immediately);

          const currentViewportBounds = viewer.viewport.getBounds();
          if (currentViewportBounds.y < 0) {
            viewer.viewport.panBy(new OpenSeadragon.Point(0, -currentViewportBounds.y), immediately);
          }
          if (currentViewportBounds.y > 0 && fitTop) {
            viewer.viewport.panBy(new OpenSeadragon.Point(0, -currentViewportBounds.y + minY), immediately);
          }
        }
        viewer.raiseEvent("full-width", viewer);
      }
    } else {
      throw new Error("Not a valid viewer or no items in the world.");
    }
  }

  appendNotification(cuts: CutNotification): void {
    const last: CutNotification = this._notificationQueue[this._notificationQueue.length - 1];
    if (last === undefined || !equals(last, cuts)) {
      this._notificationQueue.push(cuts);
    }
  }

  notify(cuts: CutNotification, immediately: boolean = true): void {
    if (!this._loaded || this.viewer === undefined) {
      this.appendNotification(cuts);
    } else {
      this.preview(
        cuts[0][CutPosition.Left],
        cuts[0][CutPosition.Top],
        cuts[0][CutPosition.Right],
        cuts[0][CutPosition.Bottom],
        immediately, // Check if false looks better
        cuts[1],
        cuts[2]
      );
    }
  }

  async renderImage(width: number = 1920, height: number = 1080): Promise<OpenSeadragon.Viewer> {
    const container = document.createElement("div");
    let debugElement: HTMLElement | undefined | null;
    container.id = Renderer._rendererContainer;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;

    if (this._debug !== undefined && this._debug) {
      debugElement = document.querySelector<HTMLElement>(`#${Renderer._debugId}`);
      if (debugElement === null) {
        debugElement = document.querySelector<HTMLElement>("body");
      }
      debugElement!.insertAdjacentElement("beforeend", container);
    } else {
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      container.style.overflow = "hidden";
      document.querySelector<HTMLElement>("body")!.insertAdjacentElement("beforeend", container);
    }

    const renderer: Renderer = new Renderer(container, this.columns, this.rows, false, false, false, undefined, width, height);
    renderer.fitPreview = false;
    const childViewer = renderer.viewer;

    if (!childViewer) {
      throw new Error("Child Renderer has no viewer!");
    }

    if (!this._source) {
      throw new Error("Parent viewer has no source!");
    }

    const clip: { [key in CutPosition]?: number | undefined } = {};
    const offsets: { [key in CutPosition]?: number } | undefined = this._offsets;
    const rotations: { [key in CutPosition]?: number } | undefined = this._rotations;

    if (this.clipRect !== undefined) {
      clip[CutPosition.Top] = this.clipRect.y;
      clip[CutPosition.Left] = this.clipRect.x;
      clip[CutPosition.Right] = this.clipRect.x + this.clipRect.width;
      clip[CutPosition.Bottom] = this.clipRect.y + this.clipRect.height;
    } else {
      clip[CutPosition.Top] = 0;
      clip[CutPosition.Left] = 0;
      clip[CutPosition.Right] = this._source!.width;
      clip[CutPosition.Bottom] = this._source!.height;
    }

    renderer.source = this._source;
    const numTiles = childViewer.world.getItemCount();

    return new Promise<OpenSeadragon.Viewer>((resolve, reject) => {
      let layoutFinished = false;
      //let updateViewportFired = false;
      let tilesDrawn = 0;
      let fullWidthFired = false;

      const checkReady = () => {
        if (layoutFinished && tilesDrawn >= numTiles && fullWidthFired) {
          try {
            resolve(childViewer);
            clearTimeout(timer);
            //remove handlers
            if (tileDrawnHandler) childViewer.removeHandler("tile-drawn", tileDrawnHandler);
            if (layoutFinishHandler) childViewer.removeHandler("layout-finish", layoutFinishHandler);
            if (fullWidthHandler) childViewer.removeHandler("full-width", fullWidthHandler);
          } catch (error) {
            reject(error);
            clearTimeout(timer);
            if (tileDrawnHandler) childViewer.removeHandler("tile-drawn", tileDrawnHandler);
            if (layoutFinishHandler) childViewer.removeHandler("layout-finish", layoutFinishHandler);
            if (fullWidthHandler) childViewer.removeHandler("full-width", fullWidthHandler);
          }
        }
      };

      const tileDrawnHandler: OpenSeadragon.EventHandler<OpenSeadragon.ViewerEvent> = () => {
        //event: OpenSeadragon.ViewerEvent
        //console.log(`tile-drawn event fired ${tilesDrawn}`, event);
        tilesDrawn++;
        checkReady();
      };

      const layoutFinishHandler: () => void = () => {
        //console.log("layout-finish event fired");
        layoutFinished = true;
        childViewer.addOnceHandler("full-width", fullWidthHandler);
        Renderer.fitToWidth(childViewer, true, undefined, true);
        checkReady();
      };

      const fullWidthHandler: OpenSeadragon.EventHandler<OpenSeadragon.ViewerEvent> = () => {
        //event: OpenSeadragon.ViewerEvent
        //console.log("full-width event fired", event);
        fullWidthFired = true;
        checkReady();
      };

      childViewer.addHandler("tile-drawn", tileDrawnHandler);

      const updateViewportHandler: OpenSeadragon.EventHandler<OpenSeadragon.ViewerEvent> = () => {
        //event: OpenSeadragon.ViewerEvent
        //console.log("update viewport event fired", event);
        //updateViewportFired = true;
      };
      childViewer.addHandler("update-viewport", updateViewportHandler);

      const waitForTiles = () => {
        if (tilesDrawn >= numTiles) {
          childViewer.removeHandler("tile-drawn", waitForTiles);
          childViewer.addOnceHandler("layout-finish", layoutFinishHandler);
          renderer.notify([clip, offsets, rotations] as CutNotification, true);
        }
      };
      childViewer.addHandler("tile-drawn", waitForTiles);

      const timer = setTimeout(() => {
        const errMsg = i18next.t("renderer:renderTimeout");
        reject(new Error(`${errMsg} ${this.renderTimeout}ms`));
        if (tileDrawnHandler) childViewer.removeHandler("tile-drawn", tileDrawnHandler);
        if (layoutFinishHandler) childViewer.removeHandler("layout-finish", layoutFinishHandler);
        if (fullWidthHandler) childViewer.removeHandler("full-width", fullWidthHandler);
      }, this.renderTimeout);
    });
  }

  addControls(element: HTMLElement, width: number = 1920, height: number = 1080, type: string = "image/png") {
    let childViewer: OpenSeadragon.Viewer | null;
    const renderCallback = async (width: number = 1920, height: number = 1080): Promise<HTMLCanvasElement> => {
      try {
        const viewer = await this.renderImage(width, height);
        // Just an ugly hack everything else won't work
        await new Promise((r) => setTimeout(r, 500));
        //console.log("returning canvas to download");
        childViewer = viewer;
        return viewer.drawer.canvas as HTMLCanvasElement;
      } catch (e) {
        if (this.statusContainer !== null) {
          const errMsg = i18next.t("renderer:error") + ": " + e.message;
          this.statusContainer.innerHTML = errMsg;
        }
        throw new Error(e, { cause: e });
      }
    };
    if (this._download) {
      customElements.define("offscreencanvas-download", CanvasDownloadButton);
      this.downloadButton = document.createElement("offscreencanvas-download") as CanvasDownloadButton;
      const suffix = type.split("/")[1];
      this.downloadButton.format = suffix;
      this.downloadButton.renderCallback = renderCallback.bind(this); //this.renderImage.bind(this);
      this.downloadButton.addEventListener("download-end", () => {
        // 'childViewer' shouldn't be undefined here, that is certainly related to a missing call to this.preview()
        if (childViewer !== undefined && childViewer !== null && childViewer.container !== undefined) {
          const childViewerContainer = childViewer.container;
          childViewer.destroy();
          childViewerContainer.remove();
          if (this._debug !== undefined && this._debug) {
            const debugElement = document.querySelector<HTMLElement>(`#${Renderer._debugId}`);
            if (debugElement !== null) {
              debugElement.remove();
            } else {
              document.querySelector("body > div:last-of-type")?.remove();
            }
          }
          const downloadRenderer = document.querySelector(`#${Renderer._rendererContainer}`);
          if (downloadRenderer !== null) {
            downloadRenderer.remove();
          }
          childViewer = null;
        }
      });
      this.downloadButton.fileName = `wallpaper`;
      this.downloadButton.width = width;
      this.downloadButton.height = height;
      this.downloadButton.setAttribute("disabled", "true");
      this.downloadButton.classList.add("download-button");
      customElements.define("image-resolution-select", ImageResolutionSelect);
      this.resolutionSelect = document.createElement("image-resolution-select") as ImageResolutionSelect;
      //const options = this.resolutionSelect.optionsData;
      this.resolutionSelect.setAttribute("confirm-button", "true");
      this.resolutionSelect.customHeight = height;
      this.resolutionSelect.customWidth = width;
      this.resolutionSelect.setAttribute("disabled", "true");
      this.resolutionSelect.addEventListener("change", (event: CustomEvent) => {
        if (event.detail !== undefined) {
          this.downloadButton!.width = event.detail[0];
          this.downloadButton!.height = event.detail[1];
          this.downloadButton!.disabled = false;
        }
      });
      this.resolutionSelect.classList.add("resolution-select");
      element.appendChild(this.resolutionSelect);
      element.appendChild(this.downloadButton);
    }

    if (this._gridSelector) {
      customElements.define("grid-size-selector", GridSizeSelector);
      this.gridSizeSelect = document.createElement("grid-size-selector") as GridSizeSelector;
      this.gridSizeSelect.setAttribute("disabled", "true");
      this.gridSizeSelect.setAttribute("width", String(this.columns));
      this.gridSizeSelect.setAttribute("height", String(this.rows));
      this.gridSizeSelect.classList.add("grid-select");
      const sizeChangeHandler = (event: CustomEvent) => {
        const columns = event.detail.width;
        const rows = event.detail.height;
        const fitCallback = () => {
          if (this.viewer !== undefined) {
            Renderer.fitToWidth(this.viewer, true);
          }
        };
        this.viewer?.addOnceHandler("source-loaded", fitCallback.bind(this));
        this.setSize(columns, rows); //, fitCallback.bind(this)
      };
      this.gridSizeSelect.addEventListener("size-changed", sizeChangeHandler.bind(this));
      element.appendChild(this.gridSizeSelect);
    }
  }
}
