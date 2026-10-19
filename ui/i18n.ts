import runtime from './generated/runtime.json';
import type { StoragePort } from './storage';
export type Language = 'zh' | 'en';
export type Dictionary = Record<string, string>;
/** Accept a flat catalogue or {strings/entries/translations:{key:string|{text,value}}}. */
export function dictionary(raw: unknown): Dictionary {
  if (!raw || typeof raw !== 'object') return {};
  const object = raw as Record<string, unknown>;
  const source = object.messages ?? object.strings ?? object.entries ?? object.translations ?? object;
  const out: Dictionary = {};
  for (const [key, value] of Object.entries(source as object)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'string') out[key] = value;
    else if (value && typeof value === 'object') {
      const v = value as { text?: unknown; value?: unknown; id?: string };
      if (typeof v.text === 'string' || typeof v.value === 'string') out[v.id ?? key] = String(v.text ?? v.value);
    }
  }
  return out;
}
const fallback: Dictionary = runtime.fallback;
// Port-only UI copy, not claims about original wording/layout. L01 keys take precedence.
const local: Record<Language, Dictionary> = {
  en: {
    'trophy.remaining':'Trophy kills remaining', 'trophy.easy':'Disabled on Easy', 'trophy.limit':'Run limit reached', 'trophy.complete':'No eligible classes',
    'trophy.nextRun':'Saved progress for your next run. Choose non-Easy difficulty and a class that can still earn trophies. Dungeon Sprint advances the counter randomly, so more kills may be needed.',
    'trophy.minimum':'At least {count} qualifying special-enemy kills; the exact number is random.',
    'trophy.count':'{count} qualifying special-enemy kills remaining.',
    'trophy.sprint':'Dungeon Sprint: each kill has a 50/101 chance to advance the counter. ≥ shows a minimum, not a guaranteed kill count. A counter already at zero drops on the next qualifying kill.',
    'trophy.rules':'Tap this row for details. Only special enemies that grant kill rewards count. At most 3 trophies drop per run, and a locked class or an upgradable current class must remain. The counter resets when a trophy appears, even before collection, and carries across runs.',
    damage: 'Damage', settings: 'Settings', language: 'Language', volume: 'Volume', confirm: 'Confirm', main: 'Main Menu', over: 'Game Over', score: 'Score', turn: 'Turn', level: 'Level', saved: 'Profile updated', hint: 'Connect 3 or more adjacent matching tiles', empty: 'Empty', abandon: 'Start a new game?', noMove: 'No legal chain. Try a skill or start again.', error: 'Action could not complete', save: 'Save game', stats: 'Stats', close: 'Close', profile: 'Games played', subtitle: 'A dungeon, one chain at a time' },
  zh: {
    'trophy.remaining':'下次奖杯需击杀', 'trophy.easy':'简单难度不掉落', 'trophy.limit':'本局已达上限', 'trophy.complete':'无可成长职业',
    'trophy.nextRun':'这是跨局保存的进度。新局需选择非简单难度和仍可获得奖杯的职业；地牢冲刺按概率推进计数，实际击杀数可能更多。',
    'trophy.minimum':'最少还需击杀 {count} 个有效特殊敌人，实际数量由概率计数决定。',
    'trophy.count':'还需击杀 {count} 个进入正常奖励结算的特殊敌人。',
    'trophy.sprint':'地牢冲刺：每次击杀有50/101的概率推进计数。“≥”表示最少击杀数，不保证击杀这些数量后掉落。计数已为0时，下次有效击杀即可掉落。',
    'trophy.rules':'点按此行查看说明。普通骷髅不计数。每局最多掉落3个，且需有未解锁职业或当前职业可升级。奖杯生成时即重置计数，未领取也一样；计数跨局保存。',
    damage: '伤害', settings: '设置', language: '语言', volume: '音量', confirm: '确认', main: '主菜单', over: '游戏结束', score: '分数', turn: '回合', level: '等级', saved: '档案已更新', hint: '拖动连接至少三个相邻同类格子', empty: '空', abandon: '开始新的一局？', noMove: '没有可连的线，可尝试技能或重新开局', error: '操作未完成', save: '保存对局', stats: '属性', close: '关闭', profile: '完成局数', subtitle: '探索地牢，从一次连线开始' },
};
export class I18n {
  language: Language = 'zh';
  private catalogues: Record<Language, Dictionary> = { en: {}, zh: {} };
  private aliases: Record<string, string> = {};
  private metadata: Record<string, { placeholders?: { name: string; type: string; printf: string; precision?: number; precisionParam?: string }[] }> = {};
  installCatalog(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const c = raw as { aliases?: Record<string, string>; sourceToKey?: Record<string, string>; entries?: Record<string, { placeholders?: { name: string; type: string; printf: string; precision?: number; precisionParam?: string }[] }> };
    this.aliases = { ...c.sourceToKey, ...c.aliases }; this.metadata = c.entries ?? {};
  }
  constructor(readonly storage: StoragePort) {
    try { if (storage.getItem('dungeonraid.language') === 'en') this.language = 'en'; } catch { /* optional preferences */ }
  }
  install(language: Language, raw: unknown) { this.catalogues[language] = dictionary(raw); }
  setLanguage(language: Language) {
    this.language = language;
    try { this.storage.setItem('dungeonraid.language', language); } catch { /* memory-only */ }
  }
  /** Translate source display names through L01; no English concatenation in UI. */
  source(english: string, params: Record<string, string | number> = {}): string {
    const key = Object.keys(this.catalogues.en).find(k => this.catalogues.en[k] === english);
    return key ? this.t(key, params) : english;
  }
  t(key: string, params: Record<string, string | number> = {}): string {
    const sourceKey = key; key = this.aliases[key] ?? key;
    const value = this.catalogues[this.language][key] ?? this.catalogues.en[key] ?? local[this.language][key] ?? fallback[sourceKey] ?? sourceKey;
    const entry = this.metadata[key];
    if (entry?.placeholders) {
      const formatted: Record<string, string> = {};
      for (const p of entry.placeholders) {
        const v = params[p.name];
        if (v === undefined) throw new Error(`Missing i18n parameter: ${p.name}`);
        if (p.type === 'string') {
          if (typeof v !== 'string') throw new TypeError(`Expected string: ${p.name}`);
          formatted[p.name] = v;
        } else {
          if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`Expected finite number: ${p.name}`);
          if (p.printf === '%d') formatted[p.name] = String(Math.trunc(v));
          else {
            const digits = p.precisionParam ? params[p.precisionParam] : p.precision;
            if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 100) throw new RangeError('Invalid i18n precision');
            formatted[p.name] = v.toFixed(digits);
          }
        }
      }
      return value.replace(/\{(\w+)\}/g, (match, name: string) => formatted[name] ?? match);
    }
    let index = 0;
    return value.replace(/\{(\w+)\}|%(?:\d+\$)?(?:\.\d+)?[dsf]/g, (match, name: string | undefined) => {
      const v = params[name ?? String(index++)]; return v === undefined ? match : String(v);
    });
  }
}
