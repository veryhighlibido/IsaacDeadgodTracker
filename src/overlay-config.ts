import { isLang, type Lang, type Strings } from './i18n';

export type OverlaySet = 'blind' | 'watch' | 'locked' | 'progress' | 'marks';

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
}

export const OVERLAY_SETS: Array<{ id: OverlaySet; label: keyof Strings['overlaySets'] }> = [
  { id: 'blind', label: 'blind' },
  { id: 'watch', label: 'watch' },
  { id: 'locked', label: 'locked' },
  { id: 'progress', label: 'progress' },
  { id: 'marks', label: 'marks' },
];

export const DEFAULT_OVERLAY: Omit<OverlayConfig, 'lang'> = {
  set: 'blind',
  size: 40,
  columns: 0,
  gap: 6,
  labels: true,
  background: true,
  scale: 1,
  max: 0,
};

function num(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1' || value === 'true';
}

export function parseOverlayParams(search: string, lang: Lang): OverlayConfig {
  const params = new URLSearchParams(search);
  const set = params.get('set') as OverlaySet | null;
  const raw = params.get('lang');
  return {
    set: OVERLAY_SETS.some((item) => item.id === set) ? (set as OverlaySet) : DEFAULT_OVERLAY.set,
    size: Math.min(160, Math.max(16, num(params.get('size'), DEFAULT_OVERLAY.size))),
    columns: Math.min(40, Math.max(0, Math.round(num(params.get('cols'), DEFAULT_OVERLAY.columns)))),
    gap: Math.min(40, Math.max(0, num(params.get('gap'), DEFAULT_OVERLAY.gap))),
    labels: bool(params.get('labels'), DEFAULT_OVERLAY.labels),
    background: bool(params.get('bg'), DEFAULT_OVERLAY.background),
    scale: Math.min(4, Math.max(0.25, num(params.get('scale'), DEFAULT_OVERLAY.scale))),
    max: Math.max(0, Math.round(num(params.get('max'), DEFAULT_OVERLAY.max))),
    lang: isLang(raw) ? raw : lang,
  };
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
  return params.toString();
}
