import { defineConfig } from "vite";
// @ts-ignore Build-only JS module.
import { buildUiRuntime, buildAtlasWebp } from "./tools/build-ui-runtime.mjs";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname);

// `vite` (development): tile atlas from the local reverse/ directory, for side-by-side comparison.
// `vite build`: published build using the redrawn art pack in art/.
export default defineConfig(({ command }) => {
  buildUiRuntime();
  const pages = command === "build";
  if (pages) console.log(buildAtlasWebp());
  return {
    root: "ui",
    base: "./",
    server: { port: 5310, strictPort: true, fs: { allow: [root] } },
    resolve: {
      alias: {
        "@sheet": `${root}ui/sheet-${pages ? "pack" : "original"}.ts`,
        "@art": `${root}reverse/apktool/res/drawable-nodpi-v4`,
      },
    },
    build: { outDir: `${root}dist`, emptyOutDir: true },
  };
});
