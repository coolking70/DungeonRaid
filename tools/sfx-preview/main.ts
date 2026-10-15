import { SfxPlayer, soundPresets } from '../../src/audio/player';

const player = new SfxPlayer();
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const list = document.querySelector<HTMLDivElement>('#sounds')!;
const all = document.querySelector<HTMLButtonElement>('#play-all')!;
const buttons: HTMLButtonElement[] = [];
const rows = new Map<number, HTMLElement>();
let sequence = 0;
let loaded = false;

function stop(): void {
  sequence++;
  player.stopAll();
  for (const row of rows.values()) row.classList.remove('playing');
  all.disabled = !loaded;
}
function error(reason: unknown): void {
  stop();
  status.textContent = `播放未完成：${reason instanceof Error ? reason.message : String(reason)}。请再次点击播放。`;
}
async function audition(soundId: number, variant: number, token: number): Promise<boolean> {
  if (sequence !== token) return false;
  const sound = soundPresets.find(s => s.id === soundId)!;
  const handle = player.play(soundId, variant);
  if (!handle) {
    status.textContent = '未播放：请取消静音、提高音量，并点击播放以启用音频。';
    return false;
  }
  const row = rows.get(soundId)!;
  row.classList.add('playing');
  status.textContent = `正在播放 ${soundId} / ${sound.name} · 变体 ${variant}`;
  await handle.finished;
  if (sequence !== token) return false;
  row.classList.remove('playing');
  return true;
}
for (const sound of soundPresets) {
  const row = document.createElement('article');
  rows.set(sound.id, row);
  const heading = document.createElement('h2');
  const id = document.createElement('span'); id.className = 'id'; id.textContent = String(sound.id).padStart(2, '0');
  heading.append(id, sound.name);
  const description = document.createElement('p'); description.className = 'description'; description.textContent = sound.designDescription;
  const timbre = document.createElement('p'); timbre.className = 'timbre'; timbre.textContent = sound.timbre;
  row.append(heading, description, timbre);
  for (const variant of sound.variants) {
    const block = document.createElement('div'); block.className = 'variant';
    const line = document.createElement('div'); line.className = 'variant-line';
    const button = document.createElement('button'); button.textContent = `播放 ${sound.name} · ${variant.variant}`; button.disabled = true;
    buttons.push(button);
    button.addEventListener('click', () => {
      stop(); const token = sequence;
      // Must call unlock immediately inside this user gesture, before asynchronous work.
      void player.unlock().then(async unlocked => {
        if (!unlocked) throw new Error('浏览器未启用音频');
        if (await audition(sound.id, variant.variant, token)) status.textContent = `播放完成：${variant.name}`;
      }).catch(error);
    });
    const duration = document.createElement('small'); duration.textContent = `${variant.params.durationSeconds.toFixed(4)} s`;
    line.append(button, duration);
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '查看合成参数';
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(variant.params, null, 2);
    details.append(summary, pre); block.append(line, details); row.append(block);
  }
  list.append(row);
}
all.addEventListener('click', () => {
  stop(); const token = sequence; all.disabled = true;
  void player.unlock().then(async unlocked => {
    if (!unlocked) throw new Error('浏览器未启用音频');
    for (const sound of soundPresets) for (const variant of sound.variants) {
      if (!await audition(sound.id, variant.variant, token)) {
        if (sequence === token) all.disabled = false;
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 180));
    }
    if (sequence === token) { status.textContent = '全部 70 个变体已播放完成。'; all.disabled = false; }
  }).catch(error);
});
document.querySelector('#stop')!.addEventListener('click', () => { stop(); status.textContent = '已停止。'; });
document.querySelector<HTMLInputElement>('#volume')!.addEventListener('input', event => {
  const value = Number((event.target as HTMLInputElement).value);
  player.setVolume(value);
  document.querySelector('#volume-value')!.textContent = `${Math.round(value * 100)}%`;
});
document.querySelector<HTMLInputElement>('#mute')!.addEventListener('change', event => {
  const muted = (event.target as HTMLInputElement).checked;
  if (muted) stop();
  player.setMuted(muted); status.textContent = muted ? '已静音。' : '已取消静音。';
});
// Returning from another tab requires a new gesture on platforms that suspend audio.
// Cancel sequential audition instead of waiting forever on a suspended source.
const visibility = () => { if (document.hidden) { stop(); status.textContent = '试听已暂停；返回后请重新点击播放。'; } };
document.addEventListener('visibilitychange', visibility);
void player.preload().then(() => {
  loaded = true; all.disabled = false;
  for (const button of buttons) button.disabled = false;
  status.textContent = '70 个变体已就绪，点击任意播放按钮启用声音。';
}).catch(error);
if (import.meta.hot) import.meta.hot.dispose(() => { stop(); document.removeEventListener('visibilitychange', visibility); void player.dispose(); });
