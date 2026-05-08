import i18next from "i18next";

export class ImageResolutionSelect extends HTMLElement {
  private shadow: ShadowRoot;
  private displayElement: HTMLElement;
  private optionsContainer: HTMLElement;
  private options: { value: string; label: string }[] = [
    { value: "custom", label: i18next.t("imageResolutionSelect:custom") },
    { value: "1920x1080", label: "1080p (Full HD) (1920x1080)" },
    { value: "1280x720", label: "720p (HD) (1280x720)" },
    { value: "800x600", label: "SVGA (800x600)" },
    { value: "640x480", label: "VGA (640x480)" },
    { value: "1080x1080", label: "Instagram Post (1080x1080)" },
    { value: "1080x1920", label: "Instagram Story (1080x1920)" },
    { value: "1200x630", label: "Facebook Post (1200x630)" },
    { value: "1280x720", label: "YouTube Thumbnail (1280x720)" }
  ];
  private _disabled = false;
  private _value: string | null = null;
  private _selectedIndex = -1;
  private _customWidth: number = 0;
  private _customHeight: number = 0;
  private customInputs: HTMLDivElement | null = null;
  private confirmButton: HTMLButtonElement | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("display");
    this.optionsContainer = document.createElement("div");
    this.optionsContainer.classList.add("options-container");
    this.setupDOM();
    this.applyStyles();
    this.setupEventListeners();
    this.mergeOptions();
  }

  private mergeOptions() {
    const childOptions: { value: string; label: string }[] = Array.from(this.children)
      .filter((child) => child.tagName.toLowerCase() === "option")
      .map((child) => ({
        value: child.getAttribute("value") || "",
        label: child.textContent || ""
      }));

    const allOptions = [...this.options, ...childOptions];

    const uniqueOptions: { value: string; label: string }[] = [];
    const seenValues = new Set<string>();

    for (const option of allOptions) {
      if (!seenValues.has(option.value)) {
        uniqueOptions.push(option);
        seenValues.add(option.value);
      }
    }

    // Custom option always first
    const customOption = uniqueOptions.shift();

    // Sort by size (largest first)
    uniqueOptions.sort((a, b) => {
      const [widthA, heightA] = (a.value.match(/\d+x\d+/) ? a.value : "0x0").split("x").map(Number);
      const [widthB, heightB] = (b.value.match(/\d+x\d+/) ? b.value : "0x0").split("x").map(Number);
      return widthB * heightB - widthA * heightA;
    });

    // Add resolution in brackets to labels
    uniqueOptions.forEach((option) => {
      if (option.value.match(/\d+x\d+/)) {
        if (!option.label.includes(option.value)) {
          option.label += ` (${option.value})`;
        }
      }
    });

    if (customOption) {
      this.options = [customOption, ...uniqueOptions];
    } else {
      this.options = uniqueOptions;
    }
  }

  connectedCallback() {
    this.populateOptions();
    this.showCustomInputs();
    if (this.confirmButton) {
      this.enableConfirmButton();
    }
  }

  static get observedAttributes() {
    return ["disabled", "value", "custom-width", "custom-height", "confirm-button"];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;
    if (name === "disabled") {
      this.disabled = newValue !== null;
    } else if (name === "value") {
      this.value = newValue;
    } else if (name === "custom-width") {
      this._customWidth = newValue ? parseInt(newValue) || 0 : 0;
      this.updateCustomInputs();
    } else if (name === "custom-height") {
      this._customHeight = newValue ? parseInt(newValue) || 0 : 0;
      this.updateCustomInputs();
    }
  }

  get customWidth(): number {
    return this._customWidth;
  }

  set customWidth(value: number) {
    this._customWidth = value;
    this.updateCustomInputs();
  }

  get customHeight(): number {
    return this._customHeight;
  }

  set customHeight(value: number) {
    this._customHeight = value;
    this.updateCustomInputs();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    this._disabled = value;
    this.updateDisabledState();
  }

  get value(): string | null {
    return this._value;
  }

  set value(newValue: string | null) {
    if (this._value !== newValue) {
      this._value = newValue;
      this.updateDisplay();
    }
  }

  get optionsData(): { value: string; label: string }[] {
    return this.options;
  }

  set optionsData(newOptions: { value: string; label: string }[]) {
    this.options = [{ value: "custom", label: "Custom" }, ...newOptions];
    this.populateOptions();
  }

  private setupDOM() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("wrapper");
    wrapper.appendChild(this.displayElement);
    wrapper.appendChild(this.optionsContainer);
    this.shadow.appendChild(wrapper);
  }

  private applyStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block;
        --btn-bg-color: #66afff;
        --btn-font-size: 1em;
        --font-family: sans-serif;
        --disabled-opacity: .6;
        --btn-disabled-bg-color: #cccccc;
        --btn-disabled-text-color: #666666;
        --btn-disabled-cursor: not-allowed;
        --btn-hover-bg-color: #007bff;
        --btn-hover-tansition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
        --btn-border-radius: 0.4rem;
        --btn-border: none;
        --btn-padding: 8px 16px;
        --disabled-opacity: .6;
      }

      :host(.disabled) {
        opacity: var(--disabled-opacity);
        pointer-events: none;
      }

      .wrapper {
        position: relative;
        display: inline-block;
        min-width: 14em;
        font-size: var(--btn-font-size);
        font-family: var(--font-family);
      }

      .display {
        border: var(--btn-border);
        padding: var(--btn-padding);
        background-color: var(--btn-bg-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        width: 100%;
        border-radius: var(--btn-border-radius);
        color: var(--btn-text-color);
      }

      .display.disabled {
        background-color: var(--btn-disabled-bg-color);
        color: var(--btn-disabled-text-color);
        opacity: var(--disabled-opacity);
        pointer-events: none;
        cursor: var(--btn-disabled-cursor);
      }

      .options-container {
        position: absolute;
        top: 100%;
        left: 0;
        display: none;
        border: 1px solid #ccc;
        background-color: white;
        z-index: 10;
        border-radius: var(--btn-border-radius);
      }

      .options-container.open {
        display: block;
      }

      .option {
        padding: 8px;
        display: flex;
        align-items: center;
        cursor: pointer;
        white-space: nowrap;
      }

      .option.selected {
        background-color: #f0f0f0;
      }

      .custom-inputs {
        display: flex;
        align-items: center;
      }

      .custom-inputs input {
        width: 60px;
        margin: 0 4px;
      }

      .custom-inputs button {
        margin-left: 4px;
        transition: var(--btn-hover-tansition);
        border-radius: var(--btn-border-radius);
        background-color: var(--btn-bg-color);
        font-size: var(--btn-font-size);
        color: var(--btn-text-color);
        var(--btn-border);
        padding: var(--btn-padding);
        font-family: var(--font-family)
      }

      .custom-inputs button:hover:not(:disabled) {
        background-color: var(--btn-hover-bg-color);
      }

      .custom-inputs button:disabled {
        background-color: var(--btn-disabled-bg-color);
        color: var(--btn-disabled-text-color);
        cursor: var(--btn-disabled-cursor);
      }
    `;
    this.shadow.appendChild(style);
  }

  private setupEventListeners() {
    this.displayElement.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.disabled) {
        this.optionsContainer.classList.toggle("open");
        if (this.optionsContainer.classList.contains("open")) {
          this._selectedIndex = -1;
        }
      }
    });

    document.addEventListener("click", (event) => {
      if (!this.shadow.contains(event.target as Node) && this.optionsContainer.classList.contains("open")) {
        this.optionsContainer.classList.remove("open");
      }
    });

    this.displayElement.addEventListener("keydown", (event) => {
      if (this.disabled) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.navigateOptions(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.navigateOptions(-1);
      } else if (event.key === "Enter" && this._selectedIndex !== -1) {
        event.preventDefault();
        this.selectOption(this._selectedIndex);
      } else if (event.key === "Escape") {
        this.optionsContainer.classList.remove("open");
      }
    });

    this.displayElement.setAttribute("tabindex", "0");
  }

  private navigateOptions(direction: number) {
    if (!this.optionsContainer.classList.contains("open")) {
      this.optionsContainer.classList.add("open");
    }
    this._selectedIndex += direction;
    if (this._selectedIndex < 0) {
      this._selectedIndex = this.options.length - 1;
    } else if (this._selectedIndex >= this.options.length) {
      this._selectedIndex = 0;
    }
    this.updateOptionSelection();
  }

  private selectOption(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.value = this.options[index].value;
      this.optionsContainer.classList.remove("open");

      let detailValue: number[] | string = this.options[index].value;

      if (this.options[index].value !== "custom") {
        const [width, height] = this.options[index].value.split("x").map(Number);
        if (!isNaN(width) && !isNaN(height)) {
          this._customWidth = width;
          this._customHeight = height;
          this.updateCustomInputs();
          detailValue = [width, height];
        }
      } else {
        detailValue = [this._customWidth, this._customHeight];
      }

      this.dispatchEvent(new CustomEvent("change", { detail: detailValue }));
    }
  }

  private updateOptionSelection() {
    Array.from(this.optionsContainer.children).forEach((option, index) => {
      if (index === this._selectedIndex) {
        option.classList.add("selected");
        option.scrollIntoView({ block: "nearest" });
      } else {
        option.classList.remove("selected");
      }
    });
  }

  private populateOptions() {
    this.optionsContainer.innerHTML = "";
    this.options.forEach((option, index) => {
      const optionElement = document.createElement("div");
      optionElement.classList.add("option");
      optionElement.dataset.value = option.value;
      optionElement.textContent = option.label;
      optionElement.addEventListener("click", () => {
        this.selectOption(index);
      });
      this.optionsContainer.appendChild(optionElement);
    });

    this.updateDisplay();
    this.updateDisabledState();
  }

  private updateDisplay() {
    const selectedOption = this.options.find((option) => option.value === this.value);
    if (selectedOption) {
      this.displayElement.textContent = selectedOption.label;
    } else {
      this.displayElement.textContent = this.options[0].label;
    }
  }

  private updateDisabledState() {
    if (this.disabled) {
      this.displayElement.classList.add("disabled");
      this.displayElement.setAttribute("tabindex", "-1");
    } else {
      this.displayElement.classList.remove("disabled");
      this.displayElement.setAttribute("tabindex", "0");
    }
  }

  private showCustomInputs() {
    if (!this.customInputs) {
      this.customInputs = document.createElement("div");
      this.customInputs.classList.add("custom-inputs");

      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.value = this._customWidth.toString();
      widthInput.addEventListener("change", (e) => {
        this._customWidth = parseInt((e.target as HTMLInputElement).value) || 0;
        this.updateCustomValue();
        this.enableConfirmButton();
      });
      widthInput.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      const heightInput = document.createElement("input");
      heightInput.type = "number";
      heightInput.value = this._customHeight.toString();
      heightInput.addEventListener("change", (e) => {
        this._customHeight = parseInt((e.target as HTMLInputElement).value) || 0;
        this.updateCustomValue();
        this.enableConfirmButton();
      });
      heightInput.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      const x = document.createTextNode("x");

      this.customInputs.appendChild(widthInput);
      this.customInputs.appendChild(x);
      this.customInputs.appendChild(heightInput);

      if (this.hasAttribute("confirm-button")) {
        this.confirmButton = document.createElement("button");
        this.confirmButton.textContent = i18next.t("imageResolutionSelect:confirmButton");
        this.confirmButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.confirmCustomSelection();
        });
        this.confirmButton.disabled = true;
        this.confirmButton.style.display = "none";
        this.customInputs.appendChild(this.confirmButton);
      }

      const customOption = Array.from(this.optionsContainer.children).find((option: HTMLElement) => {
        return option.dataset.value === "custom";
      });
      if (customOption) {
        const initialLabel = this.getCustomOption().label;
        customOption.innerHTML = "";
        customOption.appendChild(document.createTextNode(`${initialLabel} (`));
        customOption.appendChild(this.customInputs);
        customOption.appendChild(document.createTextNode(")"));
      }
    }

    this.customInputs.style.display = "flex";
  }

  private updateCustomInputs() {
    if (this.customInputs) {
      const widthInput = this.customInputs.querySelector("input[type='number']:first-of-type") as HTMLInputElement;
      const heightInput = this.customInputs.querySelector("input[type='number']:last-of-type") as HTMLInputElement;

      if (widthInput) {
        widthInput.value = this._customWidth.toString();
      }

      if (heightInput) {
        heightInput.value = this._customHeight.toString();
      }
    }
  }

  private updateCustomValue() {
    this.value = `${this._customWidth}x${this._customHeight}`;
  }

  private confirmCustomSelection() {
    this.selectOption(0);
  }

  private enableConfirmButton() {
    if (this.confirmButton) {
      this.confirmButton.disabled = false;
      this.confirmButton.style.display = "inline-block";
    }
  }

  private getCustomOption(): { [key: string]: string } {
    return this.options.filter((opt) => opt.value === "custom")[0];
  }
}
