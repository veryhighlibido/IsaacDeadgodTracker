import { useSyncExternalStore } from 'react';

import { api, type StatusResponse, type StoredPreset } from './api';
import { currentLang, strings } from './i18n';
import { onPrefs } from './live';
import { normalizeOverlay, overlayQuery, type OverlayConfig } from './overlay-config';

export interface Preset {
  id: string;
  name: string;
  config: OverlayConfig;
  draft: OverlayConfig | null;
}

export interface PresetState {
  ready: boolean;
  presets: Preset[];
  active: string;
}

const DRAFT_DELAY = 120;

let state: PresetState = { ready: false, presets: [], active: '' };
const listeners = new Set<() => void>();
let inflight = 0;
let timer: number | undefined;

function emit(next: Partial<PresetState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function same(a: OverlayConfig, b: OverlayConfig): boolean {
  return overlayQuery(a) === overlayQuery(b);
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function stored(): StoredPreset[] {
  return state.presets.map(({ id, name, config, draft }) => ({ id, name, config, draft }));
}

function post(body: { presets?: StoredPreset[]; active?: string }) {
  inflight += 1;
  api
    .savePresets(body)
    .catch(() => undefined)
    .finally(() => {
      inflight -= 1;
    });
}

function cancelPending() {
  if (timer === undefined) return;
  window.clearTimeout(timer);
  timer = undefined;
}

function commitNow(next: Partial<PresetState>) {
  cancelPending();
  emit(next);
  post({ presets: stored(), active: state.active });
}

function commitLater(next: Partial<PresetState>) {
  emit(next);
  cancelPending();
  timer = window.setTimeout(() => {
    timer = undefined;
    post({ presets: stored() });
  }, DRAFT_DELAY);
}

function readPreset(raw: StoredPreset): Preset | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const lang = currentLang();
  const config = normalizeOverlay(raw.config, lang);
  const draft = raw.draft && typeof raw.draft === 'object' ? normalizeOverlay(raw.draft, lang) : null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : strings(lang).presetFirst,
    config,
    draft: draft && !same(draft, config) ? draft : null,
  };
}

export function loadPresets(settings: StatusResponse['settings']) {
  if (state.ready) return;
  const presets = (Array.isArray(settings.presets) ? settings.presets : [])
    .map(readPreset)
    .filter((preset): preset is Preset => preset !== null);
  if (presets.length > 0) {
    const active = presets.some((preset) => preset.id === settings.activePreset) ? settings.activePreset! : presets[0].id;
    emit({ ready: true, presets, active });
    return;
  }
  const legacy = settings.overlay && typeof settings.overlay === 'object' ? settings.overlay : null;
  const first: Preset = {
    id: newId(),
    name: strings(currentLang()).presetFirst,
    config: normalizeOverlay(legacy, currentLang()),
    draft: null,
  };
  commitNow({ ready: true, presets: [first], active: first.id });
}

onPrefs((prefs) => {
  if (!state.ready || inflight > 0 || timer !== undefined) return;
  if (!prefs.active || prefs.active === state.active) return;
  if (!state.presets.some((preset) => preset.id === prefs.active)) return;
  emit({ active: prefs.active });
});

export function activePreset(current: PresetState = state): Preset | undefined {
  return current.presets.find((preset) => preset.id === current.active) ?? current.presets[0];
}

export function editorConfig(preset: Preset): OverlayConfig {
  return preset.draft ?? preset.config;
}

function replace(id: string, change: (preset: Preset) => Preset): Preset[] {
  return state.presets.map((preset) => (preset.id === id ? change(preset) : preset));
}

export function setDraft(config: OverlayConfig) {
  const current = activePreset();
  if (!current) return;
  commitLater({
    presets: replace(current.id, (preset) => ({ ...preset, draft: same(config, preset.config) ? null : config })),
  });
}

export function patchDraft(next: Partial<OverlayConfig>) {
  const current = activePreset();
  if (current) setDraft({ ...editorConfig(current), ...next });
}

export function saveDraft() {
  const current = activePreset();
  if (!current?.draft) return;
  commitNow({ presets: replace(current.id, (preset) => ({ ...preset, config: preset.draft ?? preset.config, draft: null })) });
}

export function revertDraft() {
  const current = activePreset();
  if (!current?.draft) return;
  commitNow({ presets: replace(current.id, (preset) => ({ ...preset, draft: null })) });
}

export function activate(id: string) {
  if (id === state.active || !state.presets.some((preset) => preset.id === id)) return;
  commitNow({ active: id });
}

function uniqueName(base: (n: number) => string): string {
  const taken = new Set(state.presets.map((preset) => preset.name));
  for (let n = 1; ; n += 1) {
    const name = base(n);
    if (!taken.has(name)) return name;
  }
}

export function createPreset(): Preset {
  const s = strings(currentLang());
  const preset: Preset = {
    id: newId(),
    name: uniqueName((n) => s.presetNew(state.presets.length + n)),
    config: normalizeOverlay(null, currentLang()),
    draft: null,
  };
  commitNow({ presets: [...state.presets, preset], active: preset.id });
  return preset;
}

export function duplicatePreset(): Preset | null {
  const current = activePreset();
  if (!current) return null;
  const s = strings(currentLang());
  const copy: Preset = { ...current, id: newId(), name: uniqueName((n) => s.presetCopy(current.name, n)) };
  const index = state.presets.findIndex((preset) => preset.id === current.id);
  const presets = [...state.presets];
  presets.splice(index + 1, 0, copy);
  commitNow({ presets, active: copy.id });
  return copy;
}

export function renamePreset(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const target = state.presets.find((preset) => preset.id === id);
  if (!target || target.name === clean) return;
  commitNow({ presets: replace(id, (preset) => ({ ...preset, name: clean })) });
}

export function removePreset(id: string) {
  if (state.presets.length < 2) return;
  const index = state.presets.findIndex((preset) => preset.id === id);
  if (index < 0) return;
  const presets = state.presets.filter((preset) => preset.id !== id);
  const active = state.active === id ? presets[Math.min(index, presets.length - 1)].id : state.active;
  commitNow({ presets, active });
}

export function movePreset(id: string, target: string, after: boolean) {
  if (id === target) return;
  const moving = state.presets.find((preset) => preset.id === id);
  if (!moving) return;
  const rest = state.presets.filter((preset) => preset.id !== id);
  const index = rest.findIndex((preset) => preset.id === target);
  if (index < 0) return;
  rest.splice(after ? index + 1 : index, 0, moving);
  commitNow({ presets: rest });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePresets(): PresetState {
  return useSyncExternalStore(subscribe, () => state);
}
