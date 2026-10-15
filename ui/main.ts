// Debug UI for the P2 rules engine: drives `step` only, never mutates engine state directly.
import tilesUrl from "@art/tiles.png";
import enumsJson from "../data/enums.json";
import { hitTile } from "../src/core/chain";
import { Difficulty, GameMode, TileType } from "../src/core/data";
import { step, type Action, type GameEvent } from "../src/core/engine";
import { createRunState, type RunState, type Tile } from "../src/core/state";

// Tile::SetType / UpdateEnemyUV @0x64ef8/@0x64b04: 0.051757812 * 1024 = 53px cells.
const CELL_PX = 53;
// Tile::GetEnemyUV @0x62b44: special enemy e at ((e-1)%8, (e-1)>>3), v offset 0.65625.
const ENEMY_V0 = 0.65625 * 1024;
const TILE = 64;
const BOARD = TILE * 6;
const STEP_DELAY = { falling: 180, attack: 260 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;
const sheet = new Image();
sheet.src = tilesUrl;
sheet.onload = () => draw();

const dpr = Math.max(1, window.devicePixelRatio || 1);
canvas.width = BOARD * dpr;
canvas.height = BOARD * dpr;
canvas.style.width = `${BOARD}px`;
canvas.style.height = `${BOARD}px`;
ctx.scale(dpr, dpr);

type EnumEntry = { name: string; value: number; displayName?: { text?: string } | null };
const enums = (enumsJson as unknown as { enums: Record<string, EnumEntry[]> }).enums;
const label = (e: EnumEntry) => e.displayName?.text ?? e.name;

let state: RunState = createRunState();
let busy = false;
let dragging = false;
let lastHover: number | null = null;
let fall: { progress: number } | null = null;
let flash = 0;

// ---------- controls ----------
function fillSelect(id: string, entries: EnumEntry[], selected: number) {
  const el = $<HTMLSelectElement>(id);
  el.innerHTML = entries.map(e => `<option value="${e.value}" ${e.value === selected ? "selected" : ""}>${label(e)}</option>`).join("");
}
fillSelect("cls", enums.ClassType!.filter(e => !e.name.endsWith("_COUNT")), 0);
fillSelect("diff", enums.Difficulty!.filter(e => !e.name.endsWith("_COUNT")), Difficulty.DIFF_NORMAL);
fillSelect("mode", enums.GameMode!.filter(e => e.value === GameMode.MODE_CLASSIC || e.value === GameMode.MODE_SPRINT), GameMode.MODE_CLASSIC);
$<HTMLInputElement>("seed").value = String(Math.floor(Math.random() * 1e9));
$("new").addEventListener("click", () => newGame());

function newGame() {
  const num = (id: string) => Number($<HTMLSelectElement | HTMLInputElement>(id).value);
  logLines.length = 0;
  apply({ type: "NewGame", seed: num("seed"), classId: num("cls"), difficulty: num("diff"), mode: num("mode") });
  hideModal();
}

// ---------- engine driving ----------
const logLines: string[] = [];
function log(line: string) {
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  const el = $("log");
  el.textContent = logLines.join("\n");
  el.scrollTop = el.scrollHeight;
}

function describe(e: GameEvent): string | null {
  switch (e.type) {
    case "EnemyAttack": return `敌人攻击 ${e.attack}：护甲挡 ${e.blocked}，掉血 ${e.damage}，护甲损 ${e.armourLoss}`;
    case "PlayerHealth": return `HP ${e.before} → ${e.after}（${e.source}）`;
    case "EnemyDamaged": return `格 ${e.slot} 受伤 ${e.healthLoss}${e.armourLoss ? `，破甲 ${e.armourLoss}` : ""}${e.killed ? " ✝击杀" : ""}`;
    case "MenuRequested": return `菜单：${e.menu.kind}`;
    case "TurnEnded": return `—— 第 ${e.turn} 回合结束 ——`;
    case "SpecialEnemyPending": return `特殊敌人生成（T05 前按普通敌人占位）`;
    case "GameOver": return `游戏结束：${e.outcome.won ? "胜利" : "死亡"}（${e.outcome.cause}，第 ${e.outcome.turn} 回合）`;
    case "CompatibilityNotice": return `提示：${e.message}`;
    case "NewGameStarted": return `新游戏开始`;
    default: return null;
  }
}

function apply(action: Action): GameEvent[] {
  try {
    const r = step(state, action);
    state = r.state;
    for (const e of r.events) {
      const line = describe(e);
      if (line) log(line);
      if (e.type === "EnemyAttack" && e.damage > 0) flash = 1;
    }
    return r.events;
  } catch (err) {
    log(`⚠ ${action.type}: ${(err as Error).message}`);
    return [];
  } finally {
    render();
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function animateFall() {
  if (!state.moving.length) return;
  fall = { progress: 0 };
  const start = performance.now();
  // Timer-driven (not rAF) so a hidden tab cannot stall the turn.
  while (fall.progress < 1) {
    await sleep(16);
    fall.progress = Math.min(1, (performance.now() - start) / STEP_DELAY.falling);
    draw();
  }
  fall = null;
}

/** Same drain order as test/turn-helpers nextAction, with pauses for falling and attacks. */
async function settle() {
  busy = true;
  for (let guard = 0; guard < 2000 && state.phase !== "input" && state.phase !== "ended"; guard++) {
    if (state.phase === "menu") { showMenu(); busy = false; return; }
    if (state.phase === "falling") { await animateFall(); apply({ type: "AdvancePhase" }); continue; }
    if (state.pending.length) { apply({ type: "ConsumeEffect", id: state.pending[0]!.id }); continue; }
    const wasAttack = state.phase === "enemy-attack";
    apply({ type: "AdvancePhase" });
    if (wasAttack) await sleep(STEP_DELAY.attack);
  }
  busy = false;
  if (state.phase === "ended") showGameOver();
  render();
}

// ---------- modal ----------
const MENU_NAMES: Record<string, string> = { level: "升级", shop: "商店", upgrade: "装备强化", class: "职业" };
function showMenu() {
  const m = state.menus[0]!;
  $("modal-text").textContent = `${MENU_NAMES[m.kind] ?? m.kind}菜单（具体选项在 T06 实现，现在只能跳过）`;
  $("modal-btn").textContent = "跳过并继续";
  $("modal-btn").onclick = () => { hideModal(); apply({ type: "ChooseMenuOption", menuId: m.id, option: "skip" }); void settle(); };
  $("modal").classList.add("show");
}
function showGameOver() {
  const o = state.outcome!;
  $("modal-text").textContent = o.won ? `冲刺成功！第 ${o.turn} 回合` : `你倒下了（${o.cause}），坚持到第 ${o.turn} 回合`;
  $("modal-btn").textContent = "再来一局";
  $("modal-btn").onclick = () => { $<HTMLInputElement>("seed").value = String(Math.floor(Math.random() * 1e9)); newGame(); };
  $("modal").classList.add("show");
}
function hideModal() { $("modal").classList.remove("show"); }

// ---------- input ----------
function boardPoint(ev: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * 6, y: ((ev.clientY - r.top) / r.height) * 6 };
}
canvas.addEventListener("pointerdown", ev => {
  if (busy || state.phase !== "input") return;
  const at = hitTile(boardPoint(ev));
  if (!at) return;
  canvas.setPointerCapture(ev.pointerId);
  dragging = true;
  lastHover = at.y * 6 + at.x;
  apply({ type: "SelectTile", at });
});
canvas.addEventListener("pointermove", ev => {
  if (!dragging) return;
  const at = hitTile(boardPoint(ev));
  if (!at) return;
  const slot = at.y * 6 + at.x;
  if (slot === lastHover) return;
  lastHover = slot;
  apply({ type: "SelectTile", at });
});
const release = () => {
  if (!dragging) return;
  dragging = false;
  lastHover = null;
  const valid = state.preview.valid;
  apply({ type: valid ? "CommitChain" : "CancelChain" });
  if (valid) void settle();
};
// Listen on window: the finger/mouse is often released outside the board.
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
window.addEventListener("mouseup", release);

// ---------- rendering ----------
function tilePos(slot: number, t: Tile) {
  const mv = fall ? state.moving.find(m => m.slot === slot) : undefined;
  if (!mv) return { x: t.x * TILE, y: t.y * TILE };
  const p = fall!.progress;
  return { x: (mv.from.x + (mv.to.x - mv.from.x) * p) * TILE, y: (mv.from.y + (mv.to.y - mv.from.y) * p) * TILE };
}

function drawTile(slot: number, t: Tile) {
  if (t.type === TileType.TILE_NONE || (t.matched && !fall)) return;
  const { x, y } = tilePos(slot, t);
  let sx = t.appearance * CELL_PX, sy = t.type * CELL_PX;
  if (t.type === TileType.TILE_SKULL && t.enemyType > 0) {
    sx = ((t.enemyType - 1) % 8) * CELL_PX;
    sy = ENEMY_V0 + ((t.enemyType - 1) >> 3) * CELL_PX;
  }
  ctx.globalAlpha = t.broken ? 0.45 : 1;
  ctx.drawImage(sheet, sx, sy, CELL_PX, CELL_PX, x, y, TILE, TILE);
  ctx.globalAlpha = 1;
  if (t.frozen) { ctx.fillStyle = "#7fd4ff55"; ctx.fillRect(x, y, TILE, TILE); }
  if (t.selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); }
  const marks = [t.arrow && "➶", t.magicSword && "✦", t.mana && "◆", t.burning && "🔥"].filter(Boolean).join("");
  if (marks) text(marks, x + TILE - 4, y + 14, "#fff", "right", 12);
  if (t.type === TileType.TILE_SKULL) {
    text(String(t.attack), x + 4, y + 14, "#ff6b6b", "left", 13);
    if (t.defence) text(String(t.defence), x + TILE - 4, y + 14, "#9fc2ff", "right", 13);
    text(String(t.health), x + TILE / 2, y + TILE - 6, "#fff", "center", 16);
    if (t.statsStatus === "special-pending") text("?", x + TILE - 6, y + TILE - 6, "#ffd34d", "right", 13);
    const pv = state.preview.enemies.find(e => e.slot === slot);
    if (pv && state.chain.nodes.length) {
      ctx.fillStyle = pv.lethal ? "#ff2a2a66" : "#ffaa0033";
      ctx.fillRect(x, y, TILE, TILE);
      text(pv.lethal ? "✝" : `-${pv.healthLoss}`, x + TILE / 2, y + 36, pv.lethal ? "#fff" : "#ffd27a", "center", pv.lethal ? 22 : 14);
    }
  }
}

function text(s: string, x: number, y: number, color: string, align: CanvasTextAlign, size: number) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function drawChain() {
  const nodes = state.chain.nodes;
  if (nodes.length < 2) return;
  ctx.strokeStyle = state.preview.valid ? "#ffffffcc" : "#ffffff66";
  ctx.lineWidth = 6;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.beginPath();
  nodes.forEach((slot, i) => {
    const t = state.board[slot]!;
    const px = t.x * TILE + TILE / 2, py = t.y * TILE + TILE / 2;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function draw() {
  ctx.fillStyle = "#1b1622";
  ctx.fillRect(0, 0, BOARD, BOARD);
  if (!sheet.complete || state.phase === "idle") {
    text("选好设置后点「新游戏」", BOARD / 2, BOARD / 2, "#ccc", "center", 16);
    return;
  }
  state.board.forEach((t, slot) => drawTile(slot, t));
  drawChain();
  if (flash > 0) {
    ctx.fillStyle = `rgba(220,30,40,${0.35 * flash})`;
    ctx.fillRect(0, 0, BOARD, BOARD);
    flash = Math.max(0, flash - 0.08);
    requestAnimationFrame(draw);
  }
}

function bar(name: string, value: number, max: number, color: string, extra = "") {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar"><i style="width:${pct}%;background:${color}"></i><span>${name} ${value}/${max}${extra}</span></div>`;
}

function renderHud() {
  const s = state;
  if (s.phase === "idle") { $("hud").innerHTML = `<div class="note">尚未开始</div>`; $("preview").innerHTML = ""; return; }
  const maxHp = s.base.maxHealth + s.equipmentStats.maxHealth;
  const r = s.resources;
  $("hud").innerHTML = `
    <div>第 <b>${s.turn}</b> 回合 · 等级 <b>${s.level}</b> · 阶段 ${s.phase}</div>
    ${bar("生命", s.health, maxHp, "var(--hp)", s.playerPoison ? ` ☠${s.playerPoison}` : "")}
    ${bar("护甲", s.armour, s.equipmentStats.maxArmour, "var(--armour)")}
    ${bar("经验", r.xp.remainder, 100, "var(--xp)", ` · 累计 ${r.xp.banked + r.xp.remainder}`)}
    ${bar("金币", r.gold.remainder, 100, "var(--gold)", ` · 累计 ${r.gold.banked + r.gold.remainder}`)}
    ${bar("强化", r.upgrade.remainder, 100, "var(--up)", ` · 累计 ${r.upgrade.banked + r.upgrade.remainder}`)}
    <div class="note">基础伤害 ${s.base.damage + s.equipmentStats.damage} · 每剑 +${s.equipmentStats.weaponDamage}</div>`;
  const p = s.preview;
  if (!s.chain.nodes.length) { $("preview").innerHTML = `<span class="note">拖动连接 3 个以上相邻同类格子（剑可连骷髅）</span>`; return; }
  const kills = p.enemies.filter(e => e.lethal).length;
  $("preview").innerHTML = `链长 ${p.effectiveLength}${p.valid ? "" : "（不足 3）"} · 伤害 <b>${p.damage}</b>` +
    (p.enemies.length ? ` · 命中 ${p.enemies.length} 只，击杀 <b>${kills}</b>` : "") +
    (p.leech ? ` · 吸血 ${p.leech}` : "") + (p.spikes ? ` · 反伤 ${p.spikes}` : "");
}

function render() { renderHud(); draw(); }

// Read-only debug handle for the browser console.
(window as unknown as { __dr: object }).__dr = { get state() { return structuredClone(state); }, get busy() { return busy; } };

render();
newGame();
