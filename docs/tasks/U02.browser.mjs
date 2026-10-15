// U02 browser acceptance: all play actions go through pointer input; no game-state mutation.
// Uses the already-installed develop-web-game Playwright, no dependency installation.
import { chromium } from '/Users/coolking70/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const base = process.env.U02_URL ?? 'http://127.0.0.1:5312';
const out = new URL('./U02.shots/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [], counts = { chains: 0, menus: 0, skills: 0, trophies: 0 };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(String(e)));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
await page.addInitScript(() => { Date.now = () => 12345; });
async function state(p = page) { return p.evaluate(() => JSON.parse(window.render_game_to_text())); }
async function advance(ms = 1000, p = page) { await p.evaluate(ms => window.advanceTime(ms), ms); }
async function open(p = page, suffix = '') { await p.goto(base + '/' + suffix); await p.waitForFunction(() => !!window.render_game_to_text); await advance(1000, p); }
async function shot(name, p = page) { await p.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) }); await writeFile(new URL(name + '.json', out), JSON.stringify(await state(p), null, 2)); }
async function point(x, y, p = page) { const s = await state(p); return { x: s.viewport.x + x / 320 * s.viewport.width, y: s.viewport.y + y / 480 * s.viewport.height }; }
async function button(id, p = page) {
  const s = await state(p), b = s.buttons.find(b => b.id === id); assert(b?.enabled, `Missing/disabled ${id} on ${s.screen}`);
  const q = await point(b.x + b.w / 2, b.y + b.h / 2, p); await p.mouse.click(q.x, q.y);
  await advance(1000, p);
}
async function chain(nodes, release = true) {
  const run = await page.evaluate(() => window.__dr.state);
  const coords = await Promise.all(nodes.map(slot => point(1 + (slot % 6 + .5) * 53, 79 + (run.challenge ? 5 : 0) + (Math.floor(slot / 6) + .5) * 53)));
  await page.mouse.move(coords[0].x, coords[0].y); await page.mouse.down();
  for (const p of coords.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
  if (release) await page.mouse.up();
}
async function longChain() {
  return page.evaluate(async () => {
    const { adjacent, canMatchType } = await import('/@fs/Users/coolking70/Documents/同步空间/DungeonRaid/src/core/chain.ts');
    const s = window.__dr.state; let best = [];
    for (let first = 0; first < 36; first++) {
      if (!canMatchType(s, first, [])) continue;
      const nodes = [first];
      for (;;) {
        const slot = s.board.findIndex((tile, i) => !nodes.includes(i) && adjacent(tile, s.board[nodes.at(-1)]) && canMatchType(s, i, nodes));
        if (slot < 0) break; nodes.push(slot);
      }
      if (nodes.length > best.length) best = nodes;
    }
    return best.length >= 3 ? best : window.__dr.legalChain;
  });
}
try {
  await open(); await shot('main-desktop');
  const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mobile = await mobileCtx.newPage(); mobile.on('pageerror', e => errors.push(String(e)));
  await open(mobile); await shot('main-mobile', mobile);
  assert.equal(await mobile.evaluate(() => document.querySelector('canvas').width), 1125); checks.push('375x812 / DPR3 canvas and letterbox');
  // Use an actual touch tap on the mobile New Game button.
  const m = await point(160, 232, mobile); await mobile.touchscreen.tap(m.x, m.y); await advance(1000, mobile);
  assert.equal((await state(mobile)).screen, 'game'); await shot('game-mobile', mobile);
  await mobileCtx.close();
  await button('settings'); await button('language'); assert.equal((await state()).language, 'en');
  await button('language'); await button('mute'); await button('volume'); await shot('settings'); await button('return');
  await button('new'); assert.equal((await state()).screen, 'game'); await shot('game');
  const before = await page.evaluate(() => JSON.stringify(window.__dr.state));
  await page.setViewportSize({ width: 375, height: 812 }); await advance(100);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__dr.state)), before); checks.push('resize preserves entire rule snapshot/RNG');
  await page.setViewportSize({ width: 1280, height: 720 }); await advance(100);
  const nodes = await longChain(); await chain(nodes, false);
  await page.dispatchEvent('#game', 'pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 }); await page.mouse.up();
  assert.equal((await state()).turn, 0); assert.equal(await page.evaluate(() => window.__dr.state.chain.nodes.length), 0); checks.push('pointer cancellation never submits');
  await chain(nodes); counts.chains++;
  await button('menu'); await shot('game-menu');
  const frozen = await page.evaluate(() => JSON.stringify(window.__dr.state));
  const display = (await state()).health; await advance(30000);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__dr.state)), frozen); assert.equal((await state()).health, display); checks.push('menu freezes playback');
  await button('resume'); await advance(30000);
  let rewardShot = false, skillShot = false;
  for (let n = 0; n < 1500; n++) {
    await advance(30000); const s = await state();
    assert.equal(s.error, null); assert.equal(s.storageError, null);
    if (s.screen === 'game-over') break;
    if (s.screen === 'reward') {
      if (!rewardShot) { await shot('reward-menu'); rewardShot = true; }
      const candidates = s.menu.candidates.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.kind === 'skill') - Number(a.c.kind === 'skill'));
      for (const { i } of candidates.slice(0, s.menu.kind === 'level' ? 2 : 1)) await button(`candidate-${i}`);
      await button('confirm'); counts.menus++; continue;
    }
    assert.equal(s.screen, 'game');
    const trophy = await page.evaluate(() => window.__dr.state.board.findIndex(t => t.specialType === 2 && !t.frozen && !t.matched));
    if (trophy >= 0) { const p = await point(1 + (trophy % 6 + .5) * 53, 79 + (Math.floor(trophy / 6) + .5) * 53); await page.mouse.click(p.x, p.y); counts.trophies++; continue; }
    const skill = s.buttons.find(b => b.id.startsWith('skill-') && b.enabled);
    if (skill) { await button(skill.id); counts.skills++; if (!skillShot) { await shot('skill'); skillShot = true; } continue; }
    const move = await longChain(); assert(move?.length >= 3, `No chain at ${s.turn}`); await chain(move); counts.chains++;
  }
  const final = await state(); assert.equal(final.screen, 'game-over'); assert.equal(final.outcome.won, false); assert.equal(final.games, 1);
  assert(counts.menus > 0); assert(counts.skills > 0); await shot('game-over');
  checks.push('new game → reward menus → manual skills → natural death → profile increment');
  await page.reload(); await page.waitForFunction(() => !!window.render_game_to_text); await advance(1000);
  assert.equal((await state()).games, 1); assert.equal((await state()).phase, 'idle'); checks.push('reload cannot settle finished run twice');
  await open(page, '?debug');
  await page.locator('#seed').fill('42'); await page.locator('#cls').selectOption('1'); await page.locator('#diff').selectOption('2'); await page.locator('#mode').selectOption('1');
  page.once('dialog', d => d.accept()); await page.locator('#new').click(); await advance(1000);
  const debug = await page.evaluate(() => window.__dr.state); assert.equal(debug.character.classId, 1); assert.equal(debug.difficulty, 2); assert.equal(debug.mode, 1);
  assert.match(await page.locator('#log').innerText(), /新游戏开始/); await shot('debug'); checks.push('debug seed/class/difficulty/mode and shared persistence');
  await open(page, '?art=original'); assert.equal((await state()).art, '原版贴图（仅本地）'); checks.push('dev-only original atlas switch');
  assert.deepEqual(errors, []);
  await writeFile(new URL('acceptance.json', out), JSON.stringify({ checks, counts, final, errors }, null, 2));
  console.log(JSON.stringify({ checks, counts, turn: final.turn, score: final.score, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: fileURLToPath(new URL('failure.png', out)) });
  await writeFile(new URL('failure.json', out), JSON.stringify({ error: String(error), state: await state().catch(() => null), errors }, null, 2)); throw error;
} finally { await browser.close(); }
