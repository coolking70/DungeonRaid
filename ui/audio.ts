import type { GameEvent } from '../src/core/engine';
/** U04 adapter boundary; S01 owns src/audio/player.ts. Variants use zero-based native indices. */
export interface AudioPort {
  play(soundId: number, variant: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
}
export class SilentAudio implements AudioPort {
  volume = 1; muted = false;
  play(_soundId: number, _variant: number) {}
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); }
  setMuted(muted: boolean) { this.muted = muted; }
}
// Only unambiguous triggers. Resource/attack/heartbeat/menu-option branches need their own
// presentation-stage filters in U04. Do not unconditionally map EnemyAbility/TileMatched.
// Skill::Activate @0x60210; GameOverScreen::Initialise @0x457d4; UnlockMenu::Show @0x66fc4.
const SKILL_SOUND = [19,20,19,19,19,22,19,21,24,19,19,25,19,19,19,19,23,23,23,23,19,26,27,14,34,19,37,28,28,24,27,26,14,19,14,19,null,19,27,23,28,28];
export function soundCues(event: GameEvent): number[] {
  switch (event.type) {
    case 'SkillCast': return event.id === 36 ? [2, 2, 2] : SKILL_SOUND[event.id] == null ? [] : [SKILL_SOUND[event.id]!];
    case 'GameOver': return [event.outcome.won ? 12 : 33];
    default: return [];
  }
}
