import "server-only";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decrypt, encrypt, safeEqual } from "@/lib/crypto";

/**
 * Document storage. Files are encrypted (AES-256-GCM) before they touch disk/object storage.
 * Development: local directory. Production: mount UAE-hosted encrypted object storage at
 * STORAGE_DIR, or replace put/get with the provider SDK (interface stays the same).
 */
const root = () => process.env.STORAGE_DIR ?? ".data/uploads";

export async function putObject(key: string, data: Buffer) {
  const file = path.join(/*turbopackIgnore: true*/ root(), key.replace(/[^a-zA-Z0-9/_-]/g, ""));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, encrypt(data.toString("base64")));
  return { sha256: createHash("sha256").update(data).digest("hex"), sizeBytes: data.length };
}

export async function getObject(key: string): Promise<Buffer> {
  const file = path.join(/*turbopackIgnore: true*/ root(), key.replace(/[^a-zA-Z0-9/_-]/g, ""));
  return Buffer.from(decrypt(await readFile(file, "utf8")), "base64");
}

const secret = () => process.env.TOKEN_PEPPER ?? "dev";

/** Short-lived signed download URL bound to the document and the requesting user. */
export function signDownload(documentId: string, userId: string, ttlSeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", secret()).update(`${documentId}:${userId}:${exp}`).digest("base64url");
  return `/api/v1/documents/${documentId}?exp=${exp}&sig=${sig}`;
}

export function verifyDownload(documentId: string, userId: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = createHmac("sha256", secret()).update(`${documentId}:${userId}:${exp}`).digest("base64url");
  return safeEqual(expected, sig);
}
