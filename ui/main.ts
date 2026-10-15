// Debug UI for the P2 rules engine: drives `step` only, never mutates engine state directly.
// "@sheet" is aliased per build mode: original art locally, the original-free art pack for public builds.
import { SHEET } from "@sheet";
import enumsJson from "../data/enums.json";
import { adjacent, canMatchType, hitTile } from "../src/core/chain";
import { consumeAchievements } from "../src/core/achievements";
import { applyClassLevelChanged, applyRunResult, prepareNewRun } from "../src/core/profile";
import { deserializeProfile, deserializeRun, serializeProfile, serializeRun } from "../src/core/save";
import { getScore, scoreBreakdown } from "../src/core/scoring";
import { scrollNativeWord } from "./scroll-i1";
import { Difficulty, GameMode, TileType, enumData, getNativeSkill, itemData } from "../src/core/data";
import { itemName } from "../src/core/equipment";
import { skillDescription } from "../src/core/menus";
import { canCastSkill } from "../src/core/skills";
import { step, type Action, type GameEvent } from "../src/core/engine";
import { createProfileState, createRunState, type ItemState, type MenuCandidate, type ProfileState, type RunState, type SkillState, type Tile } from "../src/core/state";

// Tile::SetType / UpdateEnemyUV @0x64ef8/@0x64b04: 0.051757812 * 1024 = 53px cells.
// All atlas coordinates below are in native 1024 units and multiplied by SHEET.scale.
const NATIVE_CELL = 53;
// Tile::GetEnemyUV @0x62b44: special enemy e at ((e-1)%8, (e-1)>>3), v offset 0.65625.
const ENEMY_V0 = 0.65625 * 1024;
const TILE = 64;
const BOARD = TILE * 6;
const STEP_DELAY = { falling: 180, attack: 260 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;
const sheet = new Image();
sheet.src = SHEET.url;
sheet.onload = () => draw();

const dpr = Math.max(1, window.devicePixelRatio || 1);
canvas.width = BOARD * dpr;
canvas.height = BOARD * dpr;
// CSS sizes the canvas (max 384px, shrinks on phones); input maps through getBoundingClientRect.
ctx.scale(dpr, dpr);

type EnumEntry = { name: string; value: number; displayName?: { text?: string } | null };
const enums = (enumsJson as unknown as { enums: Record<string, EnumEntry[]> }).enums;
const label = (e: EnumEntry) => e.displayName?.text ?? e.name;
const enumOf = (group: string, name: string) => enums[group]!.find(e => e.name === name)!.value;
const LICH = enumOf("EnemyType", "ENEMY_LICH");
const SPECIAL_CHAIN = enumOf("SpecialTileType", "SPECIAL_TILE_CHAIN");
const SPECIAL_TROPHY = enumOf("SpecialTileType", "SPECIAL_TILE_TROPHY");
// Enemies with no active ActivateAbility case still emit EnemyAbility; only log real actors.
const ENEMY_ABILITY_LOG = new Set<number>([3, 4, 6, 7, 8, 10, 11, 13, 14, 16, 17, 18, 19, 22, 23, 24, 25, 26, 28, 31, 32]);
const className = (id: number) => enums.ClassType!.find(e => e.value === id)?.displayName?.text ?? `#${id}`;
const ENEMY_NAMES: Record<number, string> = Object.fromEntries(enums.EnemyType!.map(e => [e.value, e.displayName?.text ?? ""]));

// I1 interim policy (ui/scroll-i1.ts): without it the engine rejects every shop that rolls a scroll.
const ENGINE_OPTIONS = { scrollFilter: "supplied-native-fixture" as const };
const HOOKS = { scrollNativeWord };
let state: RunState = createRunState(ENGINE_OPTIONS);

// ---------- persistence (the engine never touches storage) ----------
const RUN_KEY = "dungeonraid.run.v1";
const PROFILE_KEY = "dungeonraid.profile.v1";
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode: play without saves */ } },
  remove(key: string) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
