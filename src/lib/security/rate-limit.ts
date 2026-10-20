/**
 * Sliding-window rate limiter.
 *
 * NOTE: state is per server instance (in-memory). That is fine for a single Node process and as
 * a best-effort guard on serverless, but for strict global limits swap `hit()` for a shared store
 * (Upstash Redis, Supabase table). Chat rate limits are enforced in Postgres and are global.
 */
const buckets = new Map<string, number[]>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => t <= cutoff)) buckets.delete(k);
  }
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function resetRateLimits() {
  buckets.clear();
}
