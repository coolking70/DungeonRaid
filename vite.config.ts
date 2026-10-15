import { defineConfig } from "vite";
const root = decodeURIComponent(new URL(".", import.meta.url).pathname);

// Debug UI: original art is read from the gitignored reverse/ directory and never copied into the repo.
export default defineConfig({
  root: "ui",
  server: { port: 5310, strictPort: true, fs: { allow: [root] } },
  resolve: { alias: { "@art": `${root}reverse/apktool/res/drawable-nodpi-v4` } },
});
