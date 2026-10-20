"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLiveInput, deleteLiveInput, ProviderError, ProviderNotConfiguredError, updateLiveInput } from "@/lib/providers/cloudflare";
import { getRecordingSettings, reconcileRecordings, recordingAllowedFor } from "@/lib/recording";
import { reconcileStream } from "@/lib/stream-sync";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { thumbnailFromForm } from "@/lib/thumbnails";
import { streamFormSchema, sourceKindSchema } from "@/lib/validators";
import { validateExternalSource } from "@/lib/source-validate";
import { logger, errMessage } from "@/lib/log";
import { ActionError, actionUser, bool, done, fail, guard, limitUser, str, zodErrors, type ActionState } from "./util";
import { hasRole } from "@/lib/auth";

function readForm(fd: FormData) {
  return streamFormSchema.safeParse({
    title: str(fd, "title"), description: str(fd, "description"), sport_id: str(fd, "sport_id"), language: str(fd, "language"),
    visibility: str(fd, "visibility") || "public", match_id: str(fd, "match_id"), scheduled_start: str(fd, "scheduled_start"),
    thumbnail_alt: str(fd, "thumbnail_alt"), thumbnail_focus_x: str(fd, "thumbnail_focus_x") || 50, thumbnail_focus_y: str(fd, "thumbnail_focus_y") || 50,
    chat_enabled: fd.has("chat_enabled_present") ? bool(fd, "chat_enabled") : true, chat_slow_mode_seconds: str(fd, "chat_slow_mode_seconds") || 0,
    recording_enabled: fd.has("recording_enabled_present") ? bool(fd, "recording_enabled") : true,
  });
}

const dbOrThrow = async () => {
  const db = await createSupabaseServerClient();
  if (!db) throw new ActionError("The database is not configured.");
  return db;
};

export async function createStreamAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let created: string | null = null;
  const res = await guard(async () => {
    const user = await actionUser("streamer");
    await limitUser("stream-create", user.id, 10, 60 * 60_000);
    if (!bool(fd, "rights")) return fail("You must confirm you have the rights to broadcast this content.", { rights: "Required" });
    const parsed = readForm(fd);
    if (!parsed.success) return fail("Check the highlighted fields.", zodErrors(parsed.error));
    const kind = sourceKindSchema.safeParse(str(fd, "source_kind"));
    if (!kind.success) return fail("Choose how you will broadcast.", { source_kind: "Required" });
    const v = parsed.data;
    const db = await dbOrThrow();

    let thumb: string | null;
    try {
      thumb = await thumbnailFromForm(fd, user.id, v.thumbnail_focus_x, v.thumbnail_focus_y);
    } catch (e) {
      return fail(errMessage(e), { thumbnail_file: errMessage(e) });
    }

    const base = {
      owner_id: user.id, sport_id: v.sport_id, title: v.title, description: v.description, thumbnail_url: thumb, thumbnail_alt: v.thumbnail_alt,
      thumbnail_focus_x: v.thumbnail_focus_x, thumbnail_focus_y: v.thumbnail_focus_y, language: v.language, visibility: v.visibility, match_id: v.match_id,
      scheduled_start: v.scheduled_start ? new Date(v.scheduled_start).toISOString() : null, chat_enabled: v.chat_enabled, chat_slow_mode_seconds: v.chat_slow_mode_seconds,
      status: v.scheduled_start ? "scheduled" : "draft", is_published: false,
    };

    if (kind.data === "external") {
      const url = str(fd, "external_url");
      const check = await validateExternalSource(url);
      if (!check.ok || !check.source) return fail(check.detail, { external_url: check.detail });
      const { data, error } = await db.from("streams").insert({ ...base, source_type: check.source.type, playback_ref: check.source.ref, recording_enabled: false, source_health: "unknown", thumbnail_url: thumb ?? null }).select("id").single();
      if (error) return fail("Could not create the stream. " + (error.code === "42501" ? "You do not have permission." : ""));
      // health is system-managed: record the validation result with the service role
      await createSupabaseAdminClient()?.from("streams").update({ source_health: check.health, source_health_detail: check.detail, source_checked_at: new Date().toISOString() }).eq("id", data.id);
      created = data.id;
      return done("Stream created.");
    }

    // Platform sources: create a provider live input, then the row (service role: provider fields are system-managed).
    const admin = createSupabaseAdminClient();
    if (!admin) throw new ActionError("The database service role is not configured.");
    const protocol = kind.data === "platform_rtmps" ? "rtmps" : "whip";
    if (protocol === "whip" && v.visibility === "private") return fail("Browser broadcasts cannot be private (WebRTC playback cannot be access-restricted). Choose Public or Unlisted, or use OBS.", { visibility: "Not available for browser broadcasts" });
    let record = false;
    let recordingNote = "";
    if (protocol === "rtmps" && v.recording_enabled) {
      const allowed = await recordingAllowedFor(user.id);
      record = allowed.allowed;
      if (!allowed.allowed) recordingNote = ` Recording was not enabled: ${allowed.reason}`;
    }
    let input;
    try {
      input = await createLiveInput({ name: v.title, ref: user.id, protocol, record, reconnectWindowSeconds: (await getRecordingSettings()).reconnect_window_seconds });
    } catch (e) {
      if (e instanceof ProviderNotConfiguredError) return fail("The streaming provider is not configured yet, so platform broadcasting is unavailable.");
      logger.error("createLiveInput failed", { error: errMessage(e) });
      return fail(e instanceof ProviderError ? `The streaming provider rejected the request: ${e.message}` : "Could not reach the streaming provider.");
    }
    const { data, error } = await admin.from("streams").insert({ ...base, source_type: protocol === "rtmps" ? "platform_rtmps" : "platform_webrtc", provider: "cloudflare", provider_stream_id: input.uid, recording_enabled: record }).select("id").single();
    if (error) {
      await deleteLiveInput(input.uid).catch(() => undefined); // do not leak orphaned inputs
      return fail("Could not create the stream.");
    }
    created = data.id;
    return done("Stream created." + recordingNote);
  });
  if (res?.ok && created) redirect(`/dashboard/streams/${created}/edit?created=1`);
  return res;
}

