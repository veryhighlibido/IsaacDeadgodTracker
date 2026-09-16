import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

function store(file) {
  const png = readFileSync(file);
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${file}: not a PNG`);
  const parts = [SIGNATURE];
  const idat = [];
  let slot = -1;
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (type === 'IDAT') {
      if (slot < 0) slot = parts.push(null) - 1;
      idat.push(png.subarray(offset + 8, offset + 8 + length));
    } else {
      parts.push(png.subarray(offset, end));
    }
    offset = end;
    if (type === 'IEND') break;
  }
  const pixels = inflateSync(Buffer.concat(idat));
  parts[slot] = chunk('IDAT', deflateSync(pixels, { level: 0 }));
  const out = Buffer.concat(parts);
  writeFileSync(file, out);
  return [png.length, out.length];
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

const root = process.argv[2] ?? 'dist';
let before = 0;
let after = 0;
const files = walk(root);
for (const file of files) {
  const [from, to] = store(file);
  before += from;
  after += to;
}
console.log(`stored ${files.length} png: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
