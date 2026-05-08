import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import commonjs from "@rollup/plugin-commonjs";
import alias from "@rollup/plugin-alias";
import json from "@rollup/plugin-json";
import postcss from "rollup-plugin-postcss";
import url from "postcss-url";
import path from "path";
import fs from "fs";
import copy from "rollup-plugin-copy";
import { NodePackageImporter } from "sass";
import replace from "@rollup/plugin-replace";

// External configs
import typescriptOptions from "./tsconfig.json" with { type: "json" };
import packageJson from "./package.json" with { type: "json" };

const artifactName = packageJson.name.split('/').pop();
const artifactversion = packageJson.version;

const fontPath = "src/assets/fonts";
const fontURLPath = "/fonts/";
if (!fs.existsSync(fontPath)) {
  fs.mkdirSync(fontPath);
}

const aliasConfig = {
  entries: [
    {
      find: "@",
      replacement: path.resolve("src/assets")
    }
  ]
};

const config = [
  {
    input: "src/CuttingTable.ts",
    output: [
      {
        file: `dist/index.d.ts`,
        format: "es"
      }
    ],
    plugins: [
      postcss({
        use: [
          [
            "sass",
            {
              pkgImporter: new NodePackageImporter()
            }
          ]
        ]
      }),
      dts()
    ]
  },
  {
    input: "src/assets/scss/base.scss",
    output: [
      {
        file: `dist/${artifactName}-vorsatzpapier.css`,
        format: "es"
      }
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          defaults: "vorsatzpapier"
        }
      }),
      postcss({
        extract: true,
        sourceMap: true,
        use: [
          [
            "sass",
            {
              pkgImporter: new NodePackageImporter(),
              includePaths: [path.resolve("node_modules")]
            }
          ]
        ],
        plugins: [
          url([
            {
              url: "inline",
              maxSize: 100,
              fallback: "copy",
              basePath: path.resolve("src/assets/scss"),
              assetsPath: path.resolve("src/assets/images")
            }
          ]),
          url([
            {
              url: (asset) => {
                if (asset.pathname === null || (asset.url !== undefined && asset.url.startsWith("data:"))) {
                  return;
                }
                if (asset.pathname !== null && asset.pathname.startsWith("@fontsource")) {
                  const src = path.resolve(path.join("node_modules", asset.pathname));
                  const fontFile = path.basename(asset.pathname);
                  const dest = path.join(fontPath, fontFile);
                  if (!fs.existsSync(dest)) {
                    fs.cpSync(src, dest);
                  }
                  const urlPath = path.join(fontURLPath, fontFile);
                  return urlPath;
                }
              },
              multi: true
            }
          ])
        ]
      }),
      nodeResolve({
        extensions: [".css"]
      })
    ]
  },
  {
    input: "src/assets/scss/base.scss",
    output: [
      {
        file: `dist/${artifactName}-christianmahnke.css`,
        format: "es"
      }
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          defaults: "christianmahnke"
        }
      }),
      alias(aliasConfig),
      postcss({
        extract: true,
        sourceMap: true,
        use: [
          [
            "sass",
            {
              pkgImporter: new NodePackageImporter()
            }
          ]
        ],
        plugins: [
          url([
            {
              url: "inline",
              maxSize: 100,
              fallback: "copy",
              basePath: path.resolve("src/assets/scss"),
              assetsPath: path.resolve("src/assets/images")
            }
          ]),
          url([
            {
              url: (asset) => {
                if (asset.pathname === null || (asset.url !== undefined && asset.url.startsWith("data:"))) {
                  return;
                }
                if (asset.pathname !== null && asset.pathname.startsWith("@fontsource")) {
                  const src = path.resolve(path.join("node_modules", asset.pathname));
                  const fontFile = path.basename(asset.pathname);
                  const dest = path.join(fontPath, fontFile);
                  if (!fs.existsSync(dest)) {
                    fs.cpSync(src, dest);
                  }
                  const urlPath = path.join(fontURLPath, fontFile);
                  return urlPath;
                }
              },
              multi: true
            }
          ])
        ]
      })
    ]
  },
  {
    input: "src/CuttingTable.ts",
    output: [
      {
        file: `dist/${artifactName}.js`,
        format: "es",
        sourcemap: true,
        assetFileNames: "[name][extname]"
      }
    ],
    external: [
      "openseadragon",
      "openseadragon-fabric-overlay",
      "fabric",
      "@allmaps/iiif-parser",
      "i18next",
      "i18next-browser-languagedetector"
    ],
    plugins: [
      alias(aliasConfig),
      json({ preferConst: true }),
      postcss({
        extract: `${artifactName}.css`,
        sourceMap: true,
        use: [
          [
            "sass",
            {
              pkgImporter: new NodePackageImporter()
            }
          ]
        ],
        plugins: [
          url([
            {
              url: "inline",
              maxSize: 100,
              fallback: "copy",
              basePath: path.resolve("src/assets/scss"),
              assetsPath: path.resolve("src/assets/images")
            }
          ]),
          url([
            {
              url: (asset) => {
                if (asset.pathname === null || (asset.url !== undefined && asset.url.startsWith("data:"))) {
                  return;
                }
                if (asset.pathname !== null && asset.pathname.startsWith("@fontsource")) {
                  const src = path.resolve(path.join("node_modules", asset.pathname));
                  const fontFile = path.basename(asset.pathname);
                  const dest = path.join(fontPath, fontFile);
                  if (!fs.existsSync(dest)) {
                    fs.cpSync(src, dest);
                  }
                  const urlPath = path.join(fontURLPath, fontFile);
                  return urlPath;
                }
              },
              multi: true
            }
          ])
        ]
      }),
      typescript(typescriptOptions),
      commonjs(),
      copy({
        targets: [
          {
            src: `${fontPath}/*`,
            dest: path.join("build", fontURLPath)
          }
        ]
      }),

      nodeResolve()
    ]
  },
  {
    input: "src/CuttingTable.ts",
    output: [
      {
        file: `dist/${artifactName}-${artifactversion}-complete.iife.min.js`,
        format: "iife",
        name: "PatternGenerator",
        sourcemap: true,
        assetFileNames: "[name][extname]"
      }
    ],
    plugins: [
      alias(aliasConfig),
      json({ preferConst: true }),
      postcss({
        extract: `${artifactName}.css`,
        sourceMap: true,
        use: [
          [
            "sass",
            {
              pkgImporter: new NodePackageImporter()
            }
          ]
        ],
        plugins: [
          url([
            {
              url: "inline",
              maxSize: 100,
              fallback: "copy",
              basePath: path.resolve("src/assets/scss"),
              assetsPath: path.resolve("src/assets/images")
            }
          ]),
          url([
            {
              url: (asset) => {
                if (asset.pathname === null || (asset.url !== undefined && asset.url.startsWith("data:"))) {
                  return;
                }
                if (asset.pathname !== null && asset.pathname.startsWith("@fontsource")) {
                  const src = path.resolve(path.join("node_modules", asset.pathname));
                  const fontFile = path.basename(asset.pathname);
                  const dest = path.join(fontPath, fontFile);
                  if (!fs.existsSync(dest)) {
                    fs.cpSync(src, dest);
                  }
                  const urlPath = path.join(fontURLPath, fontFile);
                  return urlPath;
                }
              },
              multi: true
            }
          ])
        ]
      }),
      commonjs(),
      copy({
        targets: [
          {
            src: "src/index.html",
            dest: "build",
            transform: (contents, filename) =>
              contents
                .toString()
                .replace("./main.ts", `${artifactName}-complete.es.min.js`)
                .replace("</title>", `</title><link rel="stylesheet" crossorigin href="${artifactName}.css">`)
          }
        ]
      }),
      typescript({ ...typescriptOptions, sourceMap: false, inlineSources: false }),
      nodeResolve(),
      terser()
    ]
  }
];

export default config;
