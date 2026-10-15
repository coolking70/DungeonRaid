import { activateAbility } from './specials';
import { flareDraw, labelDraw, particleDraws } from './cosmetics';
import { isSprint } from './board';
import { TileType, turnData } from './data';
import { iadd, isub } from './num';
import { hasPerk, type RunState, type SkillFlags } from './state';
import { addResource, attackSkull, checkEndGame, columnSlots, countAttackers, effectiveEnemy, enemyId, hasEnemy, heal, hurt, matchTile, phase, processAttack, raceIs, refill, type RuleContext } from './combat';

function rotate(s: RunState, keys: (keyof SkillFlags)[]): void {
  for (const key of keys) { s.current[key] = s.next[key]; s.next[key] = false; }
}
/** Exposed mutating substage for C28; never advances turn or consumes effects. */
export function playerEndTurn(s: RunState, c: RuleContext): void {
  if (s.equipmentStats.regeneration > 0) heal(s, s.equipmentStats.regeneration, 'regeneration', c);
  if (s.playerPoison > 0) { hurt(s, s.playerPoison, 'poison', c); labelDraw(c.rng, 7); }
}
/** EndOfTurn poison path intentionally does NOT call AttackSkull or increment direct kill counters. */
export function enemyPoison(s: RunState, c: RuleContext): void {
  for (const slot of columnSlots()) {
    const t = s.board[slot]!;
    if (t.type !== TileType.TILE_SKULL) continue;
    const poison = t.poison[0]; t.poison = [t.poison[1], t.poison[2], 0];
    if (poison !== 0) {
      labelDraw(c.rng, 7);
      if (isub(t.health, poison) < 1) matchTile(s, slot, c);
      else { t.health = isub(t.health, poison); particleDraws(c.rng, 'sparks'); }
    }
  }
}
/** EndOfTurn @0x3289c, kept in native statement order. Arrivals generated here drain AFTER its tail. */
export function endOfTurn(s: RunState, c: RuleContext): void {
  s.turn = iadd(s.turn, 1);
  if (checkEndGame(s, c)) return;
  for (const skill of s.skills) if (skill) {
    if (!hasEnemy(s, 'MAGE')) skill.charge = Math.min(skill.cooldown, iadd(skill.charge, 1));
    skill.active = false;
  }
  for (const key of Object.keys(s.combo) as (keyof RunState['combo'])[]) s.combo[key] = false;
  if (s.current.rune && !s.next.rune) s.current.rune = false;
  s.next.rune = false;
  rotate(s, ['berserk', 'swordBoost', 'shieldBoost', 'potionBoost', 'coinBoost', 'steal']);
  s.counterattack = false; s.collectedByType.fill(0);
  for (const slot of columnSlots()) {
    const t = s.board[slot]!;
    if (t.frozen) { flareDraw(c.rng); t.frozen = false; }
    else if (t.burning) {
      flareDraw(c.rng);
      if (t.type === TileType.TILE_SKULL) {
        if (isub(t.health, t.fireDamage) < 1) { t.health = 0; attackSkull(s, slot, 0, false, c); }
        else { t.health = isub(t.health, t.fireDamage); particleDraws(c.rng, 'sparks'); }
      }
      t.burning = false; t.fireDamage = 0; t.fireSafe = false;
    }
  }
  playerEndTurn(s, c);
  if (checkEndGame(s, c)) return;
  enemyPoison(s, c);
  s.board.forEach(t => { t.abilityUsed = false; });
  // ProcessCripples @0x2f558 is row-major, unlike surrounding native loops.
  if (raceIs(s, 'WEREWOLF')) for (let slot = 0; slot < s.board.length; slot++) {
    const t = s.board[slot]!;
    if (!t.matched && t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('NORMAL') && t.health < t.defence) { matchTile(s, slot, c); labelDraw(c.rng, 36); }
  }
  for (const slot of columnSlots()) {
    const t = s.board[slot]!;
    if (t.type !== TileType.TILE_SKULL || effectiveEnemy(s, t) === enemyId('NORMAL')) continue;
    (c.hooks?.activateAbility ?? activateAbility)(s, slot, c);
    if (s.outcome) return;
  }
  s.delayedLastStand = s.current.lastStand;
  rotate(s, ['lastStand']);
  if (checkEndGame(s, c)) return;
  refill(s, c);
  if (s.outcome) return;
  s.board.forEach(t => { t.newThisTurn = false; });
  rotate(s, ['oneHealthSkulls', 'forceCoin']);
  s.filter.enabled = s.filter.excludeSwords = false;
  s.promotion.remaining = Math.max(0, isub(s.promotion.remaining, 1));
  s.actionCommitted = false; s.attackStage = 0;
  s.sprintWon = isSprint(s) && s.turn === turnData.sprintTurns;
  if (checkEndGame(s, c)) return;
  c.events.push({ type: 'TurnEnded', turn: s.turn });
  s.resumePhase = 'input'; phase(s, s.moving.length ? 'falling' : 'arrivals', c);
}
/** Explicit UI/replay arrivals resolve C2 without guessing animation time or priority. */
export function consumeEffect(s: RunState, id: number, c: RuleContext): void {
  if (s.phase !== 'falling' && s.phase !== 'arrivals') throw new Error(`Cannot consume effect during ${s.phase}`);
  const index = s.pending.findIndex(effect => effect.id === id);
  if (index < 0) throw new RangeError(`Unknown or consumed effect ${id}`);
  const effect = s.pending[index]!;
  // Reject mode provides a strict guard for unverified native multi-arrival traces.
  if (s.options.arrivalOrder === 'reject-ambiguous' && s.pending.length > 1) throw new Error('C2: multiple arrivals require an explicit-events policy');
  s.pending.splice(index, 1); c.events.push({ type: 'EffectConsumed', id });
  if (effect.kind === 'resource') addResource(s, effect, c);
  else if (effect.kind === 'healing') heal(s, effect.amount, effect.source, c);
  else { hurt(s, effect.amount, effect.source, c); checkEndGame(s, c); }
}
export { confirmMenu as chooseMenu } from './menus';
export function advancePhase(s: RunState, c: RuleContext): void {
  if (s.phase === 'falling') { s.moving = []; phase(s, 'arrivals', c); return; }
  if (s.phase === 'arrivals') {
    if (s.pending.length || s.moving.length || s.menus.length) throw new Error('Await explicit effects/movement/menu completion');
    const resume = s.resumePhase;
    if (!resume) throw new Error('Arrivals have no continuation');
    s.resumePhase = null;
    if (resume === 'enemy-attack') {
      const skip = countAttackers(s) === 0 || (s.turn < turnData.earlyTurns && hasPerk(s, 'PERK_UNEXPECTED'));
      s.attackStage = skip ? 8 : 1; phase(s, skip ? 'end-turn' : 'enemy-attack', c);
    } else phase(s, resume, c);
    return;
  }
  if (s.phase === 'enemy-attack') {
    processAttack(s, c);
    if (s.outcome) return;
    s.attackStage = 8;
    // Spikes/counterattack rewards and refill must settle before EndOfTurn.
    s.resumePhase = 'end-turn'; phase(s, s.moving.length ? 'falling' : 'arrivals', c); return;
  }
  if (s.phase === 'end-turn') { endOfTurn(s, c); return; }
  throw new Error(`Cannot advance phase ${s.phase}`);
}
