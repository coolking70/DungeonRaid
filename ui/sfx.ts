import type { StoragePort } from './storage';
import { SfxPlayer, soundPresets, type SoundStyle } from '../src/audio/player';
import { PresentationRandom, type AudioPort } from './audio';
export class GameAudio implements AudioPort {
  readonly player = new SfxPlayer();
  readonly random = new PresentationRandom();
  readonly log: { id: number; variant: number; played: boolean }[] = [];
  error: string | null = null;
  calls=0; played=0; counts: Record<number,number> = {};
  constructor(private storage?: StoragePort) {
    try { this.player.setStyle(storage?.getItem('dungeonraid.soundStyle') === 'synth' ? 'synth' : 'original'); } catch {}
    this.player.bindUnlock(window, e => { this.error = String(e); });
  }
  setStyle(style: SoundStyle) {
    this.player.setStyle(style);
    try { this.storage?.setItem('dungeonraid.soundStyle',style); } catch {}
  }
  get volume() { return this.player.volume; }
  play(id: number, variant = -1) {
    const n = soundPresets.find(s => s.id === id)?.variants.length;
    if (!n) return;
    const chosen = variant < 0 ? Math.floor(this.random.unit() * n) : variant;
    try { const played = !!this.player.play(id, chosen); this.calls++;if(played)this.played++;this.counts[id]=(this.counts[id]??0)+1;this.log.push({ id, variant: chosen, played }); }
    catch (e) { this.error = String(e); }
    if (this.log.length > 2000) this.log.shift();
  }
  setVolume(n: number) { this.player.setVolume(n); }
  setMuted(muted: boolean) { this.player.setMuted(muted); }
}
