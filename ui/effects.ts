import type { CosmeticSample } from '../src/core/cosmetics';
import type { GameEvent } from '../src/core/engine';
import type { RunState } from '../src/core/state';
import type { Animation, Point } from './animation';
import { PresentationRandom, type AudioPort } from './audio';
import type { Assets } from './assets';
import type { I18n } from './i18n';
import { text } from './board-view';
const centre = (s: RunState, slot: number) => ({ x: 27.5 + slot % 6 * 53, y: 105.5 + Math.floor(slot / 6) * 53 + (s.challenge ? 5 : 0) });
export type EffectKind = 'label' | 'flare' | 'sparks' | 'shatter' | 'shield';
export class VisualEffect implements Animation {
  elapsed = 0; done = false;
  readonly particles: { x: number; y: number; dx: number; dy: number; speed: number; acceleration: number }[];
  constructor(readonly kind: EffectKind, readonly position: Point, readonly duration: number, readonly value = '', readonly color = '#fff3cd', readonly speed = 32, readonly angle = 0, random = new PresentationRandom(), samples: number[] = []) {
    let k = 0; const unit = () => samples[k++] ?? random.unit();
    // Native samples retained; geometry assignment is an explicitly documented approximation.
    this.particles = Array.from({ length: 10 }, () => { const a = unit()*Math.PI*2; return { ...position, dx: Math.cos(a), dy: Math.sin(a), speed: (kind === 'sparks' ? .1+unit()*.2 : 1+unit())*320, acceleration: (kind === 'sparks' ? -.5-unit()*2.5 : -3-unit()*7)*320 }; });
  }
  update(dt: number) {
    this.elapsed += dt; this.done = this.elapsed >= this.duration;
    if (this.kind === 'sparks' || this.kind === 'shatter') for (const p of this.particles) { p.speed += p.acceleration*dt; p.x += p.dx*p.speed*dt; p.y += p.dy*p.speed*dt; }
  }
  draw(ctx: CanvasRenderingContext2D, assets: Assets, i18n: I18n) {
    if (this.done) return;
    const p = Math.min(1, this.elapsed / this.duration);
    ctx.save(); ctx.globalAlpha *= 1-p*p;
    if (this.kind === 'label') text(ctx, this.value.startsWith('skill.') || this.value.startsWith('enemy.') ? i18n.t(this.value) : i18n.source(this.value), this.position.x, this.position.y-this.speed*this.elapsed, 12, this.color);
    if (this.kind === 'flare') {
      const size = (.08+2*this.elapsed)*320; ctx.globalAlpha *= Math.max(0,1-3.5*this.elapsed);
      ctx.translate(this.position.x,this.position.y); ctx.rotate(this.angle*Math.PI/180); assets.ui.paint(ctx,'ui.flare',-size/2,-size/2,size,size);
    }
    if (this.kind === 'sparks' || this.kind === 'shatter') for (const particle of this.particles) { ctx.fillStyle = this.color; ctx.fillRect(particle.x,particle.y,this.kind === 'sparks' ? 2 : 4,4); }
    if (this.kind === 'shield') for (const dir of [-1,1]) {
      ctx.save(); ctx.globalAlpha = 1-p*p*p;
      ctx.translate((dir < 0 ? .4859375 : .5078125)*320 + dir*.08*p*320, 1.29375*320-.2*(.04-(.3-p)**2)*320);
      ctx.rotate(dir*Math.PI/2*p); assets.ui.paint(ctx,dir < 0 ? 'ui.shield.left' : 'ui.shield.right',-12,-24,25,49); ctx.restore();
    }
    ctx.restore();
  }
}
export function eventEffects(before: RunState, after: RunState, events: GameEvent[], samples: CosmeticSample[]): VisualEffect[] {
  const out: VisualEffect[] = [], random = new PresentationRandom(before.rng.calls ^ 0x55493034);
  const labels = samples.filter(s => s.kind === 'label');
  const flares = samples.filter(s => s.kind === 'flare');
  const particles = samples.filter(s => s.kind === 'sparks' || s.kind === 'shatter');
  const label = (point: Point, value: string, color: string) => out.push(new VisualEffect('label', point, 1, value,color,(labels.shift()?.values[0] ?? .1)*320));
  const flare = (point: Point) => out.push(new VisualEffect('flare',point,1/3.5,'','#fff',32,flares.shift()?.values[0] ?? 0));
  const burst = (point: Point, kind: 'sparks'|'shatter') => out.push(new VisualEffect(kind,point,.3,'',kind === 'sparks' ? '#ffd480' : '#c1c4df',32,0,random,particles.shift()?.values));
  for (const e of events) {
    if (e.type === 'EnemyDamaged') { const p = centre(before,e.slot); if (e.healthLoss) label(p,`-${e.healthLoss}`,'#ffc6b0'); if (e.armourLoss) label({x:p.x,y:p.y+14},`-${e.armourLoss}`,'#adb1ff'); flare(p); if (e.killed || e.healthLoss || e.armourLoss) burst(p,e.killed ? 'shatter':'sparks'); }
    if (e.type === 'TileMatched' && before.board[e.slot]?.broken) burst(centre(before,e.slot),'shatter');
    if (e.type === 'PlayerHealth' && e.before !== e.after) label({ x:273,y:443 }, `${e.after>e.before?'+':''}${e.after-e.before}`, e.after>e.before?'#b3ef96':'#ff8877');
    if (e.type === 'EnemyAttack' && e.armourLoss > 0) out.push(new VisualEffect('shield',{ x:159,y:414 },.5));
    if (e.type === 'EnemyAbility') {
      // Event can be a no-op; feedback only where the before/after snapshots prove a change.
      const changed = JSON.stringify(before.board) !== JSON.stringify(after.board) || before.health !== after.health || before.resources.gold.remainder !== after.resources.gold.remainder;
      if (changed) { label(centre(before,e.slot),`enemy.${e.enemyType}.name`,'#ffd480'); flare(centre(before,e.slot)); }
    }
    if (e.type === 'SpecialEnemyGenerated' || e.type === 'TrophyGenerated' || e.type === 'TrophyClaimed') flare(centre(after,e.slot));
    if (e.type === 'SkillCast') { label({x:160,y:100},`skill.${e.id}.name`,'#c5e9ff'); if ([5,27,28,37,40,41].includes(e.id)) burst({x:160,y:238},'shatter'); }
    if (e.type === 'PretzelScored' && e.points>0) label({x:160,y:240},`+${e.points}`,'#ffe095');
  }
  // Freeze/fire/poison changes may originate in skills or enemy subbranches.
  after.board.forEach((tile,slot) => { const old = before.board[slot]!; if ((!old.frozen&&tile.frozen)||(!old.burning&&tile.burning)) flare(centre(after,slot)); });
  return out;
}
/** Interface::ProcessHeartbeat @0x48dfc. Unresolved native colour cosine uses a UI pulse. */
export class Heartbeat {
  elapsed = 0; waiting = 0; duration = 0; pulse = 0;
  update(dt: number, ratio: number, audio: AudioPort) {
    if (this.duration > 0) {
      this.elapsed += dt; const p = this.elapsed/this.duration;
      this.pulse = p<.2 ? (p/.2)**2 : Math.max(0,(1+Math.cos((p-.2)/.8*Math.PI))/2);
      if (p>=1) { this.duration=0; this.pulse=0; this.waiting=0; }
    } else if (ratio>0 && ratio<=.35) {
      const q = Math.max(0,Math.min(1,(ratio-.15)/.2)); this.waiting+=dt;
      if (this.waiting>=.1+1.9*q) { this.duration=.3+.2*q; this.elapsed=0; audio.play(32,-1); }
    } else { this.waiting=0; this.pulse=0; }
  }
}
