import { describe, expect, it } from "vitest";
import { ingestProviderVideo, providerVideoState, type RecordingLite, type RecordingStore, type StreamLite, type VideoInsert } from "@/lib/recording-core";

function memoryStore(streams: StreamLite[], inputs: Record<string, string>) {
  const recordings: (RecordingLite & { owner_id: string; error?: string | null; duration_seconds?: number | null })[] = [];
  const videos: (VideoInsert & { id: string })[] = [];
  const notifications: { userId: string; dedupe_key: string; type: string }[] = [];
  let n = 0;
  const store: RecordingStore = {
    async getStreamByInput(uid) {
      const id = inputs[uid];
      return streams.find((s) => s.id === id) ?? null;
    },
    async findRecordingByProviderId(uid) {
      return recordings.find((r) => r.provider_recording_id === uid) ?? null;
    },
    async findOpenRecording(streamId) {
      return recordings.find((r) => r.stream_id === streamId && r.provider_recording_id === null && r.status !== "ready") ?? null;
    },
    async saveRecording(r) {
      const found = (r.id && recordings.find((x) => x.id === r.id)) || recordings.find((x) => x.provider_recording_id === r.provider_recording_id);
      if (found) {
        Object.assign(found, r, { id: found.id });
        return found.id;
      }
      const row = { ...r, id: `rec-${++n}` } as (typeof recordings)[number];
      recordings.push(row);
      return row.id;
    },
    async videoExists(uid) {
      return videos.some((v) => v.provider_asset_id === uid);
    },
    async insertVideo(v) {
      const ex = videos.find((x) => x.provider_asset_id === v.provider_asset_id);
      if (ex) return { created: false, id: ex.id };
      const row = { ...v, id: `vid-${++n}` };
      videos.push(row);
      return { created: true, id: row.id };
    },
    async notify(userId, nn) {
      if (notifications.some((x) => x.userId === userId && x.dedupe_key === nn.dedupe_key)) return;
      notifications.push({ userId, dedupe_key: nn.dedupe_key, type: nn.type });
    },
  };
  return { store, recordings, videos, notifications };
}

const stream = (over: Partial<StreamLite> = {}): StreamLite => ({
  id: "s1", owner_id: "u1", title: "Derby night", description: "d", sport_id: "sport", language: "en",
  visibility: "public", is_published: true, thumbnail_url: "https://img/custom.jpg", thumbnail_alt: "alt",
  thumbnail_focus_x: 50, thumbnail_focus_y: 50, started_at: "2026-10-20T18:00:00Z", ...over,
});
const ready = (uid = "vid-a") => ({ uid, liveInput: "input-1", readyToStream: true, duration: 3600.4, status: { state: "ready" } });

describe("providerVideoState", () => {
  it("maps provider states", () => {
    expect(providerVideoState({ uid: "a", status: { state: "live-inprogress" } })).toBe("live");
    expect(providerVideoState({ uid: "a", status: { state: "error" } })).toBe("failed");
    expect(providerVideoState({ uid: "a", status: { state: "ready" }, readyToStream: true })).toBe("ready");
    expect(providerVideoState({ uid: "a", status: { state: "ready" }, readyToStream: false })).toBe("processing");
    expect(providerVideoState({ uid: "a", status: { state: "inprogress" } })).toBe("processing");
  });
});

