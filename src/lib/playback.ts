import "server-only";
import { env } from "@/lib/env";
import { FIXTURE_MP4 } from "@/lib/fixtures";
import { dashUrl, hlsUrl, signPlaybackToken } from "@/lib/providers/cloudflare";
import type { Stream, Video } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** What the client player needs. Contains only playback URLs (signed + short-lived where required). */
export type PlaybackDescriptor =
  | { kind: "hls"; url: string; live: boolean; dashUrl?: string }
  | { kind: "dash"; url: string; live: boolean }
  | { kind: "mp4"; url: string }
  | { kind: "whep"; url: string }
  | { kind: "youtube"; embedUrl: string }
  | { kind: "embed"; url: string }
  | { kind: "replay"; videoId: string }
  | { kind: "offline"; message: string };

export async function playbackForStream(s: Stream): Promise<PlaybackDescriptor> {
  switch (s.source_type) {
    case "hls":
      return s.status === "disabled" ? { kind: "offline", message: "This stream has been disabled." } : { kind: "hls", url: s.playback_ref!, live: s.status === "live" };
    case "dash":
      return { kind: "dash", url: s.playback_ref!, live: s.status === "live" };
    case "mp4":
      return { kind: "mp4", url: s.playback_ref! };
    case "youtube":
      return { kind: "youtube", embedUrl: s.playback_ref! };
    case "embed": {
      const host = safeHost(s.playback_ref);
      if (!host || !env.approvedEmbedHosts.some((h) => host === h || host.endsWith("." + h))) {
        return { kind: "offline", message: "This embed provider is no longer approved." };
      }
      return { kind: "embed", url: s.playback_ref! };
    }
    case "platform_webrtc": {
      if (s.status !== "live") return { kind: "offline", message: s.status === "ended" ? "This broadcast has ended. Browser broadcasts are not recorded." : "The broadcaster has not started yet." };
      if (!env.cfCustomerCode || !s.provider_stream_id) return { kind: "offline", message: "Streaming provider is not configured." };
      return { kind: "whep", url: `https://customer-${env.cfCustomerCode}.cloudflarestream.com/${s.provider_stream_id}/webRTC/play` };
    }
    case "platform_rtmps": {
      if (s.status === "live" && s.provider_stream_id) {
        const token = await signPlaybackToken(s.provider_stream_id, 2 * 3600);
        return { kind: "hls", url: hlsUrl(token), live: true };
      }
      if (s.status === "ended") {
        const db = createSupabaseAdminClient();
        const { data } = await db?.from("videos").select("id").eq("stream_id", s.id).eq("processing_status", "ready").order("published_at", { ascending: false }).limit(1).maybeSingle() ?? { data: null };
        if (data) return { kind: "replay", videoId: data.id };
        return { kind: "offline", message: s.recording_enabled ? "The broadcast has ended. The replay is still processing or no recording was produced." : "The broadcast has ended. Recording was not enabled." };
      }
      return { kind: "offline", message: "The broadcaster has not started yet." };
    }
  }
}

export async function playbackForVideo(v: Video): Promise<PlaybackDescriptor> {
  if (v.isFixture) return { kind: "mp4", url: FIXTURE_MP4 };
  if (v.processing_status !== "ready") return { kind: "offline", message: "This video is still processing." };
  const token = await signPlaybackToken(v.provider_asset_id, 4 * 3600);
  return { kind: "hls", url: hlsUrl(token), dashUrl: dashUrl(token), live: false };
}

function safeHost(u: string | null) {
  try {
    return u ? new URL(u).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}
