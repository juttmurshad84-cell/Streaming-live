"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { actionUser, ActionError, done, fail, guard, limitUser, type ActionState } from "./util";

const uuid = z.string().uuid();
const db = async () => {
  const c = await createSupabaseServerClient();
  if (!c) throw new ActionError("The database is not configured.");
  return c;
};

export async function toggleFollowAction(streamerId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    if (!uuid.safeParse(streamerId).success) return fail("Invalid streamer.");
    if (streamerId === user.id) return fail("You cannot follow yourself.");
    await limitUser("follow", user.id, 30, 60_000);
    const c = await db();
    const { data: ex } = await c.from("follows").select("streamer_id").eq("follower_id", user.id).eq("streamer_id", streamerId).maybeSingle();
    if (ex) {
      const { error } = await c.from("follows").delete().eq("follower_id", user.id).eq("streamer_id", streamerId);
      if (error) return fail("Could not unfollow.");
    } else {
      const { error } = await c.from("follows").insert({ follower_id: user.id, streamer_id: streamerId });
      if (error) return fail("Could not follow this streamer.");
    }
    revalidatePath("/dashboard/following");
    return done(ex ? "Unfollowed." : "Following.", { active: !ex });
  });
}

const kinds = z.enum(["stream", "video", "team", "sport", "match"]);
export async function toggleFavoriteAction(kind: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    const k = kinds.safeParse(kind);
    if (!k.success || !uuid.safeParse(id).success) return fail("Invalid item.");
    await limitUser("fav", user.id, 60, 60_000);
    const c = await db();
    const col = `${k.data}_id`;
    const { data: ex } = await c.from("favorites").select("id").eq("user_id", user.id).eq(col, id).maybeSingle();
    if (ex) {
      await c.from("favorites").delete().eq("id", ex.id);
    } else {
      const { error } = await c.from("favorites").insert({ user_id: user.id, [col]: id });
      if (error) return fail("Could not save this item.");
    }
    revalidatePath("/dashboard/favorites");
    return done(ex ? "Removed from favorites." : "Saved to favorites.", { active: !ex });
  });
}

export async function toggleReminderAction(matchId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    if (!uuid.safeParse(matchId).success) return fail("Invalid match.");
    const c = await db();
    const { data: ex } = await c.from("match_reminders").select("match_id").eq("user_id", user.id).eq("match_id", matchId).maybeSingle();
    if (ex) await c.from("match_reminders").delete().eq("user_id", user.id).eq("match_id", matchId);
    else {
      const { error } = await c.from("match_reminders").insert({ user_id: user.id, match_id: matchId });
      if (error) return fail("Could not set the reminder.");
    }
    return done(ex ? "Reminder removed." : "We'll notify you before it starts.", { active: !ex });
  });
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    const c = await db();
    let q = c.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    if (ids?.length) q = q.in("id", ids.filter((i) => uuid.safeParse(i).success));
    await q;
    revalidatePath("/dashboard/notifications");
    return done();
  });
}

export async function deleteNotificationAction(id: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    if (!uuid.safeParse(id).success) return fail("Invalid notification.");
    await (await db()).from("notifications").delete().eq("id", id).eq("user_id", user.id);
    revalidatePath("/dashboard/notifications");
    return done();
  });
}

export async function blockUserAction(userId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    if (!uuid.safeParse(userId).success || userId === user.id) return fail("Invalid user.");
    const { error } = await (await db()).from("user_blocks").upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: "blocker_id,blocked_id" });
    return error ? fail("Could not block that user.") : done("User blocked. Their messages are hidden for you.");
  });
}

export async function unblockUserAction(userId: string): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    await (await db()).from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
    return done("User unblocked.");
  });
}
