import i18next from "i18next";

export class GridSizeSelector extends HTMLElement {
  static observedAttributes = ["width", "height", "maxrows", "maxcols", "disabled"];

  static initialMaxRows = 10;
  static initialMaxCols = 10;

  width = 10;
  height = 10;
  maxrows = GridSizeSelector.initialMaxRows;
  maxcols = GridSizeSelector.initialMaxCols;
  disabled = false;

  _width = this.width;
  _height = this.height;
  _isDragging = false;
  _dragStartWidth = 0;
  _dragStartHeight = 0;
  _isOpen = false;
  _gridSize = 200;
  _maxGridSize = 400;
  _disableSizeUpdate = false;

  widthInput: HTMLInputElement | null = null;
  heightInput: HTMLInputElement | null = null;
  gridContainer: HTMLElement | null = null;
  triggerButton: HTMLButtonElement | null = null;
  updateButton: HTMLButtonElement | null = null;

  constructor(maxCols?: number, maxRows?: number) {
    super();
    if (maxCols !== undefined) {
      this.maxcols = maxCols;
    }
    if (maxRows !== undefined) {
      this.maxrows = maxRows;
    }
    this.attachShadow({ mode: "open" });
    this.render();
  }

  connectedCallback() {
    this.initializeElements();
    this.addEventListeners();
    this.updateInputs();
  }

  disconnectedCallback() {
    this.removeEventListeners();
  }

  initializeElements() {
    if (!this.shadowRoot) return;
    this.widthInput = this.shadowRoot.querySelector("#widthInput");
    this.heightInput = this.shadowRoot.querySelector("#heightInput");
    this.gridContainer = this.shadowRoot.querySelector(".grid-container");
    this.triggerButton = this.shadowRoot.querySelector(".trigger-button");
    this.updateButton = this.shadowRoot.querySelector(".update-button");
  }

  addEventListeners() {
    const gridArea = this.shadowRoot?.querySelector<HTMLElement>(".grid-area");
    if (gridArea && !this.disabled) {
      gridArea.addEventListener("mousedown", this.handleMouseDown.bind(this));
      gridArea.addEventListener("mousemove", this.handleMouseMove.bind(this));
      gridArea.addEventListener("mouseup", this.handleMouseUp.bind(this));
      gridArea.addEventListener("mouseleave", this.handleMouseUp.bind(this));
    }

    if (this.widthInput && !this.disabled) {
      this.widthInput.addEventListener("change", this.handleInputChange.bind(this));
    }
    if (this.heightInput && !this.disabled) {
      this.heightInput.addEventListener("change", this.handleInputChange.bind(this));
    }

    if (this.updateButton && !this._disableSizeUpdate && !this.disabled) {
      this.updateButton.addEventListener("click", () => this.handleUpdateSize());
    }
    if (this.triggerButton && !this.disabled) {
      this.triggerButton.addEventListener("click", () => this.handleToggleGrid());
    }
  }

  removeEventListeners() {
    const gridArea = this.shadowRoot?.querySelector<HTMLElement>(".grid-area");
    if (gridArea) {
      gridArea.removeEventListener("mousedown", this.handleMouseDown.bind(this));
      gridArea.removeEventListener("mousemove", this.handleMouseMove.bind(this));
      gridArea.removeEventListener("mouseup", this.handleMouseUp.bind(this));
      gridArea.removeEventListener("mouseleave", this.handleMouseUp.bind(this));
    }

    if (this.widthInput) {
      this.widthInput.removeEventListener("change", this.handleInputChange.bind(this));
    }
    if (this.heightInput) {
      this.heightInput.removeEventListener("change", this.handleInputChange.bind(this));
    }

    if (this.updateButton) {
      this.updateButton.removeEventListener("click", () => this.handleUpdateSize());
    }
    if (this.triggerButton) {
      this.triggerButton.removeEventListener("click", () => this.handleToggleGrid());
    }
  }

