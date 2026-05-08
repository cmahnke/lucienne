import { IIIF, Collection, Manifest, Canvas, Image } from "@allmaps/iiif-parser";
import { IconDropdownSelect } from "./components/IconDropdownSelect";
import { CuttingTable } from "./CuttingTable";
import type { IIIFSelect, IIIFEntry, IIIFImageEntry, IIIFType } from "./types";
import { loadInfoJson } from "./util/util";
import i18next from "i18next";

type ReturnJSON = { url: URL; json: object | undefined };

export class IIIFForm {
  static typeHierarchy: { [key in IIIFType]: string } = { Collection: "collection.json", Manifest: "manifest.json", Image: "info.json" };

  cuttingTable: CuttingTable;
  buttonClass: string = "load-url-button";
  button: HTMLButtonElement;
  inputFieldClass: string = "url-input";
  inputField: HTMLInputElement;
  selectContainer: HTMLDivElement;
  statusContainer: HTMLDivElement | null;

  current?: IIIFType;
  entries: { [key in IIIFType]?: IIIFSelect } = {};
  initial: { string: string };
  _imageAPIUrl: URL;
  _urlInput: boolean;
  _autoLoad: boolean = false;

  constructor(
    cuttingTable: CuttingTable,
    element: HTMLDivElement,
    statusContainer: HTMLDivElement | null,
    urlInput: boolean = true,
    autoLoad?: boolean
  ) {
    this.cuttingTable = cuttingTable;
    customElements.define("icon-dropdown-select", IconDropdownSelect);
    this.inputField = this.cuttingTable.container.querySelector<HTMLInputElement>(`.${this.inputFieldClass}`)!;
    if (element === undefined) {
      this.selectContainer = this.cuttingTable.container.querySelector<HTMLDivElement>(`.${CuttingTable.selectContainerClass}`)!;
    } else {
      this.selectContainer = element;
    }
    this._urlInput = urlInput;
    if (autoLoad !== undefined) {
      this._autoLoad = autoLoad;
    }
    //this.statusContainer = this.cuttingTable.container.querySelector<HTMLDivElement>(`.${CuttingTable.statusContainerClass}`)!;
    this.statusContainer = statusContainer;
    if (urlInput) {
      this.button = this.cuttingTable.container.querySelector<HTMLButtonElement>(`.${this.buttonClass}`)!;
      this.button.innerText = i18next.t("iiifForm:loadButton");
    }
    this.setup();
  }

  setup() {
    const loader: (url: string) => void = (url) => {
      try {
        this.loadUrl(new URL(url), undefined).then((options: IIIFSelect) => {
          this.createForm(options);
        });
      } catch (error) {
        this.displayMessage(i18next.t("iiifForm:errorURL"));
        console.error("Exception", error);
        return;
      }
    };

    if (this._urlInput) {
      const handleLoad = () => {
        if (this.inputField !== null) {
          const url = this.inputField?.value;

          if (url !== undefined && url !== "" && this.statusContainer !== null) {
            this.statusContainer.innerHTML = "";
            this.selectContainer.innerHTML = "";
            loader(url);
            /*
            this.loadUrl(new URL(url), undefined).then((options: IIIFSelect) => {
              this.createForm(options);
            });
            */
          }
        }
      };
      if (this.inputField !== null) {
        this.inputField.addEventListener("keyup", ({ key }) => {
          if (key === "Enter") {
            handleLoad();
          }
        });
      }
      this.button?.addEventListener("click", handleLoad);
      if (this._autoLoad) {
        this.button?.click();
      }
    } else if (this.cuttingTable.url !== undefined) {
      this.loadUrl(new URL(this.cuttingTable.url), undefined).then((options: IIIFSelect) => {
        this.createForm(options);
      });
    } else {
      throw new Error("Input is disabled but no default URL given!");
    }
  }

  set urlInput(url: URL) {
    if (this.inputField !== null) {
      this.inputField.value = url.toString();
    }
  }

