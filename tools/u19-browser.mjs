import { homedir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? `${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url = process.env.U19_URL ?? 'http://localhost:5319', out = process.env.U19_OUT ?? '/tmp/U19-browser';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [], errors = [];
const snap = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms = 2000) => p.evaluate(ms => window.advanceTime(ms), ms);
async function ready(p) { await p.waitForFunction(() => !!window.advanceTime); await advance(p); }
async function point(p, x, y) { const { viewport: v } = await snap(p); return { x: v.x + x * v.width / 320, y: v.y + y * v.height / 480 }; }
async function click(p, id) { const s = await snap(p), b = s.buttons.find(b => b.id === id); assert(b, `missing ${id} on ${s.screen}`); const pt = await point(p, b.x + b.w / 2, b.y + b.h / 2); await p.mouse.click(pt.x, pt.y); await advance(p); }
try {
  for (const missing of [false, true]) for (const language of ['zh', 'en']) for (const mobile of [false, true]) {
    const name = `${missing ? 'fallback' : 'native'}-${language}-${mobile ? 'mobile' : 'desktop'}`;
    const context = await browser.newContext({ viewport: mobile ? { width: 393, height: 851 } : { width: 1024, height: 768 }, hasTouch: mobile });
    await context.addInitScript(({ missing, language }) => {
      if (missing) { delete window.structuredClone; delete Array.prototype.at; delete Object.hasOwn; }
      localStorage.setItem('dungeonraid.language', language);
      localStorage.setItem('dungeonraid.help.v1', JSON.stringify({ bits: 0, enabled: false }));
    }, { missing, language });
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(`${name}: ${e}`)); p.on('console', e => { if (e.type() === 'error') errors.push(`${name}: ${e.text()}`); });
    await p.goto(url); await ready(p); assert.equal((await snap(p)).screen, 'main');
    await click(p, 'new'); await click(p, 'class'); await click(p, 'back'); await click(p, 'start'); await click(p, 'begin'); await advance(p, 20000);
    assert.equal((await snap(p)).screen, 'game');
    const chain = await p.evaluate(() => window.__dr.legalChain); assert(chain?.length >= 3);
    const pts = await Promise.all(chain.map(slot => point(p, 1 + (slot % 6 + .5) * 53, 79 + (Math.floor(slot / 6) + .5) * 53)));
    if (mobile) {
      const cdp = await context.newCDPSession(p);
      for (const [n, pt] of pts.entries()) await cdp.send('Input.dispatchTouchEvent', { type: n ? 'touchMove' : 'touchStart', touchPoints: [{ ...pt, id: 1 }] });
      await advance(p, 16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down(); for (const pt of pts.slice(1)) await p.mouse.move(pt.x, pt.y); await advance(p, 16); await p.mouse.up(); }
    await advance(p, 30000); const state = await p.evaluate(() => JSON.stringify(window.__dr.state)); assert.equal(JSON.parse(state).turn, 1);
    await p.reload(); await ready(p); await click(p, 'continue'); await advance(p, 20000);
    assert.equal(await p.evaluate(() => JSON.stringify(window.__dr.state)), state);
    await click(p, 'stats'); await click(p, 'close');
    if (missing) await p.screenshot({ path: `${out}/${name}.png` });
    assert.equal(await p.evaluate(() => typeof window.structuredClone), missing ? 'undefined' : 'function');
    results.push({ name, turn: (await snap(p)).turn, resumeIdentical: true }); await context.close();
  }
  // Debug entry uses the same cloning helper and remains usable without the API.
  const c = await browser.newContext(); await c.addInitScript(() => { delete window.structuredClone; delete Array.prototype.at; delete Object.hasOwn; });
  const p = await c.newPage(); p.on('pageerror', e => errors.push(`debug: ${e}`));
  await p.goto(`${url}/?debug`); await ready(p); await p.locator('#new').click(); await advance(p, 20000); assert.equal((await snap(p)).screen, 'debug'); assert.equal((await snap(p)).error, null); await c.close();
  assert.deepEqual(errors, []); writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2)); console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
