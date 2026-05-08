export class IconDropdownSelect extends HTMLElement {
  private shadow: ShadowRoot;
  private displayElement: HTMLElement;
  private optionsContainer: HTMLElement;
  private options: { value: string; innerHTML: string }[] = [];
  private _disabled = false;
  private _value: string | null = null;
  private _selectedIndex = -1;

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
  }

  connectedCallback() {
    this.populateOptions();
  }

  static get observedAttributes() {
    return ["disabled", "value"];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;
    if (name === "disabled") {
      this.disabled = newValue !== null;
    } else if (name === "value") {
      this.value = newValue;
    }
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
          --disabled-opacity: .6;
      }

      :host(.disabled) {
        opacity: var(--disabled-opacity);
        pointer-events: none;
      }

      .wrapper {
        position: relative;
        display: inline-block;
        width: 100%;
      }
      
      .display {
        border: 1px solid #ccc;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        border-radius: .4rem;
      }

      .display.disabled {
        cursor: default;
        background-color: #eee;
        color: #999;
      }

      .display img {
        margin-right: 8px;
        width: 20px;
        height: 20px;
      }

      .options-container {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        display: none;
        border: 1px solid #ccc;
        background-color: white;
        z-index: 10;
        overflow-y: scroll;
        min-height: 30vh;
        max-height: 80vh;
      }

      .options-container.open {
        display: block;
      }

      .option {
        padding: .2rem;
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      .option img {
        margin-right: 8px;
        width: 20px;
        height: 20px;
      }

      .option.selected {
        background-color: #f0f0f0;
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
      this.dispatchEvent(new CustomEvent("change", { detail: this.options[index].value }));
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
    this.options = Array.from(this.children).map((child) => {
      const value = child.getAttribute("value") || "";
      const innerHTML = child.innerHTML || "";
      return { value, innerHTML };
    });

    this.options.forEach((option) => {
      const optionElement = document.createElement("div");
      optionElement.classList.add("option");
      optionElement.innerHTML = option.innerHTML;
      optionElement.addEventListener("click", () => {
        this.value = option.value;
        this.optionsContainer.classList.remove("open");
        this.dispatchEvent(new CustomEvent("change", { detail: option.value }));
      });
      this.optionsContainer.appendChild(optionElement);
    });

    this.updateDisplay();
    this.updateDisabledState();
  }

  private updateDisplay() {
    const selectedOption = this.options.find((option) => option.value === this.value);
    this.displayElement.innerHTML = "";
    if (selectedOption) {
      this.displayElement.innerHTML = selectedOption.innerHTML;
    } else if (this.options.length > 0) {
      this.displayElement.innerHTML = this.options[0].innerHTML;
    }
  }

  private updateDisabledState() {
    if (this.disabled) {
      this.displayElement.classList.add("disabled");
    } else {
      this.displayElement.classList.remove("disabled");
    }
  }
}
