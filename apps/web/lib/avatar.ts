import sharp from "sharp";
import { newStorageKey, putObject } from "@vtk/storage";

export const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8 MiB before re-encode

/**
 * Store an uploaded avatar: re-encode to a square-ish JPEG, upload to S3 and
 * return the new storage key. Returns `null` when no (valid) file was sent.
 * Gedeeld door het eigen profiel (/account, onboarding) en het
 * gebruikersbeheer in de admin (WEBSITE-50), zodat beide dezelfde
 * uitsnede- en opslagregels volgen.
 *
 * Bewust in `lib` en niet in een `app/actions/*` ("use server") file: een
 * server file mag alleen async functies exporteren, dus de constante
 * `MAX_AVATAR_BYTES` mag er niet leven.
 */
export async function storeAvatar(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_AVATAR_BYTES) throw new Error("AVATAR_TOO_LARGE");

  const input = Buffer.from(await file.arrayBuffer());
  const body = await sharp(input)
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const key = newStorageKey("avatars", "avatar.jpg");
  await putObject(key, body, "image/jpeg");
  return key;
}
