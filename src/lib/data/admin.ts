import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Competition, Page, Profile } from "@/lib/types";
import { clampPage, fixtureMode, likePattern, pageOf, readDb } from "./helpers";

export interface AdminCounts { users: number; liveStreams: number; streams: number; videos: number; openReports: number; openComplaints: number; failedRecordings: number }

export async function adminCounts(): Promise<AdminCounts | null> {
  if (fixtureMode()) return null;
  const db = (await readDb())!;
  const c = async (t: string, f?: (q: ReturnType<typeof db.from>) => unknown) => {
    const base = db.from(t).select("*", { count: "exact", head: true });
    const { count } = (await (f ? (f(base as never) as typeof base) : base)) as { count: number | null };
    return count ?? 0;
  };
  const [users, liveStreams, streams, videos, openReports, openComplaints, failedRecordings] = await Promise.all([
    c("profiles"),
    c("streams", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "live")),
    c("streams"),
    c("videos"),
    c("reports", (q) => (q as never as { in: (a: string, b: string[]) => unknown }).in("status", ["open", "reviewing"])),
    c("copyright_complaints", (q) => (q as never as { in: (a: string, b: string[]) => unknown }).in("status", ["open", "reviewing"])),
    c("stream_recordings", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "failed")),
  ]);
  return { users, liveStreams, streams, videos, openReports, openComplaints, failedRecordings };
}

export interface AdminUser extends Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "role" | "created_at" | "follower_count"> {
  private: { strikes: number; suspended_at: string | null; suspended_reason: string | null; recording_approved: boolean } | null;
}

export async function listAdminUsers(opts: { q?: string; role?: string; page?: number }): Promise<Page<AdminUser>> {
  const page = clampPage(opts.page);
  if (fixtureMode()) return pageOf([], 0, page, 20);
  const db = (await readDb())!;
  let q = db.from("profiles").select("id, username, display_name, avatar_url, role, created_at, follower_count, private:profile_private(strikes, suspended_at, suspended_reason, recording_approved)", { count: "exact" });
  if (opts.role) q = q.eq("role", opts.role);
  if (opts.q) q = q.or(`username.ilike.${likePattern(opts.q)},display_name.ilike.${likePattern(opts.q)}`);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  const rows = (data ?? []).map((r) => {
    const x = r as unknown as AdminUser & { private: AdminUser["private"] | AdminUser["private"][] };
    return { ...x, private: Array.isArray(x.private) ? x.private[0] ?? null : x.private } as AdminUser;
  });
  return pageOf(rows, count ?? 0, page, 20);
}

export interface ReportRow {
  id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; created_at: string; resolution_note: string | null;
  reporter: { username: string; display_name: string } | null;
}
export async function listReports(status: "open" | "closed", limit = 50): Promise<ReportRow[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  let q = db.from("reports").select("id, target_type, target_id, reason, details, status, created_at, resolution_note, reporter:profiles!reports_reporter_id_fkey(username, display_name)");
  q = status === "open" ? q.in("status", ["open", "reviewing"]) : q.in("status", ["actioned", "dismissed"]);
  const { data } = await q.order("created_at", { ascending: status !== "closed" }).limit(limit);
  return (data ?? []) as unknown as ReportRow[];
}

export interface ComplaintRow {
  id: string; complainant_name: string; complainant_email: string; company: string | null; work_description: string; infringing_urls: string[]; signature: string; status: string; created_at: string; stream_id: string | null; video_id: string | null;
}
export async function listComplaints(status: "open" | "closed", limit = 50): Promise<ComplaintRow[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  let q = db.from("copyright_complaints").select("id, complainant_name, complainant_email, company, work_description, infringing_urls, signature, status, created_at, stream_id, video_id");
  q = status === "open" ? q.in("status", ["open", "reviewing"]) : q.in("status", ["upheld", "rejected", "counter_notice"]);
  const { data } = await q.order("created_at", { ascending: status !== "closed" }).limit(limit);
  return (data ?? []) as ComplaintRow[];
}

export async function recentModeration(limit = 15) {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("moderation_actions").select("id, action, target_type, target_id, reason, created_at, actor:profiles!moderation_actions_actor_id_fkey(username)").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as { id: string; action: string; target_type: string; target_id: string; reason: string | null; created_at: string; actor: { username: string } | null }[];
}

export async function recentWebhookEvents(limit = 10) {
  const db = createSupabaseAdminClient();
  if (!db) return [];
  const { data } = await db.from("webhook_events").select("id, provider, event_type, received_at, processed_at, error").order("received_at", { ascending: false }).limit(limit);
  return (data ?? []) as { id: string; provider: string; event_type: string; received_at: string; processed_at: string | null; error: string | null }[];
}

export async function lastSportsSync(): Promise<string | null> {
  if (fixtureMode()) return null;
  const db = (await readDb())!;
  const { data } = await db.from("matches").select("data_synced_at").not("data_synced_at", "is", null).order("data_synced_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.data_synced_at as string | undefined) ?? null;
}

export async function listAllCompetitions(): Promise<(Competition & { sport: { name: string } | null })[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("competitions").select("*, sport:sports_categories(name)").order("sort_order").order("name").limit(300);
  return (data ?? []) as unknown as (Competition & { sport: { name: string } | null })[];
}
