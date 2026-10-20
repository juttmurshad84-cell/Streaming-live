import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const THUMB_W = 1280;
export const THUMB_H = 720;

export type ImageKind = "jpeg" | "png" | "webp";

/** Identify an image from its magic bytes (never trust the filename or declared MIME type). */
export function sniffImage(buf: Uint8Array): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 12 && String.fromCharCode(...buf.subarray(0, 4)) === "RIFF" && String.fromCharCode(...buf.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Largest rectangle with the target aspect ratio, centred on the focal point (percent) and kept inside the image. */
export function computeCrop(width: number, height: number, fx: number, fy: number, aspect = 16 / 9) {
  let cw = width;
  let ch = Math.round(width / aspect);
  if (ch > height) {
    ch = height;
    cw = Math.round(height * aspect);
  }
  const left = Math.min(Math.max(Math.round((width * clamp(fx)) / 100 - cw / 2), 0), width - cw);
  const top = Math.min(Math.max(Math.round((height * clamp(fy)) / 100 - ch / 2), 0), height - ch);
  return { left, top, width: cw, height: ch };
}
const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 50));

export class ImageError extends Error {}

/** Validate, crop to 16:9 around the focal point, resize to 1280×720 and re-encode as WebP (strips metadata). */
export async function processThumbnail(input: Buffer, fx = 50, fy = 50): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.byteLength === 0) throw new ImageError("The image is empty.");
  if (input.byteLength > MAX_IMAGE_BYTES) throw new ImageError("Images must be 5 MB or smaller.");
  if (!sniffImage(input)) throw new ImageError("Only JPEG, PNG or WebP images are allowed.");
  try {
    const oriented = await sharp(input, { limitInputPixels: 50_000_000 }).rotate().toBuffer(); // applies EXIF orientation
    const { width: w, height: h } = await sharp(oriented).metadata();
    if (!w || !h || w < 320 || h < 180) throw new ImageError("Image is too small (minimum 320×180).");
    const data = await sharp(oriented)
      .extract(computeCrop(w, h, fx, fy))
      .resize(THUMB_W, THUMB_H, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    return { data, width: THUMB_W, height: THUMB_H };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError("The file could not be read as an image.");
  }
}

/** Avatars: square 256×256. */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  if (input.byteLength > MAX_IMAGE_BYTES) throw new ImageError("Images must be 5 MB or smaller.");
  if (!sniffImage(input)) throw new ImageError("Only JPEG, PNG or WebP images are allowed.");
  try {
    return await sharp(input, { limitInputPixels: 50_000_000 }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new ImageError("The file could not be read as an image.");
  }
}

export async function processBanner(input: Buffer): Promise<Buffer> {
  if (input.byteLength > MAX_IMAGE_BYTES) throw new ImageError("Images must be 5 MB or smaller.");
  if (!sniffImage(input)) throw new ImageError("Only JPEG, PNG or WebP images are allowed.");
  try {
    return await sharp(input, { limitInputPixels: 50_000_000 }).rotate().resize(1600, 400, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new ImageError("The file could not be read as an image.");
  }
}
