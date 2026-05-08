import OpenSeadragon from "openseadragon";
import { initOSDFabricOverlay, FabricOverlay } from "openseadragon-fabric-overlay";
import { RotatingInput } from "./components/RotatingInput";
import { DualRangeSlider } from "./components/DualRangeSlider";
import { Cuts } from "./Cuts";
import type { CutType } from "./Cuts";
import { Renderer } from "./Renderer";
import { IIIFForm } from "./IIIFForm";
import { CutPosition } from "./types";
import type { IIIFImageStub, CutJSON, CutJSONLD } from "./types";
import { loadInfoJson } from "./util/util";
import { IIIFTileSourceSpecifier } from "./openseadragon/IIIFTileSourceSpecifier";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import translations from "./assets/json/translations.json";
import "./assets/scss/base.scss";

i18next.use(LanguageDetector).init({
  debug: false,
  fallbackLng: "en",
  resources: translations,
  supportedLngs: ["en", "de"]
});

const appName = "lucienne";

export class CuttingTable {
  static {
    CuttingTable.patchOpenSeadragon();
  }

  //Element identifiers / classes / selectors
  static defaultId: string = "generator";
  static selectContainerClass: string = "select-container";
  static statusContainerClass: string = "status-container";
  static viewerElementClass: string = "cutting-table-viewer";
  static dropZoneElementClass: string = "input-area";
  static rendererElementClass = "texture-container";
  static shiftClass = "shifts";
  static rulerElementSelector = ".box.rulers";
  static squareButtonSelector = ".square";
  static controlSelectors: { [key in CutType]: { x: string; y: string } } = {
    cut: { x: ".cut-x", y: ".cut-y" },
    offset: { x: ".offset-x", y: ".offset-y" },
    rotation: { x: ".rotation-x", y: ".rotation-y" }
  };

  container: HTMLDivElement;
  _imageAPI: URL;
  download: boolean = true;
  viewer: OpenSeadragon.Viewer;
  renderer: Renderer | undefined;
  // Components
  cuts: Cuts;
  form: IIIFForm;
  fabricOverlay: FabricOverlay;
  //Options
  _urlInput: boolean;
  _gridSelector: boolean;
  _download: boolean;
  _debug: boolean = false;
  _autoLoad: boolean;
  _shifts: boolean = true;
  //Elements of Contols and children
  viewerElement: HTMLDivElement;
  cutY: DualRangeSlider;
  cutX: DualRangeSlider;
  offsetY: HTMLInputElement;
  offsetX: HTMLInputElement;
  rotationX: RotatingInput;
  rotationY: RotatingInput;
  rulerCheckbox: HTMLInputElement;
  squareButton: HTMLElement;
  downloadLink: HTMLAnchorElement;
  dropZoneElement: HTMLDivElement;
  statusContainer: HTMLDivElement | null;
  //Renderer tiles
  _columns: number = 4;
  _rows: number = 4;

  //URL handling
  _initialUrls: { url: string; label: string }[];
  _url: URL;

