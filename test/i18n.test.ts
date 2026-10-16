import { describe, expect, it } from 'vitest';
import { checkFiles, layoutReport, loadInputs, measureText, requiredCharacters, validate } from '../tools/i18n/check.mjs';
import { createI18n } from '../tools/i18n/runtime.mjs';

const input = loadInputs();
const clone = () => structuredClone(input);

describe('L01 bilingual source catalog', () => {
  it('passes the shared source, placeholder, Chinese and font checks', () => {
    const result = checkFiles(input);
    expect(result.errors).toEqual([]);
    expect(result.stats.messages).toBe(1191);
    expect(result.stats.sources).toBe(1708);
  });

  it('detects omissions, altered originals, missing arguments and residual English', () => {
    const missing = clone();
    delete missing.zh.messages['ui.menu.newGame'];
    expect(validate(missing)).toContain('Locale key sets differ');
    const english = clone();
    english.en.messages['ui.menu.newGame'] = 'Start Game';
    expect(validate(english)).toContain('ui.menu.newGame: English differs from original');
    const parameter = clone();
    parameter.zh.messages['ui.level'] = '等级';
    expect(validate(parameter)).toContain('ui.level: placeholders differ');
    const untranslated = clone();
    untranslated.zh.messages['ui.menu.newGame'] = '新 Game';
    expect(validate(untranslated).some(e => e.includes('untranslated Latin text'))).toBe(true);
  });

  it('requires every source even if both languages lose the same entry', () => {
    const broken = clone();
    const key = 'ui.menu.newGame';
    delete broken.en.messages[key];
    delete broken.zh.messages[key];
    delete broken.en.sources[key];
    delete broken.zh.sources[key];
    delete broken.catalog.entries[key];
    expect(validate(broken)).toContain('Catalog entries omit sources');
  });

  it('covers 32 special enemies, 42 native skills, 10 classes/races and 20 perks/flaws', () => {
    const i18n = createI18n(input);
    for (const [prefix, count, start] of [
      ['enemy', 32, 1], ['skill', 42, 0], ['class', 10, 0], ['race', 10, 0],
      ['perk', 10, 0], ['flaw', 10, 0],
    ] as const) {
      for (let id = start; id < start + count; id++) {
        const key = `${prefix}.${id}.name`;
        expect(i18n.t(key)).not.toBe(key);
        expect(i18n.t(key)).toMatch(/\p{Script=Han}/u);
      }
    }
    expect(i18n.t('skill.40.name')).toBe('震击');
    expect(i18n.t('skill.41.name')).toBe('震慑');
  });
});

describe('L01 U02 reference adapter', () => {
  it('defaults to Chinese, switches languages, resolves source IDs, and preserves blank keys', () => {
    const i18n = createI18n(input);
    expect(i18n.locale).toBe('zh');
    expect(i18n.t('ui.menu.newGame')).toBe('新游戏');
    expect(i18n.t('baked.2')).toBe('新游戏');
    i18n.setLocale('en');
    expect(i18n.t('ui.menu.newGame')).toBe('New Game');
    const blank = Object.keys(input.en.messages).find(k => input.en.messages[k] === '')!;
    expect(i18n.t(blank)).toBe('');
    expect(i18n.t('unknown.key')).toBe('unknown.key');
    i18n.setLocale('unsupported');
    expect(i18n.locale).toBe('zh');
    const partial = clone();
    delete partial.zh.messages['ui.menu.newGame'];
    expect(createI18n(partial).t('ui.menu.newGame')).toBe('New Game');
  });

  it('formats named numeric values and preserves native decimal precision', () => {
    const i18n = createI18n(input);
    expect(i18n.t('ui.level', { level: 7 })).toBe('7级');
    expect(i18n.t('ui.debug.fps', { fps: 59.96 })).toBe('帧率：60.0');
    const entry = Object.entries(input.catalog.entries).find(([, e]) => e.original === '+%.*f Gold per coin')!;
    expect(i18n.t(entry[0], { value: 1.25, valuePrecision: 1 })).toBe('每枚钱币+1.3金币');
    i18n.setLocale('en');
    expect(i18n.t(entry[0], { value: 1.25, valuePrecision: 2 })).toBe('+1.25 Gold per coin');
    const percent = Object.entries(input.catalog.entries).find(([, e]) => e.original === '%d%%')![0];
    expect(i18n.t(percent, { value: 25 })).toBe('25%');
    expect(() => i18n.t('ui.level')).toThrow('Missing i18n parameter');
    expect(() => i18n.t(entry[0], { value: 1.25 })).toThrow('Invalid i18n precision');
  });

  it('joins translated prefixes and nouns, and safely interpolates literal names', () => {
    const i18n = createI18n(input);
    expect(i18n.t('item.name.format', { prefix: '传奇', noun: '长剑' })).toBe('传奇长剑');
    expect(i18n.t('ui.enemy.mortal', { enemy: '$&{class}' })).toBe('$&{class}（宿敌）');
    i18n.setLocale('en');
    expect(i18n.t('item.name.format', { prefix: 'Legendary', noun: 'Longsword' })).toBe('Legendary  Longsword');
  });
});

describe('L01 font coverage and layout estimates', () => {
  it('covers all bilingual characters and fixed symbols using the exported output cmap', () => {
    const codepoints = new Set(input.font.codepoints);
    expect(requiredCharacters(input).filter(cp => !codepoints.has(cp))).toEqual([]);
    const broken = clone();
    broken.font.codepoints = broken.font.codepoints.filter(cp => cp !== '地'.codePointAt(0));
    expect(validate(broken).some(e => e.startsWith('Missing font glyphs:'))).toBe(true);
    const stale = clone();
    stale.font.fontSha256 = 'stale';
    expect(checkFiles(stale).errors).toContain('Font binary/manifest SHA-256 differs');
  });

  it('measures proportional advances and reports overflowing text without certifying unknown widths', () => {
    expect(measureText('护甲', input.font)).toBe(24);
    expect(measureText('ii', input.font)).toBeLessThan(measureText('WW', input.font));
    const report = layoutReport(input);
    expect(report.overflows.some(r => r.target === 'main.confirmation' && r.locale === 'en')).toBe(true);
    expect(report.overflows.some(r => r.sourceId === 'helpText.17' && r.dynamicHeight)).toBe(true);
    expect(report.unknown.some(r => r.target === 'hud.health-value')).toBe(true);
    const narrow = clone();
    narrow.layout.elements.find(e => e.id === 'main.new')!.rect!.w = 12;
    expect(layoutReport(narrow).overflows.some(r => r.target === 'main.new' && r.locale === 'zh')).toBe(true);
  });
});
