import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => JSON.parse(readFileSync(root + p, 'utf8'));
const fields = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
/** Build-only evidence stripping. Authority files remain intact. No runtime rule data is changed. */
export function buildUiRuntime() {
  const catalog = read('data/i18n/catalog.json');
  const ui = read('art/ui/manifest.json');
  const region = e => fields(e, ['id', 'slot', 'rect', 'asset', 'nineSlice', 'sliceMargins', 'states', 'fillBounds']);
  const result = {
    _source: 'tools/build-ui-runtime.mjs; data/i18n, data/ui-layout.json, art/*/manifest.json',
    en: { messages: read('data/i18n/en.json').messages }, zh: { messages: read('data/i18n/zh.json').messages },
    catalog: { aliases: Object.fromEntries(Object.entries(catalog.aliases).filter(([k,v]) => k !== v)), sourceToKey: catalog.sourceToKey,
      entries: Object.fromEntries(Object.entries(catalog.entries).filter(([,v]) => v.placeholders?.length).map(([k,v]) => [k, { placeholders: v.placeholders }])) },
    fallback: Object.fromEntries(read('data/ui-strings.json').strings.filter(s => s.id.startsWith('baked.')).map(s => [s.id, s.text])),
    ui: { assets: ui.assets.map(region), elements: ui.elements.map(e => ({ id: e.id, asset: e.asset })) },
    items: { slots: read('art/items/manifest.json').slots.map(region) },
    tiles: { tiles: read('art/manifest.json').tiles.map(region) },
    layout: Object.fromEntries(read('data/ui-layout.json').elements.map(e => [e.id, fields(e, ['rect', 'rectFormula'])])),
  };
  mkdirSync(root + 'ui/generated', { recursive: true });
  const output = JSON.stringify(result) + '\n';
  let previous; try { previous = readFileSync(root + 'ui/generated/runtime.json','utf8'); } catch {}
  if (previous !== output) writeFileSync(root + 'ui/generated/runtime.json', output);
  return Buffer.byteLength(output);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`UI runtime: ${buildUiRuntime()} bytes`);
