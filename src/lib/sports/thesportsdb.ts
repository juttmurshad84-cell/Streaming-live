import type { MatchStatus } from "@/lib/types";

/**
 * TheSportsDB (v1 REST) adapter. Docs: https://www.thesportsdb.com/documentation
 * Free key limits: 30 req/min; livescores and v2 require a premium key (NOT used here).
 * This provides fixtures, teams, competitions, final/updated scores and statuses by day.
 * It does NOT grant any right to broadcast a match.
 */
export interface ProviderEvent {
  idEvent: string;
  strEvent?: string;
  idLeague?: string;
  strLeague?: string;
  strLeagueBadge?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strStatus?: string | null;
  strProgress?: string | null;
  strVenue?: string | null;
  strCountry?: string | null;
}

export interface NormalizedMatch {
  externalId: string;
  title: string;
  status: MatchStatus;
  startsAt: string;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  venue: string | null;
  country: string | null;
  league: { externalId: string; name: string; logo: string | null; country: string | null } | null;
  home: { externalId: string; name: string; logo: string | null } | null;
  away: { externalId: string; name: string; logo: string | null } | null;
}

const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "Q1", "Q2", "Q3", "Q4", "OT", "IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "IN7", "IN8", "IN9", "S1", "S2", "S3", "S4", "S5"]);
const FINISHED = new Set(["FT", "AET", "PEN", "AOT", "AP", "MATCH FINISHED", "FINISHED", "AFTER OVERTIME", "FINAL", "ENDED"]);
const NOT_STARTED = new Set(["NS", "NOT STARTED", "TBD", "SCHEDULED", ""]);

export function mapStatus(raw: string | null | undefined, hasScore: boolean, startsAt: Date, now = new Date()): MatchStatus {
  const s = (raw ?? "").trim().toUpperCase();
  if (s.startsWith("POSTP") || s === "PST") return "postponed";
  if (s.startsWith("CANC") || s === "ABD" || s === "AWD" || s === "WO") return "cancelled";
  if (FINISHED.has(s)) return "finished";
  if (LIVE.has(s) || s.includes("HALF") || s.includes("QUARTER") || s.includes("INNING")) return "live";
  if (NOT_STARTED.has(s)) {
    // Provider gave no state: treat as scheduled; never infer "live" from the clock alone.
    return startsAt.getTime() < now.getTime() - 6 * 3600_000 && hasScore ? "finished" : "scheduled";
  }
  return hasScore && startsAt.getTime() < now.getTime() - 6 * 3600_000 ? "finished" : "scheduled";
}

const toInt = (v: string | null | undefined) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function normalizeEvent(e: ProviderEvent, now = new Date()): NormalizedMatch | null {
  if (!e.idEvent) return null;
  const ts = e.strTimestamp ?? (e.dateEvent ? `${e.dateEvent}T${e.strTime ?? "00:00:00"}` : null);
  if (!ts) return null;
  const startsAt = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts.replace(" ", "T") + "Z"); // provider timestamps are UTC
  if (Number.isNaN(startsAt.getTime())) return null;
  const hs = toInt(e.intHomeScore);
  const as = toInt(e.intAwayScore);
  const title = e.strEvent || (e.strHomeTeam && e.strAwayTeam ? `${e.strHomeTeam} vs ${e.strAwayTeam}` : null);
  if (!title) return null;
  return {
    externalId: e.idEvent,
    title,
    status: mapStatus(e.strStatus, hs != null && as != null, startsAt, now),
    startsAt: startsAt.toISOString(),
    homeScore: hs,
    awayScore: as,
    period: e.strProgress || (e.strStatus && !["NS", "Not Started"].includes(e.strStatus) ? e.strStatus : null) || null,
    venue: e.strVenue || null,
    country: e.strCountry || null,
    league: e.idLeague && e.strLeague ? { externalId: e.idLeague, name: e.strLeague, logo: e.strLeagueBadge || null, country: e.strCountry || null } : null,
    home: e.idHomeTeam && e.strHomeTeam ? { externalId: e.idHomeTeam, name: e.strHomeTeam, logo: e.strHomeTeamBadge || null } : null,
    away: e.idAwayTeam && e.strAwayTeam ? { externalId: e.idAwayTeam, name: e.strAwayTeam, logo: e.strAwayTeamBadge || null } : null,
  };
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Sports API rate limit reached; retry after ${retryAfterSeconds}s`);
  }
}

/** GET with retry/backoff on 5xx and network errors; surfaces 429 as RateLimitedError (caller stops the run). */
export async function fetchEventsByDay(apiKey: string, date: string, sportName: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ProviderEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(apiKey)}/eventsday.php?d=${date}&s=${encodeURIComponent(sportName)}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (res.status === 429) throw new RateLimitedError(Number(res.headers.get("retry-after")) || 60);
      if (res.status >= 500) throw new Error(`Sports API HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`Sports API HTTP ${res.status}`), { fatal: true });
      const json = (await res.json()) as { events?: ProviderEvent[] | null };
      return json.events ?? [];
    } catch (e) {
      if (e instanceof RateLimitedError || (e as { fatal?: boolean }).fatal) throw e;
      lastErr = e;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Sports API request failed");
}
