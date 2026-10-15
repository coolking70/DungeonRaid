#!/usr/bin/env node
// T02 data integrity, source bytes and coverage. Does not execute the game engine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p));
const json = p => JSON.parse(read(p));
const enums = json('data/enums.json').enums;
const items = json('data/items.json');
const classes = json('data/classes.json');
const elf = read('reverse/native/libDungeonRaidJni.so');
const allNames = new Map(Object.entries(enums).flatMap(([type, entries]) =>
  entries.map(e => [e.name, { type, value: e.value }])));
let refs = 0, strings = 0;
function walk(x, path) {
  if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${path}[${i}]`));
  if (!x || typeof x !== 'object') return;
  if ('enum' in x) {
    assert(enums[x.enum], `${path}: unknown enum type ${x.enum}`);
    const match = enums[x.enum].find(e => e.name === x.name);
    assert(match && match.value === x.value, `${path}: invalid enum reference`);
    refs++;
  } else if ('name' in x && 'value' in x) {
    const e = allNames.get(x.name);
    assert(e && e.value === x.value, `${path}: unknown copied enum member`);
    refs++;
  }
  if ('stringFileOffset' in x) {
    const p = Number(x.stringFileOffset);
    assert(Number.isInteger(p) && p >= 0 && p < elf.length, `${path}: bad string offset`);
    const end = elf.indexOf(0, p);
    assert(end >= p, `${path}: unterminated source string`);
    assert.equal(elf.subarray(p, end).toString('utf8'), x.text, `${path}: source string mismatch`);
    strings++;
  }
  Object.entries(x).forEach(([k, v]) => walk(v, `${path}.${k}`));
}
walk(items, 'items'); walk(classes, 'classes');
const sequence = (xs, n, field) => assert.deepEqual(xs.map(field), Array.from({length:n}, (_, i) => i));
sequence(classes.classes, 10, c => c.class.value);
sequence(classes.races, 10, r => r.race.value);
sequence(classes.skills, 42, s => s.nativeId);
sequence(items.slots, 5, s => s.itemType.value);
sequence(items.upgrades, 20, u => u.nativeId);
assert.equal(classes.perks.length, 10); assert.equal(classes.flaws.length, 10);
assert.equal(enums.Achievement.length, 78);
assert.equal(classes.skills.filter(s => s.skill !== null).length, 40);
const skillEnum = enums.SkillType.filter(s => s.value >= 0 && s.value < 40);
assert.equal(skillEnum.length, 40);
const expectedCooldowns = [13,16,15,16,18,18,15,20,18,18,35,12,18,15,25,15,14,15,15,15,18,20,18,15,25,14,12,16,14,20,24,15,15,-1,14,12,25,35,18,16,14,14];
assert.deepEqual(classes.skills.map(s => s.baseCooldown), expectedCooldowns);
classes.skills.forEach(s => {
  assert.equal(elf.readInt32LE(Number(s.cooldownSource.fileOffset)), s.baseCooldown);
  assert.equal(s.normallyObtainable, s.nativeId < 40);
  if (s.nativeId < 40) assert.equal(s.skill.value, s.nativeId);
  else assert.equal(s.skill, null, 'native 40/41 must not invent wrapper enum references');
});
classes.classes.forEach(c => {
  assert.equal(c.baseSkillVector.length, 20);
  assert.equal(new Set(c.baseSkillVector.map(s => s.value)).size, 20);
  assert.deepEqual(c.initialEquippedSkills, []);
  if (c.class.value) assert.equal(c.firstLevelRewardSkill.value, 30 + c.class.value);
  else assert.equal(c.firstLevelRewardSkill, null);
});
assert.deepEqual(classes.statIncrements.values, [1,1,5,1]);
assert.deepEqual(classes.races.map(r => r.mortalEnemy.value), [0,9,14,13,16,12,5,20,8,19]);
const expectedPools = [[0,1,2,3,4,6,8,9],[6,7,10,11,12,13,17],[10,11,12,14,15,17,18,19],[0,1,11,12,13,15,16],[5,8,9,10,17,18,19]];
const expectedRanges = [[0,79],[80,159],[240,319],[160,239],[320,399]];
items.slots.forEach((s,i) => {
  assert.equal(s.initialStats.length, 20);
  assert(s.initialStats.every(n => Number.isInteger(n) && n >= 0));
  assert.deepEqual(s.upgradePool, expectedPools[i]);
  assert.deepEqual(s.iconRangeInclusive, expectedRanges[i]);
  assert.deepEqual(s.upgradeWeights, s.upgradePool.map(nativeStatId => ({nativeStatId, weight:1})));
});
items.upgrades.forEach(u => {
  assert.equal(Number(u.itemOffset), 0x94 + u.nativeId * 4);
  assert(u.stepSource && u.upgradeStep && u.downgradeStep && u.eligibility);
});
const nameCounts = {m_namesSword1:15,m_namesSword2:12,m_namesMace:13,m_namesHammer:12,m_namesAxe:15,m_namesHelm:17,m_namesShield:16,m_namesArmour:17,m_namesAmulet:14,m_namesRing:11,m_namesCharm:14,m_namesRune:16,m_namesPotion:16,m_prefixes:148};
assert.deepEqual(Object.fromEntries(Object.entries(items.names).map(([k,v]) => [k,v.length])), nameCounts);
assert.equal(items.nameMappings.length, 13);
for (const m of items.nameMappings) {
  assert(items.names[m.pool], `missing name pool ${m.pool}`);
  assert(m.iconStart < m.iconEndExclusive);
}
for (let icon=0; icon<400; icon++) assert.equal(items.nameMappings.filter(m => m.iconStart<=icon && icon<m.iconEndExclusive).length, 1);
const cases = read('docs/spec/07-test-cases.md').toString();
const ids = [...cases.matchAll(/^\| ([CEPS]\d{2})\b/gm)].map(m => m[1]);
assert(ids.length >= 40); assert.equal(ids.length, new Set(ids).size);
for (let i=1; i<=32; i++) assert(ids.includes(`E${String(i).padStart(2,'0')}`));
const achievementDoc = read('docs/spec/06-score-and-save.md').toString();
for (const a of enums.Achievement) assert(achievementDoc.includes(`| ${a.value} ${a.name} |`), `missing achievement ${a.name}`);
for (const x of [items, classes]) assert(x._source.functions.length && x._source.generator);
console.log(`OK: ${refs} enum references; ${strings} source strings; 10 classes, 10 races, 42 native / 40 wrapper skills`);
console.log(`OK: 5 slots, 20 upgrades, ${Object.keys(nameCounts).length} name pools; ${ids.length} behavior cases; 32 special enemies; 78 achievement rows`);