describe("ingestProviderVideo", () => {
  it("publishes a replay once, even when the webhook is delivered repeatedly", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    const first = await ingestProviderVideo(m.store, ready());
    expect(first.kind).toBe("published");
    for (let i = 0; i < 3; i++) expect((await ingestProviderVideo(m.store, ready())).kind).toBe("duplicate");
    expect(m.videos).toHaveLength(1);
    expect(m.recordings).toHaveLength(1);
    expect(m.notifications).toHaveLength(1);
    const v = m.videos[0];
    expect(v).toMatchObject({ owner_id: "u1", stream_id: "s1", visibility: "public", processing_status: "ready", provider_asset_id: "vid-a", title: "Derby night" });
    expect(v.published_at).toBeTruthy();
    expect(v.thumbnail_url).toBe("https://img/custom.jpg");
  });

  it("adopts the open recording row created at stream start", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    m.recordings.push({ id: "pre", stream_id: "s1", provider_recording_id: null, status: "processing", owner_id: "u1" });
    await ingestProviderVideo(m.store, ready());
    expect(m.recordings).toHaveLength(1);
    expect(m.recordings[0]).toMatchObject({ id: "pre", provider_recording_id: "vid-a", status: "ready" });
  });

  it("does not publish while the provider is still processing or live", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    const r = await ingestProviderVideo(m.store, { uid: "vid-a", liveInput: "input-1", status: { state: "inprogress" } });
    expect(r.kind).toBe("processing");
    const r2 = await ingestProviderVideo(m.store, { uid: "vid-a", liveInput: "input-1", status: { state: "live-inprogress" } });
    expect(r2.kind).toBe("processing");
    expect(m.videos).toHaveLength(0);
    expect(m.recordings[0].status).toBe("recording");
  });

  it("records failures genuinely and notifies the owner once", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    const bad = { uid: "vid-bad", liveInput: "input-1", status: { state: "error", errorReasonCode: "ERR_MALFORMED_VIDEO", errorReasonText: "corrupt" } };
    expect((await ingestProviderVideo(m.store, bad)).kind).toBe("failed");
    await ingestProviderVideo(m.store, bad);
    expect(m.videos).toHaveLength(0);
    expect(m.recordings[0]).toMatchObject({ status: "failed" });
    expect(m.recordings[0].error).toContain("ERR_MALFORMED_VIDEO");
    expect(m.notifications).toEqual([{ userId: "u1", dedupe_key: "rec-failed:vid-bad", type: "recording_failed" }]);
  });

  it("recovers a failed recording when the provider later reports ready (retry)", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    await ingestProviderVideo(m.store, { uid: "vid-a", liveInput: "input-1", status: { state: "error" } });
    expect((await ingestProviderVideo(m.store, ready())).kind).toBe("published");
    expect(m.recordings[0].status).toBe("ready");
  });

  it("makes replays of unpublished streams private and keeps unlisted as unlisted", async () => {
    const a = memoryStore([stream({ is_published: false })], { "input-1": "s1" });
    await ingestProviderVideo(a.store, ready());
    expect(a.videos[0].visibility).toBe("private");
    const b = memoryStore([stream({ visibility: "unlisted" })], { "input-1": "s1" });
    await ingestProviderVideo(b.store, ready());
    expect(b.videos[0].visibility).toBe("unlisted");
  });

  it("ignores videos that are not live recordings or belong to unknown inputs", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    expect((await ingestProviderVideo(m.store, { uid: "x", status: { state: "ready" } })).kind).toBe("ignored");
    expect((await ingestProviderVideo(m.store, { uid: "x", liveInput: "other", status: { state: "ready" } })).kind).toBe("ignored");
    expect(m.videos).toHaveLength(0);
  });

  it("resolves the live input via the provider when the webhook omits it", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    const r = await ingestProviderVideo(m.store, { uid: "vid-a", readyToStream: true, status: { state: "ready" } }, { resolveLiveInput: async () => "input-1" });
    expect(r.kind).toBe("published");
  });

  it("falls back gracefully when copying the provider thumbnail fails", async () => {
    const m = memoryStore([stream({ thumbnail_url: null })], { "input-1": "s1" });
    const r = await ingestProviderVideo(m.store, ready(), { copyThumbnail: async () => { throw new Error("boom"); } });
    expect(r.kind).toBe("published");
    expect(m.videos[0].thumbnail_url).toBeNull();
    const m2 = memoryStore([stream({ thumbnail_url: null })], { "input-1": "s1" });
    await ingestProviderVideo(m2.store, ready(), { copyThumbnail: async () => "https://cdn/auto.jpg" });
    expect(m2.videos[0].thumbnail_url).toBe("https://cdn/auto.jpg");
  });

  it("does not resurrect a deleted replay", async () => {
    const m = memoryStore([stream()], { "input-1": "s1" });
    m.recordings.push({ id: "r", stream_id: "s1", provider_recording_id: "vid-a", status: "skipped", owner_id: "u1" });
    expect((await ingestProviderVideo(m.store, ready())).kind).toBe("ignored");
    expect(m.videos).toHaveLength(0);
  });
});