export async function updateStreamAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const id = str(fd, "id");
    const parsed = readForm(fd);
    if (!parsed.success) return fail("Check the highlighted fields.", zodErrors(parsed.error));
    const v = parsed.data;
    const db = await dbOrThrow();
    const { data: cur } = await db.from("streams").select("id, owner_id, status, source_type, visibility, recording_enabled, provider_stream_id").eq("id", id).maybeSingle();
    if (!cur || (cur.owner_id !== user.id && !hasRole(user, "moderator"))) return fail("Stream not found.");
    if (cur.source_type === "platform_webrtc" && v.visibility === "private") return fail("Browser broadcasts cannot be private.", { visibility: "Not available for browser broadcasts" });
    let thumb: string | null;
    try {
      thumb = await thumbnailFromForm(fd, cur.owner_id, v.thumbnail_focus_x, v.thumbnail_focus_y);
    } catch (e) {
      return fail(errMessage(e), { thumbnail_file: errMessage(e) });
    }
    const patch: Record<string, unknown> = {
      title: v.title, description: v.description, sport_id: v.sport_id, language: v.language, visibility: v.visibility, match_id: v.match_id,
      thumbnail_alt: v.thumbnail_alt, thumbnail_focus_x: v.thumbnail_focus_x, thumbnail_focus_y: v.thumbnail_focus_y, chat_enabled: v.chat_enabled, chat_slow_mode_seconds: v.chat_slow_mode_seconds,
      scheduled_start: v.scheduled_start ? new Date(v.scheduled_start).toISOString() : null,
    };
    if (thumb) patch.thumbnail_url = thumb;
    if (bool(fd, "remove_thumbnail") && !thumb) patch.thumbnail_url = null;
    // recording_enabled is system-managed (DB trigger): toggle it on the provider first, then record it with the service role.
    let recordingChange: boolean | null = null;
    if (cur.status !== "live" && cur.source_type === "platform_rtmps" && fd.has("recording_enabled_present") && v.recording_enabled !== cur.recording_enabled) {
      if (v.recording_enabled && !(await recordingAllowedFor(cur.owner_id)).allowed) return fail("Recording is not available for your account.", { recording_enabled: "Not available" });
      recordingChange = v.recording_enabled;
    }
    const newUrl = str(fd, "external_url");
    if (newUrl && !["platform_rtmps", "platform_webrtc"].includes(cur.source_type)) {
      const check = await validateExternalSource(newUrl);
      if (!check.ok || !check.source) return fail(check.detail, { external_url: check.detail });
      patch.source_type = check.source.type;
      patch.playback_ref = check.source.ref;
      await createSupabaseAdminClient()?.from("streams").update({ source_health: check.health, source_health_detail: check.detail, source_checked_at: new Date().toISOString() }).eq("id", id);
    }
    const { error } = await db.from("streams").update(patch).eq("id", id);
    if (error) return fail("Could not save changes.");
    if (recordingChange !== null && cur.provider_stream_id) {
      try {
        await updateLiveInput(cur.provider_stream_id, { recording: { mode: recordingChange ? "automatic" : "off", requireSignedURLs: true, timeoutSeconds: (await getRecordingSettings()).reconnect_window_seconds } });
        await createSupabaseAdminClient()?.from("streams").update({ recording_enabled: recordingChange }).eq("id", id);
      } catch (e) {
        logger.error("recording toggle failed", { error: errMessage(e) });
        return fail("Your changes were saved, but the recording setting could not be changed at the streaming provider.");
      }
    }
    revalidatePath(`/watch/${id}`);
    revalidatePath("/dashboard/streams");
    return done("Changes saved.");
  });
}

