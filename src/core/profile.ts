import { cloneData } from './clone';
import { applyAchievementRequests, classAchievementRequests } from './achievements';
import { Difficulty, GameMode, scoringData } from './data';
import { iadd } from './num';
import { getScore, scoreBreakdown, scoreCategory } from './scoring';
import type { GameEvent } from './engine';
import type { Four, ProfileState, RunState, ScoreRecord } from './state';

export const classLevelsFromProfile = (profile: ProfileState): number[] => profile.classes.map(cls => cls.level);
/** Called before NewGame, including after app restart. NewGame preserves both snapshots. */
export function prepareNewRun(profile: ProfileState, state: RunState): RunState {
  const result = cloneData(state);
  result.classLevels = classLevelsFromProfile(profile);
  result.trophies.remaining = result.options.trophyInterval === 'carry-across-runs' ? profile.trophyRemaining : 0;
  return result;
}
/** ProcessInput / LevelUp. Duplicate delivery is harmless; incompatible stale transitions reject. */
export function applyClassLevelChanged(profile: ProfileState, event: Extract<GameEvent, { type: 'ClassLevelChanged' }>, difficulty: number): ProfileState {
  const result = cloneData(profile), cls = result.classes[event.classId];
  if (!cls || !Number.isInteger(event.after) || event.after < 1 || event.after > 10 || event.after !== event.before + 1) throw new RangeError('Invalid class level event');
  if (cls.level === event.after) return result;
  if (cls.level !== event.before) throw new Error('Class level event does not match profile');
  cls.level = event.after;
  return applyAchievementRequests(result, difficulty, classAchievementRequests(classLevelsFromProfile(result), event.classId)).profile;
}
/** AddScore @0x5cc5c: equal scores follow older entries; even a low score replaces slot 9. */
export function addScore(profile: ProfileState, category: number, record: ScoreRecord): ProfileState {
  if (!Number.isInteger(category) || category < 0 || category >= 6) throw new RangeError('Invalid score category');
  const result = cloneData(profile), list = result.highScores[category]!;
  const above = list.findIndex(old => old.score < record.score);
  const index = Math.min(above < 0 ? list.length : above, scoringData.leaderboardLimit - 1);
  list.splice(index, 0, cloneData(record)); list.length = Math.min(list.length, scoringData.leaderboardLimit);
  // Native ScoreScreen+f24/f28 is one global category/index pair.
  result.lastScoreIndices.fill(null);
  result.lastScoreIndices[category] = index;
  return result;
}
/** CheckEndGame @0x2f960: one application per completed run (caller transaction boundary).
 * Pass the undrained final queue, or a state returned by consumeAchievements. */
export function applyRunResult(profile: ProfileState, finalRunState: RunState): ProfileState {
  const s = finalRunState;
  if (s.phase !== 'ended' || !s.outcome) throw new Error('Run result requires a completed run');
  let result = cloneData(profile);
  result.classes.forEach((cls, id) => { cls.level = Math.max(cls.level, s.classLevels[id]!); });
  const cls = result.classes[s.character.classId]!;
  cls.games = iadd(cls.games, 1); cls.kills = iadd(cls.kills, s.kills.total);
  const score = getScore(s), breakdown = scoreBreakdown(s);
  if (s.mode === GameMode.MODE_CLASSIC && s.difficulty !== Difficulty.DIFF_EASY) {
    const index = s.difficulty - Difficulty.DIFF_NORMAL;
    cls.bestScores[index] = Math.max(cls.bestScores[index]!, score);
  }
  const values = s.mode === GameMode.MODE_PRETZEL
    ? { xp: s.pretzel.averageTimes10, gold: s.pretzel.maxCrosses, upgrade: s.pretzel.scoringChains }
    : s.mode === GameMode.MODE_SPRINT ? breakdown.contributions : breakdown.resources;
  result = addScore(result, scoreCategory(s), { name: profile.playerName, turn: s.turn, xp: values.xp, gold: values.gold, upgrade: values.upgrade, score, skills: s.skills.map(k => k?.id ?? null) as Four<number | null> });
  result.trophyRemaining = s.trophies.remaining;
  result = applyAchievementRequests(result, s.difficulty, s.achievementQueue).profile;
  return result;
}
