"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { storeProfileImage } from "@/lib/thumbnails";
import { errMessage } from "@/lib/log";
import { actionUser, ActionError, bool, done, fail, guard, str, zodErrors, type ActionState } from "./util";

const schema = z.object({
  display_name: z.string().trim().min(1, "Enter a display name").max(60),
  bio: z.string().trim().max(500, "At most 500 characters").transform((s) => s || null),
});

export async function updateProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    const p = schema.safeParse({ display_name: str(fd, "display_name"), bio: str(fd, "bio") });
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const db = await createSupabaseServerClient();
    if (!db) throw new ActionError("The database is not configured.");
    const patch: Record<string, unknown> = { ...p.data, favorite_sports: fd.getAll("favorite_sports").filter((s): s is string => typeof s === "string").slice(0, 12) };
    try {
      const avatar = await storeProfileImage(fd, "avatar", user.id);
      const banner = await storeProfileImage(fd, "banner", user.id);
      if (avatar) patch.avatar_url = avatar;
      if (banner) patch.banner_url = banner;
    } catch (e) {
      return fail(errMessage(e));
    }
    const { error } = await db.from("profiles").update(patch).eq("id", user.id);
    if (error) return fail("Could not save your profile.");
    revalidatePath(`/streamer/${user.profile.username}`);
    revalidatePath("/settings");
    return done("Profile updated.");
  });
}

export async function updateNotificationPrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    const db = await createSupabaseServerClient();
    if (!db) throw new ActionError("The database is not configured.");
    const prefs = { live_started: bool(fd, "live_started"), recording_ready: bool(fd, "recording_ready"), match_reminders: bool(fd, "match_reminders") };
    const { error } = await db.from("profile_private").update({ notification_prefs: prefs }).eq("user_id", user.id);
    return error ? fail("Could not save preferences.") : done("Notification preferences saved.");
  });
}

/** Viewer → streamer upgrade; requires explicit confirmation of publishing rights (recorded server-side). */
export async function becomeStreamerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    if (!bool(fd, "rights")) return fail("You must accept the streaming agreement to continue.");
    const db = await createSupabaseServerClient();
    if (!db) throw new ActionError("The database is not configured.");
    const { error } = await db.rpc("become_streamer");
    if (error) return fail("Could not enable streaming for your account.");
    revalidatePath("/", "layout");
    void user;
    return done("Streaming enabled. You can now create streams.", { redirect: "/dashboard/streams/new" });
  });
}

export async function updateEmailAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await actionUser();
    const parsed = z.string().email("Enter a valid email").safeParse(str(fd, "email"));
    if (!parsed.success) return fail("Enter a valid email", { email: "Enter a valid email" });
    const db = await createSupabaseServerClient();
    const { error } = await db!.auth.updateUser({ email: parsed.data });
    return error ? fail(error.message) : done("Check both inboxes to confirm the change.");
  });
}
