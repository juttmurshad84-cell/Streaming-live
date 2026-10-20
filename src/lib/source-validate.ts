import "server-only";
import { env } from "@/lib/env";
import { safeFetch, UnsafeUrlError } from "@/lib/security/safe-fetch";
import { classifySource, sniffSource, SourceError, type ClassifiedSource } from "@/lib/sources";
import type { SourceHealth } from "@/lib/types";

export interface SourceCheck {
  ok: boolean;
  source?: ClassifiedSource;
  health: SourceHealth;
  detail: string;
  title?: string;
  thumbnailUrl?: string;
}

/**
 * Validate an external playback source on the server: shape → SSRF-safe fetch → content sniffing.
 * Never executes or embeds anything; only reads the first bytes through the guarded fetcher.
 */
export async function validateExternalSource(raw: string): Promise<SourceCheck> {
  let source: ClassifiedSource;
  try {
    source = classifySource(raw, env.approvedEmbedHosts);
  } catch (e) {
    return { ok: false, health: "failed", detail: e instanceof SourceError ? e.message : "Invalid URL" };
  }
  try {
    if (source.type === "youtube") {
      const o = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${source.youtubeId}`)}`, { maxBytes: 32 * 1024 });
      if (o.status === 401 || o.status === 403) return { ok: false, source, health: "failed", detail: "The owner has disabled embedding for this YouTube video." };
      if (o.status === 404) return { ok: false, source, health: "failed", detail: "YouTube reports this video is unavailable or private." };
      if (o.status >= 400) return { ok: false, source, health: "degraded", detail: `YouTube oEmbed returned HTTP ${o.status}.` };
      const j = JSON.parse(o.text) as { title?: string; thumbnail_url?: string };
      return { ok: true, source, health: "healthy", detail: "Official YouTube embed verified via oEmbed.", title: j.title, thumbnailUrl: j.thumbnail_url };
    }
    if (source.type === "embed") {
      const r = await safeFetch(source.ref, { method: "HEAD" });
      if (r.status >= 400) return { ok: false, source, health: "failed", detail: `The embed host returned HTTP ${r.status}.` };
      return { ok: true, source, health: "healthy", detail: "Approved embed host reachable. Embedding is still subject to the provider's own rules." };
    }
    const r = await safeFetch(source.ref, { headers: source.type === "mp4" ? { range: "bytes=0-1023" } : {}, maxBytes: 64 * 1024 });
    if (r.status === 401 || r.status === 403) return { ok: false, source, health: "failed", detail: "The source requires authentication or denies access. Protected streams are not supported." };
    if (r.status === 404 || r.status === 410) return { ok: false, source, health: "failed", detail: "The source was not found (it may have expired)." };
    if (r.status >= 400) return { ok: false, source, health: "failed", detail: `The source returned HTTP ${r.status}.` };
    if (/#EXT-X-KEY:METHOD=(?!NONE)/i.test(r.text) && /KEYFORMAT="(com\.apple\.streamingkeydelivery|com\.microsoft\.playready|urn:uuid)/i.test(r.text)) {
      return { ok: false, source, health: "failed", detail: "DRM-protected streams are not supported." };
    }
    const problem = sniffSource(source.type, r.contentType, r.text);
    if (problem) return { ok: false, source, health: "failed", detail: problem };
    return { ok: true, source, health: "healthy", detail: "Source responded with a valid manifest/media. CORS and geo restrictions can still affect some viewers." };
  } catch (e) {
    if (e instanceof UnsafeUrlError) return { ok: false, source, health: "failed", detail: `Blocked: ${e.message}.` };
    const msg = e instanceof Error ? e.message : "";
    const timedOut = /abort|timeout/i.test(msg);
    return { ok: false, source, health: "failed", detail: timedOut ? "The source did not respond in time." : "Could not reach the source." };
  }
}
