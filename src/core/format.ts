const SAVE_HEADER = 'ISAACNGSAVE09R  ';

export type SaveErrorCode = 'header' | 'truncated' | 'chunk' | 'bestiary';

export class SaveFormatError extends Error {
  code: SaveErrorCode;
  detail?: string;
  constructor(code: SaveErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SaveFormatError';
    this.code = code;
    this.detail = detail;
  }
}

export interface SaveData {
  achievements: Uint8Array;
  counters: Uint32Array;
  collectibles: Uint8Array;
  challenges: Uint8Array;
}

export interface ParsedSave {
  save: SaveData;
  edition: Edition;
}

export type Edition = 'repentance-plus' | 'repentance' | 'afterbirth-plus' | 'unknown';

const CHUNK_KINDS: ReadonlyArray<'bool' | 'int'> = ['bool', 'int', 'int', 'bool', 'bool', 'bool', 'bool', 'int', 'int', 'bool'];
const BESTIARY_SECTION_IDS: readonly number[] = [4, 2, 3, 1];

export function editionOf(achievementCount: number): Edition {
  if (achievementCount === 642) return 'repentance-plus';
  if (achievementCount === 638) return 'repentance';
  if (achievementCount === 404) return 'afterbirth-plus';
  return 'unknown';
}

class Reader {
  private view: DataView;
  private bytes: Uint8Array;
  pos = 0;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u32(): number {
    if (this.pos + 4 > this.bytes.length) throw new SaveFormatError('truncated', `at ${this.pos}`);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  bytesOf(n: number): Uint8Array {
    if (this.pos + n > this.bytes.length) throw new SaveFormatError('truncated', `at ${this.pos}`);
    const out = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  u32Array(n: number): Uint32Array {
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u32();
    return out;
  }
  skip(n: number): void {
    if (this.pos + n > this.bytes.length) throw new SaveFormatError('truncated', `at ${this.pos}`);
    this.pos += n;
  }
}

export function parseSave(bytes: Uint8Array): ParsedSave {
  if (bytes.length < 16 + 4 + 12 * 11 + 8) throw new SaveFormatError('truncated', 'file too small');
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  if (header !== SAVE_HEADER) throw new SaveFormatError('header', header.replace(/[^\x20-\x7e]/g, '?'));

  const r = new Reader(bytes);
  r.pos = 16;
  r.u32();

  const chunks: Array<Uint8Array | Uint32Array> = [];

  for (let i = 0; i < 10; i++) {
    const id = r.u32();
    if (id !== i + 1) throw new SaveFormatError('chunk', `expected chunk ${i + 1}, got ${id}`);
    r.u32();
    const count = r.u32();
    if (count <= 0 || count > 100000) throw new SaveFormatError('chunk', `chunk ${id} count ${count}`);
    chunks.push(CHUNK_KINDS[i] === 'bool' ? r.bytesOf(count) : r.u32Array(count));
  }

  const bestiaryId = r.u32();
  if (bestiaryId !== 11) throw new SaveFormatError('chunk', `expected chunk 11, got ${bestiaryId}`);
  const bestiarySizeWritten = r.u32();
  const bestiarySectionCount = r.u32();
  if (bestiarySectionCount !== 4 && bestiarySectionCount !== 5) {
    throw new SaveFormatError('bestiary', `section count ${bestiarySectionCount}`);
  }
  let entriesTotal = 0;
  for (const id of BESTIARY_SECTION_IDS) {
    const sid = r.u32();
    if (sid !== id) throw new SaveFormatError('bestiary', `expected section ${id}, got ${sid}`);
    const sizeWritten = r.u32();
    if (sizeWritten % 4 !== 0) throw new SaveFormatError('bestiary', `section size ${sizeWritten}`);
    const n = sizeWritten / 4;
    r.skip(n * 8);
    entriesTotal += n;
  }
  if (bestiarySizeWritten !== entriesTotal * 4) {
    throw new SaveFormatError('bestiary', `chunk size ${bestiarySizeWritten} vs entries ${entriesTotal}`);
  }

  r.u32();
  r.u32();
  if (r.pos !== bytes.length) throw new SaveFormatError('chunk', `trailing ${bytes.length - r.pos} bytes`);

  const save: SaveData = {
    achievements: chunks[0] as Uint8Array,
    counters: chunks[1] as Uint32Array,
    collectibles: chunks[3] as Uint8Array,
    challenges: chunks[6] as Uint8Array,
  };

  return { save, edition: editionOf(save.achievements.length) };
}
