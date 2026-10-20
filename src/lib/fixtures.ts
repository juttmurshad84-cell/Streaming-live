/**
 * DEVELOPMENT FIXTURES — used ONLY when Supabase is not configured, so the UI can be reviewed.
 * Everything here is sample data. The UI labels it as such; it must never be presented as real
 * streams, scores, viewers or analytics. Viewer counts are deliberately null.
 */
import type { Competition, Match, Profile, ProfileLite, Sport, Stream, Team, Video } from "./types";

const H = 3600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const SPORT_ROWS: [string, string, string][] = [
  ["cricket", "Cricket", "Cricket"], ["football", "Football", "Soccer"], ["basketball", "Basketball", "Basketball"],
  ["tennis", "Tennis", "Tennis"], ["volleyball", "Volleyball", "Volleyball"], ["hockey", "Hockey", "Ice Hockey"],
  ["rugby", "Rugby", "Rugby"], ["baseball", "Baseball", "Baseball"], ["badminton", "Badminton", "Badminton"],
  ["esports", "Esports", ""], ["other", "Other sports", ""],
];
export const fxSports: Sport[] = SPORT_ROWS.map(([slug, name, p], i) => ({
  id: `fx-sport-${slug}`, slug, name, image_url: null, sort_order: (i + 1) * 10, is_active: true, provider_sport_name: p || null,
}));
const sp = (slug: string) => fxSports.find((s) => s.slug === slug)!;
const spl = (slug: string) => ({ slug, name: sp(slug).name });

export const fxCompetitions: Competition[] = [
  { id: "fx-comp-1", sport_id: sp("football").id, name: "Sample Premier League", slug: "sample-premier-league", country: "England", logo_url: null, is_active: true, sort_order: 10 },
  { id: "fx-comp-2", sport_id: sp("basketball").id, name: "Sample Basketball Cup", slug: "sample-basketball-cup", country: "USA", logo_url: null, is_active: true, sort_order: 20 },
  { id: "fx-comp-3", sport_id: sp("cricket").id, name: "Sample T20 Series", slug: "sample-t20-series", country: "International", logo_url: null, is_active: true, sort_order: 30 },
  { id: "fx-comp-4", sport_id: sp("tennis").id, name: "Sample Open", slug: "sample-open", country: "Australia", logo_url: null, is_active: true, sort_order: 40 },
];
const comp = (n: number) => { const c = fxCompetitions[n]; return { id: c.id, name: c.name, slug: c.slug, logo_url: c.logo_url }; };

const T = (id: string, name: string, short: string, sport: string): Team => ({ id: `fx-team-${id}`, sport_id: sp(sport).id, name, short_name: short, logo_url: null, country: null });
export const fxTeams: Team[] = [
  T("a", "Northbridge FC", "NBR", "football"), T("b", "Eastport United", "EPU", "football"),
  T("c", "Harbor Hawks", "HHK", "basketball"), T("d", "Summit Wolves", "SWV", "basketball"),
  T("e", "Capital Kings", "CPK", "cricket"), T("f", "Coastal Strikers", "CST", "cricket"),
  T("g", "Redfield Rovers", "RFR", "football"), T("h", "Lakeside City", "LKC", "football"),
];
const tl = (id: string) => { const t = fxTeams.find((x) => x.id === `fx-team-${id}`)!; return { id: t.id, name: t.name, short_name: t.short_name, logo_url: t.logo_url }; };

const M = (id: string, sport: string, c: number, h: string, a: string, status: Match["status"], startOffset: number, hs: number | null, as: number | null, period: string | null): Match => ({
  id: `fx-match-${id}`, sport_id: sp(sport).id, title: `${tl(h).name} vs ${tl(a).name}`, status, starts_at: iso(startOffset),
  home_score: hs, away_score: as, period, venue: null, country: null, language: "en", data_synced_at: null, provider: "dev-fixture",
  sport: spl(sport), competition: comp(c), home_team: tl(h), away_team: tl(a), isFixture: true,
});
export const fxMatches: Match[] = [
  M("1", "football", 0, "a", "b", "live", -1 * H, 1, 1, "2nd half"),
  M("2", "basketball", 1, "c", "d", "live", -0.75 * H, 54, 49, "3rd quarter"),
  M("3", "cricket", 2, "e", "f", "scheduled", 3 * H, null, null, null),
  M("4", "football", 0, "g", "h", "scheduled", 26 * H, null, null, null),
  M("5", "football", 0, "b", "g", "scheduled", 50 * H, null, null, null),
  M("6", "basketball", 1, "d", "c", "finished", -30 * H, 88, 91, "Final"),
  M("7", "football", 0, "h", "a", "finished", -52 * H, 0, 2, "Full time"),
];

