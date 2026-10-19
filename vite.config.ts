import { defineConfig } from "vite";
// @ts-ignore Build-only JS module.
import { buildUiRuntime, buildAtlasWebp } from "./tools/build-ui-runtime.mjs";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname);

// U14: both builds use the checked-in native tile atlas; ?art=redrawn selects A01 comparison art.
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
        "@sheet": `${root}ui/sheet-original.ts`,
        "@art": `${root}reverse/apktool/res/drawable-nodpi-v4`,
      },
    },
    build: { outDir: `${root}dist`, emptyOutDir: true },
  };
});