export async function setPublishedAction(id: string, publish: boolean): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const db = await dbOrThrow();
    const { data: cur } = await db.from("streams").select("owner_id, status, title, description, thumbnail_url").eq("id", id).maybeSingle();
    if (!cur || (cur.owner_id !== user.id && !hasRole(user, "moderator"))) return fail("Stream not found.");
    if (cur.status === "disabled") return fail("This stream was disabled by a moderator.");
    if (publish && !user.rightsAccepted && cur.owner_id === user.id) return fail("Confirm your publishing rights in Settings first.");
    const { error } = await db.from("streams").update({ is_published: publish }).eq("id", id);
    if (error) return fail("Could not update publication.");
    revalidatePath("/", "layout");
    return done(publish ? "Stream published." : "Stream unpublished.");
  });
}

export async function deleteStreamAction(id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const db = await dbOrThrow();
    const { data: cur } = await db.from("streams").select("owner_id, status, provider_stream_id, source_type").eq("id", id).maybeSingle();
    if (!cur || (cur.owner_id !== user.id && !hasRole(user, "admin"))) return fail("Stream not found.");
    if (cur.status === "live") return fail("Stop the broadcast before deleting this stream.");
    if (cur.provider_stream_id && cur.source_type.startsWith("platform")) {
      await deleteLiveInput(cur.provider_stream_id).catch((e) => logger.warn("deleteLiveInput failed", { error: errMessage(e) }));
    }
    const { data: del, error } = await db.from("streams").delete().eq("id", id).select("id");
    if (error || !del?.length) return fail("Could not delete the stream.");
    revalidatePath("/dashboard/streams");
    return done("Stream deleted. Saved replays stay in your videos.");
  });
}