function loadProfile(): ProfileState {
  const raw = store.get(PROFILE_KEY);
  if (raw) { try { return deserializeProfile(raw); } catch (err) { console.warn("profile unreadable, starting fresh", err); } }
  return createProfileState();
}
let profile: ProfileState = loadProfile();
const saveProfile = () => store.set(PROFILE_KEY, serializeProfile(profile));
function saveRun() {
  if (state.phase === "idle" || state.phase === "ended") return;
  store.set(RUN_KEY, serializeRun(state).json);
}
/** Profile settlement and run removal happen together so a finished run is never counted twice. */
function finishRun() {
  profile = applyRunResult(profile, state);
  saveProfile();
  store.remove(RUN_KEY);
}
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
fillSelect("mode", enums.GameMode!.filter(e => !e.name.endsWith("_COUNT")), GameMode.MODE_CLASSIC);
$<HTMLInputElement>("seed").value = String(Math.floor(Math.random() * 1e9));
$("new").addEventListener("click", () => newGame());

function newGame() {
  if (state.phase !== "idle" && state.phase !== "ended" && !confirm("放弃当前对局并开始新游戏？")) return;
  const num = (id: string) => Number($<HTMLSelectElement | HTMLInputElement>(id).value);
  logLines.length = 0;
  state = prepareNewRun(profile, createRunState(ENGINE_OPTIONS));
  apply({ type: "NewGame", seed: num("seed"), classId: num("cls"), difficulty: num("diff"), mode: num("mode") });
  saveRun();
  hideModal();
}

function resumeOrStart() {
  const raw = store.get(RUN_KEY);
  if (raw) {
    try {
      state = deserializeRun(raw);
      log("已恢复上次未完成的对局");
      render();
      if (state.phase !== "input") void settle();
      return;
    } catch (err) {
      console.warn("saved run unreadable, discarded", err);
      store.remove(RUN_KEY);
    }
  }
  newGame();
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
    case "SpecialEnemyGenerated": return `特殊敌人出现：${ENEMY_NAMES[e.enemyType] ?? e.enemyType}（格 ${e.slot}）`;
    case "EnemyAbility": return ENEMY_ABILITY_LOG.has(e.enemyType) ? `${ENEMY_NAMES[e.enemyType]} 发动能力（格 ${e.slot}）` : null;
    case "TrophyGenerated": return `奖杯出现（格 ${e.slot}），点击即可领取`;
    case "GameOver": return `游戏结束：${e.outcome.won ? "胜利" : "死亡"}（${e.outcome.cause}，第 ${e.outcome.turn} 回合）`;
    case "CompatibilityNotice": return `提示：${e.message}`;
    case "NewGameStarted": return `新游戏开始`;
    case "PretzelScored": return `Pretzel：本链交叉 ${e.points} 分（评级 ${e.rating}），累计 ${e.total}`;
    case "ClassLevelChanged": return `职业 ${className(e.classId)}：等级 ${e.before} → ${e.after}`;
    default: return null;
  }
}

