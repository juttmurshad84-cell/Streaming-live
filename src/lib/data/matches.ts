import "server-only";
import { fxMatches, fxTeams } from "@/lib/fixtures";
import type { Match, MatchStatus, Page, Team } from "@/lib/types";
import { clampPage, fixtureMode, likePattern, MATCH_SELECT, pageOf, PAGE_SIZE, readDb, slicePage } from "./helpers";
import { getSportBySlug } from "./sports";

export interface MatchFilters {
  status?: MatchStatus | "upcoming" | "completed";
  sport?: string; // slug
  competition?: string; // competition id
  q?: string; // title / team
  team?: string; // team id
  language?: string;
  country?: string;
  from?: string; // ISO date
  to?: string;
  sort?: "start_asc" | "start_desc";
  page?: number;
  pageSize?: number;
}

export async function listMatches(f: MatchFilters = {}): Promise<Page<Match>> {
  const page = clampPage(f.page);
  const pageSize = f.pageSize ?? PAGE_SIZE;
  const status = f.status === "upcoming" ? "scheduled" : f.status === "completed" ? "finished" : f.status;
  const sort = f.sort ?? (status === "finished" ? "start_desc" : "start_asc");

  if (fixtureMode()) {
    let rows = fxMatches.slice();
    if (status) rows = rows.filter((m) => m.status === status);
    if (f.sport) rows = rows.filter((m) => m.sport?.slug === f.sport);
    if (f.competition) rows = rows.filter((m) => m.competition?.id === f.competition);
    if (f.team) rows = rows.filter((m) => m.home_team?.id === f.team || m.away_team?.id === f.team);
    if (f.language) rows = rows.filter((m) => m.language === f.language);
    if (f.q) rows = rows.filter((m) => m.title.toLowerCase().includes(f.q!.toLowerCase()));
    if (f.from) rows = rows.filter((m) => m.starts_at >= f.from!);
    if (f.to) rows = rows.filter((m) => m.starts_at <= f.to!);
    rows.sort((a, b) => (sort === "start_asc" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)));
    return slicePage(rows, page, pageSize);
  }

  const db = (await readDb())!;
  let q = db.from("matches").select(MATCH_SELECT, { count: "exact" });
  if (status) q = q.eq("status", status);
  if (f.sport) {
    const s = await getSportBySlug(f.sport);
    if (!s) return pageOf([], 0, page, pageSize);
    q = q.eq("sport_id", s.id);
  }
  if (f.competition) q = q.eq("competition_id", f.competition);
  if (f.team) q = q.or(`home_team_id.eq.${f.team},away_team_id.eq.${f.team}`);
  if (f.language) q = q.eq("language", f.language);
  if (f.country) q = q.eq("country", f.country);
  if (f.q) q = q.ilike("title", likePattern(f.q));
  if (f.from) q = q.gte("starts_at", f.from);
  if (f.to) q = q.lte("starts_at", f.to);
  q = q.order("starts_at", { ascending: sort === "start_asc" }).range((page - 1) * pageSize, page * pageSize - 1);
  const { data, count, error } = await q;
  if (error) throw error;
  return pageOf((data ?? []) as unknown as Match[], count ?? 0, page, pageSize);
}

export async function getMatch(id: string): Promise<Match | null> {
  if (fixtureMode()) return fxMatches.find((m) => m.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = (await readDb())!;
  const { data } = await db.from("matches").select(MATCH_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as Match) ?? null;
}

export async function searchTeams(q: string, limit = 8): Promise<Team[]> {
  if (fixtureMode()) return fxTeams.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit);
  const db = (await readDb())!;
  const { data } = await db.from("teams").select("*").ilike("name", likePattern(q)).limit(limit);
  return (data ?? []) as Team[];
}

export async function listTeams(sportId?: string): Promise<Team[]> {
  if (fixtureMode()) return fxTeams.filter((t) => !sportId || t.sport_id === sportId);
  const db = (await readDb())!;
  let q = db.from("teams").select("*").order("name").limit(500);
  if (sportId) q = q.eq("sport_id", sportId);
  const { data } = await q;
  return (data ?? []) as Team[];
}
