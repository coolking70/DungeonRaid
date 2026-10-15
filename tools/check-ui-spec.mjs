#!/usr/bin/env node
// U01: structural/reference verification, not a declaration of pixel completeness.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const json = name => JSON.parse(read(name));
const input = {
  layout: json('data/ui-layout.json'),
  strings: json('data/ui-strings.json'),
  sounds: json('data/sounds.json'),
};
const nativeLibrary = readFileSync(resolve(root, 'reverse/native/libDungeonRaidJni.so'));
const fields = ['id', 'screen', 'type', 'rect', 'anchor', 'atlas', 'uv',
  'stringId', 'font', 'color', 'alpha', 'layer', 'touch', 'visibleWhen',
  'sounds', 'source', 'unresolved'];
const nonempty = x => typeof x === 'string' && x.length > 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);

function validate({ layout, strings, sounds }) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  function unique(rows, field, label) {
    const seen = new Set();
    for (const row of rows) {
      check(row[field] !== undefined && !seen.has(row[field]), `${label}: duplicate/missing ${field} ${row[field]}`);
      seen.add(row[field]);
    }
    return seen;
  }
  const stringIds = unique([...strings.strings, ...strings.references], 'id', 'strings');
  const soundNames = unique(sounds.sounds, 'name', 'sounds');
  unique(sounds.sounds, 'id', 'sounds');
  unique(layout.elements, 'id', 'elements');
  unique(layout.artSlots, 'id', 'artSlots');
  unique(sounds.callSites, 'id', 'callSites');
  unique(sounds.assemblyCallSites, 'elfInstructionAddress', 'assemblyCallSites');
  const fontIds = new Set(layout.fonts.map(f => f.id));
  const atlasIds = new Set(['tiles', 'menus', 'icons']);
  function rect(r, path, uv = false) {
    check(r && ['x', 'y', 'w', 'h'].every(k => finite(r[k])), `${path}: invalid rectangle`);
    if (!r || !['x', 'y', 'w', 'h'].every(k => finite(r[k]))) return;
    check(r.w >= 0 && r.h >= 0, `${path}: negative extent`);
    if (uv) check(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1024 && r.y + r.h <= 1024,
      `${path}: UV outside 1024 atlas`);
  }
  // Walk nested variants as well as base elements; references cannot hide in a variant.
  function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    for (const [key, value] of Object.entries(node)) {
      const p = `${path}.${key}`;
      if (key === 'stringId' && value !== null) check(stringIds.has(value), `${p}: unknown string ${value}`);
      if (key === 'sounds') {
        check(Array.isArray(value), `${p}: expected array`);
        if (Array.isArray(value)) for (const name of value) check(soundNames.has(name), `${p}: unknown sound ${name}`);
      }
      if (key === 'sound' && value !== null) check(soundNames.has(value), `${p}: unknown sound ${value}`);
      if (key === 'uv' && value !== null) rect(value, p, true);
      if (key === 'rect' && value !== null && typeof value !== 'string') rect(value, p);
      walk(value, p);
    }
  }
  for (const e of layout.elements) {
    for (const field of fields) check(Object.hasOwn(e, field), `${e.id}: missing ${field}`);
    for (const field of ['id', 'screen', 'type', 'visibleWhen']) check(nonempty(e[field]), `${e.id}: empty ${field}`);
    check(Array.isArray(e.source) && e.source.length > 0, `${e.id}: missing evidence`);
    check(Array.isArray(e.unresolved), `${e.id}: unresolved must be array`);
    if (e.rect === null) check(nonempty(e.rectFormula) || e.unresolved?.length > 0, `${e.id}: unexplained null rect`);
    for (const field of ['anchor', 'color', 'alpha']) {
      if (e[field] === null) check(e.unresolved?.length > 0, `${e.id}: unexplained null ${field}`);
    }
    check(e.font === null || fontIds.has(e.font), `${e.id}: unknown font`);
    check(e.atlas === null || atlasIds.has(e.atlas), `${e.id}: unknown atlas`);
    check(e.uv === null || e.atlas !== null, `${e.id}: UV without atlas`);
    check(e.alpha === null || (finite(e.alpha) && e.alpha >= 0 && e.alpha <= 255), `${e.id}: invalid alpha`);
    check(e.color === null || (Array.isArray(e.color) && e.color.length === 3 && e.color.every(c => finite(c) && c >= 0 && c <= 255)), `${e.id}: invalid color`);
    check(finite(e.layer), `${e.id}: invalid layer`);
    if (e.touch) check(nonempty(e.touch.action) && Object.hasOwn(e.touch, 'rect') && Object.hasOwn(e.touch, 'trigger'), `${e.id}: incomplete touch`);
  }
  walk(layout.elements, 'elements');
  walk(layout.artSlots, 'artSlots');
  walk(sounds.callSites, 'callSites');
  for (const s of strings.strings) {
    check(typeof s.text === 'string', `${s.id}: missing text`);
    check(s.sources?.length > 0 && s.usedBy?.length > 0 && s.lengthLimit?.basis, `${s.id}: missing source/usage/length basis`);
    for (const source of s.sources ?? []) {
      if (source.stringFileOffset) {
        const offset = Number(source.stringFileOffset);
        const end = nativeLibrary.indexOf(0, offset);
        check(Number.isInteger(offset) && offset >= 0 && end >= offset
          && nativeLibrary.subarray(offset, end).toString('utf8') === s.text,
        `${s.id}: native string offset/text mismatch`);
      }
    }
  }
  for (const ref of strings.references) {
    try {
      const [file, pointer] = ref.ref.split('#');
      check(file.startsWith('data/') && pointer?.startsWith('/'), `${ref.id}: invalid reference`);
      let value = json(file);
      for (const part of pointer.slice(1).split('/')) value = value[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      check(typeof value === 'string' || typeof value?.text === 'string', `${ref.id}: reference does not resolve to text`);
    } catch (error) { errors.push(`${ref.id}: broken reference (${error.message})`); }
  }
  const allFiles = sounds.sounds.flatMap(s => s.files);
  unique(allFiles, 'file', 'ogg files');
  check(sounds.soundCount === sounds.sounds.length, 'soundCount mismatch');
  check(sounds.fileCount === allFiles.length, 'fileCount mismatch');
  for (const s of sounds.sounds) {
    check(s.variations === s.files.length, `${s.name}: variation count mismatch`);
    s.files.forEach((f, i) => {
      check(f.file === `${s.name}${i + 1}.ogg`, `${s.name}: unexpected filename ${f.file}`);
      check(f.sampleRate > 0 && f.samples > 0 && Math.abs(f.durationSeconds - f.samples / f.sampleRate) < 1e-9, `${f.file}: invalid duration`);
    });
    const expected = sounds.callSites.filter(c => c.soundId === s.id).map(c => c.id).sort();
    check(JSON.stringify([...s.callSiteIds].sort()) === JSON.stringify(expected), `${s.name}: callSiteIds mismatch`);
  }
  const nativeFiles = readdirSync(resolve(root, 'reverse/apktool/res/raw')).filter(f => f.endsWith('.ogg')).sort();
  check(JSON.stringify(nativeFiles) === JSON.stringify(allFiles.map(f => f.file).sort()), 'OGG inventory mismatch');
  const eventNames = new Set([...read('src/core/combat.ts').matchAll(/type: '([^']+)'/g),
    ...read('src/core/board.ts').matchAll(/type: '([^']+)'/g)].map(m => m[1]));
  for (const c of sounds.callSites) {
    check(sounds.sounds.some(s => s.id === c.soundId && s.name === c.sound), `${c.id}: sound id/name mismatch`);
    check(read(c.sourceFile).split('\n')[c.line - 1]?.includes('QueueSound'), `${c.id}: source call missing`);
    for (const event of c.events) check(eventNames.has(event), `${c.id}: unknown engine event ${event}`);
  }
  const ghidraFiles = readdirSync(resolve(root, 'reverse/native/ghidra')).filter(f => f.endsWith('.c'));
  const nativeCalls = ghidraFiles.flatMap(file => read(`reverse/native/ghidra/${file}`).split('\n')
    .flatMap((line, i) => /(?:Game::)?QueueSound\s*\(/.test(line) && !/^\s*(\/|void|undefined)/.test(line)
      ? [`${file.slice(0, 8)}:${i + 1}`] : []));
  check(JSON.stringify(nativeCalls.sort()) === JSON.stringify(sounds.callSites.map(c => c.id).sort()), 'native QueueSound call coverage mismatch');
  for (const source of layout.sourceIndex) {
    const sourceLines = read(source.file).split('\n');
    for (const c of source.constants) check(sourceLines[c.line - 1]?.trim() === c.statement, `${source.file}:${c.line}: constant evidence changed`);
  }
  return errors;
}

const errors = validate(input);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${input.layout.elements.length} elements, ${input.layout.artSlots.length} art slots, ${input.strings.strings.length} strings + ${input.strings.references.length} references, ${input.sounds.soundCount} sounds / ${input.sounds.fileCount} OGGs / ${input.sounds.callSites.length} calls.`);
  const unresolved = input.layout.elements.filter(e => e.rect === null);
  console.log(`Coverage note: ${unresolved.length} null rects (${unresolved.filter(e => e.rectFormula).length} have formulas); unresolved fields remain. Schema PASS is not pixel-complete acceptance.`);
  if (process.argv.includes('--self-test')) {
    const cases = [
      ['missing field', x => { delete x.layout.elements[0].alpha; }, 'missing alpha'],
      ['missing string', x => { x.layout.elements[0].stringId = 'missing'; }, 'unknown string'],
      ['missing sound', x => { x.layout.elements[0].sounds = ['missing']; }, 'unknown sound'],
      ['base UV bounds', x => { x.layout.elements[0].uv.x = 1024; }, 'UV outside'],
      ['variant UV bounds', x => { x.layout.elements.find(e => e.variants).variants[0].uv.y = -1; }, 'UV outside'],
      ['broken text reference', x => { x.strings.references[0].ref = 'data/enums.json#/missing'; }, 'does not resolve'],
      ['duplicate element', x => { x.layout.elements.push(x.layout.elements[0]); }, 'duplicate/missing'],
      ['wrong sound mapping', x => { x.sounds.callSites[0].sound = 'click'; }, 'id/name mismatch'],
    ];
    for (const [name, mutate, message] of cases) {
      const fixture = structuredClone(input);
      mutate(fixture);
      assert(validate(fixture).some(e => e.includes(message)), `checker failed to reject ${name}`);
    }
    console.log(`PASS: ${cases.length} in-memory negative fixtures rejected; no files modified.`);
  }
}
