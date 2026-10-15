// Interim I1 policy for playable builds (docs/spec/04-items.md, I1; to be confirmed against the original in P6).
//
// The native shop-scroll filter reads the int at Game+c358+4*skillId (asm @0x331e6..0x331f0) and drops
// the skill when it is non-zero. That address range overlaps fields the port already models (T03 offset table):
//   id 0..3  c358..c364  equipped Skill pointers        -> non-zero when that slot is occupied
//   id 4     c368        selectedSkillCount
//   id 5..9  c36c..c37c  collectedByType[0..4]
//   id 10    c380..c383  filter.enabled, filter.excludeSwords, counterattack, current.steal (one byte each)
//   id 11    c384        next.steal (bytes c385..c387 unmapped)
// Offsets from c388 onwards (ids 12..41) are not mapped yet and are read as 0, i.e. not filtered.
// Without this hook the engine (scrollFilter='reject-unresolved') throws whenever a shop rolls a scroll.
import type { RunState } from "../src/core/state";

const byte = (b: boolean, shift: number) => (b ? 1 : 0) << shift;

export function scrollNativeWord(s: RunState, skillId: number): number {
  if (skillId >= 0 && skillId <= 3) return s.skills[skillId] ? 1 : 0;
  if (skillId === 4) return s.selectedSkillCount;
  if (skillId >= 5 && skillId <= 9) return s.collectedByType[skillId - 5] ?? 0;
  if (skillId === 10) return byte(s.filter.enabled, 0) | byte(s.filter.excludeSwords, 8) | byte(s.counterattack, 16) | byte(s.current.steal, 24);
  if (skillId === 11) return byte(s.next.steal, 0);
  return 0;
}
