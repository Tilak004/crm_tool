import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Invoice files are stored on disk, outside the public folder, and served
// only through /api/attachments/[id] after a permission check.
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TYPES = [
  { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
] as const;

/** Detects the file type from its first bytes; the browser-supplied type isn't trusted. */
export function sniffType(bytes: Uint8Array) {
  const isWebp = bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (isWebp) return { mime: "image/webp", ext: "webp" };
  return TYPES.find((t) => t.magic.every((b, i) => bytes[i] === b)) ?? null;
}

/** Saves the file and returns its storage key (a relative path under ROOT). */
export async function saveUpload(merchantId: string, bytes: Uint8Array, ext: string) {
  const key = path.posix.join(safeSegment(merchantId), `${randomUUID()}.${ext}`);
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return key;
}

export function readUpload(key: string) {
  return readFile(resolveKey(key));
}

export async function deleteUpload(key: string) {
  await rm(resolveKey(key), { force: true });
}

/** Removes every file of one merchant (used when the merchant is deleted). */
export async function deleteMerchantUploads(merchantId: string) {
  await rm(resolveKey(safeSegment(merchantId)), { recursive: true, force: true });
}

function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

function safeSegment(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "");
}
