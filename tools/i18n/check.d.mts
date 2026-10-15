import type { Bundles } from './runtime.mjs';
export interface FontManifest {
  codepoints: number[];
  requiredCodepoints: number[];
  advanceWidths: Record<string, number>;
  unitsPerEm: number;
  nameRecords: { nameID: number; value: string }[];
  font: string;
  fontSha256: string;
  source: string;
  sourceSha256: string;
  subsetBytes: number;
}
interface InventoryRow {
  id: string;
  text?: string;
  ref?: string;
  lengthLimit: Record<string, unknown>;
}
export interface Inputs extends Bundles {
  inventory: { strings: InventoryRow[]; references: InventoryRow[] };
  layout: { elements: Array<{ id: string; stringId: string | null; rect: { w: number; h: number } | null; rectFormula?: string }> };
  font: FontManifest;
  symbols: { characters: string; nonGlyphControls: string[] };
  data: Record<string, unknown>;
}
export interface Measurement {
  target: string;
  sourceId: string;
  key: string;
  locale: string;
  widthPx: number;
  measuredWidthPx: number;
  needsWrap: boolean;
  dynamicHeight: boolean;
}
export interface LayoutReport {
  fontSizePx: number;
  measurements: Measurement[];
  overflows: Measurement[];
  unknown: { sourceId: string; key?: string; target?: string; reason: string }[];
}
export const root: string;
export function placeholders(text: string): string[];
export function loadInputs(): Inputs;
export function requiredCharacters(inputs: Inputs): number[];
export function measureText(text: string, font: FontManifest): number;
export function validate(inputs: Inputs): string[];
export function layoutReport(inputs: Inputs): LayoutReport;
export function checkFiles(inputs?: Inputs): { errors: string[]; stats: Record<string, number>; layout: LayoutReport | null };
