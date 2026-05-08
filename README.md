# Lucienne - A IIIF pattern generator

This is a web component to build patterns from IIIF manififests - like from wall papers. It's also possible to pass a collection like [the default one](https://vorsatzpapier.projektemacher.org/collection.json) to load a sample from it. For more background see this [blog Article](https://christianmahnke.de/en/post/wallpaper-generator/)-

# Name

The software is named after [Lucienne_Day](https://en.wikipedia.org/wiki/Lucienne_Day), a famous British textile and wallpaper designer.

# Installation

```
npm i @projektemacher/lucienne
```

# Usage

Make sure you have a HTMLElement to attach the generator to:

```
<div id="generator"></div>
```

Then (either in a script element or a JavaScript module) pass the

```javascript
const urls = [
  { url: "https://vorsatzpapier.projektemacher.org/patterns/collection.json", label: "Sammlung Vorsatzpapier" }
];
const generatorElement = document.querySelector<HTMLDivElement>("#generator")!;
const cuttingTable = new CuttingTable(generatorElement, true, true, true, true, urls, false);
```

See next sections for options.

## Parameters

| Parameter | Type | Default | Description |
|---------|------|---------|-------------|
| `element` | `HTMLDivElement` | — | The container element where the CuttingTable interface will be rendered. |
| `urlInput` | `boolean` | `true` | Whether to display a URL input field for specifying image sources. |
| `gridSelector` | `boolean` | `true` | Whether to enable grid selection controls for layout configuration. |
| `download` | `boolean` | `true` | Whether to enable download functionality for exported JSON data. |
| `autoLoad` | `boolean` | `true` | Whether to automatically load the first configured URL upon initialization. |
| `urls` | `URL \| Array<{url: string, label: string}> \| string \| undefined` | `undefined` | Optional initial URLs to load. Can be a single URL, an array of URL objects with labels, or a string URL. |
| `shifts` | `boolean` | `false` | Whether to enable shift controls for offset adjustments. |

## Throws

* `Error` if no valid element is provided or if no initial URL is set when `urlInput` is `false`.


# Development

This package uses Vite for development.

## Dev browser mode

```
npm run dev
```

### Test URL

[http://localhost:5173/patterns/?url=https://static.projektemacher.org/vorsatzpapier/post/tapete-47/front](http://localhost:5173/patterns/?url=https://static.projektemacher.org/vorsatzpapier/post/tapete-47/front)

## Generating JSDoc

```
npm run jsdoc
```

One can view the JSDoc using `serve`

```
npm install -g serve
serve public/jsdoc
```

Open [http://localhost:3000](http://localhost:3000)


## Packaging

Vite is sadly not very flexible in regard of creating distributable artifacts, thus we use Rollup for that.

```
npm run build
```

It's also possible to use `vite` to build the test and debug site:

```
npm run vite-build
```

## Updating OpenSeadragon types

Since version 0.1.1 (and thus OpenSeadragon 6) the types aren't provides by `@tyoes/openseadragon` anymore, they are now provided by `src/@types/openseadragon/index.d.ts` which is used to override the provided types. Those are currently hand crafted.

# TODO

## Known issues

- Preview icon in collections, implemented but parser doesn't support it

## Next Version(s)

- Pass cuts via URL
- Use a options object in constructor
- Select download area from result viewer
- Shifts / offsets
  - Dynamic margins not clipped correctly at edges
    - insets nor working with clippings
    - check margins wit offsets in two dimensions
  - Rotation not working with offsets
- Make sure everything is reset when changing the size - NTH
- Check how the augmented types could be generated
