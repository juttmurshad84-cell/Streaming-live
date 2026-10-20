import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Idempotency ledger for provider webhooks. `claim` returns true exactly once per event key —
 * except that an event whose previous attempt FAILED (processed_at is null) can be claimed again,
 * so provider retries can complete the work.
 */
export async function claimWebhookEvent(provider: string, eventKey: string, eventType: string, payload: unknown): Promise<{ claimed: boolean; id: string | null }> {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const { data, error } = await db.from("webhook_events").insert({ provider, event_key: eventKey, event_type: eventType, payload }).select("id").single();
  if (!error) return { claimed: true, id: data.id };
  if (error.code !== "23505") throw error;
  const { data: existing } = await db.from("webhook_events").select("id, processed_at").eq("provider", provider).eq("event_key", eventKey).single();
  if (existing && !existing.processed_at) return { claimed: true, id: existing.id };
  return { claimed: false, id: existing?.id ?? null };
}

export async function finishWebhookEvent(id: string | null, error?: string) {
  if (!id) return;
  const db = createSupabaseAdminClient();
  if (!db) return;
  await db.from("webhook_events").update(error ? { error: error.slice(0, 500) } : { processed_at: new Date().toISOString(), error: null }).eq("id", id);
}
