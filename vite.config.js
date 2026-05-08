import { resolve, join } from "path";
import { defineConfig } from "vite";
import stylelint from "vite-plugin-stylelint";
import { checker } from "vite-plugin-checker";
import { viteStaticCopy } from "vite-plugin-static-copy";
import browserslistToEsbuild from "browserslist-to-esbuild";
import { NodePackageImporter } from "sass";
import svg from "vite-plugin-svgo";

// External configs
import packageJson from "./package.json";
import svgoConfig from "./svgo.config.mjs";

const artifactName = packageJson.name;
const artifactversion = packageJson.version;

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  assetsInclude: ['assets/images/*.svg','assets/fonts/*'],
  plugins: [
    {
      apply: "build"
    },
    checker({ typescript: false }),
    svg(svgoConfig),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/openseadragon/build/openseadragon/images/*",
          dest: "images/"
        }
      ]
    }),
    stylelint({ build: true, dev: false, lintOnStart: true })
  ],
  build: {
    target: browserslistToEsbuild(),
    commonjsOptions: { transformMixedEsModules: true },
    outDir: "public",
    cssMinify: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html")
      },
      output: {
        assetFileNames: `assets/[name].[ext]`
      }
    }
  },
  resolve: {
    preserveSymlinks: true,
    alias: [
      {
        find: /~(.+)/,
        replacement: join(process.cwd(), "node_modules/$1")
      },
      {
        find: /@\/(.+)/,
        replacement: join(process.cwd(), "src", "assets", "$1")
      }
    ]
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        importers: [new NodePackageImporter()]
      }
    }
  },
  server: {
    cors: true
  }
});
