import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { errMessage } from "@/lib/log";
import { syncSportsData } from "@/lib/sports/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = cronAuthorized(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (auth === "denied") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncSportsData());
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 500 });
  }
}
