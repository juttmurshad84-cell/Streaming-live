import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const schema = z.object({ streamId: z.string().uuid(), key: z.string().min(16).max(64) });

/** Concurrent-viewer heartbeat (every ~20s while the player is visible). Counts real open watch sessions. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!rateLimit(`hb:${parsed.data.key}`, 8, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ viewers: null });
  const { data, error } = await db.rpc("viewer_heartbeat", { p_stream: parsed.data.streamId, p_key: parsed.data.key });
  if (error) return NextResponse.json({ error: "failed" }, { status: 400 });
  return NextResponse.json({ viewers: data as number });
}
