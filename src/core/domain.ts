import marksJson from '../data/marks.json';
import type { SaveData } from './format';

export const MARK_BOSSES = marksJson.bosses as readonly MarkBoss[];
export const MARK_MATRIX = marksJson.matrix as readonly (readonly number[])[];

export type MarkBoss =
  | 'momsHeart'
  | 'isaac'
  | 'satan'
  | 'bossRush'
  | 'blueBaby'
  | 'lamb'
  | 'megaSatan'
  | 'greed'
  | 'hush'
  | 'delirium'
  | 'mother'
  | 'beast';

export type MarkLevel = 0 | 1 | 2;

export interface MarkState {
  offline: MarkLevel;
  online: MarkLevel;
}

export function decodeMark(value: number): MarkState {
  const off = value & 0b11;
  const on = (value >> 2) & 0b11;
  return { offline: off >= 2 ? 2 : (off as MarkLevel), online: on >= 2 ? 2 : (on as MarkLevel) };
}

export type ChangeKind = 'achievement' | 'collectible' | 'challenge' | 'mark';

export interface Change {
  kind: ChangeKind;
  index: number;
  before: number;
  after: number;
}

const MARK_INDEX_SET = new Set(MARK_MATRIX.flat());

function diffArray(kind: ChangeKind, a: ArrayLike<number>, b: ArrayLike<number>, out: Change[]) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const before = a[i] ?? 0;
    const after = b[i] ?? 0;
    if (before !== after) out.push({ kind, index: i, before, after });
  }
}

export function diffSaves(original: SaveData, current: SaveData): Change[] {
  const out: Change[] = [];
  diffArray('achievement', original.achievements, current.achievements, out);
  diffArray('collectible', original.collectibles, current.collectibles, out);
  diffArray('challenge', original.challenges, current.challenges, out);
  for (const index of MARK_INDEX_SET) {
    const before = original.counters[index] ?? 0;
    const after = current.counters[index] ?? 0;
    if (before !== after) out.push({ kind: 'mark', index, before, after });
  }
  return out;
}

export function countTrue(arr: Uint8Array, from = 1): number {
  let n = 0;
  for (let i = from; i < arr.length; i++) if (arr[i]) n++;
  return n;
}
