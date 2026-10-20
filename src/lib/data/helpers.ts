import "server-only";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/env";
import type { Page } from "@/lib/types";

export const PAGE_SIZE = 12;
/** True when running without a database (development fixtures are shown, clearly labelled). */
export const fixtureMode = () => !hasSupabase();

export const readDb = () => createSupabaseServerClient();

export function pageOf<T>(items: T[], total: number, page: number, pageSize = PAGE_SIZE): Page<T> {
  return { items, total, page, pageSize };
}
export function slicePage<T>(all: T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
}
export const clampPage = (p: unknown) => Math.max(1, Math.min(1000, Number.parseInt(String(p ?? "1"), 10) || 1));

/** Escape user input for use inside PostgREST `ilike`/`or` filters. */
export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\,()*]/g, " ").trim()}%`;
}

export async function viewerCounts(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const admin = createSupabaseAdminClient();
  if (!admin) return {};
  const { data } = await admin.rpc("viewer_counts", { p_streams: ids });
  return Object.fromEntries(((data ?? []) as { stream_id: string; viewers: number }[]).map((r) => [r.stream_id, r.viewers]));
}

export const STREAM_SELECT = `*, owner:profiles!streams_owner_id_fkey(id,username,display_name,avatar_url,role,follower_count), sport:sports_categories(slug,name), match:matches(id,title,status,home_score,away_score, home_team:teams!matches_home_team_id_fkey(id,name,short_name,logo_url), away_team:teams!matches_away_team_id_fkey(id,name,short_name,logo_url), competition:competitions(id,name,slug,logo_url))`;
export const MATCH_SELECT = `*, sport:sports_categories(slug,name), competition:competitions(id,name,slug,logo_url), home_team:teams!matches_home_team_id_fkey(id,name,short_name,logo_url), away_team:teams!matches_away_team_id_fkey(id,name,short_name,logo_url)`;
export const VIDEO_SELECT = `*, owner:profiles!videos_owner_id_fkey(id,username,display_name,avatar_url,role,follower_count), sport:sports_categories(slug,name)`;
