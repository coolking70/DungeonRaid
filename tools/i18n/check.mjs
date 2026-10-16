#!/usr/bin/env node
// L01: source completeness + formatting + measured font widths. No files written by default.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMessage } from './runtime.mjs';
import { achievementSources } from './achievements.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const json = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const sha = name => createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortedKeys = object => Object.keys(object).sort();
export const placeholders = text => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(m => m[1]).sort();

export function loadInputs() {
  return {
    en: json('data/i18n/en.json'), zh: json('data/i18n/zh.json'), catalog: json('data/i18n/catalog.json'),
    inventory: json('data/ui-strings.json'), layout: json('data/ui-layout.json'),
    font: json('fonts/fusion-pixel-12-subset.chars.json'), symbols: json('tools/i18n/fixed-symbols.json'),
    portCopy: json('tools/i18n/achievements-copy.json'),
    data: Object.fromEntries(['enums', 'items', 'classes', 'specials', 'scoring', 'achievements'].map(name => [`data/${name}.json`, json(`data/${name}.json`)])),
  };
}

export function requiredCharacters({ en, zh, symbols }) {
  const controls = new Set(symbols.nonGlyphControls);
  return [...new Set([...Object.values(en.messages), ...Object.values(zh.messages), symbols.characters].join(''))]
    .filter(c => !controls.has(c)).map(c => c.codePointAt(0)).sort((a, b) => a - b);
}

export function measureText(text, font) {
  return Math.max(0, ...text.split(/\r?\n/).map(line => [...line.replaceAll('\t', '    ')].reduce((sum, c) => {
    const advance = font.advanceWidths[c.codePointAt(0)];
    if (advance === undefined) throw new Error(`No font metric for U+${c.codePointAt(0).toString(16)}`);
    return sum + advance * 12 / font.unitsPerEm;
  }, 0)));
}

