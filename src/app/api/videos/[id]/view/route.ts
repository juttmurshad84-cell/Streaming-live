import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Count a view: at most once per client per video per 30 minutes (best-effort, per instance). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!rateLimit(`view:${clientIp(req.headers)}:${id}`, 1, 30 * 60_000).ok) return NextResponse.json({ counted: false });
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ counted: false });
  const { error } = await db.rpc("increment_video_views", { p_video: id });
  return NextResponse.json({ counted: !error });
}
