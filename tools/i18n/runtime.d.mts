export interface Placeholder {
  name: string;
  type: string;
  printf: string;
  precision?: number;
  precisionParam?: string;
}
export interface Source {
  id: string;
  ref: string;
  evidence: unknown;
  lengthLimit: Record<string, unknown>;
}
export interface Entry {
  original: string;
  originalFormat: string | null;
  argumentOrder: string[];
  placeholders: Placeholder[];
  sources: Source[];
  allowedLatin?: string[];
  latinReason?: string;
  allowEmpty?: boolean;
}
export interface Pack {
  locale: string;
  messages: Record<string, string>;
  sources: Record<string, string[]>;
}
export interface Catalog {
  defaultLocale: string;
  fallbackLocale: string;
  entries: Record<string, Entry>;
  aliases: Record<string, string>;
  sourceToKey: Record<string, string>;
}
export interface Bundles { en: Pack; zh: Pack; catalog: Catalog }
export function formatMessage(template: string, entry: Entry, params?: Record<string, string | number>): string;
export function createI18n(bundles: Bundles, initialLocale?: string): {
  readonly locale: 'zh' | 'en';
  setLocale(locale: string): void;
  t(key: string, params?: Record<string, string | number>): string;
};
