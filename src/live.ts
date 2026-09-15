import { useSyncExternalStore } from 'react';

import { WS_URL, type SaveStatus } from './api';
import { countTrue, diffSaves } from './core/domain';
import { parseSave, SaveFormatError, type ParsedSave } from './core/format';
import { currentLang, strings } from './i18n';

export type Connection = 'connecting' | 'online' | 'offline';

export interface SaveFrame {
  path: string;
  size: number;
  mtime: number | null;
  hash: string;
  readAt: number;
}

export interface UnlockEvent {
  kind: 'achievement' | 'challenge' | 'mark' | 'item';
  index: number;
  at: number;
  label?: string;
}

export interface LiveState {
  connection: Connection;
  status: SaveStatus | null;
  parsed: ParsedSave | null;
  frame: SaveFrame | null;
  parseError: string | null;
  events: UnlockEvent[];
  regression: { at: number; before: number; after: number } | null;
}

const EMPTY: LiveState = {
  connection: 'connecting',
  status: null,
  parsed: null,
  frame: null,
  parseError: null,
  events: [],
  regression: null,
};

let state: LiveState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: Partial<LiveState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function decodeFrame(buffer: ArrayBuffer): { frame: SaveFrame; bytes: Uint8Array } {
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as SaveFrame;
  return { frame: header, bytes: new Uint8Array(buffer, 4 + headerLength) };
}

function collectEvents(previous: ParsedSave, next: ParsedSave, at: number): UnlockEvent[] {
  const out: UnlockEvent[] = [];
  for (const change of diffSaves(previous.save, next.save)) {
    if (change.after <= change.before) continue;
    if (change.kind === 'achievement') out.push({ kind: 'achievement', index: change.index, at });
    else if (change.kind === 'challenge') out.push({ kind: 'challenge', index: change.index, at });
    else if (change.kind === 'mark') out.push({ kind: 'mark', index: change.index, at });
    else if (change.kind === 'collectible') out.push({ kind: 'item', index: change.index, at });
  }
  return out;
}

const seenFrames = new Set<string>();

function applySave(buffer: ArrayBuffer) {
  let decoded: { frame: SaveFrame; bytes: Uint8Array };
  try {
    decoded = decodeFrame(buffer);
  } catch {
    emit({ parseError: strings(currentLang()).packetError });
    return;
  }
  const key = `${decoded.frame.hash}:${decoded.frame.readAt}`;
  if (seenFrames.has(key)) return;
  seenFrames.add(key);
  try {
    const parsed = parseSave(decoded.bytes);
    const sameTarget = state.frame?.path === decoded.frame.path;
    const previous = sameTarget ? state.parsed : null;
    let events = sameTarget ? state.events : [];
    let regression = sameTarget ? state.regression : null;
    if (previous && previous.save.achievements.length === parsed.save.achievements.length) {
      const fresh = collectEvents(previous, parsed, decoded.frame.readAt);
      if (fresh.length) events = [...fresh, ...events].slice(0, 200);
      const before = countTrue(previous.save.achievements);
      const after = countTrue(parsed.save.achievements);
      if (after < before) regression = { at: decoded.frame.readAt, before, after };
    }
    emit({ parsed, frame: decoded.frame, parseError: null, events, regression });
  } catch (error) {
    const s = strings(currentLang());
    const message =
      error instanceof SaveFormatError
        ? s.formatError(`${error.code}${error.detail ? `: ${error.detail}` : ''}`)
        : s.parseError;
    emit({ parseError: message });
  }
}

let socket: WebSocket | null = null;
let retry = 0;
let reconnectTimer: number | undefined;

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  emit({ connection: state.parsed ? state.connection : 'connecting' });
  const ws = new WebSocket(WS_URL);
  ws.binaryType = 'arraybuffer';
  socket = ws;

  ws.onopen = () => {
    retry = 0;
    emit({ connection: 'online' });
  };
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as { type: string; status?: SaveStatus };
        if (message.type === 'status' && message.status) emit({ status: message.status });
      } catch {
        /* ignore malformed status */
      }
      return;
    }
    applySave(event.data as ArrayBuffer);
  };
  ws.onclose = () => {
    socket = null;
    emit({ connection: 'offline' });
    scheduleReconnect();
  };
  ws.onerror = () => ws.close();
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined) return;
  const delay = Math.min(500 * 2 ** retry, 5000);
  retry += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) connect();
  return () => {
    listeners.delete(listener);
  };
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state);
}

export function clearRegression() {
  emit({ regression: null });
}
