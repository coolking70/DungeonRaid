import { Difficulty, GameMode, SpecialTileType, getNativeSkill, itemData, enumData } from '../src/core/data';
import { hitTile } from '../src/core/chain';
import { itemName } from '../src/core/equipment';
import { canCastSkill } from '../src/core/skills';
import { getScore, scoreBreakdown } from '../src/core/scoring';
import type { MenuCandidate } from '../src/core/state';
import { GameSession, isStuck, legalChain } from './session';
import { browserStorage } from './storage';
import { Assets } from './assets';
import { I18n } from './i18n';
import { SilentAudio } from './audio';
import { ScreenStack, TRANSITIONS, type Screen, type ScreenInput } from './screens';
import { CanvasViewport } from './viewport';
import { drawBoard, drawTokens, text } from './board-view';
import { boardTop } from './timeline';

export async function mountApp() {
  document.body.innerHTML = '<canvas id="game" aria-label="Dungeon Raid" tabindex="0"></canvas>';
  document.body.className = 'game-app';
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!, ctx = canvas.getContext('2d')!;
  const storage = browserStorage(), audio = new SilentAudio(), i18n = new I18n(storage), assets = new Assets();
  const session = new GameSession(storage, audio), stack = new ScreenStack(), view = new CanvasViewport(canvas);
  const t = (key: string) => i18n.t(key);
  let muted = storage.getItem('dungeonraid.muted') === 'true';
  let volume = Number(storage.getItem('dungeonraid.volume') ?? 1);
  if (!Number.isFinite(volume)) volume = 1;
  audio.setMuted(muted); audio.setVolume(volume);
  await assets.load(i18n);
  let seed = Date.now() % 1_000_000_000;
  type Button = { id: string; label: string; x: number; y: number; w: number; h: number; run: () => void; enabled: boolean; selected: boolean };
  class Panel implements Screen {
    buttons: Button[] = []; pressed?: string;
    constructor(readonly id: string, readonly overlay = false) {}
    enter() {} exit() { this.pressed = undefined; } update(_dt: number) {}
    render(_ctx: CanvasRenderingContext2D) {}
    background(title: string, subtitle?: string) {
      ctx.fillStyle = this.overlay ? '#100e1cf2' : '#191421'; ctx.fillRect(0, 0, 320, 480);
      ctx.strokeStyle = '#8c7444'; ctx.lineWidth = 1; ctx.strokeRect(10.5, 10.5, 299, 459);
      text(ctx, title, 160, 74, 25, '#ead8a2');
      if (subtitle) text(ctx, subtitle, 160, 103, 11, '#b6a7c3', 'center', 280);
      this.buttons = [];
    }
    button(id: string, label: string, x: number, y: number, w: number, h: number, run: () => void, enabled = true, selected = false) {
      this.buttons.push({ id, label, x, y, w, h, run, enabled, selected });
      ctx.save(); ctx.globalAlpha *= enabled ? 1 : .4;
      // Semantic atlas lookup, with labelled rectangle fallback while A02 is absent.
      assets.ui.draw(ctx, 'button', x, y, w, h, '');
      if (selected) { ctx.strokeStyle = '#e8c866'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      text(ctx, label, x + w / 2, y + h / 2 + 4, 12, '#f4eacf', 'center', w - 12); ctx.restore();
    }
    input(e: ScreenInput) {
      const hit = this.buttons.find(b => b.enabled && e.x >= b.x && e.x < b.x + b.w && e.y >= b.y && e.y < b.y + b.h);
      if (e.type === 'down') this.pressed = hit?.id;
      if (e.type === 'cancel') this.pressed = undefined;
      if (e.type === 'up') {
        const pressed = this.pressed; this.pressed = undefined;
        if (hit?.id === pressed) { audio.play(0, 0); hit?.run(); }
      }
    }
  }
  const newRun = () => {
    session.start({ seed: seed++, classId: 0, difficulty: Difficulty.DIFF_NORMAL, mode: GameMode.MODE_CLASSIC });
    stack.replace(new Game(), TRANSITIONS.mainOut, 0);
  };
  class Main extends Panel {
    constructor() { super('main'); }
    override render() {
      this.background(t('baked.0'), t('subtitle'));
      this.button('continue', t('baked.1'), 60, 158, 200, 40, () => { session.resume(); stack.replace(new Game(), .3, 0); }, !['idle', 'ended'].includes(session.state.phase));
      this.button('new', t('baked.2'), 60, 212, 200, 40, () => {
        if (!['idle', 'ended'].includes(session.state.phase)) stack.push(new Confirm()); else newRun();
      });
      this.button('settings', t('settings'), 60, 266, 200, 40, () => stack.push(new Settings()));
      const games = session.profile.classes.reduce((sum, c) => sum + c.games, 0);
      text(ctx, `${t('profile')}  ${games}`, 160, 363, 12, '#b6a7c3');
      text(ctx, 'DUNGEON RAID · FAN PORT', 160, 445, 9, '#84798d');
      if (session.error) text(ctx, session.error, 160, 406, 10, '#ffb5af', 'center', 280);
    }
  }
  class Confirm extends Panel {
    constructor() { super('confirm', true); }
    override render() {
      this.background(t('abandon'));
      text(ctx, t('baked.36'), 160, 180, 12, '#b6a7c3', 'center', 275);
      this.button('yes', t('baked.38'), 60, 240, 200, 40, () => { stack.pop(0); newRun(); });
      this.button('no', t('baked.37'), 60, 294, 200, 40, () => stack.pop(.3));
    }
  }
  class Settings extends Panel {
    constructor() { super('settings', true); }
    override render() {
      this.background(t('settings'));
      this.button('language', `${t('language')}: ${i18n.language === 'zh' ? '中文' : 'English'}`, 50, 150, 220, 40, () => {
        i18n.setLanguage(i18n.language === 'zh' ? 'en' : 'zh'); document.documentElement.lang = i18n.language;
      });
      this.button('mute', t(muted ? 'baked.7' : 'baked.6'), 50, 204, 220, 40, () => {
        muted = !muted; audio.setMuted(muted); try { storage.setItem('dungeonraid.muted', String(muted)); } catch { /* optional */ }
      });
      this.button('volume', `${t('volume')}: ${Math.round(audio.volume * 100)}%`, 50, 258, 220, 40, () => {
        audio.setVolume(audio.volume >= 1 ? 0 : audio.volume + .25); try { storage.setItem('dungeonraid.volume', String(audio.volume)); } catch { /* optional */ }
      });
      this.button('return', t('baked.26'), 50, 340, 220, 40, () => stack.pop());
    }
  }
  class GameMenu extends Panel {
    constructor() { super('game-menu', true); }
    override render() {
      this.background(t('baked.22'));
      this.button('resume', t('baked.1'), 60, 140, 200, 40, () => stack.pop());
      this.button('settings', t('settings'), 60, 196, 200, 40, () => stack.push(new Settings()));
      this.button('save', t('save'), 60, 252, 200, 40, () => session.save());
      this.button('main', t('main'), 60, 330, 200, 40, () => { session.save(); stack.pop(0); stack.replace(new Main(), .2, .5); });
    }
  }
  class Stats extends Panel {
    constructor() { super('stats', true); }
    override render() {
      this.background(t('stats'));
      const s = session.state;
      text(ctx, `${t('level')} ${s.level} · ${t('score')} ${getScore(s)}`, 160, 140);
      text(ctx, `DMG ${s.base.damage + s.equipmentStats.damage} · Sword +${s.equipmentStats.weaponDamage}`, 160, 168);
      s.equipment.filter(Boolean).forEach((item, i) => text(ctx, itemName(item!), 160, 211 + i * 29, 11, '#b6a7c3', 'center', 270));
      this.button('close', t('close'), 60, 395, 200, 36, () => stack.pop());
    }
  }
  function candidate(c: MenuCandidate): string {
    switch (c.kind) {
      case 'skill': return `${i18n.t(`skill.${c.skill.id}.name`) === `skill.${c.skill.id}.name` ? getNativeSkill(c.skill.id).displayName.text : i18n.t(`skill.${c.skill.id}.name`)} Lv${c.skill.level}`;
      case 'stat': return enumData.enums.StatType.find(s => s.value === c.stat)?.displayName?.text ?? `Stat ${c.stat}`;
      case 'item': return itemName(c.item) + (c.scroll ? ` + ${getNativeSkill(c.scroll.id).displayName.text}` : '');
      case 'upgrade': return `${itemData.slots.find(s => s.itemType.value === c.itemType)?.itemType.name ?? ''} · ${itemData.upgrades.find(u => u.nativeId === c.stat)?.displayName.text ?? c.stat} +${c.value}`;
    }
  }
  class Reward extends Panel {
    constructor() { super('reward', true); }
    override render() {
      const m = session.state.menus[0]; if (!m) return;
      this.background(t(m.kind === 'level' ? 'baked.13' : m.kind === 'shop' ? 'baked.14' : 'baked.15'), t(m.kind === 'level' ? 'baked.17' : m.kind === 'shop' ? 'baked.16' : 'baked.18'));
      m.candidates.forEach((c, i) => {
        const order = m.selected.indexOf(i);
        this.button(`candidate-${i}`, `${order < 0 ? '' : `${order + 1}. `}${candidate(c)}`, 23, 136 + i * 60, 274, 50,
          () => session.dispatch({ type: 'SelectMenuItem', menuId: m.id, index: i }), true, order >= 0);
      });
      this.button('confirm', t('confirm'), 60, 399, 200, 40, () => {
        if (session.dispatch({ type: 'ConfirmMenu', menuId: m.id })) stack.pop(.3);
      }, m.selected.length >= (m.kind === 'level' ? 2 : 1));
    }
  }
  class GameOver extends Panel {
    constructor() { super('game-over'); }
    override render() {
      const b = scoreBreakdown(session.state), o = session.state.outcome!;
      this.background(o.won ? t('baked.30') : t('over'), `${t('turn')} ${o.turn}`);
      text(ctx, String(b.score), 160, 194, 50, o.won ? '#40e200' : '#e86f55');
      text(ctx, t('score'), 160, 223, 14);
      text(ctx, `XP ${b.contributions.xp} · Gold ${b.contributions.gold} · UP ${b.contributions.upgrade}`, 160, 264, 12);
      if (b.pretzel) text(ctx, `Avg ${b.pretzel.averageTimes10 / 10} · Max ${b.pretzel.maxCrosses} · Total ${b.pretzel.scoringChains}`, 160, 290, 11);
      text(ctx, session.storageError ?? t('saved'), 160, 324, 12, '#b6a7c3', 'center', 280);
      this.button('main', t('main'), 60, 370, 200, 40, () => stack.replace(new Main(), .3, .5));
    }
  }
  class Game extends Panel {
    dragging = false; lastSlot = -1; stuck = false;
    constructor() { super('game'); }
    override exit() { super.exit(); this.cancel(); }
    cancel() {
      if (this.dragging) session.dispatch({ type: 'CancelChain' });
      this.dragging = false; this.lastSlot = -1;
    }
    override update(dt: number) {
      session.update(dt);
      if (session.busy) return;
      if (session.state.phase === 'ended') { stack.replace(new GameOver(), 0, .3); return; }
      if (session.state.phase === 'menu') { stack.push(new Reward(), .3); return; }
      this.stuck = isStuck(session.state);
    }
    override render() {
      const s = session.timeline.display;
      ctx.fillStyle = '#191421'; ctx.fillRect(0, 0, 320, 480); this.buttons = [];
      for (let slot = 0; slot < 4; slot++) {
        const sk = s.skills[slot];
        const title = sk ? `${getNativeSkill(sk.id).displayName.text}` : t('empty');
        this.button(`skill-${slot}`, title, 6 + slot * 59, 6, 53, 53, () => session.dispatch({ type: 'CastSkill', slot, source: 'manual' }), !!sk && !session.busy && canCastSkill(session.state, slot));
        if (sk) text(ctx, `${sk.charge}/${sk.cooldown}`, 32.5 + slot * 59, 53, 9, '#cbbfe0');
      }
      this.button('menu', t('baked.22'), 242, 5, 72, 26, () => { this.cancel(); stack.push(new GameMenu()); });
      this.button('stats', t('baked.21'), 242, 33, 72, 26, () => { this.cancel(); stack.push(new Stats()); });
      text(ctx, `${t('turn')} ${s.turn} · ${t('level')} ${s.level} · ${t('score')} ${getScore(s)}`, 160, 73, 10, '#cbbfe0');
      drawBoard(ctx, s, session.timeline, assets);
      ctx.fillStyle = '#2b2237'; ctx.fillRect(0, 404, 320, 76);
      const maxHp = Math.max(1, s.base.maxHealth + s.equipmentStats.maxHealth);
      ctx.fillStyle = '#992e4d'; ctx.fillRect(239, 470 - 64 * s.health / maxHp, 71, 64 * s.health / maxHp);
      text(ctx, `${s.health}/${maxHp}`, 273, 463, 14);
      text(ctx, `${s.armour}/${s.equipmentStats.maxArmour}`, 159, 437, 13, '#adb1ff');
      for (const [key, y, color] of [['upgrade', 445, '#a070d8'], ['xp', 463, '#74b961']] as const) {
        ctx.fillStyle = '#15101f'; ctx.fillRect(110, y, 100, 10); ctx.fillStyle = color; ctx.fillRect(110, y, s.resources[key].remainder, 10);
      }
      const gold = s.resources.gold.remainder;
      ctx.fillStyle = '#c89e3d'; ctx.fillRect(5, 415, 16 * Math.floor(gold / 20), 61); ctx.fillRect(5 + 16 * Math.floor(gold / 20), 476 - 3 * (gold % 20), 16, 3 * (gold % 20));
      text(ctx, String(gold), 48, 461, 14);
      const hint = session.error ?? session.storageError ?? (this.stuck ? t('noMove') : s.chain.nodes.length ? `×${s.preview.effectiveLength}  DMG ${s.preview.damage}  HP +${s.preview.leech} / -${s.preview.spikes}` : '');
      if (hint) { ctx.fillStyle = '#100e1de8'; ctx.fillRect(4, 370, 312, 27); text(ctx, hint, 160, 387, 10, '#fff0ba', 'center', 304); }
      drawTokens(ctx, session.timeline, assets);
    }
    override input(e: ScreenInput) {
      if (e.type === 'cancel') { this.cancel(); super.input(e); return; }
      if (!this.dragging) super.input(e);
      if (e.y < boardTop(session.state) || e.y >= boardTop(session.state) + 318) {
        if (e.type === 'up' && this.dragging) this.release(); return;
      }
      if (session.busy || session.state.phase !== 'input') return;
      const at = hitTile({ x: (e.x - 1) / 53, y: (e.y - boardTop(session.state)) / 53 });
      if (e.type === 'down' && at) {
        const slot = at.y * 6 + at.x;
        if (session.state.board[slot]!.specialType === SpecialTileType.SPECIAL_TILE_TROPHY) { session.dispatch({ type: 'ClaimTrophy', slot }); return; }
        this.dragging = true; this.lastSlot = slot; session.dispatch({ type: 'SelectTile', at });
      } else if (e.type === 'move' && this.dragging && at && at.y * 6 + at.x !== this.lastSlot) {
        this.lastSlot = at.y * 6 + at.x; session.dispatch({ type: 'SelectTile', at });
      } else if (e.type === 'up') this.release();
    }
    release() {
      if (!this.dragging) return;
      this.dragging = false; this.lastSlot = -1;
      session.dispatch({ type: session.state.preview.valid ? 'CommitChain' : 'CancelChain' });
    }
  }
  stack.push(new Main(), .51);
  const resize = () => view.resize(window.innerWidth, window.innerHeight);
  resize(); window.addEventListener('resize', resize);
  let pointer: number | undefined;
  for (const [dom, type] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['pointercancel', 'cancel'], ['lostpointercapture', 'cancel']] as const) {
    canvas.addEventListener(dom, (e: PointerEvent) => {
      if (type === 'down') { if (pointer !== undefined) return; pointer = e.pointerId; canvas.setPointerCapture(e.pointerId); }
      if (pointer !== e.pointerId) return;
      const point = view.point(e.clientX, e.clientY); stack.input({ type, ...point });
      if (type === 'up' || type === 'cancel') pointer = undefined;
    });
  }
  let lastTime = performance.now(), manual = false;
  const render = () => { ctx.save(); view.begin(ctx); stack.render(ctx); ctx.restore(); };
  function update(dt: number) { stack.update(dt); }
  const frame = (now: number) => {
    if (!manual) update(Math.min(.05, Math.max(0, (now - lastTime) / 1000)));
    lastTime = now; render(); requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stack.input({ type: 'cancel', x: -1, y: -1 }); session.save(); }
    stack.paused = document.hidden; lastTime = performance.now();
  });
  window.addEventListener('pagehide', () => session.save());
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void canvas.requestFullscreen(); }
    if (e.key === 'Escape' && !stack.transitioning) {
      if (stack.top?.id === 'game') { stack.input({ type: 'cancel', x: -1, y: -1 }); stack.push(new GameMenu()); }
      else if (['settings', 'game-menu', 'stats', 'confirm'].includes(stack.top?.id ?? '')) stack.pop();
    }
  });
  const gameText = () => JSON.stringify({
    coordinates: '320x480; origin top-left; x right, y down', screen: stack.top?.id, stack: stack.ids, viewport: view.value,
    transitioning: stack.transitioning, busy: session.busy, paused: stack.paused, phase: session.state.phase, displayPhase: session.timeline.display.phase,
    turn: session.state.turn, health: session.timeline.display.health, score: getScore(session.state), language: i18n.language,
    board: session.timeline.display.board.map(tile => ({ type: tile.type, enemy: tile.enemyType, hp: tile.health, selected: tile.selected })),
    buttons: (stack.top as Panel)?.buttons?.map(({ id, label, x, y, w, h, enabled }) => ({ id, label, x, y, w, h, enabled })),
    menu: session.state.menus[0], skills: session.state.skills, outcome: session.state.outcome,
    games: session.profile.classes.reduce((n, c) => n + c.games, 0), error: session.error, storageError: session.storageError,
    art: assets.sheet.label, atlases: { ui: assets.ui.status, items: assets.items.status },
  });
  Object.assign(window, {
    render_game_to_text: gameText,
    advanceTime(ms: number) { manual = true; for (let left = Math.max(0, ms / 1000); left > 0; left -= 1 / 60) update(Math.min(left, 1 / 60)); render(); },
    // Read-only QA snapshots. Browser tests still use real pointer/button actions.
    __dr: { get state() { return structuredClone(session.state); }, get profile() { return structuredClone(session.profile); }, get busy() { return session.busy; }, get events() { return structuredClone(session.events); }, get legalChain() { return legalChain(session.state); } },
  });
  document.documentElement.lang = i18n.language; render(); requestAnimationFrame(frame);
}
