import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
const record = JSON.parse(await readFile(process.argv[2], 'utf8'));
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { step } = await server.ssrLoadModule('/src/core/engine.ts');
  const { createRunState } = await server.ssrLoadModule('/src/core/state.ts');
  const { canMatchType, adjacent } = await server.ssrLoadModule('/src/core/chain.ts');
  const { canCastSkill } = await server.ssrLoadModule('/src/core/skills.ts');
  let s = createRunState({ scrollFilter: 'supplied-native-fixture' });
  for (const action of record.actions) s = step(s, action, { scrollNativeWord: () => 0 }).state;
  let legal = [];
  function walk(nodes) {
    const effective = nodes.filter((slot, i) => i === 0 || !s.board[nodes[i - 1]].arrow || [1, 4].includes(s.board[slot].type)).length;
    if (effective >= 3) { legal.push(nodes); return; }
    if (nodes.length >= 5) return;
    for (let i = 0; i < 36; i++) if (!nodes.includes(i) && (!nodes.length || adjacent(s.board[i], s.board[nodes.at(-1)])) && canMatchType(s, i, nodes)) walk([...nodes, i]);
  }
  walk([]);
  console.log(JSON.stringify({ config: record.config, turn: s.turn, phase: s.phase, health: s.health, armour: s.armour, skills: s.skills.map((k, i) => ({ ...k, canCast: canCastSkill(s, i) })), legalCount: legal.length, firstLegal: legal[0], board: s.board.map(t => ({ type: t.type, frozen: t.frozen, matched: t.matched, arrow: t.arrow, special: t.specialType, enemy: t.enemyType, hp: t.health, attack: t.attack })) }, null, 2));
} finally { await server.close(); }
