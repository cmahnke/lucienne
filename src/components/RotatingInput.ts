export class RotatingInput extends HTMLElement {
  private degree: number = 0;
  private shadow: ShadowRoot;
  private step: number = 1;
  private displayDegrees: boolean = true;
  private radius: number = 75;
  private _disabled: boolean = false;
  private handleElement: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
  }

  static get observedAttributes(): string[] {
    return ["step", "display-degrees", "radius", "value", "disabled"];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === "step" && newValue !== null) {
      this.step = parseInt(newValue, 10) || 1;
    } else if (name === "display-degrees") {
      this.displayDegrees = newValue !== "false";
    } else if (name === "radius" && newValue !== null) {
      this.radius = parseInt(newValue, 10) || 75;
      this.updateRadius();
    } else if (name === "value" && newValue !== null) {
      this.degree = parseInt(newValue, 10) || 0;
      this.updateHandlePosition();
    } else if (name === "disabled") {
      const isDisabled = newValue !== null;
      if (this._disabled !== isDisabled) {
        this._disabled = isDisabled;
        this.updateDisabledState();
      }
    }
    this.updateDisplay();
  }

  render(): void {
    this.shadow.innerHTML = `
      <style id="dynamic-styles">
        :host {
          --control-handle-color: #007bff;
          --handle-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-handle-color)"};
          --rotating-input-container-margin: 20px auto;
          --disabled-opacity: .6;
          --control-circle-color: #ccc;
          --control-circle-border: 2px solid var(--control-circle-color);
        }

        :host(.disabled) {
          opacity: var(--disabled-opacity);
          pointer-events: none;
        }

        .rotating-input-container {
          position: relative;
          width: ${2 * this.radius}px;
          height: ${2 * this.radius}px;
          margin: var(--rotating-input-container-margin);
          user-select: none;
        }

        .circle {
          width: ${2 * this.radius}px;
          height: ${2 * this.radius}px;
          border-radius: 50%;
          border: var(--control-circle-border);
          position: relative;
          opacity: ${this._disabled ? "0.6" : "var(--disabled-opacity)"};
          cursor: ${this._disabled ? "not-allowed" : "default"};
        }

        .handle {
          position: absolute;
          width: 20px;
          height: 20px;
          background-color: var(--handle-color);
          border-radius: 50%;
          top: 0;
          left: 50%;
          transform: translate(-50%, -50%);
          cursor: ${this._disabled ? "not-allowed" : "grab"};
        }

        .degree-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 16px;
          color: ${this._disabled ? "#999" : ""};
        }
      </style>
      <div class="rotating-input-container">
        <div class="circle">
          <div class="handle"></div>
        </div>
        <div class="degree-display">0°</div>
      </div>
    `;
    this.handleElement = this.shadow.querySelector<HTMLDivElement>(".handle");
    this.styleElement = this.shadow.querySelector<HTMLStyleElement>("#dynamic-styles");
    this.updateDisplay();
    this.updateHandlePosition();
    this.setupEventListeners();
    this.updateDisabledState();
  }

  updateRadius(): void {
    const container = this.shadow.querySelector(".rotating-input-container") as HTMLElement;
    const circle = this.shadow.querySelector(".circle") as HTMLElement;
    if (container && circle) {
      container.style.width = `${2 * this.radius}px`;
      container.style.height = `${2 * this.radius}px`;
      circle.style.width = `${2 * this.radius}px`;
      circle.style.height = `${2 * this.radius}px`;
      this.updateHandlePosition();
    }
  }

  setupEventListeners(): void {
    if (this.handleElement) {
      this.handleElement.addEventListener("mousedown", this.handleMouseDown);
      this.handleElement.addEventListener("dragstart", (e: DragEvent) => e.preventDefault());
    }
  }

  removeEventListeners(): void {
    if (this.handleElement) {
      this.handleElement.removeEventListener("mousedown", this.handleMouseDown);
    }
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);
  }

  handleMouseDown = (e: MouseEvent): void => {
    if (this._disabled || !this.handleElement) return;
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    e.preventDefault();
    if (this.handleElement) {
      this.handleElement.style.cursor = "grabbing";
    }
    document.body.style.cursor = "grabbing";
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);
  };

  handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging || this._disabled) return;
    const circle = this.shadow.querySelector(".circle") as HTMLElement;
    if (!circle) return;
    const rect = circle.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    let newDegree = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);
    if (newDegree < 0) {
      newDegree += 360;
    }

    this.degree = Math.round(newDegree / this.step) * this.step;
    this.updateHandlePosition();
  };

  handleMouseUp = (): void => {
    if (this.isDragging && this.handleElement) {
      this.isDragging = false;
      this.handleElement.style.cursor = "grab";
      document.body.style.cursor = "default";
      document.removeEventListener("mousemove", this.handleMouseMove);
      document.removeEventListener("mouseup", this.handleMouseUp);
    }
  };

  updateHandlePosition(): void {
    if (!this.handleElement) return;
    const x = this.radius * Math.sin(this.degree * (Math.PI / 180));
    const y = -this.radius * Math.cos(this.degree * (Math.PI / 180));
    this.handleElement.style.left = `${this.radius + x}px`;
    this.handleElement.style.top = `${this.radius + y}px`;
    this.updateDisplay();
    this.dispatchEvent(new CustomEvent("degreeChange", { detail: { degree: this.degree } }));
  }

  updateDisplay(): void {
    const displayElement = this.shadow.querySelector(".degree-display") as HTMLElement;
    if (displayElement) {
      if (this.displayDegrees) {
        displayElement.textContent = `${Math.round(this.degree)}°`;
        displayElement.style.display = "block";
        displayElement.style.color = this._disabled ? "#999" : "";
      } else {
        displayElement.style.display = "none";
      }
    }
  }

  updateDisabledState(): void {
    const circle = this.shadow.querySelector(".circle") as HTMLElement;
    const handle = this.shadow.querySelector(".handle") as HTMLElement;

    if (circle) {
      circle.style.opacity = this._disabled ? "0.6" : "1";
      circle.style.cursor = this._disabled ? "not-allowed" : "default";
    }
    if (handle) {
      handle.style.cursor = this._disabled ? "not-allowed" : "grab";
    }

    if (this.styleElement) {
      this.styleElement.textContent = `
        :host {
          --control-handle-color: #007bff;
          --handle-color: ${this._disabled ? "var(--control-disabled-color)" : "var(--control-handle-color)"};
          --rotating-input-container-margin: 20px auto;
          --disabled-opacity: .6;
          --control-circle-color: #ccc;
          --control-circle-border: 2px solid var(--control-circle-color);
        }

        .rotating-input-container {
          position: relative;
          width: ${2 * this.radius}px;
          height: ${2 * this.radius}px;
          margin: 20px auto;
          user-select: none;
        }

        .circle {
          width: ${2 * this.radius}px;
          height: ${2 * this.radius}px;
          border-radius: 50%;
          border: var(--control-circle-border);
          position: relative;
          opacity: ${this._disabled ? "var(--disabled-opacity)" : "1"};
          cursor: ${this._disabled ? "not-allowed" : "default"};
        }

        .handle {
          position: absolute;
          width: 20px;
          height: 20px;
          background-color: var(--handle-color);
          border-radius: 50%;
          top: 0;
          left: 50%;
          transform: translate(-50%, -50%);
          cursor: ${this._disabled ? "not-allowed" : "grab"};
        }

        .degree-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 16px;
          color: ${this._disabled ? "#999" : ""};
        }
      `;
    }

    if (!this._disabled && this.handleElement) {
      // && !this.hasMouseDownListener()) {
      this.handleElement.addEventListener("mousedown", this.handleMouseDown);
    } else if (this._disabled) {
      this.removeEventListeners();
      this.isDragging = false;
      document.body.style.cursor = "default";
      if (this.handleElement) {
        this.handleElement.style.cursor = "not-allowed";
      }
    }
  }

  /*
  private hasMouseDownListener(): boolean {
    if (!this.handleElement) return false;
    const listeners = (this.handleElement as any)?.__eventListeners || {};
    return listeners.mousedown && listeners.mousedown.some((listener: any) => listener.fn === this.handleMouseDown);
  }
  */

  get value(): number {
    return this.degree;
  }
  set value(val: number) {
    this.degree = val;
    this.updateHandlePosition();
  }

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(val: boolean) {
    this._disabled = val;
    if (val) {
      this.setAttribute("disabled", "");
    } else {
      this.removeAttribute("disabled");
    }
    this.updateDisabledState();
  }
}