  /**
   * Initializes a new CuttingTable instance for interactive image cutting and visualization.
   *
   * @param {HTMLDivElement} element - The container element where the CuttingTable interface will be rendered.
   * @param {boolean} [urlInput=true] - Whether to display a URL input field for specifying image sources.
   * @param {boolean} [gridSelector=true] - Whether to enable grid selection controls for layout configuration.
   * @param {boolean} [download=true] - Whether to enable download functionality for exported JSON data.
   * @param {boolean} [autoLoad=true] - Whether to automatically load the first configured URL upon initialization.
   * @param {URL|Array<{url: string, label: string}>|string|undefined} [urls] - Optional initial URLs to load.
   *   Can be a single URL, an array of URL objects with labels, or a string URL.
   * @param {boolean} [shifts=false] - Whether to enable shift controls for offset adjustments.
   *
   * @throws {Error} If no valid element is provided or if no initial URL is set when urlInput is false.
   *
   * @example
   * const container = document.getElementById("cutting-table");
   * const cuttingTable = new CuttingTable(container, true, true, true, true, "https://example.com/iiif/image/info.json");
   *
   * @example
   * const cuttingTable = new CuttingTable(container, false, true, true, true, [
   *   { url: "https://example.com/iiif/image1/info.json", label: "Image 1" },
   *   { url: "https://example.com/iiif/image2/info.json", label: "Image 2" }
   * ]);
   */
  constructor(
    element: HTMLDivElement,
    urlInput: boolean = true,
    gridSelector: boolean = true,
    download: boolean = true,
    autoLoad: boolean = true,
    urls?: URL | { url: string; label: string }[],
    shifts: boolean = false
  ) {
    if (element !== undefined) {
      this.container = element;
    } else {
      this.container = document.querySelector<HTMLDivElement>(`.${CuttingTable.defaultId}`)!;
    }
    this.container.classList.add("lucienne");

    if (this.container === undefined) {
      throw new Error("Couldn't setup element");
    }

    //Debug?
    if ("debug" in element.dataset && element.dataset.debug !== undefined && element.dataset.debug !== "") {
      this._debug = element.dataset.debug === "true";
    }
    // URL input field?
    if ("urlInput" in element.dataset && element.dataset.urlInput !== undefined && element.dataset.urlInput !== "") {
      urlInput = element.dataset.urlInput === "true";
    }
    this._urlInput = urlInput;
    // Enable resize option?
    if ("gridSelector" in element.dataset && element.dataset.gridSelector !== undefined && element.dataset.gridSelector !== "") {
      gridSelector = element.dataset.gridSelector === "true";
    }
    this._gridSelector = gridSelector;
    //Enable downloading?
    if ("download" in element.dataset && element.dataset.download !== undefined && element.dataset.download !== "") {
      download = element.dataset.download === "true";
    }
    this._download = download;
    this._autoLoad = autoLoad;
    this._shifts = shifts;

    //get preconfigured URL
    if ("url" in element.dataset && element.dataset.url !== undefined && element.dataset.url !== "") {
      this._url = new URL(element.dataset.url);
    } else {
      if (urls !== undefined && urls instanceof URL) {
        this._url = urls;
      } else if (urls !== undefined && Array.isArray(urls)) {
        this._initialUrls = urls;
      } else if (typeof urls === "string") {
        this._url = new URL(urls);
      }
      if (this._autoLoad && Array.isArray(this._initialUrls)) {
        this._url = new URL(this._initialUrls[0]["url"]);
      }
    }

    if ("columns" in element.dataset && element.dataset.columns !== undefined && element.dataset.columns !== "") {
      this._columns = parseInt(element.dataset.columns);
    }
    if ("rows" in element.dataset && element.dataset.rows !== undefined && element.dataset.rows !== "") {
      this._rows = parseInt(element.dataset.rows);
    }

    if (this._shifts) {
      this.container.classList.add(CuttingTable.shiftClass);
    }

    if (!this._urlInput && this._url === undefined) {
      throw new Error("No initial URL set");
    }

    //Components
    customElements.define("rotating-input", RotatingInput);
    customElements.define("dual-range-slider", DualRangeSlider);
    this.setupInterface();

    //Input form
    const selectContainer = this.container.querySelector<HTMLDivElement>(`.${CuttingTable.selectContainerClass}`)!;
    this.statusContainer = this.container.querySelector<HTMLDivElement>(`.${CuttingTable.statusContainerClass}`)!;
    this.form = new IIIFForm(this, selectContainer, this.statusContainer, this._urlInput, this._autoLoad);
    //Result renderer
    const renderElement = this.container.querySelector<HTMLDivElement>(`.${CuttingTable.rendererElementClass}`)!;
    this.renderer = new Renderer(renderElement, this._columns, this._rows, this._gridSelector, this._download);
    this.renderer.debug = this._debug;
    this.renderer.statusContainer = this.statusContainer;
    this.viewerElement = this.container.querySelector<HTMLDivElement>(`.${CuttingTable.viewerElementClass}`)!;

    this.setupOSD(this.viewerElement);
    if (this.viewerElement.parentElement !== null && this.download) {
      this.addJSONLink(this.viewerElement.parentElement);
    }

    this.setupControls();
  }

