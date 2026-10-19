import { SHEET as pack } from './sheet-pack';
import { SHEET as native } from './sheet-original';
import runtime from './generated/runtime.json';
import type { I18n } from './i18n';
import { nativeFonts } from './native-font';
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
interface Region { id: string; asset?: string | null; texture?: string; tint?: number[]; flipX?: boolean; fillBounds?: number[]; nineSlice?: boolean; sliceMargins?: number[]; states?: Record<string, { asset?: string; alpha?: number; grayscale?: number; overlay?: string }> }
export class Atlas {
  image?: HTMLImageElement;
  readonly images = new Map<string, HTMLImageElement>();
  private tinted = new Map<string, HTMLCanvasElement>();
  private scale: number;
  readonly regions: Map<string, Rect>;
  private entries = new Map<string, Region>();
  status: 'placeholder' | 'loaded' = 'placeholder';
  constructor(readonly name: string, manifest?: unknown) {
    const raw = manifest as { scale?: number; assets?: Region[]; elements?: Region[] } | undefined;
    this.scale = raw?.scale ?? 2;
    for (const e of [...(raw?.assets ?? []), ...(raw?.elements ?? [])]) if(e.id!==e.asset || !this.entries.has(e.id)) this.entries.set(e.id, e);
    this.regions = new Map([...sprites(manifest), ...sprites({ sprites: raw?.assets })].map(e => [e.id, e.rect]));
  }
  private source(region: Region | undefined, rect: Rect): {image: CanvasImageSource; rect: Rect} | undefined {
    const img = region?.texture ? this.images.get(region.texture) : this.image;
    if (!img) return;
    if (!region?.tint) return {image:img,rect};
    const key=region.id;
    let result=this.tinted.get(key);
    if(!result){
      result=document.createElement('canvas');result.width=Math.ceil(rect[2]);result.height=Math.ceil(rect[3]);
      const c=result.getContext('2d')!;c.drawImage(img,...rect,0,0,result.width,result.height);
      c.globalCompositeOperation='multiply';c.fillStyle=`rgb(${region.tint.join(',')})`;c.fillRect(0,0,result.width,result.height);
      c.globalCompositeOperation='destination-in';c.drawImage(img,...rect,0,0,result.width,result.height);
      this.tinted.set(key,result);
    }
    return {image:result,rect:[0,0,result.width,result.height]};
  }
  paint(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, state = 'normal'): boolean {
    const entry = this.entries.get(id), variant = (entry?.states ?? this.entries.get(entry?.asset ?? '')?.states)?.[state];
    const chosen = variant?.asset ?? entry?.asset ?? id;
    const region = this.entries.get(chosen) ?? entry, original = this.regions.get(chosen) ?? this.regions.get(id);
    const source = original && this.source(region,original);
    if (!source) return this.draw(ctx, id, x, y, w, h, '');
    const {image,rect}=source;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if(region?.flipX){ctx.translate(x+w,y);ctx.scale(-1,1);x=0;y=0;}
    if (variant?.alpha !== undefined) ctx.globalAlpha *= variant.alpha;
    if (variant?.grayscale) ctx.filter = 'grayscale(1)';
    const m = region?.nineSlice ? region.sliceMargins : undefined;
    if (m) {
      const [l, t, r, b] = m as Rect;
      const dw = [Math.min(l, w / 2), Math.max(0, w-l-r), Math.min(r, w / 2)];
      const dh = [Math.min(t, h / 2), Math.max(0, h-t-b), Math.min(b, h / 2)];
      const sw = [l*this.scale, rect[2]-(l+r)*this.scale, r*this.scale], sh = [t*this.scale, rect[3]-(t+b)*this.scale, b*this.scale];
      let dy = y, sy = rect[1];
      for (let row = 0; row < 3; row++) { let dx = x, sx = rect[0];
        for (let col = 0; col < 3; col++) {
          if (dw[col]! > 0 && dh[row]! > 0) ctx.drawImage(image, sx, sy, sw[col]!, sh[row]!, dx, dy, dw[col]!, dh[row]!);
          sx += sw[col]!; dx += dw[col]!;
        } sy += sh[row]!; dy += dh[row]!;
      }
    } else ctx.drawImage(image, ...rect, x, y, w, h);
    ctx.restore();
    if (variant?.overlay) {
      const locked = variant.overlay === 'ui.lock';
      this.paint(ctx, variant.overlay, locked ? x+w-16 : x, locked ? y+h-16 : y, locked ? 16 : w, locked ? 16 : h);
    }
    return true;
  }
  fill(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, fraction: number, vertical = false) {
    const f = Math.max(0, Math.min(1, fraction));
    const entry=this.entries.get(id), bounds=(entry?.fillBounds??this.entries.get(entry?.asset??'')?.fillBounds);
    const rect=this.regions.get(entry?.asset??id), sourceHeight=rect?rect[3]/this.scale:h;
    const top=vertical&&bounds?y+bounds[1]!*h/sourceHeight:y, bottom=vertical&&bounds?y+bounds[3]!*h/sourceHeight:y+h;
    ctx.save(); ctx.beginPath(); ctx.rect(x, vertical ? bottom-(bottom-top)*f : y, vertical ? w : w*f, vertical ? (bottom-top)*f : h); ctx.clip();
    this.paint(ctx, id, x, y, w, h); ctx.restore();
  }
  async load(url?: string, fallback?: string, texture?: string) {
    if (!url) return;
    const img = new Image();
    await new Promise<void>(resolve => {
      img.onload = () => { if(texture)this.images.set(texture,img);else this.image = img; this.tinted.clear();this.status = 'loaded'; resolve(); };
      img.onerror = () => { if(fallback && img.src !== new URL(fallback,location.href).href){img.src=fallback;fallback=undefined;}else resolve(); }; img.src = url;
    });
  }
  draw(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, label = id) {
    const rect = this.regions.get(id);
    const source=rect&&this.source(this.entries.get(id),rect);
    if (source) { ctx.drawImage(source.image, ...source.rect, x, y, w, h); return true; }
    ctx.fillStyle = '#393344'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#766a88'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = '#eee5f3'; ctx.textAlign = 'center'; ctx.font = '10px system-ui';
    ctx.fillText(label, x + w / 2, y + h / 2 + 3, Math.max(1, w - 8)); return false;
  }
}
// Vite globs allow absent parallel deliverables without requests/404s, and bundle them when present.

