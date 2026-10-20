import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { errMessage, logger } from "@/lib/log";
import type { CfVideo } from "@/lib/providers/cloudflare";
import { ingestRecordingVideo } from "@/lib/recording";
import { verifyStreamWebhookSignature } from "@/lib/security/webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { claimWebhookEvent, finishWebhookEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Cloudflare Stream video webhook (ready / error). Signed with HMAC-SHA256 in `Webhook-Signature`.
 * The recording → video pipeline is idempotent: repeated deliveries never create duplicate videos.
 */
export async function POST(req: Request) {
  const secret = env.cfVideoWebhookSecret;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const raw = await req.text(); // must be the unmodified body for signature verification
  const check = verifyStreamWebhookSignature(raw, req.headers.get("webhook-signature"), secret);
  if (!check.ok) {
    logger.warn("stream webhook rejected", { reason: check.reason });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let video: CfVideo;
  try {
    video = JSON.parse(raw) as CfVideo;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!video.uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });
  if (!createSupabaseAdminClient()) return NextResponse.json({ error: "database not configured" }, { status: 503 });

  const claim = await claimWebhookEvent("cloudflare-stream", `video:${video.uid}:${video.status?.state ?? ""}:${video.modified ?? ""}`, `video.${video.status?.state ?? "unknown"}`, { uid: video.uid, state: video.status?.state, liveInput: video.liveInput });
  if (!claim.claimed) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const outcome = await ingestRecordingVideo(video);
    await finishWebhookEvent(claim.id);
    return NextResponse.json({ ok: true, outcome: outcome.kind });
  } catch (e) {
    logger.error("stream webhook failed", { error: errMessage(e), video: video.uid });
    await finishWebhookEvent(claim.id, errMessage(e));
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
