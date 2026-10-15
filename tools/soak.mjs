// Standalone soak; deliberately excluded from npm run check. Uses installed Vite TS loader.
import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
const outputDir = process.env.SOAK_OUTPUT ?? '/tmp/dungeon-raid-t07-soak';
const seedCount = Number(process.env.SOAK_SEEDS ?? 1000);
const classes = [0, 1, 4];
if (!isMainThread) {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { simulate } = await server.ssrLoadModule('/test/soak-driver.ts');
    const { GameMode, Difficulty } = await server.ssrLoadModule('/src/core/data.ts');
    const modes = [GameMode.MODE_CLASSIC, GameMode.MODE_SPRINT, GameMode.MODE_PRETZEL];
    for (let seed = 1 + workerData.index; seed <= seedCount; seed += workerData.workers) {
      for (const mode of modes) for (const difficulty of Object.values(Difficulty)) for (const classId of classes) {
        const config = { seed, mode, difficulty, classId };
        try { parentPort.postMessage({ stats: simulate(config).stats }); }
        catch (error) {
          const name = `failure-${seed}-${mode}-${difficulty}-${classId}.json`;
          await writeFile(`${outputDir}/${name}`, JSON.stringify({ config, actions: error.actions, detail: error.detail ?? String(error) }));
          parentPort.postMessage({ failure: { config, file: name, detail: error.detail ?? String(error) } });
        }
      }
    }
  } finally { await server.close(); }
} else {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 1000) throw new Error('SOAK_SEEDS must be 1..1000');
  await mkdir(outputDir, { recursive: true });
  const requestedWorkers = Number(process.env.SOAK_WORKERS ?? 8);
  if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1) throw new Error('SOAK_WORKERS must be a positive integer');
  const workers = Math.min(requestedWorkers, os.availableParallelism(), seedCount);
  const summary = { seeds: seedCount, classes, expectedRuns: seedCount * 36, completedRuns: 0, anomalies: 0, groups: {}, causes: {}, specials: Array(32).fill(0), skillAppearances: Array(42).fill(0), casts: Array(42).fill(0), unlocks: Array(78).fill(0), failures: [], fixture: 'I1 synthetic 42 zero words; default engine policy unchanged' };
  const started = Date.now();
  console.log(`T07 soak: ${summary.expectedRuns} runs (${seedCount} seeds × 3 modes × 4 difficulties × ${classes.length} classes), ${workers} workers`);
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { index, workers } });
    worker.on('message', message => {
      if (message.failure) { summary.anomalies++; summary.failures.push(message.failure); console.error(`FAIL ${JSON.stringify(message.failure.config)} ${message.failure.detail.split('\n')[0]}`); }
      else {
        const s = message.stats; summary.completedRuns++;
        const key = `${s.config.mode}/${s.config.difficulty}`, g = summary.groups[key] ??= { runs: 0, turns: 0, score: 0 };
        g.runs++; g.turns += s.turns; g.score += s.score;
        summary.causes[s.cause] = (summary.causes[s.cause] ?? 0) + 1;
        for (const field of ['specials', 'skillAppearances', 'casts', 'unlocks']) s[field].forEach((n, i) => { summary[field][i] += n; });
      }
      const done = summary.completedRuns + summary.anomalies;
      if (done % 1000 === 0) console.log(`${done}/${summary.expectedRuns}, anomalies=${summary.anomalies}, elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
    });
    worker.on('error', reject); worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)));
  })));
  for (const g of Object.values(summary.groups)) { g.averageTurns = g.turns / g.runs; g.averageScore = g.score / g.runs; }
  summary.seconds = (Date.now() - started) / 1000;
  await writeFile(`${outputDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2)); console.log(`Artifacts: ${outputDir}`);
  if (summary.anomalies || summary.completedRuns !== summary.expectedRuns) process.exitCode = 1;
}
