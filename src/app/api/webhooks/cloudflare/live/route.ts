import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { errMessage, logger } from "@/lib/log";
import { verifySharedSecret } from "@/lib/security/webhook";
import { applyLiveSignal, type LiveSignal } from "@/lib/stream-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { claimWebhookEvent, finishWebhookEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

interface LiveWebhook {
  data?: {
    input_id?: string;
    event_type?: string;
    updated_at?: string;
    live_input_errored?: { error?: { code?: string; message?: string } };
  };
}

/**
 * Cloudflare Notifications webhook for live inputs (connected / disconnected / errored).
 * Cloudflare authenticates these with a shared secret in the `cf-webhook-auth` header.
 * Fails closed (503) when the secret is not configured.
 */
export async function POST(req: Request) {
  const secret = env.cfLiveWebhookSecret;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  if (!verifySharedSecret(req.headers.get("cf-webhook-auth"), secret)) {
    logger.warn("live webhook rejected: bad secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: LiveWebhook;
  try {
    body = (await req.json()) as LiveWebhook;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const d = body.data;
  if (!d?.input_id || !d.event_type) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  const signal: LiveSignal | null = d.event_type === "live_input.connected" ? "connected" : d.event_type === "live_input.disconnected" ? "disconnected" : d.event_type === "live_input.errored" ? "errored" : null;
  if (!signal) return NextResponse.json({ ok: true, ignored: d.event_type });

  const db = createSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "database not configured" }, { status: 503 });
  const claim = await claimWebhookEvent("cloudflare-live", `${d.input_id}:${d.event_type}:${d.updated_at ?? ""}`, d.event_type, body);
  if (!claim.claimed) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const { data: stream } = await db.from("streams").select("id").eq("provider", "cloudflare").eq("provider_stream_id", d.input_id).maybeSingle();
    if (!stream) {
      await finishWebhookEvent(claim.id);
      return NextResponse.json({ ok: true, ignored: "unknown input" });
    }
    const res = await applyLiveSignal(stream.id, signal, { at: d.updated_at ? new Date(d.updated_at).toISOString() : undefined, detail: d.live_input_errored?.error ? `${d.live_input_errored.error.code}: ${d.live_input_errored.error.message ?? ""}` : undefined });
    await finishWebhookEvent(claim.id);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    logger.error("live webhook failed", { error: errMessage(e), input: d.input_id });
    await finishWebhookEvent(claim.id, errMessage(e));
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // provider will retry
  }
}
