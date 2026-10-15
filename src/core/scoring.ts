import { Difficulty, GameMode, scoringData } from './data';
import { iadd, idiv, imul } from './num';
import { labelDraw } from './cosmetics';
import type { RuleContext } from './combat';
import type { RunState } from './state';

/** ProcessPretzels @0x2bcd8: repeated diagonal cell keys, including ignored nodes. */
export function pretzelChain(s: RunState, nodes: readonly number[] = s.chain.nodes): { crosses: number; points: number; rating: number } {
  const seen = new Set<number>(); let crosses = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = s.board[nodes[i - 1]!]!, b = s.board[nodes[i]!]!;
    if (a.x === b.x || a.y === b.y) continue;
    const key = Math.min(a.x, b.x) + 6 * Math.min(a.y, b.y);
    if (seen.has(key)) crosses++; else seen.add(key);
  }
  return { crosses, ...pretzelPoints(crosses) };
}
export function pretzelPoints(crosses: number): { points: number; rating: number } {
  const d = scoringData.pretzel, rating = d.thresholds.filter(t => crosses >= t).length;
  return { rating, points: rating === d.thresholds.length ? d.legendPoints : imul(crosses, d.multipliers[rating]!) };
}
export function processPretzels(s: RunState): void {
  const p = pretzelChain(s);
  s.pretzel.crosses = p.crosses;
  s.pretzel.preview = s.mode === GameMode.MODE_PRETZEL ? p.points : 0;
  s.pretzel.rating = s.mode === GameMode.MODE_PRETZEL ? p.rating : 0;
}
/** MatchTiles @0x31bcc; only scoring Pretzel chains contribute to the truncated mean. */
export function settlePretzels(s: RunState, c: RuleContext): void {
  const p = pretzelChain(s), d = scoringData.pretzel;
  if (p.crosses > d.achievementAbove) s.achievementQueue.push({ id: 75, progress: 100 });
  if (s.mode !== GameMode.MODE_PRETZEL) return;
  if (p.points > 0) {
    const old = s.pretzel;
    old.maxCrosses = Math.max(old.maxCrosses, p.crosses);
    old.averageTimes10 = idiv(iadd(imul(old.averageTimes10, old.scoringChains), imul(p.crosses, d.averageScale)), iadd(old.scoringChains, 1));
    old.scoringChains = iadd(old.scoringChains, 1);
    if (p.rating === d.thresholds.length) s.achievementQueue.push({ id: 77, progress: 100 });
    const label = d.labelTypes[p.rating]; if (label != null) labelDraw(c.rng, label);
  }
  s.pretzel.score = iadd(s.pretzel.score, p.points);
  c.events.push({ type: 'PretzelScored', ...p, total: s.pretzel.score, averageTimes10: s.pretzel.averageTimes10 });
  s.pretzel.preview = s.pretzel.rating = 0;
}
export interface ScoreBreakdown {
  mode: number; score: number; turn: number;
  resources: { xp: number; gold: number; upgrade: number };
  contributions: { xp: number; gold: number; upgrade: number; turns: number; skills: number; pretzels: number };
  multiplier: number;
  pretzel: { averageTimes10: number; maxCrosses: number; scoringChains: number; bestChainRating: number } | null;
}
/** GetScore @0x2f868. Separate per-resource truncation is deliberate. */
export function scoreBreakdown(s: RunState): ScoreBreakdown {
  const resources = { xp: iadd(s.resources.xp.banked, s.resources.xp.remainder), gold: iadd(s.resources.gold.banked, s.resources.gold.remainder), upgrade: iadd(s.resources.upgrade.banked, s.resources.upgrade.remainder) };
  const contributions = { xp: 0, gold: 0, upgrade: 0, turns: 0, skills: 0, pretzels: 0 };
  let multiplier = 1;
  if (s.mode === GameMode.MODE_CLASSIC) {
    Object.assign(contributions, resources, { turns: s.turn, skills: s.skills.reduce((sum, skill) => iadd(sum, skill ? imul(skill.level, scoringData.skillLevelPoints) : 0), 0) });
  } else if (s.mode === GameMode.MODE_SPRINT) {
    for (const key of ['xp', 'gold', 'upgrade'] as const) contributions[key] = idiv(resources[key], scoringData.sprintDivisor);
    multiplier = s.sprintWon ? scoringData.sprintVictoryMultiplier : 1;
  } else if (s.mode === GameMode.MODE_PRETZEL) contributions.pretzels = s.pretzel.score;
  else throw new RangeError('Invalid score mode');
  return { mode: s.mode, score: imul(Object.values(contributions).reduce(iadd, 0), multiplier), turn: s.turn, resources, contributions, multiplier,
    // Native rating applies to a CHAIN. Do not invent an overall-run rating formula.
    pretzel: s.mode === GameMode.MODE_PRETZEL ? { averageTimes10: s.pretzel.averageTimes10, maxCrosses: s.pretzel.maxCrosses, scoringChains: s.pretzel.scoringChains, bestChainRating: pretzelPoints(s.pretzel.maxCrosses).rating } : null };
}
export const getScore = (s: RunState): number => scoreBreakdown(s).score;
export const scoreCategory = (s: RunState): number => s.mode === GameMode.MODE_CLASSIC ? s.difficulty - Difficulty.DIFF_EASY : s.mode + 4;
