import "server-only";
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { isPrivateAddress } from "./ip";

export class UnsafeUrlError extends Error {}

const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Syntactic checks that need no network. */
export function assertSafeUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with embedded credentials are not allowed");
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError("Only ports 80 and 443 are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Host is not allowed");
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Address is not publicly routable");
  return url;
}

/**
 * DNS lookup that refuses private results *at connect time*, which also defeats DNS rebinding
 * (the address we validate is the address we connect to).
 */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (addresses as dns.LookupAddress[]).filter((a) => !isPrivateAddress(a.address));
    if (list.length === 0 || list.length !== (addresses as dns.LookupAddress[]).length) {
      return callback(new UnsafeUrlError("Host resolves to a non-public address"), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

const agent = new Agent({ connect: { lookup: guardedLookup }, headersTimeout: 6000, bodyTimeout: 6000 });

export interface SafeFetchResult {
  status: number;
  url: string;
  contentType: string | null;
  /** First `maxBytes` of the body decoded as UTF-8 (for manifest sniffing). */
  text: string;
  bytes: Buffer;
  /** True when the body was longer than maxBytes. */
  truncated: boolean;
}

/**
 * Fetch an untrusted URL: manual redirects (each hop re-validated, max 3), 6s timeout,
 * response body capped, private networks blocked, no credentials or cookies forwarded.
 */
export async function safeFetch(
  raw: string,
  opts: { method?: "GET" | "HEAD"; maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  let current = assertSafeUrlShape(raw).toString();
  for (let hop = 0; hop <= 3; hop++) {
    const res = await undiciFetch(current, {
      method: opts.method ?? "GET",
      redirect: "manual",
      dispatcher: agent,
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "ArenaLive-SourceValidator/1.0", accept: "*/*", ...(opts.headers ?? {}) },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new UnsafeUrlError("Redirect without location");
      current = assertSafeUrlShape(new URL(loc, current).toString()).toString();
      continue;
    }
    let bytes: Buffer = Buffer.alloc(0);
    let truncated = false;
    if (res.body && opts.method !== "HEAD") {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        if (size > maxBytes) {
          truncated = true;
          break;
        }
      }
      await reader.cancel().catch(() => undefined);
      bytes = Buffer.concat(chunks).subarray(0, maxBytes);
    } else {
      await res.body?.cancel();
    }
    return { status: res.status, url: current, contentType: res.headers.get("content-type"), text: bytes.toString("utf8"), bytes, truncated };
  }
  throw new UnsafeUrlError("Too many redirects");
}
