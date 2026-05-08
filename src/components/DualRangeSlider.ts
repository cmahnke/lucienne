export class DualRangeSlider extends HTMLElement {
  private shadow: ShadowRoot;
  private sliderMin: HTMLInputElement | null = null;
  private sliderMax: HTMLInputElement | null = null;
  private rangeFill: HTMLElement | null = null;
  private trackContainer: HTMLElement | null = null;

  private _min = 0;
  private _max = 100;
  private _step = 1;
  private _valueMin = 25;
  private _valueMax = 75;
  private _disabled = false;

  static get observedAttributes() {
    return ["min", "max", "step", "value-min", "value-max", "disabled"];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.setupDOM();
    this.applyStyling();
  }

  connectedCallback() {
    this.initializeSliders();
    this.addEventListeners();
    this.updateVisuals();
  }

  disconnectedCallback() {
    this.removeEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    let needsReinit = false;

    switch (name) {
      case "min":
      case "max":
      case "step":
        if (name === "min") this.min = parseFloat(newValue ?? "0");
        if (name === "max") this.max = parseFloat(newValue ?? "100");
        if (name === "step") this.step = parseFloat(newValue ?? "1");
        needsReinit = true;
        break;
      case "value-min":
        this.valueMin = parseFloat(newValue ?? String(this._min));
        break;
      case "value-max":
        this.valueMax = parseFloat(newValue ?? String(this._max));
        break;
      case "disabled":
        this.disabled = newValue !== null && newValue !== "false";
        break;
    }

    if (needsReinit && this.isConnected) {
      this.initializeSliders();
      this.updateVisuals();
    }
  }

  // --- Getters and Setters (Validation Logic Centralized Here) ---
  get min(): number {
    return this._min;
  }
  set min(value: number) {
    const newMin = isNaN(value) ? 0 : value;
    if (this._min !== newMin) {
      this._min = newMin;
    }
  }

  get max(): number {
    return this._max;
  }
  set max(value: number) {
    const newMax = isNaN(value) ? 100 : value;
    if (this._max !== newMax) {
      this._max = newMax;
    }
  }

  get step(): number {
    return this._step;
  }
  set step(value: number) {
    const newStep = isNaN(value) || value <= 0 ? 1 : value;
    if (this._step !== newStep) {
      this._step = newStep;
    }
  }

  get valueMin(): number {
    return this._valueMin;
  }
  set valueMin(value: number) {
    if (isNaN(value)) return;

    let newValue = Math.min(Math.max(value, this._min), this._max);

    newValue = Math.min(newValue, this._valueMax);

    if (this._valueMin !== newValue) {
      this._valueMin = newValue;

      if (this.isConnected) {
        if (this.sliderMin) this.sliderMin.value = String(newValue);
        this.updateAttribute("value-min", String(newValue));
        this.updateVisuals();
        this.dispatchChangeEvent();
        this.dispatchInputEvent();
      }
    } else if (this.isConnected && this.sliderMin && parseFloat(this.sliderMin.value) !== newValue) {
      this.sliderMin.value = String(newValue);
    }
  }

  get valueMax(): number {
    return this._valueMax;
  }
  set valueMax(value: number) {
    if (isNaN(value)) return;
    let newValue = Math.min(Math.max(value, this._min), this._max);
    newValue = Math.max(newValue, this._valueMin);

    if (this._valueMax !== newValue) {
      this._valueMax = newValue;

      if (this.isConnected) {
        if (this.sliderMax) this.sliderMax.value = String(newValue);
        this.updateAttribute("value-max", String(newValue));
        this.updateVisuals();
        this.dispatchChangeEvent();
        this.dispatchInputEvent();
      }
    } else if (this.isConnected && this.sliderMax && parseFloat(this.sliderMax.value) !== newValue) {
      this.sliderMax.value = String(newValue);
    }
  }

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    const newValue = !!value;
    if (this._disabled !== newValue) {
      this._disabled = newValue;
      this.applyStyling();
      this.updateDisabledState();
      this.updateAttribute("disabled", String(newValue));
    }
  }

  // --- Private Methods ---

  private setupDOM() {
    this.shadow.innerHTML = `
      <div class="wrapper">
        <div class="track-container">
          <div id="range-fill"></div>
          <input type="range" id="slider-min" aria-label="Minimum Value"/>
          <input type="range" id="slider-max" aria-label="Maximum Value"/>
        </div>
      </div>
    `;
    this.sliderMin = this.shadow.getElementById("slider-min") as HTMLInputElement;
    this.sliderMax = this.shadow.getElementById("slider-max") as HTMLInputElement;
    this.rangeFill = this.shadow.getElementById("range-fill");
    this.trackContainer = this.shadow.querySelector(".track-container");

    if (!this.sliderMin || !this.sliderMax || !this.rangeFill || !this.trackContainer) {
      console.error("DualRangeSlider: Failed to find essential elements in Shadow DOM!");
    }
  }

  private applyStyling() {
    const style = document.createElement("style");
    style.textContent = `
        :host {
          display: inline-block;
          width: 300px;
          height: auto;
          padding: 5px 0;
          --track-height: 6px;
          --thumb-size: 16px;
          --fill-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-fill-color)"};
          --control-track-color: #ddd;
          --thumb-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-thumb-color)"};
          --thumb-hover-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-thumb-hover-color)"};
          --thumb-active-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-thumb-active-color)"};
          --disabled-opacity: .6;
        }

        :host(.disabled) {
          opacity: var(--disabled-opacity);
          pointer-events: none;
        }

        .wrapper {
          position: relative;
        }
        .track-container {
          position: relative;
          width: ${this.isVertical() ? "var(--thumb-size)" : "100%"};
          height: ${this.isVertical() ? "100%" : "var(--thumb-size)"};
          display: flex;
          align-items: center;
          ${this.isVertical() ? "flex-direction: column;" : ""};
        }
        .track-container::before {
          content: '';
          position: absolute;
          left: ${this.isVertical() ? "50%" : "0"};
          right: ${this.isVertical() ? "auto" : "0"};
          top: ${this.isVertical() ? "0" : "50%"};
          bottom: ${this.isVertical() ? "auto" : "0"};
          transform: ${this.isVertical() ? "translateX(-50%)" : "translateY(-50%)"};
          width: ${this.isVertical() ? "var(--track-height)" : "100%"};
          height: ${this.isVertical() ? "100%" : "var(--track-height)"};
          background-color: var(--control-track-color);
          border-radius: calc(var(--track-height) / 2);
          z-index: 1;
          pointer-events: none;
        }
        #range-fill {
          position: absolute;
          width: ${this.isVertical() ? "var(--track-height)" : "100%"};
          height: ${this.isVertical() ? "100%" : "var(--track-height)"};
          background-color: var(--fill-color);
          border-radius: calc(var(--track-height) / 2);
          left: ${this.isVertical() ? "50%" : "0"};
          right: ${this.isVertical() ? "auto" : "0"};
          top: ${this.isVertical() ? "0" : "50%"};
          bottom: ${this.isVertical() ? "auto" : "0"};
          transform: ${this.isVertical() ? "translateX(-50%)" : "translateY(-50%)"};
          z-index: 2;
          pointer-events: none;
        }
        input[type="range"] {
          position: absolute;
          top: 0;
          left: 0;
          width: ${this.isVertical() ? "var(--thumb-size)" : "100%"};
          height: ${this.isVertical() ? "100%" : "var(--thumb-size)"};
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          margin: 0;
          padding: 0;
          cursor: ${this._disabled ? "default" : "pointer"};
          z-index: 3;
          pointer-events: none;
          ${this.isVertical() ? "writing-mode: vertical-rl;" : ""};
          ${this.isVertical() && this.getDirection() === "rtl" ? "transform: rotate(180deg);" : ""};
        }
        input[type="range"]::-webkit-slider-thumb { pointer-events: ${this._disabled ? "none" : "auto"}; }
        input[type="range"]::-moz-range-thumb { pointer-events: ${this._disabled ? "none" : "auto"}; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: var(--thumb-size);
          height: var(--thumb-size);
          background-color: var(--thumb-color);
          border-radius: 50%;
          border: none;
          cursor: ${this._disabled ? "default" : "pointer"};
          margin-top: ${this.isVertical() ? "0" : "calc((var(--thumb-size) - var(--track-height)) / -2 )"};
          margin-left: ${this.isVertical() ? "calc((var(--thumb-size) - var(--track-height)) / -2 )" : "0"};
          position: relative;
          z-index: 4;
        }
        input[type="range"]:hover::-webkit-slider-thumb { background-color: var(--thumb-hover-color); }
        input[type="range"]:active::-webkit-slider-thumb { background-color: var(--thumb-active-color); }
        input[type="range"]::-moz-range-thumb {
          width: var(--thumb-size);
          height: var(--thumb-size);
          background-color: var(--thumb-color);
          border-radius: 50%;
          border: none;
          cursor: ${this._disabled ? "default" : "pointer"};
          position: relative;
          z-index: 4;
        }
        input[type="range"]:hover::-moz-range-thumb { background-color: var(--thumb-hover-color); }
        input[type="range"]:active::-moz-range-thumb { background-color: var(--thumb-active-color); }
        input[type="range"]::-moz-range-track { background: transparent; border: none; }
      `;
    style.textContent += this.isVertical() ? "" : "";
    this.shadow.appendChild(style);
  }

  private initializeSliders() {
    if (!this.sliderMin || !this.sliderMax) {
      console.error("Cannot initialize sliders, elements not found.");
      return;
    }

    this._min = isNaN(this._min) ? 0 : this._min;
    this._max = isNaN(this._max) ? 100 : this._max;
    this._step = isNaN(this._step) || this._step <= 0 ? 1 : this._step;

    if (this._min > this._max) {
      console.warn(`Initial min (${this._min}) > max (${this._max}). Swapping them.`);
      [this._min, this._max] = [this._max, this._min]; // Swap them
    }

    this.sliderMin.min = String(this._min);
    this.sliderMin.max = String(this._max);
    this.sliderMin.step = String(this._step);

    this.sliderMax.min = String(this._min);
    this.sliderMax.max = String(this._max);
    this.sliderMax.step = String(this._step);

    const attrValueMin = this.getAttribute("value-min");
    const attrValueMax = this.getAttribute("value-max");

    let initialMin = attrValueMin !== null ? parseFloat(attrValueMin) : this._valueMin;
    let initialMax = attrValueMax !== null ? parseFloat(attrValueMax) : this._valueMax;

    initialMin = isNaN(initialMin) ? this._min : initialMin;
    initialMax = isNaN(initialMax) ? this._max : initialMax;

    this._valueMin = initialMin;
    this._valueMax = initialMax;
    this.valueMin = initialMin;
    this.valueMax = initialMax;

    this.sliderMin.value = String(this._valueMin);
    this.sliderMax.value = String(this._valueMax);

    this.updateAttribute("value-min", String(this._valueMin));
    this.updateAttribute("value-max", String(this._valueMax));
    this.updateDisabledState();
  }

  private addEventListeners() {
    if (!this.sliderMin || !this.sliderMax) return;
    this.sliderMin.addEventListener("input", this.handleMinInput);
    this.sliderMax.addEventListener("input", this.handleMaxInput);
  }

  private removeEventListeners() {
    if (!this.sliderMin || !this.sliderMax) return;
    this.sliderMin.removeEventListener("input", this.handleMinInput);
    this.sliderMax.removeEventListener("input", this.handleMaxInput);
  }

  private handleMinInput = (event: Event) => {
    if (this._disabled) return;
    const target = event.target as HTMLInputElement;
    this.valueMin = parseFloat(target.value);
    this.dispatchInputEvent();
  };

  private handleMaxInput = (event: Event) => {
    if (this._disabled) return;
    const target = event.target as HTMLInputElement;
    this.valueMax = parseFloat(target.value);
    this.dispatchInputEvent();
  };

  private updateVisuals() {
    if (this.rangeFill && this.trackContainer) {
      const range = this._max - this._min;
      if (range <= 0) {
        if (this.isVertical()) {
          this.rangeFill.style.top = "0%";
          this.rangeFill.style.height = "0%";
          this.rangeFill.style.width = "var(--track-height)";
          this.rangeFill.style.left = "50%";
          this.rangeFill.style.transform = "translateX(-50%)";
        } else {
          this.rangeFill.style.left = "0%";
          this.rangeFill.style.width = "0%";
          this.rangeFill.style.height = "var(--track-height)";
          this.rangeFill.style.top = "50%";
          this.rangeFill.style.transform = "translateY(-50%)";
        }
        return;
      }
      const minPercent = ((this._valueMin - this._min) / range) * 100;
      const maxPercent = ((this._valueMax - this._min) / range) * 100;
      if (this.isVertical()) {
        this.rangeFill.style.top = `${Math.max(0, minPercent)}%`;
        this.rangeFill.style.height = `${Math.min(100, Math.max(0, maxPercent - minPercent))}%`;
        this.rangeFill.style.width = "var(--track-height)";
        this.rangeFill.style.left = "50%";
        this.rangeFill.style.transform = "translateX(-50%)";
      } else {
        this.rangeFill.style.left = `${Math.max(0, minPercent)}%`;
        this.rangeFill.style.width = `${Math.min(100, Math.max(0, maxPercent - minPercent))}%`;
        this.rangeFill.style.height = "var(--track-height)";
        this.rangeFill.style.top = "50%";
        this.rangeFill.style.transform = "translateY(-50%)";
      }
      if (this.sliderMin && this.sliderMax) {
        this.sliderMin.style.zIndex = "3";
        this.sliderMax.style.zIndex = "4";
      }
    }
  }

  private dispatchChangeEvent() {
    const event = new CustomEvent("change", {
      detail: {
        min: this._valueMin,
        max: this._valueMax
      },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  private dispatchInputEvent() {
    const event = new CustomEvent("input", {
      detail: {
        min: this._valueMin,
        max: this._valueMax
      },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  private updateAttribute(attrName: string, value: string) {
    if (this.getAttribute(attrName) !== value) {
      this.setAttribute(attrName, value);
    }
  }

  private isVertical(): boolean {
    const computedStyle = window.getComputedStyle(this);
    return computedStyle.writingMode === "vertical-rl" || computedStyle.writingMode === "vertical-lr";
  }

  private getDirection(): string {
    const computedStyle = window.getComputedStyle(this);
    return computedStyle.direction;
  }

  private updateDisabledState(): void {
    if (this.sliderMin) this.sliderMin.disabled = this._disabled;
    if (this.sliderMax) this.sliderMax.disabled = this._disabled;
  }
}