export function validate(input) {
  const { en, zh, catalog, inventory, data, font } = input;
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(equal(sortedKeys(en.messages), sortedKeys(zh.messages)), 'Locale key sets differ');
  check(equal(sortedKeys(en.messages), sortedKeys(catalog.entries)), 'Catalog key set differs');
  check(equal(sortedKeys(en.messages), sortedKeys(en.sources)), 'English provenance keys differ');
  check(equal(sortedKeys(zh.messages), sortedKeys(zh.sources)), 'Chinese provenance keys differ');
  check(catalog.defaultLocale === 'zh' && catalog.fallbackLocale === 'en', 'Locale policy differs');
  const sourceRows = new Map([...inventory.strings, ...inventory.references, ...achievementSources(data['data/achievements.json'])].map(s => [s.id, s]));
  check(equal([...sourceRows.keys()].sort(), sortedKeys(catalog.sourceToKey)), 'Source coverage differs');
  function dereference(ref) {
    const [file, pointer] = ref.split('#');
    let value = file === 'data/ui-strings.json' ? inventory : file === 'tools/i18n/achievements-copy.json' ? input.portCopy : data[file];
    for (const part of pointer.slice(1).split('/')) value = value[part.replaceAll('~1', '/').replaceAll('~0', '~')];
    return value;
  }
  const coveredPaths = new Set();
  const coveredIds = new Set();
  for (const [key, entry] of Object.entries(catalog.entries)) {
    const a = en.messages[key], b = zh.messages[key];
    if (typeof a !== 'string' || typeof b !== 'string') { errors.push(`${key}: missing text`); continue; }
    check(equal(placeholders(a), placeholders(b)), `${key}: placeholders differ`);
    check(equal(placeholders(a), entry.placeholders.map(p => p.name).sort()), `${key}: placeholder metadata differs`);
    check(entry.original === '' ? (b === '' && entry.allowEmpty === true) : b.trim().length > 0, `${key}: empty Chinese text`);
    check(!/TODO|FIXME|待翻译|未翻译|\uFFFD/.test(b), `${key}: unfinished translation`);
    const literal = b.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
    const latin = literal.match(/\p{Script=Latin}+/gu) ?? [];
    check(latin.every(word => entry.allowedLatin?.includes(word)), `${key}: untranslated Latin text: ${latin.join(',')}`);
    if (/[A-Za-z]/.test(entry.original.replace(/%%|%(?:\.(?:\*|\d+))?[dfs]/g, '')) && !entry.allowedLatin?.length) {
      check(/\p{Script=Han}/u.test(b), `${key}: Chinese translation has no Han text`);
    }
    if (entry.allowedLatin) check(Boolean(entry.latinReason), `${key}: unjustified Latin exception`);
    let cursor = 0;
    const args = [];
    const normalized = entry.original.replace(/%%|%(?:\.(?:\*|\d+))?[dfs]/g, spec => {
      if (spec === '%%') return '%';
      const p = entry.placeholders[cursor++];
      check(p?.printf === spec, `${key}: original printf metadata differs`);
      check(p?.type === (spec.endsWith('s') ? 'string' : 'number'), `${key}: placeholder type differs`);
      if (!p) return '<missing>';
      if (spec === '%.*f') {
        check(p.precisionParam === p.name + 'Precision', `${key}: missing precision parameter`);
        args.push(p.precisionParam);
      } else if (spec.endsWith('f')) check(p.precision === Number(spec.slice(2, -1)), `${key}: fixed precision differs`);
      args.push(p.name);
      return `{${p.name}}`;
    });
    check(normalized === a, `${key}: English differs from original`);
    check(equal(args, entry.argumentOrder), `${key}: native argument order differs`);
    check(entry.originalFormat === (/%%|%(?:\.(?:\*|\d+))?[dfs]/.test(entry.original) ? entry.original : null), `${key}: originalFormat differs`);
    check(entry.sources.length > 0, `${key}: no sources`);
    const refs = entry.sources.map(s => s.ref);
    check(equal(en.sources[key], refs) && equal(zh.sources[key], refs), `${key}: provenance differs`);
    for (const source of entry.sources) {
      check(!coveredIds.has(source.id), `${source.id}: duplicate source`);
      coveredIds.add(source.id);
      coveredPaths.add(source.ref);
      const row = sourceRows.get(source.id);
      check(catalog.sourceToKey[source.id] === key, `${source.id}: wrong source mapping`);
      check(Boolean(row), `${source.id}: unknown source`);
      try {
        const value = dereference(source.ref);
        const original = typeof value === 'string' ? value : value.text;
        check(original === entry.original, `${source.id}: original/source differs`);
        check(source.evidence && Object.keys(source.evidence).length > 0, `${source.id}: no evidence`);
        if (row?.ref) {
          check(row.ref === source.ref, `${source.id}: source path differs`);
          const evidence = typeof value === 'string' ? { source: row.source } : value;
          check(equal(source.evidence, evidence), `${source.id}: reference evidence differs`);
        } else {
          check(value.id === source.id, `${source.id}: wrong inventory path`);
          check(equal(source.evidence, row?.sources), `${source.id}: native evidence differs`);
        }
        check(equal(source.lengthLimit, row?.lengthLimit), `${source.id}: length limit differs`);
      } catch { errors.push(`${source.id}: broken reference ${source.ref}`); }
    }
  }
  check(equal([...coveredIds].sort(), [...sourceRows.keys()].sort()), 'Catalog entries omit sources');
  for (const [alias, key] of Object.entries(catalog.aliases)) check(Object.hasOwn(catalog.entries, key), `${alias}: dangling alias`);
  // Independently walk the authoritative text objects: inventory omissions must fail too.
  function walk(value, path, file) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.text === 'string') check(coveredPaths.has(`${file}#${path}`), `Missing text object: ${file}#${path}`);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, file);
  }
  for (const file of ['data/enums.json', 'data/items.json', 'data/classes.json']) walk(data[file], '', file);
  const required = requiredCharacters(input);
  const cmap = new Set(font.codepoints);
  const missing = required.filter(c => !cmap.has(c));
  check(!missing.length, `Missing font glyphs: ${missing.map(c => `U+${c.toString(16)}`).join(', ')}`);
  check(equal(required, font.requiredCodepoints), 'Font input changed; regenerate subset');
  for (const cp of required) check(Number.isFinite(font.advanceWidths[cp]), `Missing metric: ${cp}`);
  check([0, 13, 14].every(id => font.nameRecords.some(n => n.nameID === id)), 'Font copyright/license records missing');
  return errors;
}

