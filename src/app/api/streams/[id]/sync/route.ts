import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errMessage } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { reconcileStream } from "@/lib/stream-sync";
import { reconcileRecordings } from "@/lib/recording";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Owner-triggered reconciliation: asks the PROVIDER whether the input is connected and updates our
 * status from that answer. The client can never assert that it is live — only the provider can.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401, headers: NO_STORE });
  if (!rateLimit(`sync:${user.id}`, 40, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: NO_STORE });
  const db = await createSupabaseServerClient();
  const { data: s } = await db!.from("streams").select("id, owner_id").eq("id", id).maybeSingle();
  if (!s || s.owner_id !== user.id) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const withRecordings = new URL(req.url).searchParams.get("recordings") === "1";
  try {
    const live = await reconcileStream(id);
    const recordings = withRecordings ? await reconcileRecordings(id) : undefined;
    const { data: fresh } = await db!.from("streams").select("status, source_health, source_health_detail, last_error, started_at, ended_at").eq("id", id).single();
    return NextResponse.json({ ...live, stream: fresh, recordings }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e).includes("not configured") ? "Streaming provider is not configured." : "Provider check failed. Try again shortly." }, { status: 502, headers: NO_STORE });
  }
}
