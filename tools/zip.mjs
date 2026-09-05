/*
 * A minimal ZIP writer.
 *
 * Store submissions want a .zip and every OS has some way to make one, but not
 * the same way — `zip` is missing on Windows, `ditto` is macOS only. Node ships
 * deflate and crc32, so 60 lines here means `npm run package` behaves
 * identically everywhere and the project still has no dependencies.
 */
import { deflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/* MS-DOS date/time, which is what the ZIP header expects. */
function dosDateTime(date) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
  const day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, day };
}

function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, base));
    /* Forward slashes: the ZIP spec requires them, and Windows would otherwise
     * produce an archive with backslashes in the names. */
    else out.push({ full, name: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

export function zipDirectory(sourceDir, outFile, when = new Date()) {
  const { time, day } = dosDateTime(when);
  const local = [];
  const central = [];
  let offset = 0;

  for (const { full, name } of filesUnder(sourceDir)) {
    const raw = readFileSync(full);
    const deflated = deflateRawSync(raw, { level: 9 });
    /* Fall back to storing when compression would make the entry bigger. */
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);            // version needed
    header.writeUInt16LE(0, 6);             // flags
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(day, 12);
    header.writeUInt32LE(sum, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);            // extra field length
    local.push(header, nameBuf, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);             // version made by
    entry.writeUInt16LE(20, 6);             // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(0, 38);             // external attributes
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);   // entries on this disk
  end.writeUInt16LE(central.length / 2, 10);  // entries total
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outFile, Buffer.concat([...local, centralBuf, end]));
  return { entries: central.length / 2, bytes: statSync(outFile).size };
}
