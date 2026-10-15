import { describe, expect, test, vi } from 'vitest';
import { viewport, logicalPoint } from '../ui/viewport';
import { ScreenStack, type Screen } from '../ui/screens';
import { Fall, TokenFlight, FrameSnap, Tween } from '../ui/animation';
import { I18n, dictionary } from '../ui/i18n';
import { sprites, Atlas } from '../ui/assets';
import { soundCues } from '../ui/audio';

const memory = () => { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; };
function screen(id: string, overlay = false): Screen {
  return { id, overlay, enter: vi.fn(), exit: vi.fn(), update: vi.fn(), render: vi.fn(), input: vi.fn() };
}
describe('viewport matches SetupRenderer and Java input conversion', () => {
  test('desktop letterbox, mobile pillar extents, and truncated odd pixel', () => {
    expect(viewport(1280, 720)).toEqual({ x: 400, y: 0, width: 480, height: 720 });
    expect(viewport(375, 812)).toEqual({ x: 0, y: 125, width: 375, height: 562 });
    expect(viewport(320, 480)).toEqual({ x: 0, y: 0, width: 320, height: 479 });
  });
  test('offset removed before normalization, margin remains outside logic', () => {
    const v = viewport(375, 812);
    expect(logicalPoint(v, 187.5, 406)).toEqual({ x: 160, y: 240 });
    expect(logicalPoint(v, 0, 0).y).toBeLessThan(0);
  });
});
describe('screen lifecycle, transitions and pause', () => {
  test('push freezes lower screen; pop exits only after fade; replace exits old once', () => {
    const stack = new ScreenStack(), a = screen('main'), b = screen('settings', true), c = screen('game');
    stack.push(a, 0); expect(a.enter).toHaveBeenCalledOnce();
    stack.push(b, .2); expect(stack.push(c)).toBe(false);
    stack.input({ type: 'down', x: 0, y: 0 }); expect(b.input).not.toHaveBeenCalled();
    stack.update(.2); stack.update(.1); expect(a.update).not.toHaveBeenCalled(); expect(b.update).toHaveBeenCalledOnce();
    stack.pop(.2); stack.update(.1); expect(b.exit).not.toHaveBeenCalled();
    stack.update(.1); expect(b.exit).toHaveBeenCalledOnce(); expect(stack.top).toBe(a);
    stack.replace(c, .3, .5); stack.update(.3); expect(a.exit).toHaveBeenCalledOnce(); expect(c.enter).toHaveBeenCalledOnce();
    stack.update(.5); expect(stack.transitioning).toBe(false);
  });
  test('paused transitions and updates do not advance', () => {
    const stack = new ScreenStack(), a = screen('main'); stack.push(a, .5); stack.paused = true;
    stack.update(100); expect(stack.transitioning).toBe(true);
    stack.paused = false; stack.update(.5); stack.update(.1); expect(a.update).toHaveBeenCalledWith(.1);
  });
});
describe('independent animation clocks', () => {
  test('fall integrates acceleration then position; completes by distance, resets velocity', () => {
    const a = new Fall(0, 100); a.update(.1); expect(a.y).toBeCloseTo(33.6); expect(a.velocity).toBe(336);
    a.update(1); expect(a.y).toBe(100); expect(a.done).toBe(true); expect(a.velocity).toBe(320);
  });
  test('fixed tween and per-frame snapping intentionally differ with frame frequency', () => {
    const a = new Tween(320, 23, .3); a.update(.15); expect(a.value).toBe(171.5); a.update(.15); expect(a.value).toBe(23);
    const snap = new FrameSnap(100, 0); snap.update(.01); expect(snap.value).toBe(70);
    snap.update(1); expect(snap.value).toBe(49); expect(snap.done).toBe(false);
    while (!snap.done) snap.update(.01); expect(snap.value).toBe(0);
  });
  test('token uses pre-move distance, dynamic target, no alpha or fixed duration', () => {
    let target = { x: 100, y: 0 };
    const a = new TokenFlight({ x: 0, y: 0 }, () => target, { x: .1, y: 0 }, 100, 1);
    a.update(.1); expect(a.position.x).toBeCloseTo(1.9); expect(a.scale).toBe(1);
    target = { ...a.position }; a.update(.01); expect(a.done).toBe(true); expect(a.elapsed).toBeCloseTo(.11);
    const b = new TokenFlight({ x: 0, y: 0 }, () => ({ x: 5, y: 0 })); b.update(.01); expect(b.done).toBe(true);
  });
});
describe('optional assets and localization', () => {
  test('normalizes manifests, rejects unresolved/null rectangles', () => {
    expect(sprites({ elements: [{ id: 'main', rect: [2, 4, 640, 960] }, { id: 'unknown', rect: null }] })).toEqual([{ id: 'main', rect: [2, 4, 640, 960] }]);
    expect(sprites({ slots: [{ slot: 399, rect: { x: 10, y: 20, width: 98, height: 98 } }] })[0]?.id).toBe('399');
    expect(new Atlas('missing').status).toBe('placeholder');
  });
  test('missing atlas draws labelled fallback without Image/requests', async () => {
    const a = new Atlas('missing'); await a.load();
    const ctx = { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(a.draw(ctx, 'missing', 0, 0, 100, 50, 'Sword')).toBe(false);
    expect(ctx.fillText).toHaveBeenCalledWith('Sword', 50, 28, 92);
  });
  test('defaults to Chinese, falls back to U01 English, saves choice and expands parameters', () => {
    const storage = memory(), i = new I18n(storage); expect(i.language).toBe('zh'); expect(i.t('baked.2')).toBe('New Game');
    i.install('zh', { strings: { 'baked.2': { text: '新游戏' }, count: '{value} 分' } });
    expect(i.t('baked.2')).toBe('新游戏'); expect(i.t('count', { value: 12 })).toBe('12 分');
    i.setLanguage('en'); expect(new I18n(storage).language).toBe('en'); expect(i.t('missing')).toBe('missing');
    expect(dictionary({ a: 'A', b: { value: 'B' }, _source: 'ignore' })).toEqual({ a: 'A', b: 'B' });
  });
  test('audio mapping keeps unresolved branches silent, preserves repeated Greed cues', () => {
    expect(soundCues({ type: 'EnemyAbility', slot: 0, enemyType: 3 })).toEqual([]);
    expect(soundCues({ type: 'SkillCast', id: 1, source: 'manual' })).toEqual([20]);
    expect(soundCues({ type: 'SkillCast', id: 36, source: 'manual' })).toEqual([2, 2, 2]);
  });
});

test('L01 messages, aliases/source IDs and named printf metadata are supported', () => {
  const i = new I18n(memory());
  i.install('zh', { messages: { 'ui.menu.newGame': '新游戏', result: '{name}：{value}' } });
  i.installCatalog({ sourceToKey: { 'baked.2': 'ui.menu.newGame' }, aliases: { 'alias': 'ui.menu.newGame' }, entries: {
    result: { placeholders: [{ name: 'name', type: 'string', printf: '%s' }, { name: 'value', type: 'number', printf: '%.1f', precision: 1 }] },
  } });
  expect(i.t('baked.2')).toBe('新游戏'); expect(i.t('alias')).toBe('新游戏');
  expect(i.t('result', { name: '$&', value: 1.23 })).toBe('$&：1.2');
  expect(() => i.t('result')).toThrow('Missing');
});
