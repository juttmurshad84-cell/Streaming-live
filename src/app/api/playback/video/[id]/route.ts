import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { getVideoForViewer } from "@/lib/data/videos";
import { errMessage, logger } from "@/lib/log";
import { playbackForVideo } from "@/lib/playback";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!rateLimit(`pbv:${clientIp(req.headers)}`, 120, 60_000).ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: NO_STORE });
  const video = await getVideoForViewer(id, await getViewer());
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json(await playbackForVideo(video), { headers: NO_STORE });
  } catch (e) {
    logger.error("video playback failed", { video: id, error: errMessage(e) });
    return NextResponse.json({ kind: "offline", message: "Playback is temporarily unavailable. Please retry." }, { status: 502, headers: NO_STORE });
  }
}