export function layoutReport(input) {
  const { en, zh, catalog, layout, inventory, font } = input;
  const measurements = [], unknown = [], seen = new Set();
  function inspect(id, sourceId, width, height, basis, dynamicHeight = false) {
    const key = catalog.sourceToKey[sourceId];
    if (!key) { unknown.push({ target: id, sourceId, reason: 'No translation mapping' }); return; }
    seen.add(sourceId);
    if (!Number.isFinite(width) || width <= 0) { unknown.push({ target: id, sourceId, key, reason: 'Unknown text width in ui-layout.json' }); return; }
    const entry = catalog.entries[key];
    for (const [locale, pack] of [['en', en], ['zh', zh]]) {
      const params = {};
      for (const p of entry.placeholders) {
        params[p.name] = p.type === 'string' ? (locale === 'en' ? 'Dragonkin' : '龙裔') : 999;
        if (p.precisionParam) params[p.precisionParam] = 1;
      }
      const text = formatMessage(pack.messages[key], entry, params);
      const textWidth = measureText(text, font);
      measurements.push({ target: id, sourceId, key, locale, text, widthPx: width, measuredWidthPx: textWidth,
        minimumLines: Math.ceil(textWidth / width), availableHeightPx: height, dynamicHeight,
        needsWrap: textWidth > width + 0.01, parameterSample: entry.placeholders.length ? params : null, basis });
    }
  }
  function walkElement(e, id = e.id) {
    if (e.stringId) inspect(id, e.stringId, e.rect?.w, e.rect?.h ?? null,
      'data/ui-layout.json element rectangle: outer width, no inferred text padding; font at 12px');
    for (const [i, variant] of (e.variants ?? []).entries()) walkElement({ ...e, ...variant, variants: [] }, `${id}.variant.${i}`);
  }
  for (const element of layout.elements) walkElement(element);
  // The formulas are U01 evidence, not hard-coded guessed character capacities.
  const helpPanel = layout.elements.find(e => e.id === 'help.panel');
  const helpText = layout.elements.find(e => e.id === 'help.text');
  const helpWidth = Number(helpPanel?.rectFormula?.match(/\bw=([\d.]+)/)?.[1]);
  const helpInset = Number(helpText?.rectFormula?.match(/relative x=([\d.]+)/)?.[1]);
  for (const row of inventory.strings.filter(s => s.id.startsWith('helpText.'))) {
    inspect('help.text', row.id, helpWidth - 2 * helpInset, null,
      'ui-layout help.panel w=313.6, help.text inset=19.2; symmetric inset estimate; height grows 16px per line', true);
  }
  // Retain explicit future maxChars/maxLines estimates without treating sourceChars as a limit.
  for (const row of [...inventory.strings, ...inventory.references, ...achievementSources(input.data['data/achievements.json'])]) {
    if (seen.has(row.id)) continue;
    const limit = row.lengthLimit;
    const chars = limit?.maxChars ?? limit?.estimatedCharsPerLine;
    if (Number.isFinite(chars)) {
      inspect('lengthLimit', row.id, chars * measureText('M', font),
        Number.isFinite(limit.maxLines) ? limit.maxLines * 12 : null,
        'Estimated capacity from U01 lengthLimit, using font advance of M; not a hard native bound', !limit.maxLines);
    } else unknown.push({ sourceId: row.id, key: catalog.sourceToKey[row.id], reason: limit?.basis ?? 'No measured container' });
  }
  return {
    fontSizePx: 12,
    method: 'Advance widths from output WOFF2; literal text/newline/tab handling. Width > container is a wrap warning, not an automatic failure. Outer rectangles do not prove inner padding. minimumLines is a lower bound, not a word-wrap simulation. Placeholder samples are not maximum possible runtime values.',
    measurements, overflows: measurements.filter(m => m.needsWrap), unknown,
  };
}

export function checkFiles(input = loadInputs()) {
  const errors = validate(input);
  if (sha(input.font.font) !== input.font.fontSha256) errors.push('Font binary/manifest SHA-256 differs');
  if (sha(input.font.source) !== input.font.sourceSha256) errors.push('Vendor font changed');
  for (const path of ['OFL.txt', 'LICENSES/galmuri/LICENSE.txt', 'LICENSES/cubic-11/OFL.txt', 'LICENSES/ark-pixel/OFL.txt']) {
    if (sha(`fonts/${path}`) !== sha(`fonts/vendor/${path}`)) errors.push(`License copy differs: ${path}`);
  }
  const report = errors.length ? null : layoutReport(input);
  return { errors, stats: { messages: Object.keys(input.en.messages).length,
    sources: Object.keys(input.catalog.sourceToKey).length, glyphs: input.font.codepoints.length,
    subsetBytes: input.font.subsetBytes, measurements: report?.measurements.length ?? 0,
    wrapWarnings: report?.overflows.length ?? 0, unknownLayouts: report?.unknown.length ?? 0 }, layout: report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkFiles();
  if (process.argv.includes('--write-report') && result.layout) {
    writeFileSync(resolve(root, 'tools/i18n/layout-report.json'), JSON.stringify(result.layout, null, 2) + '\n');
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else {
    console.log(JSON.stringify(result.stats, null, 2));
    for (const error of result.errors) console.error(error);
    for (const row of result.layout?.overflows ?? []) console.log(`WRAP ${row.locale} ${row.target} ${row.key}: ${row.measuredWidthPx}px > ${row.widthPx}px${row.dynamicHeight ? ' (dynamic height)' : ''}`);
    console.log(result.errors.length ? 'i18n check FAILED' : 'i18n check passed; unresolved layouts are reported, not certified.');
  }
  if (result.errors.length) process.exitCode = 1;
}