  createForm(options: IIIFSelect) {
    // Might happen on timeouts etc
    if (options === undefined) {
      return;
    }
    if (options.type === "Image") {
      return;
    }
    if (options.type in this.entries) {
      this.entries[options.type] = this.addSelect(options);
      this.current = options.type;
    } else if (!Object.keys(this.entries).length) {
      this.entries[options.type] = this.addSelect(options);
      this.current = options.type;
    } else {
      throw new Error("This should't happen!");
    }
  }

  updateForm(url: URL, type?: IIIFType) {
    this.loadUrl(new URL(url), type).then((options: IIIFSelect) => {
      this.createForm(options);
    });
  }

  async safeLoadIIIF(url: URL, trySuffix: string = ""): Promise<ReturnJSON> {
    return fetch(url, { redirect: "follow" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return { url: url, json: res.json() };
      })
      .catch((error) => {
        console.warn(`Failed to load ${url}, it's safe to ignore CORS warnings, those are the results of checking for manifests.`);
        if (trySuffix !== "") {
          let u = url.toString();
          if (!u.endsWith("/")) {
            u = u + "/" + trySuffix;
          } else {
            u = u + trySuffix;
          }
          return this.safeLoadIIIF(new URL(u));
        } else {
          console.warn(`Network or CORS issue for ${url.toString()}:`, error);
        }
        return { url: url, json: undefined };
      });
  }

  displayMessage(msg: string) {
    if (this.statusContainer !== null) {
      this.statusContainer.innerHTML = msg;
    }
  }

  clearMessage() {
    if (this.statusContainer !== null) {
      this.statusContainer.innerHTML = "";
    }
  }

  async loadUrl(url: URL, type: IIIFType = "Image") {
    let trySuffix;
    if (type === undefined) {
      trySuffix = "";
    } else {
      trySuffix = IIIFForm.typeHierarchy[type];
    }
    let json, loadedUrl;

    try {
      const loaded = await this.safeLoadIIIF(url, trySuffix);
      json = await loaded.json;
      loadedUrl = loaded.url;
    } catch (error) {
      console.warn(error);
    }

    if (json === undefined || loadedUrl === undefined) {
      this.displayMessage(i18next.t("iiifForm:errorJson"));
      return;
    }
    const manifest = IIIF.parse(json);
    const lang = i18next.language.split("-")[0];

    if (manifest instanceof Collection) {
      const manifests: IIIFSelect = { type: "Collection", entries: [], source: url };

      manifest.items.forEach((m: Manifest) => {
        let label = "";
        if (m.label !== undefined) {
          if (lang in m.label) {
            label = m.label[lang].join(" ");
          } else {
            label = m.label[Object.keys(m.label)[0]].join(" ");
          }
        }
        const entry = { id: m.uri, label: label } as IIIFEntry;
        if ("thumbnail" in m && m.thumbnail !== undefined) {
          entry.thumbnail = new URL(m.thumbnail[0].id);
        }
        manifests.entries.push(entry);
      });
      this.current = "Collection";
      this.entries["Collection"] = manifests;
    } else if (manifest instanceof Manifest) {
      const pages: IIIFSelect = { type: "Manifest", entries: [], source: url };
      manifest.canvases.forEach((m: Canvas) => {
        let label = "";
        if (m.label !== undefined) {
          if (lang in m.label) {
            label = m.label[lang].join(" ");
          } else {
            label = m.label[Object.keys(m.label)[0]].join(" ");
          }
        }
        const entry = { id: m.image.uri, label: label } as IIIFImageEntry;
        if ("width" in m && "height" in m) {
          entry.height = m.height;
          entry.width = m.width;
        }
        if ("thumbnail" in m && m.thumbnail !== undefined) {
          entry.thumbnail = new URL(m.thumbnail[0].id);
        }
        pages.entries.push(entry);
      });
      this.current = "Manifest";
      this.entries["Manifest"] = pages;
    } else if (manifest instanceof Image) {
      const image: IIIFSelect = { type: "Image", entries: [], source: url };
      image.entries.push({ id: manifest.uri, label: "" });
      this.current = "Image";
      this.entries["Image"] = image;
      //this._imageAPIUrl = loadedUrl
      this.loadImageAPI(loadedUrl);
    }

    return this.entries[this.current!];
  }

