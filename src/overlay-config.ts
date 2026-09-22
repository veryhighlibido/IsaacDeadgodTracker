import { isLang, type Lang, type Strings } from './i18n';
import { COUNTER_GOALS, OPTIONAL_ACHIEVEMENTS, OPTIONAL_GOALS, WATCHED_ACHIEVEMENTS } from './model';

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
  apart: boolean;
  order: string[];
  off: string[];
  bare: string[];
  version: number;
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

export const TOTAL_KEYS = ['ach', 'items', 'hard'] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];

export const COUNTER_KEYS = [...COUNTER_GOALS.map((goal) => `c${goal.achievementId}`), ...TOTAL_KEYS];
const OPTIONAL_SECRET_KEYS = OPTIONAL_ACHIEVEMENTS.map((id) => `s${id}`);
export const OPTIONAL_KEYS = [...OPTIONAL_GOALS.map((id) => `c${id}`), 'hard', ...OPTIONAL_SECRET_KEYS];
export const SECRET_KEYS = [...WATCHED_ACHIEVEMENTS.map((id) => `s${id}`), ...OPTIONAL_SECRET_KEYS];
const OVERLAY_VERSION = 5;
const PROMOTED_TO_COUNTERS = new Map(OPTIONAL_GOALS.map((id) => [`s${id}`, `c${id}`]));
export const DEFAULT_ORDER = [...COUNTER_KEYS, ...SECRET_KEYS];

const KNOWN_KEYS = new Set(DEFAULT_ORDER);
const SECRET_KEY_SET = new Set(SECRET_KEYS);
const TOTAL_KEY_SET = new Set<string>(TOTAL_KEYS);

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_SET.has(key);
}

export function isTotalKey(key: string): boolean {
  return TOTAL_KEY_SET.has(key);
}

export function spriteSize(set: OverlaySet): number {
  return set === 'marks' ? 16 : 64;
}

export function sizeTicks(set: OverlaySet): number[] {
  return set === 'marks' ? [16, 32, 48, 64, 80, 96] : [32, 64];
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
  apart: true,
  order: DEFAULT_ORDER,
  off: OPTIONAL_KEYS,
  bare: [],
  version: OVERLAY_VERSION,
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

function rawList(value: unknown): unknown[] {
  return typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
}

function promote(value: unknown): unknown[] {
  return rawList(value).map((key) => (typeof key === 'string' ? (PROMOTED_TO_COUNTERS.get(key) ?? key) : key));
}

const MERGED_INTO_TOTALS: Array<[string, string]> = [
  ['s637', 'ach'],
  ['s636', 'hard'],
];

function migrate(source: Record<string, unknown>): { off: unknown[]; bare: unknown[]; order: unknown[] } {
  const version = Number(source.version);
  let off = rawList(source.off);
  let bare = rawList(source.bare);
  let order = rawList(source.order);
  if (version === OVERLAY_VERSION) return { off, bare, order };
  if (!(version >= 2)) return { off: [...off, ...OPTIONAL_KEYS], bare, order };
  if (version === 2) {
    const hidden = new Set(off);
    bare = [...bare, ...OPTIONAL_GOALS.filter((id) => !hidden.has(`s${id}`)).map((id) => `c${id}`)];
    off = promote(off);
    order = promote(order);
  }
  if (version <= 3) off = [...off, 'hard'];
  for (const [secret, total] of MERGED_INTO_TOTALS) {
    const hidden = new Set(off);
    const secretShown = !hidden.has(secret);
    const totalShown = !hidden.has(total);
    if (secretShown && !totalShown) {
      off = off.filter((key) => key !== total);
      bare = [...bare, total];
      order = order.filter((key) => key !== total).map((key) => (key === secret ? total : key));
    } else {
      order = order.includes(total) ? order.filter((key) => key !== secret) : order.map((key) => (key === secret ? total : key));
    }
    off = off.filter((key) => key !== secret);
  }
  return { off, bare, order };
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
  const migrated = migrate(source);
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
    apart: bool(source.apart, d.apart),
    order: normalizeOrder(migrated.order),
    off: keys(migrated.off),
    bare: keys(migrated.bare),
    version: OVERLAY_VERSION,
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
      apart: params.get('apart'),
      order: params.get('order'),
      off: params.get('off'),
      bare: params.get('bare'),
      version: params.get('v'),
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
  params.set('apart', config.apart ? '1' : '0');
  if (!sameOrder(config.order)) params.set('order', config.order.join(','));
  if (config.off.length > 0) params.set('off', config.off.join(','));
  if (config.bare.length > 0) params.set('bare', config.bare.join(','));
  params.set('v', String(config.version));
  return params.toString().replace(/%2C/g, ',');
}

const CODE_PREFIX = 'IDT1.';

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const output = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await output.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function encodeOverlayCode(config: OverlayConfig): Promise<string> {
  const packed = await transform(new TextEncoder().encode(overlayQuery(config)), new CompressionStream('deflate-raw'));
  return CODE_PREFIX + toBase64Url(packed);
}

export async function decodeOverlayCode(code: string, lang: Lang): Promise<OverlayConfig | null> {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(CODE_PREFIX)) return null;
  try {
    const raw = await transform(fromBase64Url(clean.slice(CODE_PREFIX.length)), new DecompressionStream('deflate-raw'));
    return parseOverlayParams(new TextDecoder().decode(raw), lang);
  } catch {
    return null;
  }
}
