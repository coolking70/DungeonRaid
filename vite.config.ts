import { defineConfig } from "vite";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname);

// `vite` (development): original art from the gitignored reverse/ directory, personal use only.
// `vite build --mode pages`: public build with the original-free art pack in art/; never touches reverse/.
export default defineConfig(({ command }) => {
  const pages = command === "build";
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
