// Guard for the public build: dist/ must not contain original game art or audio.
// Usage: node tools/check-dist.mjs   (run after `vite build --mode pages`)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const reverse = join(root, "reverse");

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");

if (!existsSync(dist)) {
  console.error("dist/ not found: run `npx vite build --mode pages` first");
  process.exit(1);
}
const files = walk(dist);
const problems = [];

// 1. No byte-identical copy of any extracted original file (only checkable where reverse/ exists).
if (existsSync(reverse)) {
  const originals = new Map(walk(reverse).filter(p => /\.(png|ogg|ttf|fnt|jpg)$/i.test(p)).map(p => [sha(p), p]));
  for (const file of files) {
    const hit = originals.get(sha(file));
    if (hit) problems.push(`${relative(root, file)} is identical to ${relative(root, hit)}`);
  }
  console.log(`compared ${files.length} dist files against ${originals.size} original assets`);
} else {
  console.log("reverse/ absent (CI): skipping byte comparison");
}

// 2. No reference to the original asset locations in emitted text.
for (const file of files.filter(f => /\.(js|css|html|json)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const marker of ["drawable-nodpi", "reverse/apktool", "sheet-original"]) {
    if (text.includes(marker)) problems.push(`${relative(root, file)} references ${marker}`);
  }
}

// 3. The original-free art pack must be present.
if (!files.some(f => /art\/tiles|tiles-[\w-]+\.png$/.test(relative(dist, f)))) problems.push("art pack tiles.png missing from dist");

if (problems.length) {
  console.error(`FAIL:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`PASS: ${files.length} files, no original assets`);
