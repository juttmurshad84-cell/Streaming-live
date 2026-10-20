import "server-only";
import { env } from "@/lib/env";
import { verifySharedSecret } from "@/lib/security/webhook";

/** Cron endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically). */
export function cronAuthorized(req: Request): "ok" | "unconfigured" | "denied" {
  if (!env.cronSecret) return "unconfigured";
  const h = req.headers.get("authorization") ?? "";
  return verifySharedSecret(h.startsWith("Bearer ") ? h.slice(7) : null, env.cronSecret) ? "ok" : "denied";
}
