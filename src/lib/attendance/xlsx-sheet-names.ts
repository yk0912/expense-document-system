import { inflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const EOCD = 0x06054b50;

export function readXlsxSheetNames(file: Buffer): string[] {
  const xml = readZipText(file, "xl/workbook.xml");
  if (!xml) {
    return [];
  }
  const names: string[] = [];
  const pattern = /<sheet\b[^>]*?\bname=(["'])(.*?)\1/g;
  for (const match of xml.matchAll(pattern)) {
    const name = decodeXml(match[2] ?? "").trim();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function readZipText(file: Buffer, target: string): string | null {
  const eocd = findEocd(file);
  if (eocd < 0) {
    return null;
  }
  const count = file.readUInt16LE(eocd + 10);
  let offset = file.readUInt32LE(eocd + 16);
  const wanted = target.replaceAll("\\", "/");
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > file.length || file.readUInt32LE(offset) !== CENTRAL_HEADER) {
      return null;
    }
    const method = file.readUInt16LE(offset + 10);
    const compressedSize = file.readUInt32LE(offset + 20);
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const name = file.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.replaceAll("\\", "/") === wanted) {
      return readLocalEntry(file, localOffset, method, compressedSize);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function readLocalEntry(
  file: Buffer,
  localOffset: number,
  method: number,
  compressedSize: number,
): string | null {
  if (
    localOffset + 30 > file.length ||
    file.readUInt32LE(localOffset) !== LOCAL_HEADER ||
    compressedSize === 0xffffffff
  ) {
    return null;
  }
  const nameLength = file.readUInt16LE(localOffset + 26);
  const extraLength = file.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > file.length) {
    return null;
  }
  const data = file.subarray(start, end);
  if (method === 0) {
    return data.toString("utf8");
  }
  if (method === 8) {
    return inflateRawSync(data).toString("utf8");
  }
  return null;
}

function findEocd(file: Buffer): number {
  const start = Math.max(0, file.length - 22 - 0xffff);
  for (let index = file.length - 22; index >= start; index -= 1) {
    if (file.readUInt32LE(index) === EOCD) {
      return index;
    }
  }
  return -1;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
