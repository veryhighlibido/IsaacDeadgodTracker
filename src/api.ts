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
  slots: SlotInfo[];
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

export interface StatusResponse {
  status: SaveStatus;
  port: number;
  sources: SourceInfo[];
  settings: { savePath: string | null; port: number | null; ui: unknown; overlay: unknown; followSlot: boolean };
  version: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
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
  saveSettings: (body: { ui?: unknown; overlay?: unknown; followSlot?: boolean }) =>
    request<{ ok: true }>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),
  preview: async (path: string): Promise<Uint8Array> => {
    const res = await fetch(`${API_BASE}/api/preview?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(await res.text());
    return new Uint8Array(await res.arrayBuffer());
  },
};
