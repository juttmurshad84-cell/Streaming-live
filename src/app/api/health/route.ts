import { NextResponse } from "next/server";
import { hasServiceRole, integrationStatuses } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reports configuration *presence* and DB reachability, never secrets. */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const db = createSupabaseAdminClient();
  if (!db) {
    checks.database = { ok: false, detail: hasServiceRole() ? "client unavailable" : "not configured (development fixtures mode)" };
  } else {
    try {
      const { error } = await db.from("sports_categories").select("id", { head: true, count: "exact" }).limit(1);
      checks.database = error ? { ok: false, detail: error.message.includes("does not exist") ? "migrations not applied" : "query failed" } : { ok: true };
    } catch {
      checks.database = { ok: false, detail: "unreachable" };
    }
  }
  const integrations = Object.fromEntries(integrationStatuses().map((i) => [i.key, i.state]));
  const ok = checks.database.ok;
  return NextResponse.json({ status: ok ? "ok" : "degraded", time: new Date().toISOString(), checks, integrations }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
