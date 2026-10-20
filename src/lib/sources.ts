import type { SourceType } from "./types";

export interface ClassifiedSource {
  type: Exclude<SourceType, "platform_webrtc" | "platform_rtmps">;
  /** What we store as `playback_ref`. For YouTube this is the normalised embed URL. */
  ref: string;
  youtubeId?: string;
}

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: URL): string | null {
  const host = input.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;
  let id: string | null = null;
  if (host === "youtu.be") id = input.pathname.slice(1).split("/")[0];
  else if (input.pathname === "/watch") id = input.searchParams.get("v");
  else {
    const m = input.pathname.match(/^\/(?:embed|live|shorts)\/([^/?#]+)/);
    id = m?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export class SourceError extends Error {}

/**
 * Decide what kind of playback source a URL is *from its shape only*. A random web page is never
 * treated as a video: unsupported shapes are rejected, and generic embeds require an allow-listed host.
 */
export function classifySource(raw: string, approvedEmbedHosts: string[] = []): ClassifiedSource {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SourceError("Enter a valid URL.");
  }
  if (url.protocol !== "https:") throw new SourceError("Only https:// sources are supported.");
  if (url.username || url.password) throw new SourceError("URLs with embedded credentials are not allowed.");

  const yt = parseYouTubeId(url);
  if (yt) return { type: "youtube", ref: `https://www.youtube-nocookie.com/embed/${yt}`, youtubeId: yt };
  if (YT_HOSTS.has(url.hostname.toLowerCase())) {
    throw new SourceError("That YouTube link is not a single video. Use a watch, live, shorts or embed URL.");
  }

  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8")) return { type: "hls", ref: url.toString() };
  if (path.endsWith(".mpd")) return { type: "dash", ref: url.toString() };
  if (path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".m4v")) return { type: "mp4", ref: url.toString() };

  const host = url.hostname.toLowerCase();
  if (approvedEmbedHosts.some((h) => host === h || host.endsWith("." + h))) {
    return { type: "embed", ref: url.toString() };
  }
  throw new SourceError(
    "Unsupported source. Provide a direct .m3u8 (HLS), .mpd (DASH) or .mp4 URL, an official YouTube link, or a URL from an administrator-approved embed provider. Regular web pages are not video URLs.",
  );
}

/** Content sniffing of the fetched head of a source. Returns an error string or null if plausible. */
export function sniffSource(type: ClassifiedSource["type"], contentType: string | null, head: string): string | null {
  const ct = (contentType ?? "").toLowerCase();
  if (type === "hls") {
    if (!head.trimStart().startsWith("#EXTM3U")) return "The URL did not return an HLS playlist (#EXTM3U).";
  } else if (type === "dash") {
    if (!/<MPD[\s>]/i.test(head)) return "The URL did not return a DASH manifest (<MPD>).";
  } else if (type === "mp4") {
    if (!(ct.startsWith("video/") || ct === "application/octet-stream" || ct === "binary/octet-stream")) {
      return `Expected a video file but the server returned “${ct || "unknown"}”.`;
    }
  }
  return null;
}

export const EMBED_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups";