  static get styles(): string {
    return `
      :host {
        --btn-bg-color: #66afff;
        --btn-disabled-bg-color: #cccccc;
        --btn-disabled-text-color: #666666;
        --btn-text-color: white;
        --btn-hover-bg-color: #007bff;
        --btn-hover-tansition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
        --btn-padding: 8px 16px;
        --btn-border-radius: 0.4rem;
        --btn-border: none;
        --btn-disabled-cursor: not-allowed;
        --btn-font-size: 1em;
        --btn-line-height: 1.2;
        --font-family: sans-serif;
        --gap: .8em;
        --disabled-opacity: .6;
        --input-border: 1px solid #ccc;
        --grid-width: 15em;
        --grid-height: 15em;
        --cell-background-color: #ddd;
        --cell-selected-background-color: #66afff;
        --cell-selected-border: 1px solid color-mix(in srgb, var(--cell-selected-background-color) 90%, black);
        --grid-box-shadow: 0 4px 8px rgba(0,0,0,0.2);

        display: block;
        font-family: var(--font-family);
        opacity: 1;
        transition: opacity 0.3s ease;

      }

      :host(.disabled) {
        opacity: var(--disabled-opacity);
        pointer-events: none;
      }

      .container {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--gap);
        font-family: var(--font-family);
        justify-content: flex-end;
      }

      :host(.disabled) .container {
        color: var(--btn-disabled-text-color);
        cursor: var(--btn-disabled-cursor);
      }

      .input-area {
        display: flex;
        gap: var(--gap);
        align-self: center;
      }

      .container label {
        vertical-align: middle;
        text-shadow: 0px 0px 15px white, 0px 0px 15px white, 0px 0px 15px white, 0px 0px 15px white, 0px 0px 15px white, 0px 0px 15px white, 0px 0px 15px white;
        align-self: center;
      }

      input[type="number"] {
        width: 80px;
        padding: 8px;
        border: var(--input-border);
        border-radius: var(--btn-border-radius);
        text-align: center;
        font-size: var(--btn-font-size);
      }

      button {
        padding: var(--btn-padding);
        background-color: var(--btn-bg-color);
        color: var(--btn-text-color);
        border: var(--btn-border);
        border-radius: var(--btn-border-radius);
        cursor: pointer;
        transition: var(--btn-hover-tansition);
        font-size: var(--btn-font-size);
        font-family: var(--font-family);
        line-height: var(--btn-line-height);
      }

      button:hover:not(:disabled) {
        background-color: var(--btn-hover-bg-color);
      }

      :host(.disabled) button,    
      button:disabled {
        background-color: var(--btn-disabled-bg-color);
        color: var(--btn-disabled-text-color);
        cursor: var(--btn-disabled-cursor);
      }

      .grid-container {
        position: relative;
        display: inline-block;
      }

      .trigger-button {
        background-color: var(--btn-bg-color);
        var(--btn-border);
        cursor: pointer;
      }

      .trigger-button:hover {
        background-color: #367c39;
      }

      @media (min-width: 720px) {
        .trigger-button {
          order: 1;
        }
        .width-label {
          order: 2;
        }
        .width-input {
          order: 3;
        }
        .height-label {
          order: 4;
        }
        .height-input {
          order: 5;
        }
        .update-button {
          order: 6;
        }
      }

      .grid-area {
        display: none;
        /*
        grid-template-columns: repeat(${GridSizeSelector.initialMaxCols}, auto);
        grid-template-rows: repeat(${GridSizeSelector.initialMaxRows}, auto);
        */
        width: var(--grid-width, 200px);
        height: var(--grid-height, 200px);
        border: 1px solid #aaa;
        cursor: pointer;
        background-color: #f0f0f0;
        user-select: none;
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 10;
        box-shadow: var(--grid-box-shadow);
        background-color: #ffffff;
        gap: 2px;
        padding: 2px;
        box-sizing: border-box;
      }

      .grid-cell {
        background-color: var(--cell-background-color);
        border: 1px solid transparent;
        box-sizing: border-box;
      }

      .selected-cell {
        background-color: var(--cell-selected-background-color);
        border: var(--cell-selected-border);
      }
    `;
  }

  render() {
    this.shadowRoot!.innerHTML = `
        <style>${GridSizeSelector.styles}</style>
        <div class="container">
          <label class="width-label" for="widthInput">${i18next.t("generic:columns")}:</label>
          <input
            class="width-input"
            id="widthInput"
            type="number"
            min="1"
            max="${this.maxcols}"
            value="${this._width}"
            ${this.disabled ? "disabled" : ""}
          />
          <label class="height-label" for="heightInput">${i18next.t("generic:rows")}:</label>
          <input
            class="height-input"
            id="heightInput"
            type="number"
            min="1"
            max="${this.maxrows}"
            value="${this._height}"
            ${this.disabled ? "disabled" : ""}
          />
          <button class="update-button" ${
            this._disableSizeUpdate || this.disabled ? "disabled" : ""
          }>${i18next.t("gridSizeSelector:updateSize")}</button>
          <button class="trigger-button" ${this.disabled ? "disabled" : ""}>${i18next.t("gridSizeSelector:selectSize")}</button>
        </div>
        <div class="grid-container">
          <div class="grid-area">
            ${this._renderGrid()}
          </div>
        </div>
      </div>
      `;
    this.initializeElements();
    this.addEventListeners();
    this.classList.toggle("disabled", this.disabled);
  }

