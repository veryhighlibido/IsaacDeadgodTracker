import { isLang, type Lang, type Strings } from './i18n';
import { COUNTER_GOALS, WATCHED_ACHIEVEMENTS } from './model';

export type OverlaySet = 'blind' | 'watch' | 'locked' | 'progress' | 'marks';
export type OverlayLayout = 'classic' | 'tiles';
export type CaptionSide = 'below' | 'right';
export type OverlayFont = 'mono' | 'game';
export type LockedLook = 'color' | 'gray';
export type DoneLook = 'check' | 'hide' | 'dim';

export interface OverlayConfig {
  set: OverlaySet;
  size: number;
  columns: number;
  gap: number;
  labels: boolean;
  background: boolean;
  scale: number;
  max: number;
  lang: Lang;
  layout: OverlayLayout;
  rows: number;
  caption: CaptionSide;
  font: OverlayFont;
  locked: LockedLook;
  done: DoneLook;
  meter: boolean;
  order: string[];
  off: string[];
}

export const OVERLAY_SETS: Array<{ id: OverlaySet; label: keyof Strings['overlaySets'] }> = [
  { id: 'blind', label: 'blind' },
  { id: 'watch', label: 'watch' },
  { id: 'locked', label: 'locked' },
  { id: 'progress', label: 'progress' },
  { id: 'marks', label: 'marks' },
];

export const LAYOUTS: OverlayLayout[] = ['classic', 'tiles'];
export const CAPTIONS: CaptionSide[] = ['below', 'right'];
export const FONTS: OverlayFont[] = ['mono', 'game'];
export const LOCKED_LOOKS: LockedLook[] = ['color', 'gray'];
export const DONE_LOOKS: DoneLook[] = ['check', 'hide', 'dim'];

export const TOTAL_KEYS = ['ach', 'items'] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];

export const COUNTER_KEYS = [...COUNTER_GOALS.map((goal) => `c${goal.achievementId}`), ...TOTAL_KEYS];
export const SECRET_KEYS = WATCHED_ACHIEVEMENTS.map((id) => `s${id}`);
export const DEFAULT_ORDER = [...COUNTER_KEYS, ...SECRET_KEYS];

const KNOWN_KEYS = new Set(DEFAULT_ORDER);
const SECRET_KEY_SET = new Set(SECRET_KEYS);

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_SET.has(key);
}

export const LAYOUT_PRESETS: Record<OverlayLayout, Pick<OverlayConfig, 'caption' | 'font' | 'meter'>> = {
  classic: { caption: 'below', font: 'mono', meter: true },
  tiles: { caption: 'right', font: 'game', meter: false },
};

export const DEFAULT_OVERLAY: Omit<OverlayConfig, 'lang'> = {
  set: 'blind',
  size: 40,
  columns: 0,
  gap: 6,
  labels: true,
  background: true,
  scale: 1,
  max: 0,
  layout: 'classic',
  rows: 2,
  ...LAYOUT_PRESETS.classic,
  locked: 'color',
  done: 'check',
  order: DEFAULT_ORDER,
  off: [],
};

function num(value: unknown, fallback: number, min: number, max: number, round = false): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, round ? Math.round(parsed) : parsed));
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function keys(value: unknown): string[] {
  const list = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const key of list) if (typeof key === 'string' && KNOWN_KEYS.has(key)) seen.add(key);
  return [...seen];
}

export function normalizeOrder(value: unknown): string[] {
  const order = keys(value);
  const seen = new Set(order);
  return [...order, ...DEFAULT_ORDER.filter((key) => !seen.has(key))];
}

export function normalizeOverlay(raw: unknown, lang: Lang): OverlayConfig {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_OVERLAY;
  return {
    set: pick(source.set, OVERLAY_SETS.map((item) => item.id), d.set),
    size: num(source.size, d.size, 16, 160),
    columns: num(source.columns, d.columns, 0, 40, true),
    gap: num(source.gap, d.gap, 0, 40),
    labels: bool(source.labels, d.labels),
    background: bool(source.background, d.background),
    scale: num(source.scale, d.scale, 0.25, 4),
    max: num(source.max, d.max, 0, 10000, true),
    lang: isLang(source.lang) ? source.lang : lang,
    layout: pick(source.layout, LAYOUTS, d.layout),
    rows: num(source.rows, d.rows, 1, 24, true),
    caption: pick(source.caption, CAPTIONS, d.caption),
    font: pick(source.font, FONTS, d.font),
    locked: pick(source.locked, LOCKED_LOOKS, d.locked),
    done: pick(source.done, DONE_LOOKS, d.done),
    meter: bool(source.meter, d.meter),
    order: normalizeOrder(source.order),
    off: keys(source.off),
  };
}

export function parseOverlayParams(search: string, lang: Lang): OverlayConfig {
  const params = new URLSearchParams(search);
  return normalizeOverlay(
    {
      set: params.get('set'),
      size: params.get('size'),
      columns: params.get('cols'),
      gap: params.get('gap'),
      labels: params.get('labels'),
      background: params.get('bg'),
      scale: params.get('scale'),
      max: params.get('max'),
      lang: params.get('lang'),
      layout: params.get('layout'),
      rows: params.get('rows'),
      caption: params.get('cap'),
      font: params.get('font'),
      locked: params.get('locked'),
      done: params.get('done'),
      meter: params.get('meter'),
      order: params.get('order'),
      off: params.get('off'),
    },
    lang,
  );
}

function sameOrder(order: string[]): boolean {
  return order.length === DEFAULT_ORDER.length && order.every((key, index) => key === DEFAULT_ORDER[index]);
}

export function overlayQuery(config: OverlayConfig): string {
  const params = new URLSearchParams();
  params.set('set', config.set);
  params.set('size', String(config.size));
  params.set('cols', String(config.columns));
  params.set('gap', String(config.gap));
  params.set('labels', config.labels ? '1' : '0');
  params.set('bg', config.background ? '1' : '0');
  params.set('scale', String(config.scale));
  params.set('max', String(config.max));
  params.set('lang', config.lang);
  params.set('layout', config.layout);
  params.set('rows', String(config.rows));
  params.set('cap', config.caption);
  params.set('font', config.font);
  params.set('locked', config.locked);
  params.set('done', config.done);
  params.set('meter', config.meter ? '1' : '0');
  if (!sameOrder(config.order)) params.set('order', config.order.join(','));
  if (config.off.length > 0) params.set('off', config.off.join(','));
  return params.toString().replace(/%2C/g, ',');
}
