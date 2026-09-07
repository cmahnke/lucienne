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
    // Debug/testing handle: exposes the renderer for e2e diagnostics
    (this.viewerElement as { osdRenderer?: Renderer }).osdRenderer = this;

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
    Renderer._loadTiles(this.viewer, this._source, columns * rows)
      .then((result) => {
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
      })
      .catch((error) => {
        console.error("Failed to load tiles:", error);
        if (this.statusContainer !== null) {
          this.statusContainer.innerHTML = i18next.t("renderer:error") + ": " + error.message;
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
    if (Renderer.validateSidedVariations(offsets, "offset")) {
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
      CutPosition.Right in variation &&
      variation[CutPosition.Right] !== undefined
    ) {
      if (variation[CutPosition.Left] != 0 && variation[CutPosition.Right] != 0) {
        console.error(`Different ${type} for left (${variation[CutPosition.Left]}) and right (${variation[CutPosition.Right]}) sides`);
      }
    }

    if (
      CutPosition.Top in variation &&
      variation[CutPosition.Top] !== undefined &&
      CutPosition.Bottom in variation &&
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
    if (element === undefined) {
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
    if (referenceImage === undefined) {
      throw new Error("Couldn't get first tiled image!");
    }
    referenceImage.setPosition(new OpenSeadragon.Point(0, 0), immediately);
    const transformedClipRect = referenceImage.imageToViewportRectangle(this.clipRect);
    // Tiles that actually render (for the wedge detection) and tiles that are
    // hidden (spare tiles, repositioned to fill wedges)
    const placedRects: { x: number; y: number; width: number; height: number }[] = [];
    const spareTiles: OpenSeadragon.TiledImage[] = [];
    let hasOffsets = false;

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

        let isHidden = false;

        //Sanity checks
        if (tiledImage === undefined || referenceImage === undefined || this.clipRect === undefined) {
          throw new Error("Required variables are not defined");
        }

        // Operate completely on this tile group: start every layout from a
        // defined state instead of accumulating whatever the previous layout
        // left behind (a rotation, a clip the crop logic trimmed). Reusing
        // the stale clip made unrotated tiles jump whenever anything
        // triggered a relayout, e.g. rotating a tile.
        tiledImage.setRotation(0, immediately);
        tiledImage.setClip(RotateableRect.fromRect(this.clipRect));
        // The hide rect is built after the rotation reset so it consistently
        // uses rotation 0
        const hideRect = new HideRect(tiledImage);

        //expectedSize = new OpenSeadragon.Rect(0, 0, transformedClipRect.width * visibleColumns, transformedClipRect.height * visibleRows);
        let offsetRect;
        if (this._offsets != undefined) {
          offsetRect = Renderer.createOffsetRect(this._offsets, tiledImage);
          if (offsetRect !== undefined) {
            hasOffsets = true;
          }
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
            isHidden = true;
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
            // The tile's clip is already the cut region (set at the start of
            // the layout) and stays untouched: rotating the tile rotates
            // exactly that region. The previous logic rewrote the clip
            // (rotating it again and forcing its dimensions), which showed
            // the wrong source region whenever the cut region had margins
            // inside the image.
            tiledImage.setRotationPoint(
              new OpenSeadragon.Rect(0, 0, tiledImage.getContentSize().x, tiledImage.getContentSize().y).getCenter()
            );
            tiledImage.setRotation(rotation, immediately);
            // Position the tile so the rotated clip region stays exactly
            // where the unrotated clip region was, relative to the tile's
            // grid cell: OpenSeadragon rotates the content about the tile's
            // world center, so the world center has to be shifted by the
            // rotated offset between the clip center and the world center.
            // The previous margin-based approximation misaligned rotated
            // tiles whenever the cut region did not cover the whole image.
            const contentScale = OffsetRect.viewportScale(tiledImage);
            const contentSize = tiledImage.getContentSize();
            const worldWidth = contentSize.x * contentScale;
            const worldHeight = contentSize.y * contentScale;
            const clipCenterX = (this.clipRect.x + this.clipRect.width / 2) * contentScale;
            const clipCenterY = (this.clipRect.y + this.clipRect.height / 2) * contentScale;
            if (rotation === 90) {
              x += clipCenterX + clipCenterY - (worldWidth + worldHeight) / 2;
              y += clipCenterY - clipCenterX + (worldWidth - worldHeight) / 2;
            } else if (rotation === 180) {
              x += 2 * clipCenterX - worldWidth;
              y += 2 * clipCenterY - worldHeight;
            } else if (rotation === 270) {
              x += clipCenterX - clipCenterY - (worldWidth - worldHeight) / 2;
              y += clipCenterY + clipCenterX - (worldWidth + worldHeight) / 2;
            }
          }
        }

        if (offsetRect !== undefined) {
          // The cut region is the repeat unit of the pattern: shifting a
          // row/column by whole periods does not change the rendered pattern,
          // but raw accumulated shifts (offset * row/column) grow with the
          // grid size and make the composite (and with it the viewer zoom)
          // "breathe". Normalize the shifts into [0, period): wrapping
          // translates the strip by exactly one period, which is invisible
          // for a periodic pattern - wrapping at half periods (signed) would
          // make the tiles visibly jump while dragging.
          const stripShift: (offset: number, index: number, period: number) => number = (offset, index, period) => {
            // floorMod of the accumulated magnitude: a wrap translates the
            // strip by exactly one period, which is invisible for a periodic
            // pattern
            const magnitude = Math.abs(offset) * index;
            return magnitude - period * Math.floor(magnitude / period);
          };
          // Ring tiles adjacent to the visible area take the strip phase of
          // the neighboring visible row/column: with their own index they
          // would be shifted out of phase and could not fill the wedges the
          // shifted strips leave at the crop boundary
          let shiftRow = row;
          let shiftColumn = column;
          if (margins) {
            if (row == -1) {
              shiftRow = 0;
            } else if (row == visibleRows) {
              shiftRow = visibleRows - 1;
            }
            if (column == -1) {
              shiftColumn = 0;
            } else if (column == visibleColumns) {
              shiftColumn = visibleColumns - 1;
            }
          }
          // Vertical shifts
          if (offsetRect.height != 0) {
            const shift = stripShift(offsetRect.calculateY(referenceImage), shiftColumn, transformedClipRect.height);
            // When both offsets are active the vertical stagger direction
            // follows the horizontal one: opposing working directions would
            // leave uncovered wedges at the strip intersections
            const positive = offsetRect.width != 0 ? offsetRect.width > 0 : offsetRect.height > 0;
            y = positive ? y + shift : y - shift;
          }
          // Horizontal shifts
          if (offsetRect.width != 0) {
            const shift = stripShift(offsetRect.calculateX(referenceImage), shiftRow, transformedClipRect.width);
            x = offsetRect.width > 0 ? x + shift : x - shift;
          }
          if (margins) {
            // With offsets every row/column strip stays contiguous (all its
            // tiles share the same normalized shift), but the strips no
            // longer align with the crop rectangle at the boundaries. The
            // margin ring adjacent to the visible area therefore renders
            // unclipped: it continues the pattern seamlessly, fills the
            // wedges the shifted strips leave at the crop boundary and keeps
            // the composite connected. Deeper rings stay hidden.
            const adjacentX = column == -1 || column == visibleColumns;
            const adjacentY = row == -1 || row == visibleRows;
            if (adjacentX || adjacentY) {
              tiledImage.setClip(RotateableRect.fromRect(this.clipRect));
              isHidden = false;
            }
          }
        }

        // Apply the computed position first: the crop logic below measures
        // the tile's actually drawn (clipped) bounds, which depend on the
        // position just set - measuring before positioning would read the
        // world's arrange() placement instead.
        tiledImage.setPosition(new OpenSeadragon.Point(x, y), immediately);

        // Clip every tile back to the configured dimensions: the offsets only
        // change the alignment of the strips, the overall shape of the
        // composite must stay the configured columns x rows rectangle.
        // Overlapping parts beyond the crop are clipped away, the parts of
        // the adjacent margin ring inside the crop keep filling the wedges at
        // the boundary. The overflow is measured on the actually drawn
        // (clipped) bounds, which for rotated tiles are the rotated clip
        // region rather than the tile's world rectangle.
        const cropWidth = visibleColumns * transformedClipRect.width;
        const cropHeight = visibleRows * transformedClipRect.height;
        const drawn = tiledImage.getClippedBounds();
        const visibleX0 = Math.max(drawn.x, 0);
        const visibleX1 = Math.min(drawn.x + drawn.width, cropWidth);
        const visibleY0 = Math.max(drawn.y, 0);
        const visibleY1 = Math.min(drawn.y + drawn.height, cropHeight);
        if (visibleX1 <= visibleX0 || visibleY1 <= visibleY0) {
          // entirely outside the configured area
          tiledImage.setClip(hideRect.clone());
          isHidden = true;
        } else if (drawn.x < 0 || drawn.y < 0 || drawn.x + drawn.width > cropWidth || drawn.y + drawn.height > cropHeight) {
          const borderClip = tiledImage.getClip()?.clone() ?? RotateableRect.fromRect(this.clipRect);
          // Trim the clip sides that correspond to the overflowing viewport
          // sides. The drawn region is the clip region rotated by the tile's
          // rotation (clockwise): for a tile rotated by 90 degrees the
          // viewport x axis corresponds to the clip's y axis (and vice
          // versa) and for 180 degrees the axes flip - trimming the wrong
          // sides let rotated tiles stick out of the configured area or lose
          // content at the wrong edge.
          const rotation = (((Math.round(tiledImage.getRotation() / 90) * 90) % 360) + 360) % 360;
          const imagePerViewport = 1 / OffsetRect.viewportScale(tiledImage);
          const overflowRight = Math.max(0, drawn.x + drawn.width - cropWidth);
          const overflowLeft = Math.max(0, -drawn.x);
          const overflowBottom = Math.max(0, drawn.y + drawn.height - cropHeight);
          const overflowTop = Math.max(0, -drawn.y);
          const sides: Record<number, { right: string; left: string; bottom: string; top: string }> = {
            0: { right: "end-x", left: "start-x", bottom: "end-y", top: "start-y" },
            90: { right: "start-y", left: "end-y", bottom: "end-x", top: "start-x" },
            180: { right: "start-x", left: "end-x", bottom: "start-y", top: "end-y" },
            270: { right: "end-y", left: "start-y", bottom: "start-x", top: "end-x" }
          };
          const trim = (edge: string, overflow: number) => {
            if (overflow <= 0) {
              return;
            }
            const amount = overflow * imagePerViewport;
            if (edge === "end-x") {
              borderClip.width -= amount;
            } else if (edge === "start-x") {
              borderClip.x += amount;
              borderClip.width -= amount;
            } else if (edge === "end-y") {
              borderClip.height -= amount;
            } else {
              borderClip.y += amount;
              borderClip.height -= amount;
            }
          };
          const sideMap = sides[rotation] ?? sides[0];
          trim(sideMap.right, overflowRight);
          trim(sideMap.left, overflowLeft);
          trim(sideMap.bottom, overflowBottom);
          trim(sideMap.top, overflowTop);
          tiledImage.setClip(borderClip);
        }
        if (isHidden) {
          spareTiles.push(tiledImage);
        } else {
          placedRects.push({ x: drawn.x, y: drawn.y, width: drawn.width, height: drawn.height });
        }
        //console.log("final rotation point", `${c}, ${r}`, tiledImage._getRotationPoint(true), tiledImage.getBounds());

        let debugText = `${c}, ${r} (${column}, ${row})`;
        if (tiledImage === referenceImage) {
          debugText = "Reference " + debugText;
        }
        this.debugOverlay(debugText, tiledImage, true);
      }
    }

    // Fill the wedges that both offsets leave at their stagger intersections:
    // scan the configured area in quarter-tile steps for cells that the drawn
    // tiles do not fully cover and position a spare (previously hidden) tile
    // on every uncovered cell, clipped to exactly that area with the matching
    // source phase. Coverage is measured exactly: every drawn rectangle is
    // subtracted from the cell, and only cells with nothing left over count
    // as covered - cells jointly covered by neighbouring tiles of the same
    // strip (whose content is continuous) stay untouched, while cells with
    // genuine gaps get filled. The pattern is periodic, so the blob's clip
    // region is the cut region translated by the blob's position modulo the
    // period.
    if (hasOffsets && spareTiles.length > 0) {
      const stepX = transformedClipRect.width / 4;
      const stepY = transformedClipRect.height / 4;
      const ratioX = this.clipRect!.width / transformedClipRect.width;
      const ratioY = this.clipRect!.height / transformedClipRect.height;
      const cropWidth = visibleColumns * transformedClipRect.width;
      const cropHeight = visibleRows * transformedClipRect.height;
      const covers = (px: number, py: number, w: number, h: number) => {
        let remainder: { x: number; y: number; width: number; height: number }[] = [{ x: px, y: py, width: w, height: h }];
        for (const rect of placedRects) {
          if (remainder.length === 0) {
            break;
          }
          const next: { x: number; y: number; width: number; height: number }[] = [];
          for (const r of remainder) {
            const ix0 = Math.max(r.x, rect.x);
            const iy0 = Math.max(r.y, rect.y);
            const ix1 = Math.min(r.x + r.width, rect.x + rect.width);
            const iy1 = Math.min(r.y + r.height, rect.y + rect.height);
            if (ix1 <= ix0 || iy1 <= iy0) {
              next.push(r);
              continue;
            }
            if (r.x < ix0) {
              next.push({ x: r.x, y: r.y, width: ix0 - r.x, height: r.height });
            }
            if (ix1 < r.x + r.width) {
              next.push({ x: ix1, y: r.y, width: r.x + r.width - ix1, height: r.height });
            }
            if (r.y < iy0) {
              next.push({ x: ix0, y: r.y, width: ix1 - ix0, height: iy0 - r.y });
            }
            if (iy1 < r.y + r.height) {
              next.push({ x: ix0, y: iy1, width: ix1 - ix0, height: r.y + r.height - iy1 });
            }
          }
          remainder = next;
        }
        return remainder.length === 0;
      };
      const scanColumns = Math.ceil(cropWidth / stepX);
      const scanRows = Math.ceil(cropHeight / stepY);
      const uncovered = new Map<string, { gx: number; gy: number }>();
      for (let gy = 0; gy < scanRows; gy++) {
        for (let gx = 0; gx < scanColumns; gx++) {
          const px = gx * stepX;
          const py = gy * stepY;
          const w = Math.min(stepX, cropWidth - px);
          const h = Math.min(stepY, cropHeight - py);
          if (!covers(px, py, w, h)) {
            uncovered.set(`${gx},${gy}`, { gx, gy });
          }
        }
      }
      const crossesPeriod = (px: number, py: number, w: number, h: number) =>
        Math.floor(px / transformedClipRect.width) !== Math.floor((px + w - 0.001) / transformedClipRect.width) ||
        Math.floor(py / transformedClipRect.height) !== Math.floor((py + h - 0.001) / transformedClipRect.height);
      while (uncovered.size > 0 && spareTiles.length > 0) {
        const first = uncovered.values().next().value!;
        let x0 = first.gx;
        let y0 = first.gy;
        let x1 = first.gx;
        let y1 = first.gy;
        uncovered.delete(`${x0},${y0}`);
        let grew = true;
        while (grew) {
          grew = false;
          for (const cell of uncovered.values()) {
            const nx0 = Math.min(x0, cell.gx);
            const ny0 = Math.min(y0, cell.gy);
            const nx1 = Math.max(x1, cell.gx);
            const ny1 = Math.max(y1, cell.gy);
            const px = nx0 * stepX;
            const py = ny0 * stepY;
            const w = Math.min((nx1 - nx0 + 1) * stepX, cropWidth - px);
            const h = Math.min((ny1 - ny0 + 1) * stepY, cropHeight - py);
            if (!crossesPeriod(px, py, w, h)) {
              x0 = nx0;
              y0 = ny0;
              x1 = nx1;
              y1 = ny1;
              uncovered.delete(`${cell.gx},${cell.gy}`);
              grew = true;
            }
          }
        }
        const spare = spareTiles.pop();
        if (spare === undefined) {
          break;
        }
        const px = x0 * stepX;
        const py = y0 * stepY;
        const w = Math.min((x1 - x0 + 1) * stepX, cropWidth - px);
        const h = Math.min((y1 - y0 + 1) * stepY, cropHeight - py);
        // A tile draws its clip region offset from its world origin: to land
        // the drawn region exactly on the blob while showing the source
        // phase of the blob's position, the origin must sit at the
        // period-aligned window start and the clip must carry the phase
        const phaseX = px % transformedClipRect.width;
        const phaseY = py % transformedClipRect.height;
        spare.setPosition(new OpenSeadragon.Point(px - phaseX, py - phaseY), immediately);
        spare.setClip(
          new OpenSeadragon.Rect(this.clipRect!.x + phaseX * ratioX, this.clipRect!.y + phaseY * ratioY, w * ratioX, h * ratioY)
        );
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

    return new Promise<OpenSeadragon.Viewer>((resolve, reject) => {
      const waitForTiles = () => {
        childViewer.removeHandler("tile-drawn", waitForTiles);
        // Apply the layout and the final viewport zoom BEFORE the canvas is
        // captured. Previously the readiness was checked against a tile
        // count read while the world was still empty, the promise resolved
        // immediately and the canvas was captured in a mixed-zoom state.
        renderer.notify([clip, offsets, rotations] as CutNotification, true);
        // Fit the child viewport to the visible grid only: the download must
        // contain exactly the configured columns x rows of the cut area, not
        // the margin context rendered around it
        const gridReference = childViewer.world.getItemAt(renderer._marginWidth * renderer._columns + renderer._marginWidth);
        if (gridReference !== undefined) {
          const tileBounds = gridReference.getBounds();
          const gridRect = new OpenSeadragon.Rect(0, 0, tileBounds.width * renderer.columns, tileBounds.height * renderer.rows);
          childViewer.viewport.fitBounds(gridRect, true);
        }
        // Redraw everything at the final zoom and let the drawing complete
        // before the canvas is captured
        childViewer.forceRedraw();
        setTimeout(() => {
          clearTimeout(timer);
          resolve(childViewer);
        }, 600);
      };
      childViewer.addHandler("tile-drawn", waitForTiles);

      const timer = setTimeout(() => {
        const errMsg = i18next.t("renderer:renderTimeout");
        reject(new Error(`${errMsg} ${this.renderTimeout}ms`));
        childViewer.removeHandler("tile-drawn", waitForTiles);
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
        throw e instanceof Error ? e : new Error(String(e), { cause: e });
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
