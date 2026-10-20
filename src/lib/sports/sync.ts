import "server-only";
import { env } from "@/lib/env";
import { logger, errMessage } from "@/lib/log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchEventsByDay, normalizeEvent, RateLimitedError } from "./thesportsdb";

export interface SyncSummary {
  provider: string;
  sports: number;
  requests: number;
  matches: number;
  rateLimited: boolean;
  errors: string[];
  startedAt: string;
}

const PROVIDER = "thesportsdb";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "league";

/**
 * Pull fixtures/scores for a window of days around today for every active sport mapped to the
 * provider, and upsert competitions, teams and matches. Respects the free tier (30 req/min).
 */
export async function syncSportsData(opts: { daysBack?: number; daysForward?: number; maxRequests?: number } = {}): Promise<SyncSummary> {
  const summary: SyncSummary = { provider: PROVIDER, sports: 0, requests: 0, matches: 0, rateLimited: false, errors: [], startedAt: new Date().toISOString() };
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  if (!env.sportsApiKey) throw new Error("SPORTS_API_KEY is not configured");

  const { data: sports } = await db.from("sports_categories").select("id, slug, provider_sport_name").eq("is_active", true).not("provider_sport_name", "is", null);
  const days: string[] = [];
  for (let d = -(opts.daysBack ?? 1); d <= (opts.daysForward ?? 2); d++) days.push(new Date(Date.now() + d * 864e5).toISOString().slice(0, 10));
  const maxRequests = opts.maxRequests ?? 25; // stay under 30/minute on the free tier

  outer: for (const sport of sports ?? []) {
    summary.sports++;
    for (const day of days) {
      if (summary.requests >= maxRequests) break outer;
      summary.requests++;
      let events;
      try {
        events = await fetchEventsByDay(env.sportsApiKey, day, sport.provider_sport_name!);
      } catch (e) {
        if (e instanceof RateLimitedError) {
          summary.rateLimited = true;
          break outer;
        }
        summary.errors.push(`${sport.slug} ${day}: ${errMessage(e)}`);
        continue;
      }
      const now = new Date();
      for (const raw of events) {
        const m = normalizeEvent(raw, now);
        if (!m) continue;
        try {
          let competitionId: string | null = null;
          if (m.league) {
            const { data } = await db.from("competitions").upsert({ sport_id: sport.id, name: m.league.name, slug: slug(m.league.name), country: m.league.country, logo_url: m.league.logo, provider: PROVIDER, external_id: m.league.externalId }, { onConflict: "provider,external_id" }).select("id").single();
            competitionId = data?.id ?? null;
          }
          const teamId = async (t: typeof m.home) => {
            if (!t) return null;
            const { data } = await db.from("teams").upsert({ sport_id: sport.id, name: t.name, logo_url: t.logo, provider: PROVIDER, external_id: t.externalId }, { onConflict: "provider,external_id" }).select("id").single();
            return data?.id ?? null;
          };
          const [home, away] = [await teamId(m.home), await teamId(m.away)];
          const { error } = await db.from("matches").upsert({
            sport_id: sport.id, competition_id: competitionId, home_team_id: home, away_team_id: away, title: m.title, status: m.status, starts_at: m.startsAt,
            home_score: m.homeScore, away_score: m.awayScore, period: m.period, venue: m.venue, country: m.country, provider: PROVIDER, external_id: m.externalId, data_synced_at: new Date().toISOString(),
          }, { onConflict: "provider,external_id" });
          if (error) throw error;
          summary.matches++;
        } catch (e) {
          summary.errors.push(`${m.externalId}: ${errMessage(e)}`);
        }
      }
      await new Promise((r) => setTimeout(r, 2100)); // ~28 requests/minute
    }
  }
  logger.info("sports sync finished", { ...summary, errors: summary.errors.length });
  return summary;
}
