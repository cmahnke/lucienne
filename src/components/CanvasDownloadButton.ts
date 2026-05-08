import i18next from "i18next";

export class CanvasDownloadButton extends HTMLElement {
  // --- Private Properties ---
  private _canvas: HTMLCanvasElement | undefined;
  private _button: HTMLButtonElement;
  private _disabled: boolean = true; // Internal disabled state
  private _fileName: string = "canvas-image";
  private _format: string = "png";
  private _internallySettingFormat: boolean = false; // Prevents recursion in attributeChangedCallback
  private _height: number | null = null; // Required for renderCallback
  private _width: number | null = null; // Required for renderCallback
  // Callback to dynamically generate a canvas for download
  private _renderCallback?: (width: number, height: number) => Promise<HTMLCanvasElement>;
  private shadow: ShadowRoot;

  // --- Constructor and Core Lifecycle ---
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    this._button = document.createElement("button");
    this._button.className = "download-button";
    this._button.part = "button"; // Expose button for external styling
    this._button.textContent = i18next.t("canvasDownloadButton:download");
    this._button.addEventListener("click", this._initiateDownload.bind(this));

    this.shadow.appendChild(this._button);
    this._applyStyles();
    this._updateButtonState();
  }

  connectedCallback() {
    // Ensure initial attribute values are reflected if set before connection
    this._reflectAttribute("disabled", this.hasAttribute("disabled"));
    this._reflectAttribute("button-text", this.getAttribute("button-text") || i18next.t("canvasDownloadButton:download"));
    this._reflectAttribute("file-name", this.getAttribute("file-name") || "canvas-image");
    this._reflectAttribute("format", this.getAttribute("format") || "png");
    this._reflectAttribute("height", this.getAttribute("height"));
    this._reflectAttribute("width", this.getAttribute("width"));
    this._updateButtonState();
  }

  static get observedAttributes(): string[] {
    // Attributes to monitor for changes
    return ["disabled", "button-text", "file-name", "format", "height", "width"];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    // Prevent feedback loop when setting format internally
    if (this._internallySettingFormat && name === "format") {
      return;
    }

    switch (name) {
      case "disabled":
        this.disabled = newValue !== null; // Update property based on attribute presence
        break;
      case "button-text":
        this.buttonText = newValue || i18next.t("canvasDownloadButton:download");
        break;
      case "file-name":
        this.fileName = newValue || "canvas-image";
        break;
      case "format":
        // Note: Setter handles validation and reflection
        this.format = newValue || "png";
        break;
      case "height":
        this.height = newValue ? parseInt(newValue, 10) : null;
        break;
      case "width":
        this.width = newValue ? parseInt(newValue, 10) : null;
        break;
    }
  }

  // Helper to update internal state without triggering attributeChangedCallback again
  private _reflectAttribute(name: string, value: string | boolean | null) {
    switch (name) {
      case "disabled":
        this._disabled = !!value;
        break;
      case "button-text":
        this.buttonText = String(value);
        break;
      case "file-name":
        this.fileName = String(value);
        break;
      case "format":
        this.format = String(value);
        break;
      case "height":
        this.height = value !== null ? parseInt(String(value), 10) : null;
        break;
      case "width":
        this.width = value !== null ? parseInt(String(value), 10) : null;
        break;
    }
  }

  // --- Public Properties (Getters/Setters) ---

  /**
   * The HTMLCanvasElement to be downloaded.
   * Setting this will enable the download button if not disabled.
   */
  get canvas(): HTMLCanvasElement | undefined {
    return this._canvas;
  }

  set canvas(canvasInstance: HTMLCanvasElement | undefined) {
    this._canvas = canvasInstance;
    this._updateButtonState();
  }

  /**
   * Controls whether the download button is disabled. Reflects the 'disabled' attribute.
   */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    const trulyDisabled = Boolean(value);
    if (this._disabled !== trulyDisabled) {
      this._disabled = trulyDisabled;
      if (trulyDisabled) {
        this.setAttribute("disabled", "");
      } else {
        this.removeAttribute("disabled");
      }
      this._updateButtonState();
    }
  }

  /**
   * The text displayed on the download button. Reflects the 'button-text' attribute.
   */
  get buttonText(): string {
    return this._button?.textContent ?? "";
  }

  set buttonText(value: string) {
    const text = String(value || i18next.t("canvasDownloadButton:download"));
    if (this._button && this._button.textContent !== text) {
      this._button.textContent = text;
      // Reflect attribute change if needed, though less common for button text
      // this.setAttribute("button-text", text);
    }
  }

  /**
   * The base name for the downloaded file (extension is added automatically).
   * Reflects the 'file-name' attribute.
   */
  get fileName(): string {
    return this._fileName;
  }

  set fileName(value: string) {
    const name = String(value || "canvas-image");
    if (this._fileName !== name) {
      this._fileName = name;
      // Reflect attribute change if needed
      // this.setAttribute("file-name", name);
    }
  }

  /**
   * The desired image format ('png' or 'jpeg'). Defaults to 'png'.
   * Reflects the 'format' attribute. Invalid values default to 'png'.
   */
  get format(): string {
    return this._format;
  }

  set format(value: string) {
    this._internallySettingFormat = true; // Prevent attributeChanged callback loop
    let newFormat = String(value || "png").toLowerCase();
    if (newFormat !== "png" && newFormat !== "jpeg") {
      console.warn(`Invalid format "${newFormat}". Defaulting to PNG.`);
      newFormat = "png";
    }
    if (this._format !== newFormat) {
      this._format = newFormat;
      this.setAttribute("format", this._format); // Keep attribute in sync
    }
    this._internallySettingFormat = false;
  }

  /**
   * The height required for the renderCallback function. Reflects the 'height' attribute.
   */
  get height(): number | null {
    return this._height;
  }

  set height(value: number | null) {
    const numValue = value === null ? null : Number(value);
    if (this._height !== numValue) {
      this._height = numValue;
      if (numValue !== null && !isNaN(numValue)) {
        this.setAttribute("height", String(numValue));
      } else {
        this.removeAttribute("height");
        this._height = null; // Ensure it's null if invalid
      }
      this._updateButtonState();
    }
  }

  /**
   * The width required for the renderCallback function. Reflects the 'width' attribute.
   */
  get width(): number | null {
    return this._width;
  }

  set width(value: number | null) {
    const numValue = value === null ? null : Number(value);
    if (this._width !== numValue) {
      this._width = numValue;
      if (numValue !== null && !isNaN(numValue)) {
        this.setAttribute("width", String(numValue));
      } else {
        this.removeAttribute("width");
        this._width = null; // Ensure it's null if invalid
      }
      this._updateButtonState();
    }
  }

  /**
   * A callback function that generates a canvas on demand for download.
   * It receives the required width and height (must be set via attributes or properties).
   * If this is set, it takes precedence over the `canvas` property during download initiation,
   * but only if `width` and `height` are also provided.
   */
  set renderCallback(callback: (width: number, height: number) => Promise<HTMLCanvasElement>) {
    this._renderCallback = callback;
    this._updateButtonState();
  }

  /*
  get renderCallback(): ((width: number, height: number) => Promise<HTMLCanvasElement | undefined> | HTMLCanvasElement | undefined) | null {
    return this._renderCallback;
  }
  */

  // --- Private Methods ---

  /** Checks if the component has enough information to enable the button */
  private _canDownload(): boolean {
    if (this._disabled) return false; // Explicitly disabled

    // Option 1: Direct canvas is provided
    if (this._canvas) return true;

    // Option 2: Render callback is provided AND width/height are valid numbers
    if (this._renderCallback && typeof this._width === "number" && typeof this._height === "number") {
      return true;
    }

    return false; // Not enough info
  }

  /** Updates the enabled/disabled state of the internal button */
  private _updateButtonState() {
    if (this._button) {
      this._button.disabled = !this._canDownload();
    }
  }

  /** Initiates the download process when the button is clicked */
  private async _initiateDownload() {
    if (!this._canDownload()) return; // Double check state

    this.dispatchEvent(new CustomEvent("download-start", { bubbles: true, composed: true }));

    let canvasToDownload: HTMLCanvasElement | undefined = undefined;

    // Prioritize render callback if conditions are met
    if (this._renderCallback && typeof this._width === "number" && typeof this._height === "number") {
      try {
        // Execute the callback to generate the canvas
        const result = this._renderCallback(this._width, this._height);
        // Check if the result is a promise or a direct value
        canvasToDownload = await result;

        if (!canvasToDownload) {
          // Check if callback returned a canvas
          throw new Error("Render callback did not return a valid HTMLCanvasElement.");
        }
        if (!(canvasToDownload instanceof HTMLCanvasElement)) {
          throw new Error("Render callback must return an HTMLCanvasElement.");
        }
      } catch (error) {
        console.error("Error executing render callback:", error);
        this.dispatchEvent(
          new CustomEvent("download-error", {
            detail: { message: "Render callback failed.", error: error },
            bubbles: true,
            composed: true
          })
        );
        this.dispatchEvent(new CustomEvent("download-end", { bubbles: true, composed: true }));
        return; // Stop download process
      }
    }
    // Otherwise, use the directly assigned canvas if render callback wasn't used/applicable
    else if (this._canvas) {
      canvasToDownload = this._canvas;
    }

    // Final check if we have a canvas to download
    if (!canvasToDownload) {
      console.error("Error downloading: No canvas available (neither set directly nor generated by callback).");
      this.dispatchEvent(
        new CustomEvent("download-error", {
          detail: { message: "No canvas available for download." },
          bubbles: true,
          composed: true
        })
      );
      this.dispatchEvent(new CustomEvent("download-end", { bubbles: true, composed: true }));
      return;
    }

    // Proceed with the download using the determined canvas
    this._download(canvasToDownload, this._format, this._fileName);
  }

  /** Handles the actual blob creation and download link generation */
  private async _download(canvas: HTMLCanvasElement, format: string, fileName: string) {
    try {
      const blob = await this._getBlob(canvas, format); // Use the updated _getBlob
      if (!blob) {
        throw new Error("Failed to generate Blob from canvas.");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.${format}`; // Ensure correct extension
      a.style.display = "none"; // Hide the link
      document.body.appendChild(a); // Append to body to ensure click works
      a.click(); // Simulate click to trigger download
      document.body.removeChild(a); // Clean up the link
      URL.revokeObjectURL(url); // Release the object URL

      this.dispatchEvent(
        new CustomEvent("download-success", {
          // More specific success event
          detail: { fileName: a.download, format: format, blobSize: blob.size },
          bubbles: true,
          composed: true
        })
      );
    } catch (error) {
      console.error("Error during download process:", error);
      this.dispatchEvent(
        new CustomEvent("download-error", {
          detail: { message: i18next.t("canvasDownloadButton:downloadFailed"), error: error },
          bubbles: true,
          composed: true
        })
      );
    } finally {
      // Always fire download-end, regardless of success or failure
      this.dispatchEvent(new CustomEvent("download-end", { bubbles: true, composed: true }));
    }
  }

  /**
   * Generates a Blob from  HTMLCanvasElement.
   */
  private _getBlob(canvas: HTMLCanvasElement, format: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const type = format === "jpeg" ? "image/jpeg" : "image/png";
      const quality = format === "jpeg" ? 0.92 : undefined; // Optional: Specify quality for JPEG

      try {
        // Use toBlob for HTMLCanvasElement (uses a callback)
        canvas.toBlob(
          (blob) => {
            // Callback function
            resolve(blob); // Resolve with the blob (or null if failed)
          },
          type, // Mime type
          quality // Quality argument (for JPEG)
        );
      } catch (error) {
        // Catch synchronous errors (e.g., security errors if canvas is tainted)
        reject(error);
      }
    });
  }

  /** Applies basic CSS styles to the shadow DOM */
  _applyStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block; 
        vertical-align: middle;
        /* Variables for easier theming */
        --btn-bg-color: #66afff;
        --btn-text-color: white;
        --btn-hover-bg-color: #007bff;
        --btn-hover-tansition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
        --btn-disabled-bg-color: #cccccc;
        --btn-disabled-text-color: #666666;
        --btn-padding: 8px 16px;
        --btn-border-radius: 0.4rem;
        --btn-border: none;
        --btn-font-size: 1em;
        --btn-line-height: 1.2;
        --btn-cursor: pointer;
        --btn-disabled-cursor: not-allowed;
        --btn-margin: 0 2em;
        --disabled-opacity: .6;
        --font-family: sans-serif;
      }

      :host(.disabled) {
        opacity: var(--disabled-opacity);
        pointer-events: none;
      }

      .download-button {
        font-family: var(--font-family);
        padding: var(--btn-padding);
        border: var(--btn-border);
        border-radius: var(--btn-border-radius);
        cursor: var(--btn-cursor);
        font-size: var(--btn-font-size);
        transition: var(--btn-hover-tansition);
        color: var(--btn-text-color);
        background-color: var(--btn-bg-color);
        white-space: nowrap;
        line-height: var(--btn-line-height);
        margin: var(--btn-margin);
      }

      .download-button:hover:not(:disabled) {
        background-color: var(--btn-hover-bg-color);
      }

      .download-button:disabled {
        background-color: var(--btn-disabled-bg-color);
        color: var(--btn-disabled-text-color);
        cursor: var(--btn-disabled-cursor);
        opacity: var(--disabled-opacity)
      }
      `;
    this.shadow.appendChild(style);
  }
}
