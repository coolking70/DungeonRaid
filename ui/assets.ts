import { SHEET as pack } from './sheet-pack';
import tilesManifest from '../art/manifest.json';
import type { I18n } from './i18n';
export type Rect = [number, number, number, number];
export interface Sprite { id: string; rect: Rect }
/** A01: tiles; A02: elements; A03: slots/items. Pixel rectangles are atlas pixels. */
export function sprites(raw: unknown): Sprite[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;
  const entries = data.tiles ?? data.elements ?? data.slots ?? data.items ?? data.sprites;
  if (!entries || typeof entries !== 'object') return [];
  return Object.entries(entries).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object') return [];
    const e = value as { id?: string; slot?: number; rect?: unknown; atlasRect?: unknown };
    const r = e.rect ?? e.atlasRect;
    const object = r as { x?: number; y?: number; w?: number; h?: number; width?: number; height?: number } | null;
    const rect = Array.isArray(r) ? r : object && typeof object === 'object' ? [object.x, object.y, object.w ?? object.width, object.h ?? object.height] : [];
    return rect.length === 4 && rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0 ? [{ id: String(e.id ?? e.slot ?? key), rect: rect as Rect }] : [];
  });
}
export class Atlas {
  image?: HTMLImageElement;
  readonly regions: Map<string, Rect>;
  status: 'placeholder' | 'loaded' = 'placeholder';
  constructor(readonly name: string, manifest?: unknown) { this.regions = new Map(sprites(manifest).map(e => [e.id, e.rect])); }
  async load(url?: string) {
    if (!url) return;
    const img = new Image();
    await new Promise<void>(resolve => {
      img.onload = () => { this.image = img; this.status = 'loaded'; resolve(); };
      img.onerror = () => resolve(); img.src = url;
    });
  }
  draw(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, label = id) {
    const rect = this.regions.get(id);
    if (this.image && rect) { ctx.drawImage(this.image, ...rect, x, y, w, h); return true; }
    ctx.fillStyle = '#393344'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#766a88'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = '#eee5f3'; ctx.textAlign = 'center'; ctx.font = '10px system-ui';
    ctx.fillText(label, x + w / 2, y + h / 2 + 3, Math.max(1, w - 8)); return false;
  }
}
// Vite globs allow absent parallel deliverables without requests/404s, and bundle them when present.
const manifests = import.meta.glob('../art/{ui,items}/manifest.json', { eager: true, import: 'default' });
const images = import.meta.glob(['../art/ui/ui.png', '../art/items/items.png'], { eager: true, query: '?url', import: 'default' });
const catalogues = import.meta.glob('../data/i18n/{en,zh,catalog}.json', { eager: true, import: 'default' });
const fonts = import.meta.glob('../fonts/fusion-pixel-12-subset.woff2', { eager: true, query: '?url', import: 'default' });
export class Assets {
  tiles = new Atlas('tiles', tilesManifest);
  ui = new Atlas('ui', manifests['../art/ui/manifest.json']);
  items = new Atlas('items', manifests['../art/items/manifest.json']);
  sheet = pack;
  async load(i18n: I18n) {
    // @sheet aliases to pack in EVERY production build, including a default vite build.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('art') === 'original') this.sheet = (await import('@sheet')).SHEET;
    for (const lang of ['en', 'zh'] as const) i18n.install(lang, catalogues[`../data/i18n/${lang}.json`]);
    i18n.installCatalog(catalogues['../data/i18n/catalog.json']);
    const font = fonts['../fonts/fusion-pixel-12-subset.woff2'];
    if (typeof font === 'string' && typeof FontFace !== 'undefined') {
      try { document.fonts.add(await new FontFace('Fusion Pixel', `url(${font})`).load()); } catch { /* system fallback */ }
    }
    await Promise.all([this.tiles.load(this.sheet.url), this.ui.load(images['../art/ui/ui.png'] as string | undefined), this.items.load(images['../art/items/items.png'] as string | undefined)]);
  }
  tile(ctx: CanvasRenderingContext2D, sx: number, sy: number, x: number, y: number, size = 53) {
    const k = this.sheet.scale;
    if (this.tiles.image) ctx.drawImage(this.tiles.image, sx * k, sy * k, 53 * k, 53 * k, x, y, size, size);
    else this.tiles.draw(ctx, 'tile', x, y, size, size, '?');
  }
}
