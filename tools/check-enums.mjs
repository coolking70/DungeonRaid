// T01: independently verify every SWIG enum, including JNI-valued constants.
// Run from any directory: node tools/check-enums.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapperDir = path.join(root, 'reverse/jadx/sources/com/fireflame/dungeonraid/wrappers');
const nativeDir = path.join(root, 'reverse/native/ghidra');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/enums.json'), 'utf8'));
const binary = fs.readFileSync(path.join(root, 'reverse/native/libDungeonRaidJni.so'));
const found = [];
let total = 0;
let texts = 0;
function checkTextFields(entry, label) {
  for (const field of Object.values(entry)) {
    if (!field || typeof field !== 'object' || !('text' in field)) continue;
    assert.ok(field.source);
    const offsets = field.stringFileOffsets ?? [field.stringFileOffset];
    assert.ok(offsets.length > 0);
    for (const offset of offsets) {
      const start = Number(offset);
      assert.ok(Number.isInteger(start) && start >= 0 && start < binary.length);
      const end = binary.indexOf(0, start);
      assert.notEqual(end, -1);
      assert.equal(binary.subarray(start, end).toString('utf8'), field.text, `${label}: native text @${offset}`);
    }
    texts++;
  }
}
for (const file of fs.readdirSync(wrapperDir).filter(f => f.endsWith('.java')).sort()) {
  const type = file.slice(0, -5);
  const source = fs.readFileSync(path.join(wrapperDir, file), 'utf8');
  const swig = source.match(new RegExp(`private static ${type}\\[\\] swigValues = \\{([^}]+)\\}`));
  if (!swig) continue;
  found.push(type);
  const orderedNames = swig[1].split(',').map(s => s.trim());
  const entries = data.enums[type];
  assert.ok(entries, `Missing enum ${type}`);
  assert.deepEqual(entries.map(e => e.name), orderedNames, `${type}: count/order/name`);
  let next = 0;
  const seen = new Map();
  for (const [i, name] of orderedNames.entries()) {
    const decl = source.match(new RegExp(`public static final ${type} ${name} = new ${type}\\("${name}"(?:, ([^;]+))?\\);`));
    assert.ok(decl, `${type}.${name}: declaration`);
    let value = next;
    if (decl[1]) {
      const arg = decl[1];
      if (arg.startsWith('DungeonRaidJNI.')) {
        const getter = arg.slice('DungeonRaidJNI.'.length, -2).replaceAll('_', '_1');
        const matches = fs.readdirSync(nativeDir).filter(f => f.endsWith(`_DungeonRaidJNI_${getter}.c`));
        assert.equal(matches.length, 1);
        const c = fs.readFileSync(path.join(nativeDir, matches[0]), 'utf8');
        value = Number(c.match(/return (0x[0-9a-f]+|[0-9]+);/)[1]);
      } else if (seen.has(arg)) value = seen.get(arg);
      else {
        assert.match(arg, /^(?:-?\d+|0x[\da-f]+)$/i);
        value = Number(arg);
      }
    }
    assert.equal(entries[i].value, value, `${type}.${name}: integer value`);
    assert.ok(entries[i].evidence, `${name}: evidence`);
    assert.ok('displayName' in entries[i] && 'description' in entries[i]);
    checkTextFields(entries[i], name);
    seen.set(name, value);
    next = value + 1;
  }
  total += entries.length;
  console.log(`${type}: ${entries.length}/${orderedNames.length} names and values OK`);
}
assert.deepEqual(Object.keys(data.enums).sort(), found.sort(), 'extra/missing enum files');
assert.deepEqual(data.nativeOnlySkillSlots.map(s => s.value), [40, 41]);
assert.equal(data.enums.SkillType.find(s => s.name === 'SKILL_COUNT').displayName, null);
for (const slot of data.nativeOnlySkillSlots) checkTextFields(slot, `native skill ${slot.value}`);
console.log(`PASS: ${found.length} enums, ${total} entries, ${texts} native text fields`);
