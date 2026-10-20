import "server-only";
import { fxCompetitions, fxMatches, fxSports } from "@/lib/fixtures";
import type { Competition, Sport, SportWithCounts } from "@/lib/types";
import { fixtureMode, readDb } from "./helpers";

export async function listSports(opts: { includeInactive?: boolean } = {}): Promise<Sport[]> {
  if (fixtureMode()) return fxSports;
  const db = (await readDb())!;
  let q = db.from("sports_categories").select("*").order("sort_order");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Sport[];
}

export async function listSportsWithCounts(): Promise<SportWithCounts[]> {
  const sports = await listSports();
  if (fixtureMode()) {
    return sports.map((s) => {
      const ms = fxMatches.filter((m) => m.sport_id === s.id);
      return { ...s, live_count: ms.filter((m) => m.status === "live").length, upcoming_count: ms.filter((m) => m.status === "scheduled").length, total_count: ms.length };
    });
  }
  const db = (await readDb())!;
  const { data, error } = await db.rpc("sport_event_counts");
  if (error) throw error;
  const by = new Map((data as { sport_id: string; live_count: number; upcoming_count: number; total_count: number }[]).map((r) => [r.sport_id, r]));
  return sports.map((s) => ({ ...s, live_count: by.get(s.id)?.live_count ?? 0, upcoming_count: by.get(s.id)?.upcoming_count ?? 0, total_count: by.get(s.id)?.total_count ?? 0 }));
}

export async function getSportBySlug(slug: string): Promise<Sport | null> {
  return (await listSports()).find((s) => s.slug === slug) ?? null;
}

export async function listCompetitions(sportId?: string): Promise<Competition[]> {
  if (fixtureMode()) return fxCompetitions.filter((c) => !sportId || c.sport_id === sportId);
  const db = (await readDb())!;
  let q = db.from("competitions").select("*").eq("is_active", true).order("sort_order").order("name");
  if (sportId) q = q.eq("sport_id", sportId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Competition[];
}
