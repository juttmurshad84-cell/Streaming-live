import "server-only";
import { env, hasCloudflare } from "@/lib/env";

/**
 * Cloudflare Stream client (live inputs, recordings, signed playback).
 *
 * Provider facts this integration is built around (verified against Cloudflare docs, Oct 2026):
 *  - RTMPS/SRT live inputs can be recorded (`recording.mode = "automatic"`) and are delivered as HLS/DASH.
 *  - WebRTC (WHIP) live inputs are played back with WHEP only; they are NOT recorded and have no HLS.
 *  - Live-input connect/disconnect events arrive through Cloudflare *Notifications* webhooks
 *    (shared-secret header). Video-ready events arrive through the Stream webhook (HMAC signature).
 */
export class ProviderError extends Error {
  constructor(message: string, public status?: number, public code?: number | string) {
    super(message);
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor() {
    super("The streaming provider (Cloudflare Stream) is not configured on this server.");
  }
}

const apiBase = () => `https://api.cloudflare.com/client/v4/accounts/${env.cfAccountId}/stream`;
const customerBase = () => `https://customer-${env.cfCustomerCode}.cloudflarestream.com`;

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasCloudflare()) throw new ProviderNotConfiguredError();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.cfApiToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  let body: { success?: boolean; result?: T; errors?: { code: number; message: string }[] } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body
  }
  if (!res.ok || body.success === false) {
    const first = body.errors?.[0];
    throw new ProviderError(first?.message ?? `Cloudflare responded with HTTP ${res.status}`, res.status, first?.code);
  }
  return body.result as T;
}

export interface CfLiveInput {
  uid: string;
  rtmps?: { url: string; streamKey: string };
  rtmpsPlayback?: { url: string; streamKey: string };
  srt?: { url: string; streamId: string; passphrase: string };
  webRTC?: { url: string };
  webRTCPlayback?: { url: string };
  recording?: { mode: "off" | "automatic"; requireSignedURLs?: boolean; timeoutSeconds?: number };
  enabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface CfVideo {
  uid: string;
  liveInput?: string | null;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errReasonCode?: string; errorReasonText?: string; errReasonText?: string };
  duration?: number;
  created?: string;
  modified?: string;
  thumbnail?: string;
  meta?: Record<string, unknown>;
  requireSignedURLs?: boolean;
  playback?: { hls?: string; dash?: string };
}

export interface CreateLiveInputOptions {
  name: string;
  /** Opaque reference stored in provider metadata for support/debugging. */
  ref: string;
  protocol: "rtmps" | "whip";
  record: boolean;
  reconnectWindowSeconds?: number;
}

export async function createLiveInput(o: CreateLiveInputOptions): Promise<CfLiveInput> {
  // WebRTC inputs cannot be recorded or signed; OBS (RTMPS) inputs use signed playback.
  const recording =
    o.protocol === "rtmps"
      ? { mode: o.record ? "automatic" : "off", requireSignedURLs: true, timeoutSeconds: o.reconnectWindowSeconds ?? 60 }
      : { mode: "off", requireSignedURLs: false };
  return cf<CfLiveInput>("/live_inputs", {
    method: "POST",
    body: JSON.stringify({ meta: { name: o.name.slice(0, 120), ref: o.ref }, recording, enabled: true }),
  });
}

export const getLiveInput = (uid: string) => cf<CfLiveInput>(`/live_inputs/${encodeURIComponent(uid)}`);
export const updateLiveInput = (uid: string, patch: Record<string, unknown>) =>
  cf<CfLiveInput>(`/live_inputs/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify(patch) });
export const deleteLiveInput = (uid: string) =>
  cf<unknown>(`/live_inputs/${encodeURIComponent(uid)}`, { method: "DELETE" });
export const listLiveInputVideos = (uid: string) =>
  cf<CfVideo[]>(`/live_inputs/${encodeURIComponent(uid)}/videos`);
export const getVideo = (uid: string) => cf<CfVideo>(`/${encodeURIComponent(uid)}`);
export const deleteVideo = (uid: string) => cf<unknown>(`/${encodeURIComponent(uid)}`, { method: "DELETE" });

/** Short-lived playback token for assets/inputs that require signed URLs. */
export async function signPlaybackToken(uid: string, ttlSeconds = 4 * 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const r = await cf<{ token: string }>(`/${encodeURIComponent(uid)}/token`, {
    method: "POST",
    body: JSON.stringify({ exp }),
  });
  return r.token;
}

/** `{ isInput, videoUID, live }` for a live input. Uses the customer subdomain lifecycle endpoint. */
export async function getLifecycle(inputUid: string): Promise<{ live: boolean; videoUID: string | null }> {
  if (!hasCloudflare()) throw new ProviderNotConfiguredError();
  const res = await fetch(`${customerBase()}/${encodeURIComponent(inputUid)}/lifecycle`, {
    headers: { Authorization: `Bearer ${env.cfApiToken}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new ProviderError(`Lifecycle check failed (HTTP ${res.status})`, res.status);
  const j = (await res.json()) as { live?: boolean; videoUID?: string | null };
  return { live: Boolean(j.live), videoUID: j.videoUID ?? null };
}

export const hlsUrl = (idOrToken: string) => `${customerBase()}/${idOrToken}/manifest/video.m3u8`;
export const dashUrl = (idOrToken: string) => `${customerBase()}/${idOrToken}/manifest/video.mpd`;
export const thumbnailUrl = (idOrToken: string, time = "1s") =>
  `${customerBase()}/${idOrToken}/thumbnails/thumbnail.jpg?time=${time}&width=1280&height=720&fit=crop`;