const U = (id: string, username: string, name: string): Profile => ({
  id: `fx-user-${id}`, username, display_name: name, avatar_url: null, bio: "Development fixture profile.", banner_url: null,
  favorite_sports: ["football"], follower_count: 0, role: "streamer", created_at: iso(-90 * 24 * H),
});
export const fxProfiles: Profile[] = [U("1", "sample_studio", "Sample Studio"), U("2", "demo_commentary", "Demo Commentary")];
const pl = (n: number): ProfileLite => { const p = fxProfiles[n]; return { id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, role: p.role, follower_count: p.follower_count }; };

export const FIXTURE_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
export const FIXTURE_MP4 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const S = (id: string, n: number, sport: string, title: string, status: Stream["status"], matchId: string | null, started: number | null): Stream => {
  const m = matchId ? fxMatches.find((x) => x.id === matchId) ?? null : null;
  return {
    id: `fx-stream-${id}`, owner_id: fxProfiles[n].id, match_id: matchId, sport_id: sp(sport).id, title, description: "Development fixture. This is sample content, not a real broadcast.",
    thumbnail_url: null, thumbnail_alt: null, thumbnail_focus_x: 50, thumbnail_focus_y: 50, source_type: "hls", provider: null, provider_stream_id: null,
    playback_ref: FIXTURE_HLS, language: "en", visibility: "public", status, is_published: true, recording_enabled: false, chat_enabled: false,
    chat_slow_mode_seconds: 0, scheduled_start: null, started_at: started == null ? null : iso(started), ended_at: null, source_health: "unknown",
    source_health_detail: null, source_checked_at: null, last_error: null, peak_viewers: 0, created_at: iso(-2 * H), updated_at: iso(-1 * H),
    owner: pl(n), sport: spl(sport),
    match: m && { id: m.id, title: m.title, home_team: m.home_team, away_team: m.away_team, home_score: m.home_score, away_score: m.away_score, status: m.status, competition: m.competition },
    viewers: null, isFixture: true,
  };
};
export const fxStreams: Stream[] = [
  S("1", 0, "football", "Northbridge FC vs Eastport United — sample stream", "live", "fx-match-1", -1 * H),
  S("2", 1, "basketball", "Harbor Hawks vs Summit Wolves — sample stream", "live", "fx-match-2", -0.7 * H),
  S("3", 0, "other", "Sample studio pre-match show", "live", null, -0.3 * H),
];

const V = (id: string, n: number, sport: string, title: string, ageH: number, dur: number): Video => ({
  id: `fx-video-${id}`, stream_id: null, owner_id: fxProfiles[n].id, sport_id: sp(sport).id, title, description: "Development fixture video (Big Buck Bunny test clip).",
  thumbnail_url: null, thumbnail_alt: null, thumbnail_focus_x: 50, thumbnail_focus_y: 50, provider_asset_id: "fixture", duration_seconds: dur, language: "en",
  visibility: "public", processing_status: "ready", published_at: iso(-ageH * H), broadcast_started_at: iso(-ageH * H), view_count: 0,
  created_at: iso(-ageH * H), owner: pl(n), sport: spl(sport), isFixture: true,
});
export const fxVideos: Video[] = [
  V("1", 0, "football", "Sample replay — Redfield Rovers vs Lakeside City", 20, 596),
  V("2", 1, "basketball", "Sample replay — Summit Wolves vs Harbor Hawks", 30, 596),
  V("3", 0, "cricket", "Sample replay — Capital Kings innings", 60, 596),
  V("4", 1, "tennis", "Sample replay — Sample Open semi-final", 90, 596),
];
