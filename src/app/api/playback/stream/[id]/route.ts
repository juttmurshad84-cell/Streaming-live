import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { getStreamForViewer } from "@/lib/data/streams";
import { errMessage, logger } from "@/lib/log";
import { playbackForStream } from "@/lib/playback";
import { ProviderError } from "@/lib/providers/cloudflare";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!rateLimit(`pb:${clientIp(req.headers)}`, 120, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: NO_STORE });
  const stream = await getStreamForViewer(id, await getViewer());
  // 404 for both missing and forbidden: do not reveal that a private stream exists.
  if (!stream) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json(await playbackForStream(stream), { headers: NO_STORE });
  } catch (e) {
    logger.error("playback failed", { stream: id, error: errMessage(e) });
    const status = e instanceof ProviderError ? 502 : 500;
    return NextResponse.json({ kind: "offline", message: "Playback is temporarily unavailable. Please retry." }, { status, headers: NO_STORE });
  }
}
