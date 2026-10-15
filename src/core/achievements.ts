import { classData, Difficulty, scoringData } from './data';
import { fadd } from './num';
import type { ProfileState, RunState } from './state';
export interface AchievementRequest { id: number; progress: number }
export interface AchievementProgress { type: 'AchievementProgress'; id: number; before: number; after: number; unlocked: boolean }
/** QueueAchievement @0x281cc. A1/45 deliberately has no unlock path. */
export function allowedAchievement(difficulty: number, id: number): boolean {
  return id > 0 && id <= 77 && id !== 45 && (difficulty !== Difficulty.DIFF_EASY || id === 67);
}
/** Java DungeonRaidSurfaceView increment + cap. Repeated increments are real progress,
 * not duplicates; completed unlocks generate no additional notifications. */
export function applyAchievementRequests(profile: ProfileState, difficulty: number, requests: readonly AchievementRequest[]): { profile: ProfileState; events: AchievementProgress[] } {
  const result = structuredClone(profile), events: AchievementProgress[] = [];
  const before = { ...profile.achievements };
  for (const { id, progress } of requests) {
    if (!Number.isInteger(id) || id < 0 || id > 77 || !Number.isFinite(progress) || progress < 0 || progress > 100) throw new RangeError('Invalid achievement request');
    if (!allowedAchievement(difficulty, id)) continue;
    const old = result.achievements[id] ?? 0;
    result.achievements[id] = Math.min(100, fadd(old, progress));
  }
  for (const key of Object.keys(result.achievements)) {
    const id = Number(key), old = before[id] ?? 0, after = result.achievements[id]!;
    if (after > old) events.push({ type: 'AchievementProgress', id, before: old, after, unlocked: after === 100 });
  }
  return { profile: result, events };
}
/** Pure queue drain: callers persist BOTH returned states. No replay cursor hidden in a closure. */
export function consumeAchievements(profile: ProfileState, state: RunState): { profile: ProfileState; state: RunState; events: AchievementProgress[] } {
  const result = applyAchievementRequests(profile, state.difficulty, state.achievementQueue);
  const run = structuredClone(state); run.achievementQueue = [];
  return { ...result, state: run };
}
/** CharacterClass::UnlockAchievement @0x35fb0 + CheckIfAllClassesMaxed @0x2835c.
 * Race milestone uses defaultRace, even when the user customized the current race. */
export function classAchievementRequests(levels: readonly number[], changedClassId?: number): AchievementRequest[] {
  const requests: AchievementRequest[] = [];
  for (const cls of classData.classes) {
    const id = cls.class.value, level = levels[id]!;
    if (id === 0 || level === 0 || changedClassId !== undefined && id !== changedClassId) continue;
    requests.push({ id, progress: 100 });
    if (level > 4) requests.push({ id: cls.defaultRace.value + 9, progress: 100 });
    if (level === 10) requests.push({ id: id + 18, progress: 100 });
  }
  if (levels.slice(1).every(level => level >= 10)) requests.push({ id: 28, progress: 100 });
  return requests;
}
/** Item::Serialise @0x4bb90. Pure serializers return these requests alongside JSON. */
export function saveAchievementRequests(state: RunState): AchievementRequest[] {
  return allowedAchievement(state.difficulty, 72) && state.equipment.some(item => item.stats.filter(n => n !== 0).length >= scoringData.armedNonzeroStats) ? [{ id: 72, progress: 100 }] : [];
}
