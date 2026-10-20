import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import type { CurrentUser, Profile, UserRole } from "@/lib/types";

const PROFILE_COLS = "id, username, display_name, bio, avatar_url, banner_url, favorite_sports, role, follower_count, created_at";

/** The signed-in user (validated with the Auth server, not just decoded from the cookie), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [{ data: profile }, { data: priv }] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLS).eq("id", data.user.id).maybeSingle(),
    supabase.from("profile_private").select("notification_prefs, rights_agreement_accepted_at, suspended_at").eq("user_id", data.user.id).maybeSingle(),
  ]);
  if (!profile) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    profile: profile as Profile,
    suspended: Boolean(priv?.suspended_at),
    rightsAccepted: Boolean(priv?.rights_agreement_accepted_at),
    notificationPrefs: { live_started: true, recording_ready: true, match_reminders: true, ...(priv?.notification_prefs ?? {}) },
  };
});

export async function requireUser(next = "/dashboard"): Promise<CurrentUser> {
  if (!hasSupabase()) redirect(`/login?notice=not-configured`);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

const RANK: Record<UserRole, number> = { viewer: 0, streamer: 1, moderator: 2, admin: 3 };
export const hasRole = (user: Pick<CurrentUser, "profile"> | null, min: UserRole) => !!user && RANK[user.profile.role] >= RANK[min];

export async function requireRole(min: UserRole, next = "/dashboard"): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!hasRole(user, min)) redirect(min === "streamer" ? "/dashboard/become-streamer" : "/dashboard?denied=1");
  return user;
}

export const isStaff = (u: CurrentUser | null) => hasRole(u, "moderator");
export const isAdmin = (u: CurrentUser | null) => hasRole(u, "admin");

import type { Viewer } from "@/lib/access";
/** Identity used for access decisions on watch pages and playback APIs. */
export async function getViewer(): Promise<Viewer> {
  const u = await getCurrentUser();
  return u ? { id: u.id, staff: hasRole(u, "moderator") } : { id: null, staff: false };
}