const images = import.meta.glob(['../art/ui/ui.png', '../art/items/items.png'], { eager: true, query: '?url', import: 'default' });

const webp = import.meta.glob(['./generated/items.webp', './generated/ui.webp'], { eager: true, query: '?url', import: 'default' });

const fonts = import.meta.glob('../fonts/fusion-pixel-12-subset.woff2', { eager: true, query: '?url', import: 'default' });
const originals = import.meta.glob('../art/native/*.png', { eager: true, query: '?url', import: 'default' });
export const splashUrl=originals['../art/native/splash.png'] as string;
export class Assets {
  tiles = new Atlas('tiles', runtime.tiles);
  ui = new Atlas('ui', runtime.ui);
  items = new Atlas('items', runtime.items);
  sheet = native;
  get original() { return this.sheet === native; }
  private nativeTiles = new Atlas('native-tiles');
  private tintedTiles = new Map<string,HTMLCanvasElement>();
  async load(i18n: I18n) {
    // All original art is the default; ?art=redrawn retains A01–A03 for comparison.
    nativeFonts.clear();
    if (new URLSearchParams(location.search).get('art') === 'redrawn') this.sheet = pack;
    if(this.original){this.ui=new Atlas('ui',runtime.nativeUi);this.items=new Atlas('items',runtime.nativeItems);}
    for (const lang of ['en', 'zh'] as const) i18n.install(lang, runtime[lang]);
    i18n.installCatalog(runtime.catalog);
    const font = fonts['../fonts/fusion-pixel-12-subset.woff2'];
    if (typeof font === 'string' && typeof FontFace !== 'undefined') {
      try { document.fonts.add(await new FontFace('Fusion Pixel', `url(${font})`).load()); } catch { /* system fallback */ }
    }
    await Promise.all([this.tiles.load(this.sheet.url),this.nativeTiles.load(native.url), ...(this.original ? [
      ...['tiles','menus'].map(name=>this.ui.load(originals[`../art/native/${name}.png`] as string,undefined,name)),
      this.items.load(originals['../art/native/icons.png'] as string),
      nativeFonts.load(runtime.nativeFonts,originals),
    ] : (['ui','items'] as const).map(name => {
      const png=images[`../art/${name}/${name}.png`] as string | undefined;
      const compressed=import.meta.env.PROD ? webp[`./generated/${name}.webp`] as string | undefined : undefined;
      return this[name].load(compressed ?? png, compressed ? png : undefined);
    }))]);
  }
  tile(ctx: CanvasRenderingContext2D, sx: number, sy: number, x: number, y: number, size = 53, magic = false) {
    // A01 has no arrow, broken, or potion variant cells. Use native cells in redrawn comparison mode too.
    const nativeOnly=(sx===565&&sy===459)||(sx===424&&(sy===725||sy===778))||[513,566,619].includes(sy);
    const k=nativeOnly?1:this.sheet.scale, source=nativeOnly?this.nativeTiles.image:this.tiles.image;
    if (source && magic) {
      const key=`${k}:${sx}:${sy}`;
      let tile=this.tintedTiles.get(key);
      if(!tile){
        tile=document.createElement('canvas');tile.width=tile.height=53*k;
        const c=tile.getContext('2d')!;
        c.drawImage(source,sx*k,sy*k,53*k,53*k,0,0,53*k,53*k);
        c.globalCompositeOperation='multiply';c.fillStyle='rgb(150,150,255)';c.fillRect(0,0,53*k,53*k);
        c.globalCompositeOperation='destination-in';c.drawImage(source,sx*k,sy*k,53*k,53*k,0,0,53*k,53*k);
        this.tintedTiles.set(key,tile);
      }
      ctx.drawImage(tile,x,y,size,size);
    }
    else if (source) ctx.drawImage(source, sx * k, sy * k, 53 * k, 53 * k, x, y, size, size);
    else this.tiles.draw(ctx, 'tile', x, y, size, size, '?');
  }
}
