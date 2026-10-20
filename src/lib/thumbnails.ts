import "server-only";
import crypto from "node:crypto";
import { ImageError, MAX_IMAGE_BYTES, processAvatar, processBanner, processThumbnail } from "@/lib/images";
import { safeFetch, UnsafeUrlError } from "@/lib/security/safe-fetch";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class ThumbnailError extends Error {}

async function upload(ownerId: string, data: Buffer, prefix: string): Promise<string> {
  const db = createSupabaseAdminClient();
  if (!db) throw new ThumbnailError("File storage is not configured. Paste an image URL instead, or ask the administrator to configure Supabase Storage.");
  const path = `${ownerId}/${prefix}-${crypto.randomUUID()}.webp`; // unguessable name inside the owner's folder
  const { error } = await db.storage.from("thumbnails").upload(path, data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw new ThumbnailError("The image could not be stored. Please try again.");
  return db.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
}

/** Download an image from a user-supplied URL through the SSRF-guarded fetcher. */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  try {
    const r = await safeFetch(url, { maxBytes: MAX_IMAGE_BYTES + 1, headers: { accept: "image/*" } });
    if (r.status >= 400) throw new ThumbnailError(`The image URL returned HTTP ${r.status}.`);
    if (r.truncated) throw new ThumbnailError("Images must be 5 MB or smaller.");
    return r.bytes;
  } catch (e) {
    if (e instanceof ThumbnailError) throw e;
    if (e instanceof UnsafeUrlError) throw new ThumbnailError(`Image URL blocked: ${e.message}.`);
    throw new ThumbnailError("The image URL could not be downloaded.");
  }
}

/**
 * Resolve the thumbnail fields of a form: an uploaded file wins over a pasted URL. The result is always
 * a validated, cropped 16:9 WebP stored in our bucket — arbitrary remote images are never hot-linked.
 * Returns null when the form supplied no new image.
 */
export async function thumbnailFromForm(fd: FormData, ownerId: string, fx: number, fy: number): Promise<string | null> {
  const file = fd.get("thumbnail_file");
  const urlRaw = typeof fd.get("thumbnail_url") === "string" ? (fd.get("thumbnail_url") as string).trim() : "";
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMAGE_BYTES) throw new ThumbnailError("Images must be 5 MB or smaller.");
      const { data } = await processThumbnail(Buffer.from(await file.arrayBuffer()), fx, fy);
      return await upload(ownerId, data, "thumb");
    }
    if (urlRaw) {
      const { data } = await processThumbnail(await fetchImageBuffer(urlRaw), fx, fy);
      return await upload(ownerId, data, "thumb");
    }
  } catch (e) {
    if (e instanceof ImageError || e instanceof ThumbnailError) throw new ThumbnailError(e.message);
    throw e;
  }
  return null;
}

export async function storeProfileImage(fd: FormData, field: "avatar" | "banner", ownerId: string): Promise<string | null> {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    return await upload(ownerId, field === "avatar" ? await processAvatar(buf) : await processBanner(buf), field);
  } catch (e) {
    if (e instanceof ImageError || e instanceof ThumbnailError) throw new ThumbnailError(e.message);
    throw e;
  }
}
