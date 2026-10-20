import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { validateExternalSource } from "@/lib/source-validate";

export const dynamic = "force-dynamic";

/** Server-side validation of an external source URL (SSRF-guarded). Streamers and staff only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "streamer") || user.suspended) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!rateLimit(`srcval:${user.id}`, 20, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const parsed = z.object({ url: z.string().url().max(2048) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
  const r = await validateExternalSource(parsed.data.url);
  return NextResponse.json({ ok: r.ok, type: r.source?.type ?? null, health: r.health, detail: r.detail, title: r.title ?? null, thumbnailUrl: r.thumbnailUrl ?? null });
}
