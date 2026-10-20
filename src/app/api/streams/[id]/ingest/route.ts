import { NextResponse } from "next/server";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { getLiveInput, ProviderError } from "@/lib/providers/cloudflare";
import { rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * Returns the ingest credentials (stream key / WHIP URL) to the stream OWNER only.
 * They are fetched from the provider on demand and are never stored in our database or exposed publicly.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401, headers: NO_STORE });
  if (user.suspended) return NextResponse.json({ error: "account suspended" }, { status: 403, headers: NO_STORE });
  if (!rateLimit(`ingest:${user.id}`, 30, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: NO_STORE });
  const db = await createSupabaseServerClient();
  const { data: s } = await db!.from("streams").select("id, owner_id, source_type, provider_stream_id, status").eq("id", id).maybeSingle();
  // RLS lets staff read others' rows, but only the owner may see credentials.
  if (!s || s.owner_id !== user.id) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  void hasRole;
  if (!s.provider_stream_id || !(s.source_type === "platform_rtmps" || s.source_type === "platform_webrtc")) {
    return NextResponse.json({ error: "this stream does not use platform ingest" }, { status: 400, headers: NO_STORE });
  }
  try {
    const input = await getLiveInput(s.provider_stream_id);
    if (s.source_type === "platform_webrtc") {
      return NextResponse.json({ protocol: "whip", whipUrl: input.webRTC?.url ?? null, enabled: input.enabled !== false }, { headers: NO_STORE });
    }
    return NextResponse.json({
      protocol: "rtmps",
      server: input.rtmps?.url ?? null,
      streamKey: input.rtmps?.streamKey ?? null,
      srt: input.srt ? { url: input.srt.url, streamId: input.srt.streamId, passphrase: input.srt.passphrase } : null,
      enabled: input.enabled !== false,
      recording: input.recording?.mode ?? "off",
      customerCodeConfigured: Boolean(env.cfCustomerCode),
    }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "Could not reach the streaming provider.";
    return NextResponse.json({ error: msg }, { status: 502, headers: NO_STORE });
  }
}