  _renderGrid(): string {
    let cellsHtml = "";
    // Use the component's maxrows and maxcols properties
    for (let i = 0; i < this.maxrows; i++) {
      for (let j = 0; j < this.maxcols; j++) {
        const isSelected = i < this._height && j < this._width;
        cellsHtml += `
          <div
            class="grid-cell ${isSelected ? "selected-cell" : ""}"
            data-row="${i}"
            data-col="${j}"
          ></div>
        `;
      }
    }
    return cellsHtml;
  }

  handleMouseDown(event: MouseEvent) {
    if (this.disabled) return;
    const gridArea = this.shadowRoot?.querySelector<HTMLElement>(".grid-area");
    if (!gridArea) return;

    const cell = (event.target as HTMLElement).closest(".grid-cell");
    if (!cell) return;

    this._isDragging = true;
    this._dragStartWidth = parseInt(cell.getAttribute("data-col") || "0") + 1;
    this._dragStartHeight = parseInt(cell.getAttribute("data-row") || "0") + 1;
    this._width = this._dragStartWidth;
    this._height = this._dragStartHeight;

    this.updateInputs();
    this.updateGrid();
  }

  handleMouseMove(event: MouseEvent) {
    if (this.disabled) return;
    if (!this._isDragging) return;
    const gridArea = this.shadowRoot?.querySelector<HTMLElement>(".grid-area");
    if (!gridArea) return;

    const cell = (event.target as HTMLElement).closest(".grid-cell");
    if (!cell) return;

    const currentWidth = parseInt(cell.getAttribute("data-col") || "0") + 1;
    const currentHeight = parseInt(cell.getAttribute("data-row") || "0") + 1;

    this._width = Math.max(currentWidth, this._dragStartWidth);
    this._height = Math.max(currentHeight, this._dragStartHeight);
    this.updateInputs();
    this.updateGrid();
  }

  handleMouseUp() {
    if (this.disabled) return;
    this._isDragging = false;
    this._dragStartWidth = 0;
    this._dragStartHeight = 0;
  }

  handleInputChange(event: Event) {
    if (this.disabled) return;
    const input = event.target as HTMLInputElement;
    if (input.id === "widthInput") {
      this._width = parseInt(input.value);
    } else if (input.id === "heightInput") {
      this._height = parseInt(input.value);
    }
    this.updateGrid();
  }

  handleUpdateSize() {
    if (this.disabled) return;
    this.width = this._width;
    this.height = this._height;
    this._isOpen = false;
    this.updateGrid();
    this._fireChange();
  }

  _fireChange() {
    this.dispatchEvent(
      new CustomEvent("size-changed", {
        detail: { width: this.width, height: this.height }
      })
    );
  }

  handleToggleGrid() {
    if (this.disabled) return;
    this._isOpen = !this._isOpen;
    this.updateGrid();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "width") {
      this.width = parseInt(newValue);
      this._width = this.width;
    } else if (name === "height") {
      this.height = parseInt(newValue);
      this._height = this.height;
    } else if (name === "maxrows") {
      this.maxrows = parseInt(newValue);
      this._disableSizeUpdate = true;
    } else if (name === "maxcols") {
      this.maxcols = parseInt(newValue);
      this._disableSizeUpdate = true;
    } else if (name === "disabled") {
      this.disabled = newValue === "true";
      this.updateInputs();
      this.updateUpdateButtonState();
      this.classList.toggle("disabled", this.disabled);
    }
    this.updateGrid();
  }

  updateGrid() {
    const gridArea = this.shadowRoot?.querySelector<HTMLElement>(".grid-area");
    if (!gridArea) return;

    gridArea.style.display = this._isOpen ? "grid" : "none";

    gridArea.style.gridTemplateColumns = `repeat(${this.maxcols}, auto)`;
    gridArea.style.gridTemplateRows = `repeat(${this.maxrows}, auto)`;

    gridArea.innerHTML = this._renderGrid();
  }

  updateInputs() {
    if (this.widthInput) {
      this.widthInput.value = String(this._width);
      this.widthInput.max = String(this.maxcols);
      this.widthInput.disabled = this.disabled;
    }
    if (this.heightInput) {
      this.heightInput.value = String(this._height);
      this.heightInput.max = String(this.maxrows);
      this.heightInput.disabled = this.disabled;
    }
  }
  updateUpdateButtonState() {
    if (this.updateButton) {
      this.updateButton.disabled = this._disableSizeUpdate || this.disabled;
    }
  }
}
