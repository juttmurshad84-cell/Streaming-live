"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { updateLiveInput } from "@/lib/providers/cloudflare";
import { actionUser, ActionError, bool, done, fail, guard, str, zodErrors, type ActionState } from "./util";

const db = async () => {
  const c = await createSupabaseServerClient();
  if (!c) throw new ActionError("The database is not configured.");
  return c;
};
const uuid = z.string().uuid();

export async function setSuspensionAction(userId: string, suspend: boolean, reason?: string): Promise<ActionState> {
  return guard(async () => {
    await actionUser("admin");
    if (!uuid.safeParse(userId).success) return fail("Invalid user.");
    const { error } = await (await db()).rpc("set_account_suspension", { p_user: userId, p_suspend: suspend, p_reason: reason?.slice(0, 500) ?? null });
    if (error) return fail(error.message.includes("yourself") ? "You cannot suspend yourself." : "Could not update the account.");
    if (suspend) {
      // Cut off any live platform broadcasts from this user.
      const admin = createSupabaseAdminClient();
      const { data: live } = (await admin?.from("streams").select("id, provider_stream_id").eq("owner_id", userId).eq("status", "live")) ?? { data: [] };
      for (const s of live ?? []) if (s.provider_stream_id) await updateLiveInput(s.provider_stream_id, { enabled: false }).catch(() => undefined);
      await admin?.from("streams").update({ is_published: false }).eq("owner_id", userId);
    }
    revalidatePath("/admin/users");
    return done(suspend ? "Account suspended and unpublished." : "Account restored.");
  });
}

export async function setRoleAction(userId: string, role: string): Promise<ActionState> {
  return guard(async () => {
    await actionUser("admin");
    const r = z.enum(["viewer", "streamer", "moderator", "admin"]).safeParse(role);
    if (!r.success || !uuid.safeParse(userId).success) return fail("Invalid request.");
    const { error } = await (await db()).rpc("set_user_role", { p_user: userId, p_role: r.data });
    if (error) return fail("Could not change the role.");
    revalidatePath("/admin/users");
    return done("Role updated.");
  });
}

export async function setRecordingApprovalAction(userId: string, approved: boolean): Promise<ActionState> {
  return guard(async () => {
    await actionUser("admin");
    if (!uuid.safeParse(userId).success) return fail("Invalid user.");
    const { error } = await (await db()).from("profile_private").update({ recording_approved: approved }).eq("user_id", userId);
    if (error) return fail("Could not update approval.");
    await (await db()).rpc("log_moderation_action", { p_action: approved ? "recording_approved" : "recording_unapproved", p_target_type: "profile", p_target_id: userId });
    revalidatePath("/admin/users");
    return done(approved ? "Recording approved for this user." : "Recording approval removed.");
  });
}

/** Staff: disable (takedown) or re-enable a stream listing; disabling also cuts the platform ingest. */
export async function setStreamDisabledAction(streamId: string, disabled: boolean, reason?: string): Promise<ActionState> {
  return guard(async () => {
    await actionUser("moderator");
    if (!uuid.safeParse(streamId).success) return fail("Invalid stream.");
    const c = await db();
    const { data: s } = await c.from("streams").select("id, status, provider_stream_id, source_type").eq("id", streamId).maybeSingle();
    if (!s) return fail("Stream not found.");
    const { error } = await c.from("streams").update(disabled ? { status: "disabled", is_published: false } : { status: "draft" }).eq("id", streamId);
    if (error) return fail("Could not update the stream.");
    if (s.provider_stream_id && s.source_type.startsWith("platform")) await updateLiveInput(s.provider_stream_id, { enabled: !disabled }).catch(() => undefined);
    await c.rpc("log_moderation_action", { p_action: disabled ? "stream_disabled" : "stream_enabled", p_target_type: "stream", p_target_id: streamId, p_reason: reason ?? null });
    revalidatePath("/admin/streams");
    return done(disabled ? "Stream disabled." : "Stream re-enabled as a draft.");
  });
}

export async function adminSetVideoVisibilityAction(videoId: string, visibility: string): Promise<ActionState> {
  return guard(async () => {
    await actionUser("moderator");
    const v = z.enum(["public", "unlisted", "private"]).safeParse(visibility);
    if (!v.success || !uuid.safeParse(videoId).success) return fail("Invalid request.");
    const c = await db();
    const { error } = await c.from("videos").update({ visibility: v.data }).eq("id", videoId);
    if (error) return fail("Could not update the video.");
    await c.rpc("log_moderation_action", { p_action: "video_visibility_changed", p_target_type: "video", p_target_id: videoId, p_metadata: { visibility: v.data } });
    revalidatePath("/admin/videos");
    return done("Visibility updated.");
  });
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes"),
  sort_order: z.coerce.number().int().min(0).max(10000),
  image_url: z.string().url().max(500).nullable(),
  provider_sport_name: z.string().max(60).nullable(),
});

export async function saveCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await actionUser("admin");
    const p = categorySchema.safeParse({ id: str(fd, "id") || undefined, name: str(fd, "name"), slug: str(fd, "slug").toLowerCase(), sort_order: str(fd, "sort_order") || 100, image_url: str(fd, "image_url") || null, provider_sport_name: str(fd, "provider_sport_name") || null });
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const c = await db();
    const row = { ...p.data, is_active: bool(fd, "is_active") };
    const { error } = row.id ? await c.from("sports_categories").update(row).eq("id", row.id) : await c.from("sports_categories").insert(row);
    if (error) return fail(error.code === "23505" ? "That slug is already in use." : "Could not save the category.");
    revalidatePath("/", "layout");
    return done("Category saved.");
  });
}

export async function setCompetitionActiveAction(id: string, active: boolean): Promise<ActionState> {
  return guard(async () => {
    await actionUser("admin");
    if (!uuid.safeParse(id).success) return fail("Invalid competition.");
    const { error } = await (await db()).from("competitions").update({ is_active: active }).eq("id", id);
    revalidatePath("/admin/categories");
    return error ? fail("Could not update the competition.") : done("Competition updated.");
  });
}

const settingsSchema = z.object({
  policy: z.enum(["all_streamers", "approved_only", "disabled"]),
  max_duration_minutes: z.coerce.number().int().min(5).max(1440),
  retention_days: z.coerce.number().int().min(1).max(3650),
  per_user_quota_minutes: z.coerce.number().int().min(0).max(100000),
  reconnect_window_seconds: z.coerce.number().int().min(10).max(300),
});

export async function saveRecordingSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("admin");
    const p = settingsSchema.safeParse(Object.fromEntries(["policy", "max_duration_minutes", "retention_days", "per_user_quota_minutes", "reconnect_window_seconds"].map((k) => [k, str(fd, k)])));
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const c = await db();
    const { error } = await c.from("site_settings").upsert({ key: "recording", value: p.data, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) return fail("Could not save settings.");
    await c.rpc("log_moderation_action", { p_action: "recording_settings_changed", p_target_type: "settings", p_target_id: "recording", p_metadata: p.data });
    revalidatePath("/admin/integrations");
    return done("Recording settings saved. New streams use them immediately; existing inputs keep their reconnect window.");
  });
}
