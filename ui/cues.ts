import { TileType, enumValue } from '../src/core/data';
import type { GameEvent } from '../src/core/engine';
import type { PendingEffect, RunState, Tile } from '../src/core/state';
import { soundCues } from './audio';
/** Game::QueueTileSound @0x29800. Called only for a newly appended node. */
export function selectionSound(tile: Tile): number | null {
  return tile.type === TileType.TILE_POTION ? tile.explosive || tile.acid ? 24 : 5
    : ({ 1: 14, 2: 1, 3: 7, 4: 3, 6: 8 } as Record<number, number>)[tile.type] ?? null;
}
/** Game::AddResource @0x32210. Uses the pre-arrival state, including corrosive. */
export function resourceSound(s: RunState, e: Extract<PendingEffect, { kind: 'resource' }>): number | null {
  switch (e.tileType) {
    case TileType.TILE_POTION: return e.variant === 2 ? 17 : 4;
    case TileType.TILE_SKULL: return e.variant === 3 ? 17 : 9;
    case TileType.TILE_COIN: return 2;
    case TileType.TILE_SHIELD: return s.armour === s.equipmentStats.maxArmour || s.board.some(t => t.type === TileType.TILE_SKULL && t.enemyType === enumValue('EnemyType', 'ENEMY_CORROSIVE')) ? 8 : 6;
    default: return null;
  }
}
export function frameSounds(before: RunState, after: RunState, events: GameEvent[]): number[] {
  const out: number[] = [];
  for (const e of events) {
    if (e.type === 'GameOver') continue; // GameOverScreen owns its actual entry time.
    out.push(...soundCues(e));
    // IntroScreen owns the start cue, after the player presses Begin.
    if(e.type==='TileMatched') {const tile=before.board[e.slot];if(tile&&(tile.explosive||tile.type===TileType.TILE_SKULL&&tile.enemyType===enumValue('EnemyType','ENEMY_KAMIKAZE')))out.push(28);}

    if (e.type === 'ChainPreview' && after.chain.nodes.length > before.chain.nodes.length) {
      const tile = after.board[after.chain.nodes[after.chain.nodes.length - 1]!]; const id = tile && selectionSound(tile); if (id != null) out.push(id);
    }
    if (e.type === 'EnemyAttack' && e.attack > 0) {
      out.push(14, 27);
      if (before.armour > 0) out.push(e.armourLoss > 0 ? 16 : 15);
      if (e.damage > 0) out.push(17);
      if (before.armour > 0 && before.equipmentStats.weaken > 0 && before.board.some(t => t.type === TileType.TILE_SKULL && !t.newThisTurn && t.attack > 1)) out.push(30);
      if (before.armour > 0 && before.equipmentStats.spikes > 0 && before.board.some(t => t.type === TileType.TILE_SKULL && !t.newThisTurn)) out.push(3);
    }
    if(e.type==='PlayerHealth'&&e.after>e.before&&['regeneration','leech','berserk'].includes(e.source))out.push(4);
    if(e.type==='PlayerHealth'&&e.after<e.before&&e.source==='spikes')out.push(25);
    if (e.type === 'PlayerHealth' && e.after < e.before && e.source === 'poison') out.push(29);
    if (e.type === 'PlayerHealth' && e.after < e.before && ['fire', 'fleeing', 'assassin', 'thief', 'kamikaze'].includes(e.source)) out.push(17);
  }
  if(events.some(e=>e.type==='TurnEnded')&&before.board.some((t,n)=>t.frozen&&!after.board[n]?.frozen))out.push(22);
  if(before.chain.nodes.length&&after.chain.nodes.length===0&&events.some(e=>e.type==='TileMatched')){if(before.preview.enemies.length)out.push(27);else if(before.chain.nodes.some(n=>before.board[n]?.type===TileType.TILE_SWORD))out.push(26);}
  after.skills.forEach((sk, slot) => { const old = before.skills[slot]; if (sk && old && sk.id === old.id && old.charge < old.cooldown && sk.charge === sk.cooldown) out.push(10); });
  return out;
}

/** Labels are emitted only inside the native branch (not on every EnemyAbility).
 * Game::MakeAcidPotion/ConvertSwordToSkull/FreezeTiles/ThrowSkull/etc, spec12 callSites.
 * A label sample is already consumed by core; using it does not advance any RNG. */
export function sampleSounds(samples: import('../src/core/cosmetics').CosmeticSample[], events: GameEvent[] = [], before?: RunState): number[] {
  const sounds: Record<number, number[]> = { 6:[29], 14:[24], 17:[20], 18:[14], 19:[27], 20:[23], 21:[24], 22:[16], 23:[5], 24:[14], 25:[23], 26:[23], 27:[14], 28:[19], 31:[26], 32:[22] };
  const out=samples.flatMap(s=>s.kind==='label'?sounds[s.labelType!]??[]:[]);
  for(const sample of samples)if(sample.kind==='label'&&sample.labelType===37){
    const context=events.slice(0,sample.eventIndex).reverse().find(e=>e.type==='EnemyAbility');
    if(context?.type==='EnemyAbility'&&context.enemyType===enumValue('EnemyType','ENEMY_FLEEING')&&(before?.board[context.slot]?.y??0)>0)out.push(35);
  }
  // HealOrBless queues once per activation, not per healed target. Caller groups samples by event.
  if(samples.some(s=>s.kind==='label'&&(s.labelType===11||s.labelType===12)))out.push(36);
  return out;
}