/** Replace the live input (new key / WHIP URL); the old credentials stop working immediately. */
async function rotateInput(streamId: string, actorId: string, byAdmin: boolean): Promise<ActionState> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new ActionError("The database service role is not configured.");
  const { data: s } = await admin.from("streams").select("id, owner_id, status, title, source_type, provider_stream_id, recording_enabled").eq("id", streamId).maybeSingle();
  if (!s || !s.provider_stream_id || !s.source_type.startsWith("platform")) return fail("This stream does not use platform ingest.");
  if (!byAdmin && s.owner_id !== actorId) return fail("Stream not found.");
  if (s.status === "live" && !byAdmin) return fail("Stop the broadcast first, then regenerate the key.");
  const protocol = s.source_type === "platform_rtmps" ? "rtmps" : "whip";
  const input = await createLiveInput({ name: s.title, ref: s.id, protocol, record: s.recording_enabled, reconnectWindowSeconds: (await getRecordingSettings()).reconnect_window_seconds });
  const old = s.provider_stream_id;
  const { error } = await admin.from("streams").update({ provider_stream_id: input.uid, source_health: "unknown", source_health_detail: null, ...(s.status === "live" ? { status: "ended", ended_at: new Date().toISOString() } : {}) }).eq("id", s.id);
  if (error) {
    await deleteLiveInput(input.uid).catch(() => undefined);
    return fail("Could not rotate the key.");
  }
  await deleteLiveInput(old).catch((e) => logger.warn("old live input delete failed", { error: errMessage(e) }));
  await admin.from("moderation_actions").insert({ actor_id: actorId, action: byAdmin ? "stream_key_revoked_by_admin" : "stream_key_regenerated", target_type: "stream", target_id: s.id });
  return done("Stream key regenerated. The previous key no longer works.");
}

export async function regenerateKeyAction(streamId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    await limitUser("rotate", user.id, 5, 60 * 60_000);
    return rotateInput(streamId, user.id, false);
  });
}

export async function adminRevokeKeyAction(streamId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("admin");
    const r = await rotateInput(streamId, user.id, true);
    revalidatePath("/admin/streams");
    return r;
  });
}

/** Allow the owner's encoder to connect (ingest is disabled after a broadcast is stopped). */
export async function armIngestAction(streamId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const db = await dbOrThrow();
    const { data: s } = await db.from("streams").select("owner_id, provider_stream_id, status").eq("id", streamId).maybeSingle();
    if (!s || s.owner_id !== user.id || !s.provider_stream_id) return fail("Stream not found.");
    if (s.status === "disabled") return fail("This stream was disabled by a moderator.");
    try {
      await updateLiveInput(s.provider_stream_id, { enabled: true });
    } catch (e) {
      return fail(e instanceof ProviderNotConfiguredError ? "Streaming provider is not configured." : "Could not reach the streaming provider.");
    }
    return done("Ingest enabled. Start your encoder.");
  });
}

/** End a broadcast by disabling the input (disconnects the encoder), then confirm with the provider. */
export async function stopBroadcastAction(streamId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const db = await dbOrThrow();
    const { data: s } = await db.from("streams").select("owner_id, provider_stream_id").eq("id", streamId).maybeSingle();
    if (!s || s.owner_id !== user.id || !s.provider_stream_id) return fail("Stream not found.");
    try {
      await updateLiveInput(s.provider_stream_id, { enabled: false });
      await new Promise((r) => setTimeout(r, 1500));
      await reconcileStream(streamId);
    } catch (e) {
      return fail(e instanceof ProviderNotConfiguredError ? "Streaming provider is not configured." : "The provider did not confirm the stop. Check status in a moment.");
    }
    revalidatePath("/dashboard/go-live");
    return done("Broadcast stopped. If recording was enabled, your replay appears once processing finishes.");
  });
}

export async function retryRecordingAction(streamId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("streamer");
    const db = await dbOrThrow();
    const { data: s } = await db.from("streams").select("owner_id").eq("id", streamId).maybeSingle();
    if (!s || (s.owner_id !== user.id && !hasRole(user, "moderator"))) return fail("Stream not found.");
    await limitUser("retry-rec", user.id, 10, 60 * 60_000);
    try {
      const r = await reconcileRecordings(streamId);
      revalidatePath("/dashboard/videos");
      if (r.published > 0) return done(`Recovered ${r.published} replay${r.published > 1 ? "s" : ""}.`);
      if (r.pending > 0) return done("The provider is still processing the recording. Check again in a few minutes.");
      if (r.failed > 0) return fail("The provider reports the recording failed. It cannot be recovered; the next broadcast will record normally.");
      return fail("The provider has no finished recording for this stream yet.");
    } catch (e) {
      return fail(e instanceof ProviderNotConfiguredError ? "Streaming provider is not configured." : "Could not reach the streaming provider.");
    }
  });
}
