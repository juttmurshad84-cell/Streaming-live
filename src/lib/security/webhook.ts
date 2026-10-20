import crypto from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Cloudflare Stream video webhooks: header `Webhook-Signature: time=<unix>,sig1=<hex>`,
 * where sig1 = HMAC-SHA256(secret, `${time}.${rawBody}`). Rejects stale timestamps (replay).
 */
export function verifyStreamWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const time = Number(parts.time);
  if (!Number.isFinite(time) || !parts.sig1) return { ok: false, reason: "malformed signature" };
  if (Math.abs(nowSeconds - time) > toleranceSeconds) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = crypto.createHmac("sha256", secret).update(`${parts.time}.${rawBody}`).digest("hex");
  return safeEqual(expected, parts.sig1) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/** Helper for tests / local tooling. */
export function signStreamWebhook(rawBody: string, secret: string, time = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac("sha256", secret).update(`${time}.${rawBody}`).digest("hex");
  return `time=${time},sig1=${sig}`;
}

/** Cloudflare Notifications webhooks (live input events) authenticate with a shared secret header. */
export function verifySharedSecret(header: string | null, secret: string): boolean {
  return !!header && safeEqual(header, secret);
}
