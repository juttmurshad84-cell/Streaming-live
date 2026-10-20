import "server-only";
import { headers } from "next/headers";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import type { CurrentUser, UserRole } from "@/lib/types";

export type ActionState = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; redirectTo?: string; data?: Record<string, unknown> } | null;

export const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({ ok: false, error, fieldErrors });
export const done = (message?: string, data?: Record<string, unknown>): ActionState => ({ ok: true, message, data });

export class ActionError extends Error {}

/** Authenticated + role + not suspended. Throws ActionError (caught by `guard`). */
export async function actionUser(min: UserRole = "viewer"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ActionError("Please sign in to continue.");
  if (u.suspended) throw new ActionError("Your account is suspended.");
  if (!hasRole(u, min)) throw new ActionError(min === "streamer" ? "Only streamers can do this. Enable streaming in your dashboard first." : "You do not have permission to do that.");
  return u;
}

export async function limit(key: string, max: number, windowMs: number) {
  const ip = clientIp(await headers());
  const r = rateLimit(`${key}:${ip}`, max, windowMs);
  if (!r.ok) throw new ActionError(`Too many attempts. Try again in ${r.retryAfterSeconds}s.`);
}

export async function limitUser(key: string, userId: string, max: number, windowMs: number) {
  const r = rateLimit(`${key}:${userId}`, max, windowMs);
  if (!r.ok) throw new ActionError(`You're doing that too quickly. Try again in ${r.retryAfterSeconds}s.`);
}

/** Wrap an action body so ActionErrors and unexpected errors become safe, user-readable state. */
export async function guard(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message);
    // Next.js redirect() throws a special error that must propagate.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    const { logger, errMessage } = await import("@/lib/log");
    logger.error("action failed", { error: errMessage(e) });
    return fail("Something went wrong. Please try again.");
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

export function zodErrors(err: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/** Only allow same-site relative redirects. */
export const safeNext = (n: string | null | undefined, fallback = "/dashboard") =>
  n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : fallback;
