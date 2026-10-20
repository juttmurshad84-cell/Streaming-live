import "server-only";
import { canViewStream, type Viewer } from "@/lib/access";
import { fxStreams } from "@/lib/fixtures";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Page, Stream } from "@/lib/types";
import { clampPage, fixtureMode, likePattern, pageOf, PAGE_SIZE, readDb, slicePage, STREAM_SELECT, viewerCounts } from "./helpers";
import { getSportBySlug } from "./sports";

export interface StreamFilters {
  status?: "live" | "scheduled" | "ended";
  sport?: string;
  q?: string;
  language?: string;
  matchId?: string;
  competitionId?: string;
  ownerId?: string;
  excludeId?: string;
  sort?: "viewers" | "recent";
  page?: number;
  pageSize?: number;
}

async function withViewers(rows: Stream[]): Promise<Stream[]> {
  const live = rows.filter((r) => r.status === "live").map((r) => r.id);
  const counts = await viewerCounts(live);
  return rows.map((r) => ({ ...r, viewers: r.status === "live" ? (r.id in counts ? counts[r.id] : 0) : null }));
}

/** Public, published, public-visibility streams only (discovery). */
export async function listPublicStreams(f: StreamFilters = {}): Promise<Page<Stream>> {
  const page = clampPage(f.page);
  const pageSize = f.pageSize ?? PAGE_SIZE;
  const status = f.status ?? "live";

  if (fixtureMode()) {
    let rows = fxStreams.filter((s) => s.status === status);
    if (f.sport) rows = rows.filter((s) => s.sport?.slug === f.sport);
    if (f.q) rows = rows.filter((s) => s.title.toLowerCase().includes(f.q!.toLowerCase()));
    if (f.matchId) rows = rows.filter((s) => s.match_id === f.matchId);
    if (f.excludeId) rows = rows.filter((s) => s.id !== f.excludeId);
    if (f.competitionId) rows = rows.filter((s) => s.match?.competition?.id === f.competitionId);
    if (f.ownerId) rows = rows.filter((s) => s.owner_id === f.ownerId);
    return slicePage(rows, page, pageSize);
  }

  const db = (await readDb())!;
  const build = () => {
    let q = db.from("streams").select(STREAM_SELECT, { count: "exact" }).eq("is_published", true).eq("visibility", "public").eq("status", status);
    if (f.matchId) q = q.eq("match_id", f.matchId);
    if (f.ownerId) q = q.eq("owner_id", f.ownerId);
    if (f.excludeId) q = q.neq("id", f.excludeId);
    if (f.language) q = q.eq("language", f.language);
    if (f.q) q = q.ilike("title", likePattern(f.q));
    return q;
  };
  let q = build();
  if (f.sport) {
    const s = await getSportBySlug(f.sport);
    if (!s) return pageOf([], 0, page, pageSize);
    q = q.eq("sport_id", s.id);
  }
  if (f.competitionId) {
    const { data: ms } = await db.from("matches").select("id").eq("competition_id", f.competitionId).limit(500);
    const ids = (ms ?? []).map((m) => m.id);
    if (ids.length === 0) return pageOf([], 0, page, pageSize);
    q = q.in("match_id", ids);
  }

  if (status === "live" && (f.sort ?? "viewers") === "viewers") {
    // Live sets are small: rank by concurrent viewers, then recency, and paginate in memory.
    const { data, error } = await q.order("started_at", { ascending: false }).limit(200);
    if (error) throw error;
    const rows = await withViewers((data ?? []) as unknown as Stream[]);
    rows.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0) || (b.started_at ?? "").localeCompare(a.started_at ?? ""));
    return slicePage(rows, page, pageSize);
  }
  const order = status === "scheduled" ? "scheduled_start" : status === "ended" ? "ended_at" : "started_at";
  const { data, count, error } = await q.order(order, { ascending: status === "scheduled", nullsFirst: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return pageOf(await withViewers((data ?? []) as unknown as Stream[]), count ?? 0, page, pageSize);
}

/** "Trending" = live streams ranked by concurrent viewers; requires real viewer data (no viewers → empty). */
export async function listTrendingStreams(limit = 6): Promise<Stream[]> {
  if (fixtureMode()) return [];
  const page = await listPublicStreams({ status: "live", sort: "viewers", pageSize: 50 });
  return page.items.filter((s) => (s.viewers ?? 0) > 0).slice(0, limit);
}

/** Resolve a stream for the watch page, enforcing visibility. Unlisted links resolve; private does not. */
export async function getStreamForViewer(id: string, viewer: Viewer): Promise<Stream | null> {
  if (fixtureMode()) return fxStreams.find((s) => s.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createSupabaseAdminClient() ?? (await readDb())!;
  const { data } = await db.from("streams").select(STREAM_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const s = data as unknown as Stream;
  if (!canViewStream(s, viewer)) return null;
  const [withV] = await withViewers([s]);
  return withV;
}

export async function listOwnerStreams(ownerId: string): Promise<Stream[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data, error } = await db.from("streams").select(STREAM_SELECT).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Stream[];
}

export async function getOwnedStream(id: string, ownerId: string, staff = false): Promise<Stream | null> {
  if (fixtureMode() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = (await readDb())!;
  const { data } = await db.from("streams").select(STREAM_SELECT).eq("id", id).maybeSingle();
  const s = data as unknown as Stream | null;
  if (!s || (s.owner_id !== ownerId && !staff)) return null;
  return s;
}

export async function listAdminStreams(opts: { q?: string; status?: string; page?: number }): Promise<Page<Stream>> {
  const page = clampPage(opts.page);
  if (fixtureMode()) return slicePage(fxStreams, page);
  const db = (await readDb())!;
  let q = db.from("streams").select(STREAM_SELECT, { count: "exact" });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.q) q = q.ilike("title", likePattern(opts.q));
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  return pageOf((data ?? []) as unknown as Stream[], count ?? 0, page, 20);
}