  setupOSD(element: HTMLDivElement) {
    const options: OpenSeadragon.Options = {
      zoomInButton: element.querySelector<Element>(".zoomin")!,
      zoomOutButton: element.querySelector<Element>(".zoomout")!,
      element: element,
      gestureSettingsMouse: { clickToZoom: false },
      showFullPageControl: false,
      showHomeControl: false,
      autoHideControls: false,
      drawer: "canvas",
      crossOriginPolicy: "Anonymous"
    };
    this.viewer = OpenSeadragon(options);
    this.fabricOverlay = initOSDFabricOverlay(
      this.viewer,
      {
        fabricCanvasOptions: {
          selection: true
        }
      },
      appName
    );
  }

  addJSONLink(element: HTMLElement) {
    this.downloadLink = document.createElement("a");
    this.downloadLink.innerText = i18next.t("cuttingTable:linksJson");
    this.downloadLink.title = i18next.t("cuttingTable:linksJson");
    this.downloadLink.setAttribute("href", "javascript:void(0)");
    this.downloadLink.classList.add("link", "json", "disabled");
    this.downloadLink.setAttribute("id", "downloadJSON");
    this.downloadLink.setAttribute("download", "cuttingTable.json");
    this.downloadLink.addEventListener("click", () => {
      if (this.cuts !== undefined) {
        if (this.cuts.url === "" && this.imageServiceUrl === undefined) {
          throw new Error("Couldn' set target URL!");
        } else {
          this.cuts.url = this.imageServiceUrl;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.cuts.toJSONLD(), null, 2));
        this.downloadLink.setAttribute("href", dataStr);
      }
    });
    element.appendChild(this.downloadLink);
  }

  square() {
    if (this.cuts !== undefined && this.cuts.square()) {
      this.cutY.valueMin = this.cuts.getPosition(CutPosition.Top);
      this.cutY.valueMax = this.cuts.getPosition(CutPosition.Bottom);
      this.cutX.valueMin = this.cuts.getPosition(CutPosition.Left);
      this.cutX.valueMax = this.cuts.getPosition(CutPosition.Right);
    }
  }

  async loadImageAPI(imageAPIEndpoint: URL) {
    let service;
    try {
      service = await loadInfoJson(imageAPIEndpoint);
    } catch {
      console.warn(`Failed to get ${imageAPIEndpoint}`);
    }

    if (this.renderer !== undefined) {
      this.renderer.source = service;
    }

    this.imageService = service as IIIFImageStub;
    this.imageServiceUrl = imageAPIEndpoint;
  }

  set imageService(endpointService: IIIFImageStub) {
    if (this.viewer !== undefined) {
      this.viewer.world.addHandler("add-item", () => {
        if (this.cuts !== undefined) {
          this.cuts.lastAxis = undefined;
          this.updateLines(endpointService.width, endpointService.height);
          this.form.clearMessage();
          this.cuts.setVisibility(true);
        }
      });
      if (this.viewer.world.getItemCount()) {
        this.viewer.close();
        this.viewer.open(IIIFTileSourceSpecifier.wrap(endpointService));
      } else {
        this.viewer.addTiledImage({ index: this.viewer.world.getItemCount(), tileSource: endpointService });
      }
      if (endpointService["@context"].startsWith("http://iiif.io/api/image/")) {
        this.updateLines(endpointService.width, endpointService.height, false);
      }
    } else {
      console.warn("Viewer not initialized");
    }

    if (this.renderer !== undefined) {
      if (this.renderer.loaded) {
        this.renderer.clear();
      }
      this.renderer.source = endpointService;
    }
  }

  set imageServiceUrl(url: URL) {
    if (this.download) {
      this.downloadLink.classList.remove("disabled");
    }
    this._imageAPI = url;
    this.cuts.url = url;
  }

  get imageServiceUrl() {
    return this._imageAPI;
  }

  set initialUrls(initialUrls: { url: string; label: string }[]) {
    this._initialUrls = initialUrls;
  }

  get url(): URL {
    return this._url;
  }

  get urlInput(): boolean {
    return this._urlInput;
  }

  initCuts() {
    this.cuts = new Cuts([CutPosition.Right, CutPosition.Bottom, CutPosition.Top, CutPosition.Left], this.fabricOverlay);
    this.cuts.setVisibility(false);
  }

  dropHandler(event: DragEvent) {
    this.dragOffHandler();
    if (event.dataTransfer === null) {
      return;
    }
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === "application/json") {
        const reader = new FileReader();
        reader.addEventListener("load", async (e: ProgressEvent<FileReader>) => {
          if (e !== undefined && e.target !== null && e.target.result !== null) {
            try {
              const result = e.target.result as string;
              let url: URL;
              const json: CutJSON | CutJSONLD | object = JSON.parse(result) as object;
              let jsonLoadCallback: OpenSeadragon.EventHandler<OpenSeadragon.TileLoadedEvent>;
              if ("type" in json) {
                url = new URL((json as CutJSONLD).target.source);
                this.form.urlInput = url;

                jsonLoadCallback = () => {
                  this.cuts.loadJSONLD(json as CutJSONLD);
                  this.updateControls();
                };
              } else {
                url = new URL((json as CutJSON).url);
                this.form.urlInput = url;
                jsonLoadCallback = () => {
                  this.cuts.loadJSON(json as CutJSON);
                  this.updateControls();
                };
              }
              await this.loadImageAPI(url);
              this.viewer?.addOnceHandler("tile-loaded", jsonLoadCallback.bind(this));
              this.cuts.setVisibility(true);
            } catch (error) {
              console.error(error);

              this.form.displayMessage(i18next.t("cuttingTable:uploadError") + "+ " + error.message);
            }
          }
        });
        reader.readAsText(file);
      } else {
        const msg = "File is not a JSON";
        this.form.displayMessage(i18next.t("cuttingTable:uploadError") + ": " + msg);
        throw new Error(msg);
      }
    }
  }
  dragOnHandler() {
    this.dropZoneElement.classList.add("dropzone");
  }
  dragOffHandler() {
    this.dropZoneElement.classList.remove("dropzone");
  }

  updateCutLineWidth() {
    if (this.cuts !== undefined && this.viewer !== undefined) {
      const lineWidth = Math.ceil(5 / this.viewer.viewport.getZoom());
      const shapePositions = Object.keys(this.cuts.shapes) as unknown as CutPosition[];
      shapePositions.forEach((position: CutPosition) => {
        this.cuts.setLineWidth(position, lineWidth);
      });
    }
  }

  updateControls() {
    this.updateCutLineWidth();
    if (this.cuts !== undefined) {
      this.cutX.max = this.cuts.width;
      this.cutY.max = this.cuts.height;
      this.offsetX.min = String(Math.ceil(0 - this.cuts.width / 2));
      this.offsetX.max = String(Math.floor(this.cuts.width / 2));
      this.offsetY.min = String(Math.ceil(0 - this.cuts.height / 2));
      this.offsetY.max = String(Math.floor(this.cuts.height / 2));

      const positions = Object.keys(this.cuts.positions) as unknown as CutPosition[];
      positions.forEach((position: CutPosition) => {
        if (position == CutPosition.Left && this.cuts.positions[CutPosition.Left] !== undefined) {
          this.cutX.valueMin = this.cuts.positions[CutPosition.Left];
        }
        if (position == CutPosition.Right && this.cuts.positions[CutPosition.Right] !== undefined) {
          this.cutX.valueMax = this.cuts.positions[CutPosition.Right];
        }
        if (position == CutPosition.Top && this.cuts.positions[CutPosition.Top] !== undefined) {
          this.cutY.valueMin = this.cuts.positions[CutPosition.Top];
        }
        if (position == CutPosition.Bottom && this.cuts.positions[CutPosition.Bottom] !== undefined) {
          this.cutY.valueMax = this.cuts.positions[CutPosition.Bottom];
        }
      });
      const offsets = Object.keys(this.cuts.offsets) as unknown as CutPosition[];
      offsets.forEach((position: CutPosition) => {
        if (position == CutPosition.Left && this.cuts.offsets[CutPosition.Left] !== undefined) {
          this.offsetX.value = String(this.cuts.offsets[CutPosition.Left] * -1);
        }
        if (position == CutPosition.Right && this.cuts.offsets[CutPosition.Right] !== undefined) {
          this.offsetX.value = String(this.cuts.offsets[CutPosition.Right]);
        }
        if (position == CutPosition.Top && this.cuts.offsets[CutPosition.Right] !== undefined) {
          this.offsetY.value = String(this.cuts.offsets[CutPosition.Right] * -1);
        }
        if (position == CutPosition.Bottom && this.cuts.offsets[CutPosition.Bottom] !== undefined) {
          this.offsetY.value = String(this.cuts.offsets[CutPosition.Bottom]);
        }
      });
      const rotations = Object.keys(this.cuts.rotations) as unknown as CutPosition[];
      rotations.forEach((position: CutPosition) => {
        if (position == CutPosition.Right && this.cuts.rotations[CutPosition.Right] !== undefined) {
          this.rotationX.value = this.cuts.rotations[CutPosition.Right];
        }
        if (position == CutPosition.Bottom && this.cuts.rotations[CutPosition.Bottom] !== undefined) {
          this.rotationY.value = this.cuts.rotations[CutPosition.Bottom];
        }
      });
    }
  }

  updateLines(width: number, height: number, visibility: boolean = true) {
    this.fabricOverlay.fabricCanvas().clear();
    this.initCuts();
    this.cuts.setSize(width, height);
    if (this.cuts.url === undefined) {
      this.cuts.url = this.imageServiceUrl;
    }
    this.updateCutLineWidth();
    this.cuts.setVisibility(visibility);

    if (this.renderer !== undefined) {
      this.cuts.callback = this.renderer.notify.bind(this.renderer);
    }

    this.cutX.setAttribute("max", String(width));
    this.cutX.setAttribute("value-min", "0");
    this.cutX.setAttribute("value-max", String(width));
    this.cutX.disabled = false;

    this.rotationX.disabled = false;
    this.rotationX.value = 0;
    this.cutY.setAttribute("max", String(height));
    this.cutY.setAttribute("value-min", "0");
    this.cutY.setAttribute("value-max", String(height));
    this.cutY.disabled = false;
    if (this._shifts) {
      this.offsetY.min = String(Math.ceil(0 - height / 2));
      this.offsetY.max = String(Math.floor(height / 2));
      this.offsetY.setAttribute("value", "0");
      this.offsetY.value = "0";
      this.offsetY.disabled = false;
      this.offsetX.min = String(Math.ceil(0 - width / 2));
      this.offsetX.max = String(Math.floor(width / 2));
      this.offsetX.setAttribute("value", "0");
      this.offsetX.value = "0";
      this.offsetX.disabled = false;
    }
    this.rotationY.disabled = false;
    this.rotationY.value = 0;
    this.rulerCheckbox.disabled = false;
    this.rulerCheckbox.checked = true;
    this.viewerElement.querySelector<Element>(".zoomin")?.classList.remove("disabled");
    this.viewerElement.querySelector<Element>(".zoomout")?.classList.remove("disabled");
    this.squareButton.dataset.height = String(height);
    this.squareButton.dataset.width = String(width);
    this.squareButton.classList.remove("disabled");
  }

  createJsonUploader(element: HTMLElement) {
    element.addEventListener("dragover", (event: Event) => {
      event.preventDefault();
      this.dragOnHandler();
    });
    element.addEventListener("dragenter", (event: Event) => {
      event.preventDefault();
      this.dragOnHandler();
    });
    element.addEventListener("dragleave", (event: Event) => {
      event.preventDefault();
      this.dragOffHandler();
    });
    element.addEventListener("dragend", (event: Event) => {
      event.preventDefault();
      this.dragOffHandler();
    });
    element.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
      this.dropHandler(event);
    });
  }

  setupInterface() {
    let listId = "";
    let initialUrls = "";
    if (this._initialUrls !== undefined && this._initialUrls.length != 0) {
      listId = "defaultURLs";
      const dataList = document.createElement("datalist");
      dataList.setAttribute("id", listId);
      this._initialUrls.forEach((optionEntry) => {
        const option = document.createElement("option");
        option.value = optionEntry.url;
        option.text = optionEntry.label;
        dataList.appendChild(option);
      });
      initialUrls = dataList.outerHTML;
    }

    let url = "",
      urlInput = "";
    if (this.url !== undefined) {
      url = this.url.toString();
    }

    if (this._urlInput) {
      urlInput = `<input class="url-input" type="url" value="${url}" name="url" id="collection-url" pattern="https://.*" list="${listId}" required />
          ${initialUrls}
          <button type="button" class="load-url-button">${i18next.t("cuttingTable:loadUrl")}</button>`;
    }

    this.container.innerHTML = `
      <div class="input-area">
        <div class="source-select">
          ${urlInput}
          <div class="select-container"></div>
          <div class="status-container"></div>
        </div>
        <div class="cutting-table">
          <div class="${CuttingTable.viewerElementClass}">
            <i class="controls button zoomin"></i><i class="controls button zoomout"></i>
            <i class="controls button square"></i>
          </div>
          <dual-range-slider min="0" max="1" value-min="0" value-max="1" class="control slider vertical cut-y"></dual-range-slider>
          <input type="range" min="1" max="100" value="50" class="control slider vertical offset offset-y" />
          <rotating-input step="90" display-degrees="false" radius="25" class="control rotation vertical rotation-y"></rotating-input>
          <dual-range-slider min="0" max="1" value-min="0" value-max="1" class="control slider horizontal cut-x"></dual-range-slider>
          <input type="range" min="1" max="100" value="50" class="control slider horizontal offset offset-x" />
          <rotating-input step="90" display-degrees="false" radius="25" class="control rotation horizontal rotation-x"></rotating-input>
          <input type="checkbox" class="control box rulers" checked />
        </div>
      </div>
      <div class="${CuttingTable.rendererElementClass} output-area">
      </div>
    `;
  }

  async setupControls() {
    //Cutter
    this.cutX = this.container.querySelector<DualRangeSlider>(CuttingTable.controlSelectors.cut.x)!;
    this.cutY = this.container.querySelector<DualRangeSlider>(CuttingTable.controlSelectors.cut.y)!;
    this.cutX?.addEventListener("input", (e: CustomEvent) => {
      if (e.detail !== undefined) {
        const min = Number(e.detail.min);
        const max = Number(e.detail.max);
        this.cuts.update(CutPosition.Left, min);
        this.cuts.update(CutPosition.Right, max);
      }
    });
    this.cutY?.addEventListener("input", (e: CustomEvent) => {
      if (e.detail !== undefined) {
        const min = Number(e.detail.min);
        const max = Number(e.detail.max);
        this.cuts.update(CutPosition.Top, min);
        this.cuts.update(CutPosition.Bottom, max);
      }
    });

    //Offsets
    this.offsetX = this.container.querySelector<HTMLInputElement>(CuttingTable.controlSelectors.offset.x)!;
    this.offsetY = this.container.querySelector<HTMLInputElement>(CuttingTable.controlSelectors.offset.y)!;
    this.offsetX?.addEventListener("input", (e: Event) => {
      const value = Number((e.target as HTMLInputElement).value);
      this.cuts.offsetX = value;
    });
    this.offsetY?.addEventListener("input", (e: Event) => {
      const value = Number((e.target as HTMLInputElement).value);
      this.cuts.offsetY = value;
    });

    //Rotations
    this.rotationX = this.container.querySelector<RotatingInput>(CuttingTable.controlSelectors.rotation.x)!;
    this.rotationY = this.container.querySelector<RotatingInput>(CuttingTable.controlSelectors.rotation.y)!;
    this.rotationX?.addEventListener("degreeChange", (event: CustomEvent<{ degree: number }>) => {
      this.cuts.rotateX = event.detail.degree;
    });
    this.rotationY?.addEventListener("degreeChange", (event: CustomEvent<{ degree: number }>) => {
      this.cuts.rotateY = event.detail.degree;
    });

    //Options
    this.rulerCheckbox = this.container.querySelector<HTMLInputElement>(CuttingTable.rulerElementSelector)!;
    this.rulerCheckbox.title = i18next.t("cuttingTable:toggleRuler");
    this.rulerCheckbox?.addEventListener("change", (e: Event) => {
      const value = Boolean((e.target as HTMLInputElement).checked);
      this.cuts.setVisibility(value);
    });

    //Buttons
    this.viewerElement.querySelector<Element>(".zoomin")?.classList.add("disabled");
    this.viewerElement.querySelector<Element>(".zoomout")?.classList.add("disabled");

    this.squareButton = this.viewerElement.querySelector<HTMLElement>(CuttingTable.squareButtonSelector)!;
    this.squareButton.addEventListener("click", () => {
      this.square();
    });
    this.squareButton.classList.add("disabled");

    //Upload
    this.dropZoneElement = this.container.querySelector<HTMLDivElement>(`.${CuttingTable.dropZoneElementClass}`)!;
    this.createJsonUploader(this.dropZoneElement);

    if (this.cuts === undefined) {
      this.cutX.disabled = true;
      this.cutY.disabled = true;
      this.offsetX.disabled = true;
      this.offsetY.disabled = true;
      this.rotationX.disabled = true;
      this.rotationY.disabled = true;
      this.rulerCheckbox.disabled = true;
    }
  }

  static patchOpenSeadragon() {
    OpenSeadragon.TiledImage.prototype._getRotationPoint = function (current: boolean): OpenSeadragon.Point {
      let bounds = this.getBoundsNoRotate(current);
      const worldWidth = current ? this._worldWidthCurrent : this._worldWidthTarget;
      const ratio = worldWidth / this.source.dimensions.x;
      if (this._rotationPoint !== undefined) {
        const point = this._rotationPoint.times(ratio);
        /*
        if (this.getRotation(current) !=0 && this.getRotation(current)!=180 && this.getRotation(current)!==undefined) {
          bounds = bounds.rotate(-this.getRotation(current), new OpenSeadragon.Point(bounds.x + point.x, bounds.y + point.y));
        }
        */
        return new OpenSeadragon.Point(bounds.x + point.x, bounds.y + point.y);
      }

      if (this._clip) {
        const clip = this._clip.times(ratio);
        bounds = new OpenSeadragon.Rect(bounds.x + clip.x, bounds.y + clip.y, clip.width, clip.height);
      }
      return bounds.getCenter();
    };

    OpenSeadragon.TiledImage.prototype.setRotationPoint = function (rotationPoint: OpenSeadragon.Point): void {
      this._rotationPoint = rotationPoint;
    };

    OpenSeadragon.TiledImage.prototype.getPosition = function (current?: boolean): OpenSeadragon.Point {
      const bounds = this.getBounds(current);
      return new OpenSeadragon.Point(bounds.x, bounds.y);
    };

    Object.defineProperty(OpenSeadragon.TiledImage.prototype, "clip", {
      get() {
        return this._clip;
      },
      set(clip: OpenSeadragon.Rect) {
        this._clip = clip;
      }
    });

    OpenSeadragon.TileSource.prototype.getTileAtPoint = function (level: number, point: OpenSeadragon.Point) {
      //const validPoint = point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 / this.aspectRatio;
      //console.assert(validPoint, "[TileSource.getTileAtPoint] must be called with a valid point.");

      const widthScaled = this.dimensions.x * this.getLevelScale(level);
      const pixelX = point.x * widthScaled;
      const pixelY = point.y * widthScaled;

      let x = Math.floor(pixelX / this.getTileWidth(level));
      let y = Math.floor(pixelY / this.getTileHeight(level));

      // When point.x == 1 or point.y == 1 / this.aspectRatio we want to
      // return the last tile of the row/column
      if (point.x >= 1) {
        x = this.getNumTiles(level).x - 1;
      }
      const EPSILON = 1e-15;
      if (point.y >= 1 / this.aspectRatio - EPSILON) {
        y = this.getNumTiles(level).y - 1;
      }

      return new OpenSeadragon.Point(x, y);
    };

    OpenSeadragon.Viewport.prototype._setContentBounds = function (bounds, contentFactor) {
      if (isNaN(bounds.x) || isNaN(bounds.y) || isNaN(bounds.width) || isNaN(bounds.width)) {
        return;
      }

      console.assert((bounds ?? null) !== null, "[Viewport._setContentBounds] bounds is required");
      console.assert(bounds instanceof OpenSeadragon.Rect, "[Viewport._setContentBounds] bounds must be an OpenSeadragon.Rect");
      console.assert(bounds.width > 0, "[Viewport._setContentBounds] bounds.width must be greater than 0");
      console.assert(bounds.height > 0, "[Viewport._setContentBounds] bounds.height must be greater than 0");

      this._contentBoundsNoRotate = bounds.clone();
      // @ts-ignore: See https://github.com/openseadragon/openseadragon/blob/master/src/viewport.js#L210
      this._contentSizeNoRotate = this._contentBoundsNoRotate.getSize().times(contentFactor);

      // @ts-ignore: See https://github.com/openseadragon/openseadragon/blob/master/src/viewport.js#L213
      this._contentBounds = bounds.rotate(this.getRotation()).getBoundingBox();
      // @ts-ignore: See https://github.com/openseadragon/openseadragon/blob/master/src/viewport.js#L214
      this._contentSize = this._contentBounds.getSize().times(contentFactor);
      this._contentAspectRatio = this._contentSize.x / this._contentSize.y;

      if (this.viewer) {
        /**
         * Raised when the viewer's content size or home bounds are reset
         * (see {@link OpenSeadragon.Viewport#resetContentSize}).
         *
         * @event reset-size
         * @memberof OpenSeadragon.Viewer
         * @type {object}
         * @property {OpenSeadragon.Viewer} eventSource - A reference to the Viewer which raised this event.
         * @property {OpenSeadragon.Point} contentSize
         * @property {OpenSeadragon.Rect} contentBounds - Content bounds.
         * @property {OpenSeadragon.Rect} homeBounds - Content bounds.
         * Deprecated use contentBounds instead.
         * @property {Number} contentFactor
         * @property {?Object} userData - Arbitrary subscriber-defined object.
         */
        this.viewer.raiseEvent("reset-size", {
          contentSize: this._contentSizeNoRotate.clone(),
          contentFactor: contentFactor,
          homeBounds: this._contentBoundsNoRotate.clone(),
          contentBounds: this._contentBounds.clone()
        });
      }
    };
  }
}
