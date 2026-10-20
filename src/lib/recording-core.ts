/**
 * Pure recording-finalisation logic, written against a small store interface so the
 * idempotency and state-machine rules can be unit-tested without a database.
 */
import type { RecordingStatus, Visibility } from "./types";

export interface CfVideoLike {
  uid: string;
  liveInput?: string | null;
  readyToStream?: boolean;
  duration?: number;
  created?: string;
  status?: { state?: string; errorReasonCode?: string; errReasonCode?: string; errorReasonText?: string; errReasonText?: string };
}

export type ProviderVideoState = "live" | "processing" | "ready" | "failed";

export function providerVideoState(v: CfVideoLike): ProviderVideoState {
  const state = v.status?.state ?? "";
  if (state === "error") return "failed";
  if (state === "live-inprogress") return "live";
  if (state === "ready" && v.readyToStream !== false) return "ready";
  return "processing";
}

export function providerErrorText(v: CfVideoLike): string {
  const code = v.status?.errorReasonCode || v.status?.errReasonCode || "ERR_UNKNOWN";
  const text = v.status?.errorReasonText || v.status?.errReasonText || "The provider could not process the recording.";
  return `${code}: ${text}`;
}

export interface StreamLite {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  sport_id: string | null;
  language: string | null;
  visibility: Visibility;
  is_published: boolean;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  thumbnail_focus_x: number;
  thumbnail_focus_y: number;
  started_at: string | null;
}

export interface RecordingLite {
  id: string;
  stream_id: string;
  provider_recording_id: string | null;
  status: RecordingStatus;
}

export interface VideoInsert {
  stream_id: string;
  recording_id: string;
  owner_id: string;
  sport_id: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  thumbnail_focus_x: number;
  thumbnail_focus_y: number;
  provider_asset_id: string;
  duration_seconds: number | null;
  language: string | null;
  visibility: Visibility;
  processing_status: "ready";
  published_at: string;
  broadcast_started_at: string | null;
}

export interface RecordingStore {
  getStreamByInput(inputUid: string): Promise<StreamLite | null>;
  findRecordingByProviderId(videoUid: string): Promise<RecordingLite | null>;
  findOpenRecording(streamId: string): Promise<RecordingLite | null>;
  /** Insert or update; returns the row id. Must tolerate a unique-constraint race. */
  saveRecording(r: {
    id?: string;
    stream_id: string;
    owner_id: string;
    provider_recording_id: string;
    status: RecordingStatus;
    duration_seconds?: number | null;
    error?: string | null;
    storage_ref?: string | null;
    processing_status?: string | null;
    ended_at?: string | null;
  }): Promise<string>;
  videoExists(videoUid: string): Promise<boolean>;
  /** Returns created=false when the asset already has a video (duplicate delivery). */
  insertVideo(v: VideoInsert): Promise<{ created: boolean; id: string }>;
  notify(userId: string, n: { type: "recording_ready" | "recording_failed"; title: string; body: string; link: string; dedupe_key: string }): Promise<void>;
}

export interface IngestDeps {
  resolveLiveInput?: (videoUid: string) => Promise<string | null>;
  copyThumbnail?: (videoUid: string, ownerId: string, videoKey: string) => Promise<string | null>;
  now?: () => string;
}

export type IngestOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "processing"; recordingId: string }
  | { kind: "failed"; recordingId: string }
  | { kind: "published"; recordingId: string; videoId: string }
  | { kind: "duplicate"; recordingId: string };

/** Idempotently turn a provider video event into recording + video rows. Safe to call repeatedly. */
export async function ingestProviderVideo(store: RecordingStore, v: CfVideoLike, deps: IngestDeps = {}): Promise<IngestOutcome> {
  const now = deps.now?.() ?? new Date().toISOString();
  const inputUid = v.liveInput ?? (await deps.resolveLiveInput?.(v.uid)) ?? null;
  if (!inputUid) return { kind: "ignored", reason: "video is not a live-stream recording" };
  const stream = await store.getStreamByInput(inputUid);
  if (!stream) return { kind: "ignored", reason: "no stream for live input" };

  const state = providerVideoState(v);
  const existing =
    (await store.findRecordingByProviderId(v.uid)) ?? (await store.findOpenRecording(stream.id));

  const base = { id: existing?.id, stream_id: stream.id, owner_id: stream.owner_id, provider_recording_id: v.uid };

  if (state === "live" || state === "processing") {
    const id = await store.saveRecording({
      ...base,
      status: state === "live" ? "recording" : "processing",
      processing_status: state === "live" ? "live-inprogress" : (v.status?.state ?? "processing"),
    });
    return { kind: "processing", recordingId: id };
  }

  if (state === "failed") {
    const error = providerErrorText(v);
    const id = await store.saveRecording({ ...base, status: "failed", error, processing_status: "error", ended_at: now });
    await store.notify(stream.owner_id, {
      type: "recording_failed",
      title: "Recording failed",
      body: `The recording of “${stream.title}” could not be processed. ${error}`,
      link: "/dashboard/videos",
      dedupe_key: `rec-failed:${v.uid}`,
    });
    return { kind: "failed", recordingId: id };
  }

  // ready
  if (existing?.status === "skipped") return { kind: "ignored", reason: "recording was skipped or deleted by its owner" };
  if (await store.videoExists(v.uid)) return { kind: "duplicate", recordingId: existing?.id ?? "" };
  const recId = await store.saveRecording({
    ...base,
    status: "ready",
    duration_seconds: v.duration ?? null,
    storage_ref: `cloudflare-stream:${v.uid}`,
    processing_status: "ready",
    error: null,
    ended_at: now,
  });
  const videoKey = `${recId}`;
  let thumb = stream.thumbnail_url;
  if (!thumb && deps.copyThumbnail) {
    try {
      thumb = await deps.copyThumbnail(v.uid, stream.owner_id, videoKey);
    } catch {
      thumb = null; // thumbnail failure must never block publication; UI falls back to generated art
    }
  }
  const res = await store.insertVideo(videoFrom(stream, recId, v, now, thumb));
  if (!res.created) return { kind: "duplicate", recordingId: recId };
  await store.notify(stream.owner_id, {
    type: "recording_ready",
    title: "Your replay is ready",
    body: `“${stream.title}” has been saved to your videos.`,
    link: `/videos/${res.id}`,
    dedupe_key: `rec:${v.uid}`,
  });
  return { kind: "published", recordingId: recId, videoId: res.id };
}

function videoFrom(s: StreamLite, recordingId: string, v: CfVideoLike, now: string, thumb: string | null): VideoInsert {
  return {
    stream_id: s.id,
    recording_id: recordingId,
    owner_id: s.owner_id,
    sport_id: s.sport_id,
    title: s.title,
    description: s.description,
    thumbnail_url: thumb,
    thumbnail_alt: s.thumbnail_alt,
    thumbnail_focus_x: s.thumbnail_focus_x,
    thumbnail_focus_y: s.thumbnail_focus_y,
    provider_asset_id: v.uid,
    duration_seconds: v.duration && v.duration > 0 ? v.duration : null,
    language: s.language,
    // A replay is only as public as the stream was: unpublished listings become private replays.
    visibility: s.is_published ? s.visibility : "private",
    processing_status: "ready",
    published_at: now,
    broadcast_started_at: s.started_at ?? v.created ?? null,
  };
}
