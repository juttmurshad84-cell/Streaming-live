import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { computeCrop, ImageError, MAX_IMAGE_BYTES, processThumbnail, sniffImage } from "@/lib/images";

const make = (w: number, h: number, fmt: "png" | "jpeg" = "png") =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#3366ff" } })[fmt]().toBuffer();

describe("computeCrop", () => {
  it("crops tall images to 16:9, following the focal point and staying in bounds", () => {
    const top = computeCrop(1000, 2000, 50, 0);
    expect(top).toEqual({ left: 0, top: 0, width: 1000, height: 563 });
    const bottom = computeCrop(1000, 2000, 50, 100);
    expect(bottom.top + bottom.height).toBe(2000);
    const mid = computeCrop(1000, 2000, 50, 50);
    expect(mid.top).toBe(719);
  });
  it("crops wide images horizontally", () => {
    const c = computeCrop(3000, 1000, 0, 50);
    expect(c.left).toBe(0);
    expect(c.width).toBe(1778);
    expect(c.height).toBe(1000);
    expect(computeCrop(3000, 1000, 100, 50).left + 1778).toBe(3000);
  });
  it("tolerates garbage focal points", () => {
    expect(computeCrop(1600, 900, NaN, 999)).toEqual({ left: 0, top: 0, width: 1600, height: 900 });
  });
});

describe("processThumbnail", () => {
  it("outputs 1280x720 webp", async () => {
    const { data } = await processThumbnail(await make(2000, 1500, "jpeg"), 20, 70);
    const meta = await sharp(data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1280, 720, "webp"]);
  });
  it("rejects non-images, spoofed content, tiny and oversized files", async () => {
    await expect(processThumbnail(Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(ImageError);
    await expect(processThumbnail(Buffer.from("GIF89a....."))).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(processThumbnail(await make(100, 50))).rejects.toThrow(/too small/);
    await expect(processThumbnail(Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff))).rejects.toThrow(/5 MB/);
    await expect(processThumbnail(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))).rejects.toThrow(ImageError);
  });
  it("sniffs formats by magic bytes", async () => {
    expect(sniffImage(await make(10, 10, "png"))).toBe("png");
    expect(sniffImage(await make(10, 10, "jpeg"))).toBe("jpeg");
    expect(sniffImage(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).webp().toBuffer())).toBe("webp");
    expect(sniffImage(Buffer.from("hello"))).toBeNull();
  });
});
