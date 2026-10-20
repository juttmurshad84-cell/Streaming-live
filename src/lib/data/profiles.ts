import "server-only";
import { fxProfiles, fxStreams } from "@/lib/fixtures";
import type { NotificationRow, Profile, ProfileLite } from "@/lib/types";
import { fixtureMode, likePattern, readDb } from "./helpers";

const COLS = "id, username, display_name, bio, avatar_url, banner_url, favorite_sports, role, follower_count, created_at";

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const u = username.toLowerCase();
  if (fixtureMode()) return fxProfiles.find((p) => p.username === u) ?? null;
  if (!/^[a-z0-9_]{3,30}$/.test(u)) return null;
  const db = (await readDb())!;
  const { data } = await db.from("profiles").select(COLS).eq("username", u).maybeSingle();
  return (data as Profile) ?? null;
}

export interface FeaturedStreamer extends ProfileLite {
  isLive: boolean;
  sports: string[];
}

/** Streamers ranked by followers, with real live status. */
export async function listFeaturedStreamers(limit = 6): Promise<FeaturedStreamer[]> {
  if (fixtureMode()) return fxProfiles.map((p) => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, follower_count: p.follower_count, isLive: fxStreams.some((s) => s.owner_id === p.id && s.status === "live"), sports: ["Football"] }));
  const db = (await readDb())!;
  const { data: profs } = await db.from("profiles").select("id, username, display_name, avatar_url, follower_count, role").in("role", ["streamer", "moderator", "admin"]).order("follower_count", { ascending: false }).limit(limit);
  const list = (profs ?? []) as ProfileLite[];
  if (list.length === 0) return [];
  const ids = list.map((p) => p.id);
  const { data: streams } = await db.from("streams").select("owner_id, status, sport:sports_categories(name)").in("owner_id", ids).eq("is_published", true).eq("visibility", "public").in("status", ["live", "ended"]).limit(500);
  return list.map((p) => {
    const mine = (streams ?? []).filter((s) => s.owner_id === p.id) as unknown as { status: string; sport: { name: string } | null }[];
    return { ...p, isLive: mine.some((s) => s.status === "live"), sports: [...new Set(mine.map((s) => s.sport?.name).filter(Boolean) as string[])].slice(0, 3) };
  });
}

export async function searchProfiles(q: string, limit = 6): Promise<ProfileLite[]> {
  if (fixtureMode()) return fxProfiles.filter((p) => (p.username + p.display_name).toLowerCase().includes(q.toLowerCase()));
  const db = (await readDb())!;
  const p = likePattern(q);
  const { data } = await db.from("profiles").select("id, username, display_name, avatar_url, follower_count").or(`username.ilike.${p},display_name.ilike.${p}`).limit(limit);
  return (data ?? []) as ProfileLite[];
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("notifications").select("id, type, title, body, link, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function unreadCount(userId: string): Promise<number> {
  if (fixtureMode()) return 0;
  const db = (await readDb())!;
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}

export async function listFollowing(userId: string): Promise<(ProfileLite & { isLive: boolean })[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("follows").select("streamer:profiles!follows_streamer_id_fkey(id, username, display_name, avatar_url, follower_count)").eq("follower_id", userId).order("created_at", { ascending: false });
  const list = (data ?? []).map((r) => (r as unknown as { streamer: ProfileLite }).streamer).filter(Boolean);
  if (list.length === 0) return [];
  const { data: live } = await db.from("streams").select("owner_id").in("owner_id", list.map((p) => p.id)).eq("status", "live").eq("is_published", true).eq("visibility", "public");
  const liveSet = new Set((live ?? []).map((s) => s.owner_id));
  return list.map((p) => ({ ...p, isLive: liveSet.has(p.id) }));
}

export async function listFollowers(userId: string): Promise<ProfileLite[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("follows").select("follower:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)").eq("streamer_id", userId).order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((r) => (r as unknown as { follower: ProfileLite }).follower).filter(Boolean);
}

export async function isFollowing(userId: string | null, streamerId: string): Promise<boolean> {
  if (!userId || fixtureMode()) return false;
  const db = (await readDb())!;
  const { data } = await db.from("follows").select("streamer_id").eq("follower_id", userId).eq("streamer_id", streamerId).maybeSingle();
  return Boolean(data);
}

export type FavoriteKind = "stream" | "video" | "team" | "sport" | "match";
export async function isFavorite(userId: string | null, kind: FavoriteKind, id: string): Promise<boolean> {
  if (!userId || fixtureMode()) return false;
  const db = (await readDb())!;
  const { data } = await db.from("favorites").select("id").eq("user_id", userId).eq(`${kind}_id`, id).maybeSingle();
  return Boolean(data);
}

export async function listFavorites(userId: string) {
  if (fixtureMode()) return { streams: [], videos: [], teams: [], sports: [], matches: [] };
  const db = (await readDb())!;
  const { data } = await db.from("favorites").select("id, stream:streams(id,title,status,thumbnail_url,sport:sports_categories(slug,name)), video:videos(id,title,thumbnail_url,duration_seconds,sport:sports_categories(slug,name)), team:teams(id,name,logo_url), sport:sports_categories(id,slug,name), match:matches(id,title,starts_at,status)").eq("user_id", userId).order("created_at", { ascending: false });
  type Row = { id: string; stream: unknown; video: unknown; team: unknown; sport: unknown; match: unknown };
  const rows = (data ?? []) as unknown as Row[];
  const pick = <T,>(k: keyof Row) => rows.filter((r) => r[k]).map((r) => r[k] as T);
  return {
    streams: pick<{ id: string; title: string; status: string; thumbnail_url: string | null; sport: { slug: string; name: string } | null }>("stream"),
    videos: pick<{ id: string; title: string; thumbnail_url: string | null; duration_seconds: number | null; sport: { slug: string; name: string } | null }>("video"),
    teams: pick<{ id: string; name: string; logo_url: string | null }>("team"),
    sports: pick<{ id: string; slug: string; name: string }>("sport"),
    matches: pick<{ id: string; title: string; starts_at: string; status: string }>("match"),
  };
}
