const params = new URLSearchParams(location.search);
const apiPort = params.get('api');

export const API_BASE = apiPort ? `http://127.0.0.1:${apiPort}` : location.origin;
export const API_PARAM = apiPort ? `api=${apiPort}` : '';

export const WS_URL = (() => {
  if (apiPort) return `ws://127.0.0.1:${apiPort}/ws`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
})();

export interface SaveStatus {
  path: string | null;
  watching: boolean;
  error: string | null;
  errorCode: string | null;
  size: number | null;
  mtime: number | null;
  lastReadAt: number | null;
  reads: number;
}

export interface SlotInfo {
  slot: number;
  path: string;
  size: number;
  modified: number | null;
  looksLikeSave: boolean;
}

export interface SourceInfo {
  edition: string;
  editionLabel: string;
  dir: string;
  cloud: boolean;
  account: string | null;
  slots: SlotInfo[];
}

export type PlaceKind = 'cloud' | 'documents';

export interface StorageLocation {
  kind: PlaceKind;
  dir: string;
  exists: boolean;
  account: string | null;
  active: boolean;
  slots: SlotInfo[];
}

export interface StorageReport {
  steamCloud: boolean | null;
  optionsPath: string;
  optionsFound: boolean;
  gameRunning: boolean;
  backups: string;
  locations: StorageLocation[];
}

export interface CloudSwitch {
  ok: true;
  copied: number;
  backup: string | null;
  target: string | null;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface OverlayConfig {
  set: string;
  size: number;
  columns: number;
  labels: boolean;
  dim: number;
  background: number;
  accent: string;
}

export type CloseAction = 'tray' | 'exit';

export interface StoredPreset {
  id: string;
  name: string;
  config: unknown;
  draft: unknown;
}

export interface StatusResponse {
  status: SaveStatus;
  port: number;
  sources: SourceInfo[];
  settings: {
    savePath: string | null;
    port: number | null;
    ui: unknown;
    overlay: unknown;
    followSlot: boolean;
    presets: StoredPreset[];
    activePreset: string | null;
    closeAction: CloseAction | null;
    lang: string | null;
  };
  version: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),
  sources: () => request<{ sources: SourceInfo[] }>('/api/sources'),
  select: (path: string | null) =>
    request<{ ok: true }>('/api/select', { method: 'POST', body: JSON.stringify({ path }) }),
  pick: (lang: string) => request<{ path: string | null }>(`/api/pick?lang=${lang}`, { method: 'POST' }),
  refresh: () => request<{ ok: true }>('/api/refresh', { method: 'POST' }),
  reveal: (path: string) => request<{ ok: true }>('/api/reveal', { method: 'POST', body: JSON.stringify({ path }) }),
  saveSettings: (body: { ui?: unknown; overlay?: unknown; followSlot?: boolean; closeAction?: CloseAction; lang?: string }) =>
    request<{ ok: true }>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),
  savePresets: (body: { presets?: StoredPreset[]; active?: string }) =>
    request<{ ok: true; active: string | null }>('/api/presets', { method: 'POST', body: JSON.stringify(body) }),
  storage: () => request<StorageReport>('/api/storage'),
  switchCloud: (enabled: boolean, copy: boolean) =>
    request<CloudSwitch>('/api/storage/cloud', { method: 'POST', body: JSON.stringify({ enabled, copy }) }),
  openDir: (dir: string) => request<{ ok: true }>('/api/open-dir', { method: 'POST', body: JSON.stringify({ dir }) }),
  close: (action: CloseAction) =>
    request<{ ok: true }>('/api/close', { method: 'POST', body: JSON.stringify({ action }) }),
  preview: async (path: string): Promise<Uint8Array> => {
    const res = await fetch(`${API_BASE}/api/preview?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(await res.text());
    return new Uint8Array(await res.arrayBuffer());
  },
};