  static createSelect(options: IIIFSelect, clz?: string, id?: string, element?: HTMLDivElement, label?: string): IIIFSelect {
    const includeThumb = true;
    const selectList = document.createElement("icon-dropdown-select");
    selectList.classList.add("select", options.type.toLowerCase());
    const selectName = "select-" + Math.random().toString(16).slice(5);
    const selectId = "select-" + options.type;
    const labelElement = document.createElement("label");

    if (label !== undefined) {
      if (element !== undefined) {
        const existing = element.querySelector<IconDropdownSelect>(`#${selectId}`);
        if (existing !== null) {
          existing.remove();
        }
      }

      labelElement.innerHTML = label;
      labelElement.htmlFor = selectId;
      if (selectList instanceof HTMLSelectElement) {
        selectList.name = selectName;
      }
      selectList.id = selectId;
      labelElement.id = selectId;
    }
    if (clz !== undefined && clz !== "") {
      selectList.classList.add(clz);
    }
    if (id !== undefined && clz !== "") {
      selectList.id = id;
    }

    options.entries.forEach((optionEntry) => {
      const option = document.createElement("option");
      option.value = optionEntry.id;
      if (includeThumb && optionEntry.thumbnail !== undefined) {
        const thumbnail = document.createElement("img");
        thumbnail.src = optionEntry.thumbnail.toString();
        option.innerHTML = thumbnail.outerHTML + optionEntry.label;
      } else {
        option.text = optionEntry.label;
      }
      selectList.appendChild(option);
    });

    if (options.type === "Image") {
      options.element = labelElement;
    } else {
      options.element = selectList as IconDropdownSelect;
    }
    if (labelElement !== undefined) {
      options.label = labelElement;
    }
    if (element !== undefined) {
      element.appendChild(selectList);
    }
    return options;
  }

  addSelect(options: IIIFSelect, autoLoadSingle: boolean = true): IIIFSelect {
    if (this.selectContainer !== null) {
      const label = i18next.t(`iiifForm:${options.type.toLowerCase()}Choose`);
      const id = "";
      options = IIIFForm.createSelect(options, id, `select-${options.type}`, this.selectContainer, label);
    }

    if (autoLoadSingle && options.entries.length == 1) {
      if ("element" in options && options.element !== undefined) {
        (options.element as HTMLSelectElement).disabled = true;
      }
      if (options.type === "Manifest" || options.type === "Image") {
        console.warn(`Autoloading ${options.entries[0].id}`);
        this.loadImageAPI(new URL(options.entries[0].id));
      }
    } else {
      options.element?.addEventListener("change", (event: CustomEvent) => {
        if (event.detail !== undefined) {
          const url = new URL(event.detail);
          const typeKeys = Object.keys(IIIFForm.typeHierarchy) as IIIFType[];
          let expectedType;
          if (options.type !== undefined) {
            const currentType = typeKeys.indexOf(options.type);
            expectedType = typeKeys[currentType + 1];
          }
          this.updateForm(url, expectedType);
        }
      });
    }

    return options;
  }

  async loadImageAPI(imageAPIEndpoint: URL) {
    let service;
    try {
      service = await loadInfoJson(imageAPIEndpoint);
    } catch {
      console.warn(`Failed to get ${imageAPIEndpoint}`);
    }
    this.cuttingTable.imageService = service;

    if (this._imageAPIUrl !== undefined && this._imageAPIUrl != imageAPIEndpoint) {
      this.cuttingTable.imageServiceUrl = this._imageAPIUrl;
    } else {
      this.cuttingTable.imageServiceUrl = imageAPIEndpoint;
    }

    return service;
  }
}
