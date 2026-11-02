import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/uploads");

// Names we generate are UUIDs plus a short extension. Anything else is rejected
// so a stored name can never point outside the upload directory.
export function storedPath(storedName) {
  if (!storedName || !/^[\w.-]+$/.test(storedName)) return null;
  const full = path.resolve(uploadDir, storedName);
  if (!full.startsWith(uploadDir + path.sep)) return null;
  return full;
}

export async function saveUpload(buffer, extension) {
  await fs.mkdir(uploadDir, { recursive: true });
  const storedName = `${crypto.randomUUID()}${extension}`;
  const full = path.join(uploadDir, storedName);
  try {
    await fs.writeFile(full, buffer);
  } catch (err) {
    await fs.unlink(full).catch(() => {});
    throw err;
  }
  return storedName;
}

export async function hasStored(storedName) {
  const full = storedPath(storedName);
  if (!full) return false;
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

export async function deleteStored(storedName) {
  const full = storedPath(storedName);
  if (!full) return;
  await fs.unlink(full).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });
}