function apply(action: Action): GameEvent[] {
  try {
    const r = step(state, action, HOOKS);
    state = r.state;
    for (const e of r.events) {
      const line = describe(e);
      if (line) log(line);
      if (e.type === "EnemyAttack" && e.damage > 0) flash = 1;
      if (e.type === "ClassLevelChanged") { profile = applyClassLevelChanged(profile, e, state.difficulty); saveProfile(); }
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
  drainAchievements();
  if (state.phase === "ended") { finishRun(); showGameOver(); }
  else { saveRun(); if (isStuck()) showStuck(); }
  render();
}

const ACHIEVEMENT_NAMES: Record<number, string> = Object.fromEntries(enums.Achievement!.map(e => [e.value, e.displayName?.text ?? e.name]));
function drainAchievements() {
  const r = consumeAchievements(profile, state);
  profile = r.profile;
  state = r.state;
  for (const e of r.events) if (e.unlocked) log(`🏆 成就解锁：${ACHIEVEMENT_NAMES[e.id] ?? e.id}`);
  if (r.events.length) saveProfile();
}

/** Same rule as the soak driver's exhaustive search: >=3 effective nodes (arrow-skipped tiles excluded), <=5 nodes. */
function hasLegalChain(s: RunState): boolean {
  const effective = (nodes: number[]) => nodes.filter((slot, i) => i === 0 || !s.board[nodes[i - 1]!]!.arrow || [TileType.TILE_SKULL, TileType.TILE_SWORD].includes(s.board[slot]!.type)).length;
  const visit = (nodes: number[]): boolean => {
    if (effective(nodes) >= 3) return true;
    if (nodes.length >= 5) return false;
    for (let i = 0; i < 36; i++) {
      if (nodes.includes(i) || (nodes.length && !adjacent(s.board[i]!, s.board[nodes.at(-1)!]!)) || !canMatchType(s, i, nodes)) continue;
      if (visit([...nodes, i])) return true;
    }
    return false;
  };
  return visit([]);
}
function isStuck(): boolean {
  if (state.phase !== "input") return false;
  if (state.skills.some((_, slot) => canCastSkill(state, slot))) return false;
  if (state.board.some(t => t.specialType === SPECIAL_TROPHY && !t.frozen && !t.matched)) return false;
  return !hasLegalChain(state);
}
function showStuck() {
  $("modal-text").textContent = "棋盘上已经没有可以连的线了。原版程序对这种情况也没有处理（没有洗牌规则），只能开始新游戏。";
  const btn = $<HTMLButtonElement>("modal-btn");
  btn.textContent = "开始新游戏";
  btn.disabled = false;
  btn.onclick = () => { finishRun(); state = createRunState(ENGINE_OPTIONS); $<HTMLInputElement>("seed").value = String(Math.floor(Math.random() * 1e9)); newGame(); };
  $("modal").classList.add("show");
}

// ---------- modal ----------
const MENU_NAMES: Record<string, string> = { level: "升级：选 2 项", shop: "商店：买 1 件", upgrade: "装备强化：选 1 项", class: "职业" };
const upgradeName = (stat: number) => itemData.upgrades.find(u => u.nativeId === stat)?.displayName.text ?? `属性${stat}`;
const slotName = (type: number) => itemData.slots.find(x => x.itemType.value === type)?.itemType.name ?? `槽${type}`;
const statName = (stat: number) => enumData.enums.StatType.find(x => x.value === stat)?.displayName?.text ?? `属性${stat}`;
const skillName = (id: number) => getNativeSkill(id).displayName.text;
const itemStats = (item: ItemState) => item.stats.map((v, i) => (v ? `${upgradeName(i)} ${v > 0 ? "+" : ""}${v}` : "")).filter(Boolean).join("，");
function skillLine(sk: SkillState) {
  const owned = state.skills.find(x => x?.id === sk.id);
  return `<b>${skillName(sk.id)}</b> Lv${sk.level} · CD ${sk.cooldown}${owned ? `（已有 Lv${owned.level}）` : "（新）"}<br><span class="note">${skillDescription(sk.id)}</span>`;
}
function describeCandidate(c: MenuCandidate): string {
  switch (c.kind) {
    case "skill": return skillLine(c.skill);
    case "stat": return `<b>${statName(c.stat)}</b> 属性提升`;
    case "item": {
      const worn = state.equipment.find(e => e?.type === c.item.type);
      return `<b>${itemName(c.item)}</b>（${slotName(c.item.type)}）<br><span class="note">${itemStats(c.item) || "无属性"}${worn ? `<br>当前：${itemStats(worn) || "无属性"}` : ""}</span>` +
        (c.scroll ? `<br><span class="note">附带卷轴：${skillName(c.scroll.id)}</span>` : "");
    }
    case "upgrade": return `<b>${slotName(c.itemType)}</b>：${upgradeName(c.stat)} +${c.value}`;
  }
}
function showMenu() {
  const m = state.menus[0]!;
  const need = m.kind === "level" ? 2 : 1;
  const list = m.candidates.map((c, i) => {
    const order = m.selected.indexOf(i);
    return `<button class="cand ${order >= 0 ? "sel" : ""}" data-i="${i}">${order >= 0 ? `<i>${order + 1}</i>` : ""}${describeCandidate(c)}</button>`;
  }).join("");
  $("modal-text").innerHTML = `<b>${MENU_NAMES[m.kind] ?? m.kind}</b>（已选 ${m.selected.length}/${need}）<div class="cands">${list}</div>`;
  $("modal-text").querySelectorAll<HTMLButtonElement>(".cand").forEach(b => {
    b.onclick = () => { apply({ type: "SelectMenuItem", menuId: m.id, index: Number(b.dataset.i) }); showMenu(); };
  });
  const btn = $<HTMLButtonElement>("modal-btn");
  btn.textContent = "确认";
  btn.disabled = m.selected.length < need;
  btn.onclick = () => { hideModal(); apply({ type: "ConfirmMenu", menuId: m.id }); void settle(); };
  $("modal").classList.add("show");
}
const CAUSES: Record<string, string> = { "enemy-attack": "敌人攻击", poison: "中毒", fire: "火焰", spikes: "尖刺反伤", acid: "酸液", "thrown-skull": "被投掷的敌人", fleeing: "逃跑者", assassin: "刺客", thief: "盗贼", kamikaze: "自爆", sprint: "冲刺" };
function scoreLine(): string {
  const b = scoreBreakdown(state);
  const c = b.contributions;
  const parts = [`经验 ${c.xp}`, `金币 ${c.gold}`, `强化 ${c.upgrade}`, c.turns ? `回合 ${c.turns}` : "", c.skills ? `技能 ${c.skills}` : "", c.pretzels ? `交叉 ${c.pretzels}` : ""].filter(Boolean).join(" + ");
  const pretzel = b.pretzel ? `<br>平均交叉 ${(b.pretzel.averageTimes10 / 10).toFixed(1)} · 最多 ${b.pretzel.maxCrosses} · 计分链 ${b.pretzel.scoringChains}` : "";
  return `<b style="font-size:20px">${b.score} 分</b><br><span class="note">${parts}${b.multiplier !== 1 ? ` · ×${b.multiplier}` : ""}${pretzel}</span>`;
}
function showGameOver() {
  const o = state.outcome!;
  const b = scoreLine();
  $("modal-text").innerHTML = (o.won ? `冲刺成功！第 ${o.turn} 回合` : `你倒下了（${CAUSES[o.cause] ?? o.cause}），坚持到第 ${o.turn} 回合`) + `<br><br>${b}`;
  $("modal-btn").textContent = "再来一局";
  $<HTMLButtonElement>("modal-btn").disabled = false;
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
  const slot = at.y * 6 + at.x;
  if (state.board[slot]!.specialType === SPECIAL_TROPHY) {
    apply({ type: "ClaimTrophy", slot });
    void settle();
    return;
  }
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
  let sx = t.appearance * NATIVE_CELL, sy = t.type * NATIVE_CELL;
  const phylactery = t.type === TileType.TILE_SKULL && t.enemyType === LICH && t.countdown !== 0;
  if (t.specialType === SPECIAL_CHAIN || t.specialType === SPECIAL_TROPHY) {
    // Tile::SetSpecialType @0x65004: chain (0.5,0.4482), trophy (0.6035,0.4482).
    sx = t.specialType === SPECIAL_TROPHY ? 618 : 512;
    sy = 459;
  } else if (phylactery) {
    // Tile::UpdateEnemyUV @0x64b04: Lich phylactery (0.6553,0.4482).
    sx = 671; sy = 459;
  } else if (t.type === TileType.TILE_SKULL && t.enemyType > 0) {
    sx = ((t.enemyType - 1) % 8) * NATIVE_CELL;
    sy = ENEMY_V0 + ((t.enemyType - 1) >> 3) * NATIVE_CELL;
  }
  ctx.globalAlpha = t.broken ? 0.45 : 1;
  const k = SHEET.scale;
  ctx.drawImage(sheet, sx * k, sy * k, NATIVE_CELL * k, NATIVE_CELL * k, x, y, TILE, TILE);
  ctx.globalAlpha = 1;
  if (t.frozen) { ctx.fillStyle = "#7fd4ff55"; ctx.fillRect(x, y, TILE, TILE); }
  if (t.selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4); }
  const marks = [t.arrow && "➶", t.magicSword && "✦", t.mana && "◆", t.burning && "🔥"].filter(Boolean).join("");
  if (marks) text(marks, x + TILE - 4, y + 14, "#fff", "right", 12);
  if (t.burning && t.fireDamage) text(`🔥${t.fireDamage}`, x + 4, y + TILE - 6, "#ffb347", "left", 11);
  if (t.type === TileType.TILE_SKULL && !phylactery && t.countdown > 0) text(`⏱${t.countdown}`, x + 4, y + TILE - 6, "#ffd34d", "left", 12);
  if (phylactery) { text(`复活 ${t.countdown}`, x + TILE / 2, y + TILE - 6, "#ffd34d", "center", 12); return; }
  if (t.type === TileType.TILE_SKULL) {
    if (t.enemyType > 0) text(ENEMY_NAMES[t.enemyType] ?? "", x + TILE / 2, y + 26, "#ffe9a8", "center", 9);
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
    <div>第 <b>${s.turn}</b> 回合 · 等级 <b>${s.level}</b> · 分数 <b>${getScore(s)}</b> · ${className(s.character.classId)}</div>
    ${s.mode === GameMode.MODE_PRETZEL ? `<div class="note">Pretzel：本链交叉 ${s.pretzel.crosses}（预计 ${s.pretzel.preview} 分）· 累计 ${s.pretzel.score} · 最多 ${s.pretzel.maxCrosses}</div>` : ""}
    ${bar("生命", s.health, maxHp, "var(--hp)", s.playerPoison ? ` ☠${s.playerPoison}` : "")}
    ${bar("护甲", s.armour, s.equipmentStats.maxArmour, "var(--armour)")}
    ${bar("经验", r.xp.remainder, 100, "var(--xp)", ` · 累计 ${r.xp.banked + r.xp.remainder}`)}
    ${bar("金币", r.gold.remainder, 100, "var(--gold)", ` · 累计 ${r.gold.banked + r.gold.remainder}`)}
    ${bar("强化", r.upgrade.remainder, 100, "var(--up)", ` · 累计 ${r.upgrade.banked + r.upgrade.remainder}`)}
    <div class="note">基础伤害 ${s.base.damage + s.equipmentStats.damage} · 每剑 +${s.equipmentStats.weaponDamage}</div>
    <div class="note">${s.equipment.filter(Boolean).map(e => `${itemName(e!)}：${itemStats(e!) || "—"}`).join("<br>")}</div>`;
  const p = s.preview;
  if (!s.chain.nodes.length) { $("preview").innerHTML = `<span class="note">拖动连接 3 个以上相邻同类格子（剑可连骷髅）</span>`; return; }
  const kills = p.enemies.filter(e => e.lethal).length;
  $("preview").innerHTML = `链长 ${p.effectiveLength}${p.valid ? "" : "（不足 3）"} · 伤害 <b>${p.damage}</b>` +
    (p.enemies.length ? ` · 命中 ${p.enemies.length} 只，击杀 <b>${kills}</b>` : "") +
    (p.leech ? ` · 吸血 ${p.leech}` : "") + (p.spikes ? ` · 反伤 ${p.spikes}` : "");
}

function renderSkills() {
  const el = $("skills");
  if (state.phase === "idle") { el.innerHTML = ""; return; }
  el.innerHTML = state.skills.map((sk, slot) => {
    if (!sk) return `<button class="skill" disabled>空</button>`;
    const ready = canCastSkill(state, slot) && !busy;
    return `<button class="skill" data-slot="${slot}" ${ready ? "" : "disabled"} title="${skillDescription(sk.id).replace(/"/g, "&quot;")}">${skillName(sk.id)} Lv${sk.level}<br><small>${sk.charge}/${sk.cooldown}</small></button>`;
  }).join("");
  el.querySelectorAll<HTMLButtonElement>("button[data-slot]").forEach(b => {
    b.onclick = () => { apply({ type: "CastSkill", slot: Number(b.dataset.slot), source: "manual" }); void settle(); };
  });
}

function render() { renderHud(); renderSkills(); draw(); }

$("art-label").textContent = `美术：${SHEET.label}`;

// Read-only debug handle for the browser console.
(window as unknown as { __dr: object }).__dr = { get state() { return structuredClone(state); }, get busy() { return busy; } };

render();
resumeOrStart();
