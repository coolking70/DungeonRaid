/** P2 compatibility choices, not claims about unresolved native behaviour. */
export interface EngineOptions {
  initialFilter: 'exclude-skulls' | 'exclude-swords';
  zeroTurnPromotion: 'consume-unit-and-defer' | 'reject';
  arrivalOrder: 'explicit-events' | 'reject-ambiguous';
  specialInteractionOrder: 'native-slot-order' | 'reject-combinations';
  raceSkillCombinations: 'documented-branches' | 'reject-unverified';
  scrollFilter: 'reject-unresolved' | 'supplied-native-fixture';
}
export const DEFAULT_OPTIONS: Readonly<EngineOptions> = Object.freeze({
  // B1: deterministic conventional initial board; native c381 before first fill remains unknown.
  initialFilter: 'exclude-skulls',
  // B2: at q=0 consume exactly one TILE unit, retain a null candidate (ordinary enemies discard it).
  // Never substitute C=50 or simulate infinity conversion. Special promotion requiring C rejects.
  zeroTurnPromotion: 'consume-unit-and-defer',
  // C2: UI/replay must name arrivals; no invented healing/damage priority.
  arrivalOrder: 'explicit-events',
  // C3: retain known fixed slot traversal; combinations still require P6 validation.
  specialInteractionOrder: 'native-slot-order',
  // C4: preserve documented branches without a fabricated global live-enemy filter.
  raceSkillCombinations: 'documented-branches',
  // I1: cannot safely interpret out-of-four-slot native memory as owned-skill membership.
  scrollFilter: 'reject-unresolved',
});
