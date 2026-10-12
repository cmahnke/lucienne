# Open Issues - Lucienne

Tracked list of known, unfixed issues, verified against the working tree as of 2026-10-12.
Line numbers refer to the current state of the code and may shift as fixes land.

## 1. Logic bugs

None open - A1-A10 are all fixed.

## 2. Offsets / shifts mode - remaining limitations

Offset mode is enabled by default in the demo (`main.ts` passes `shifts: true`). The layout was
reworked: shifts are normalized to the pattern period (the cut region is the repeat unit), the
margin ring adjacent to the visible area renders unclipped to continue the pattern, every tile is
clipped back to the configured columns x rows rectangle (the overall shape never changes, only the
alignment), and the download renderer applies layout + final zoom before capturing the canvas.

Verified with patterned-tile screenshots and download captures
(`CAPTURE_OFFSETS=1 npx playwright test e2e/offsets.screenshots.spec.ts`, output in
`test-results/offset-screenshots/`). Single-axis offsets (the common half-drop case) are fully
correct: exact configured shape, stable scale, no gaps.

What remains:

| #   | Location                         | Limitation                                                                                                                                                                                                                                                                                                             | Impact                                                                                                                                                                                                    |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | `src/Renderer.ts` rotation block | The pattern content cannot continue seamlessly across the boundary between rotated and unrotated tiles - the pattern directions differ by the rotation angle. For non-square cut regions the rotated content also sticks out of its cell symmetrically and is trimmed at the crop boundary (geometrically unavoidable) | Visible content seams at rotated/unrotated tile boundaries; non-square cuts + 90/270 degree rotations show trimmed rotated content                                                                        |
| O2  | `src/Renderer.ts` layout         | With BOTH offsets active the row and column staggers interact: the pattern content is discontinuous at the strip intersections. This is inherent to the one-tile-per-cell model - squares on a doubly-staggered lattice cannot tile the plane continuously                                                             | No transparent gaps (wedges are exactly detected and filled with phase-correct pattern content positioned exactly on the gap), but visible content seams remain at the intersections for combined offsets |
| O3  | `src/Renderer.ts:322`            | `Renderer.set margins` is never called - margins mode is always on, the toggle is dead code                                                                                                                                                                                                                            | Margins cannot be turned off                                                                                                                                                                              |
| O4  | `e2e/`                           | Pattern correctness is verified via patterned tile screenshots and download captures, not by automated pixel assertions (tile coverage and viewport stability are asserted automatically)                                                                                                                              | Visual verification is manual - run the capture target after touching the layout math                                                                                                                     |

## 3. Dead code / cosmetics (open)

| #   | Location                                              | Issue                                                                                 |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E1  | `src/Renderer.ts:740`                                 | Impossible condition `rowEven && !columnEven && columnEven && !rowEven` - dead branch |
| E2  | `src/CuttingTable.ts:130,134,139,144,149,156,171,174` | `"x" in element.dataset` is always `true` - the feature checks are meaningless        |
| E3  | `src/CuttingTable.ts:497`                             | Dead condition `this.cuts.url === undefined` (getter returns `""`, never `undefined`) |
| E4  | `src/openseadragon/RotateableRect.ts:118`             | `_isRotated` actually means "not vertical" - inverted semantics                       |
| E5  | `src/components/CanvasDownloadButton.ts:24`           | `this._button.part = "button"` is a no-op (must be `setAttribute("part", ...)`)       |
| E6  | `src/components/ImageResolutionSelect.ts:503`         | `getCustomOption()` return type lie (`{[key: string]: string}` consumed as `{label}`) |
| E7  | `src/openseadragon/IIIFTileSourceSpecifier.ts:4-5`    | Instance field/constructor never used - only static `wrap()` is called                |
| E8  | `src/Renderer.ts:668,702,925,1215-1216,1409`          | Leftover commented-out lines (`//expectedSize`, `//console.log`, `//maxX`, `//maxY`)  |
| E9  | `src/Renderer.ts:706`                                 | Unused variable `imageCenter` (eslint warns)                                          |

## 4. Build / config notes

- `vite.config.js:44` - `__dirname` and JSON-import deprecation warnings from Vite's native config loader (informational)
- knip exits 0; it reports 4 configuration hints (redundant entry patterns, compiled extensions) that are informational only
