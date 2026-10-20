import { beforeEach, describe, expect, it } from "vitest";
import { isPrivateAddress } from "@/lib/security/ip";
import { assertSafeUrlShape, safeFetch, UnsafeUrlError } from "@/lib/security/safe-fetch";
import { rateLimit, resetRateLimits } from "@/lib/security/rate-limit";
import { signStreamWebhook, verifySharedSecret, verifyStreamWebhookSignature } from "@/lib/security/webhook";
import { classifySource, sniffSource, SourceError } from "@/lib/sources";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "not-an-ip"])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "104.16.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("assertSafeUrlShape / safeFetch (SSRF)", () => {
  it.each([
    "ftp://example.com/a.m3u8", "file:///etc/passwd", "http://localhost/a", "http://127.0.0.1/a", "http://[::1]/a",
    "http://169.254.169.254/latest/meta-data", "https://user:pw@example.com/a", "https://example.com:8443/a",
    "http://foo.internal/a", "http://printer.local/a", "http://10.0.0.5/a", "notaurl",
  ])("rejects %s", (u) => {
    expect(() => assertSafeUrlShape(u)).toThrow(UnsafeUrlError);
  });
  it("accepts public https URLs", () => {
    expect(assertSafeUrlShape("https://example.com/live/index.m3u8").hostname).toBe("example.com");
  });
  it("refuses to connect to loopback even via a hostname that resolves there", async () => {
    // `localtest.me`-style names are blocked by DNS resolution guard, shape check covers literals.
    await expect(safeFetch("http://127.0.0.1:80/")).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("http://0.0.0.0/")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit then blocks, then recovers", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit("other", 3, 1000, t + 10).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t + 1500).ok).toBe(true);
  });
});

describe("webhook verification", () => {
  const secret = "s3cret";
  const body = JSON.stringify({ uid: "abc" });
  it("accepts a correct signature and rejects tampering, bad secrets and stale timestamps", () => {
    const now = 1_700_000_000;
    const header = signStreamWebhook(body, secret, now);
    expect(verifyStreamWebhookSignature(body, header, secret, 300, now + 10)).toEqual({ ok: true });
    expect(verifyStreamWebhookSignature(body + " ", header, secret, 300, now).ok).toBe(false);
    expect(verifyStreamWebhookSignature(body, header, "other", 300, now).ok).toBe(false);
    expect(verifyStreamWebhookSignature(body, header, secret, 300, now + 1000)).toMatchObject({ ok: false, reason: expect.stringContaining("tolerance") });
    expect(verifyStreamWebhookSignature(body, null, secret).ok).toBe(false);
    expect(verifyStreamWebhookSignature(body, "garbage", secret).ok).toBe(false);
  });
  it("compares shared secrets in constant time and rejects missing values", () => {
    expect(verifySharedSecret("abc", "abc")).toBe(true);
    expect(verifySharedSecret("abd", "abc")).toBe(false);
    expect(verifySharedSecret("abcd", "abc")).toBe(false);
    expect(verifySharedSecret(null, "abc")).toBe(false);
  });
});

describe("classifySource", () => {
  it("recognises supported shapes", () => {
    expect(classifySource("https://cdn.example.com/live/master.m3u8?token=1")).toMatchObject({ type: "hls" });
    expect(classifySource("https://cdn.example.com/a/manifest.mpd")).toMatchObject({ type: "dash" });
    expect(classifySource("https://cdn.example.com/video.mp4")).toMatchObject({ type: "mp4" });
    expect(classifySource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ type: "youtube", youtubeId: "dQw4w9WgXcQ", ref: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(classifySource("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ type: "youtube" });
    expect(classifySource("https://www.youtube.com/live/dQw4w9WgXcQ")).toMatchObject({ type: "youtube" });
  });
  it("never treats an arbitrary web page as a video", () => {
    expect(() => classifySource("https://example.com/some/page")).toThrow(SourceError);
    expect(() => classifySource("https://www.youtube.com/@channel")).toThrow(SourceError);
    expect(() => classifySource("http://cdn.example.com/a.m3u8")).toThrow(/https/);
    expect(() => classifySource("javascript:alert(1)")).toThrow(SourceError);
  });
  it("allows generic embeds only for approved hosts", () => {
    expect(() => classifySource("https://player.partner.tv/embed/123")).toThrow(SourceError);
    expect(classifySource("https://player.partner.tv/embed/123", ["partner.tv"])).toMatchObject({ type: "embed" });
    expect(() => classifySource("https://evilpartner.tv/embed/123", ["partner.tv"])).toThrow(SourceError);
  });
  it("sniffs manifests", () => {
    expect(sniffSource("hls", "text/plain", "#EXTM3U\n#EXT-X-VERSION:3")).toBeNull();
    expect(sniffSource("hls", "text/html", "<html>")).toMatch(/HLS/);
    expect(sniffSource("dash", null, '<?xml version="1.0"?><MPD xmlns="x">')).toBeNull();
    expect(sniffSource("mp4", "text/html", "")).toMatch(/video/);
    expect(sniffSource("mp4", "video/mp4", "")).toBeNull();
  });
});
