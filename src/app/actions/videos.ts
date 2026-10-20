"use server";
import { revalidatePath } from "next/cache";
import { deleteProviderAsset } from "@/lib/recording";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { thumbnailFromForm } from "@/lib/thumbnails";
import { videoFormSchema } from "@/lib/validators";
import { hasRole } from "@/lib/auth";
import { errMessage, logger } from "@/lib/log";
import { actionUser, ActionError, bool, done, fail, guard, str, zodErrors, type ActionState } from "./util";

export async function updateVideoAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("viewer");
    const id = str(fd, "id");
    const parsed = videoFormSchema.safeParse({ title: str(fd, "title"), description: str(fd, "description"), visibility: str(fd, "visibility"), thumbnail_alt: str(fd, "thumbnail_alt"), thumbnail_focus_x: str(fd, "thumbnail_focus_x") || 50, thumbnail_focus_y: str(fd, "thumbnail_focus_y") || 50 });
    if (!parsed.success) return fail("Check the highlighted fields.", zodErrors(parsed.error));
    const v = parsed.data;
    const db = await createSupabaseServerClient();
    if (!db) throw new ActionError("The database is not configured.");
    const { data: cur } = await db.from("videos").select("id, owner_id").eq("id", id).maybeSingle();
    if (!cur || (cur.owner_id !== user.id && !hasRole(user, "moderator"))) return fail("Video not found.");
    let thumb: string | null;
    try {
      thumb = await thumbnailFromForm(fd, cur.owner_id, v.thumbnail_focus_x, v.thumbnail_focus_y);
    } catch (e) {
      return fail(errMessage(e), { thumbnail_file: errMessage(e) });
    }
    const patch: Record<string, unknown> = { title: v.title, description: v.description, visibility: v.visibility, thumbnail_alt: v.thumbnail_alt, thumbnail_focus_x: v.thumbnail_focus_x, thumbnail_focus_y: v.thumbnail_focus_y };
    if (thumb) patch.thumbnail_url = thumb;
    if (bool(fd, "remove_thumbnail") && !thumb) patch.thumbnail_url = null;
    const { error } = await db.from("videos").update(patch).eq("id", id);
    if (error) return fail("Could not save changes.");
    revalidatePath(`/videos/${id}`);
    revalidatePath("/dashboard/videos");
    revalidatePath("/videos");
    return done("Video updated.");
  });
}

/** Delete a replay: the owner is authorised via RLS read, then the provider asset and row are removed server-side. */
export async function deleteVideoAction(id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("viewer");
    const db = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    if (!db || !admin) throw new ActionError("The database is not configured.");
    const { data: v } = await db.from("videos").select("id, owner_id, provider_asset_id, recording_id").eq("id", id).maybeSingle();
    if (!v || (v.owner_id !== user.id && !hasRole(user, "moderator"))) return fail("Video not found.");
    try {
      await deleteProviderAsset(v.provider_asset_id);
    } catch (e) {
      logger.error("provider asset delete failed", { error: errMessage(e), video: id });
      return fail("The video could not be removed from the streaming provider. Nothing was deleted; please retry.");
    }
    // Tombstone the recording so a late/duplicate webhook cannot resurrect the replay.
    if (v.recording_id) await admin.from("stream_recordings").update({ status: "skipped", error: "Deleted by owner" }).eq("id", v.recording_id);
    const { error } = await admin.from("videos").delete().eq("id", id);
    if (error) return fail("Could not delete the video.");
    if (v.owner_id !== user.id) await admin.from("moderation_actions").insert({ actor_id: user.id, action: "video_removed", target_type: "video", target_id: id });
    revalidatePath("/dashboard/videos");
    revalidatePath("/videos");
    return done("Video deleted.");
  });
}
