export type UserRole = "viewer" | "streamer" | "moderator" | "admin";
export type Visibility = "public" | "unlisted" | "private";
export type StreamStatus = "draft" | "scheduled" | "live" | "ended" | "disabled";
export type SourceType = "platform_webrtc" | "platform_rtmps" | "hls" | "dash" | "mp4" | "youtube" | "embed";
export type SourceHealth = "unknown" | "healthy" | "degraded" | "failed";
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";
export type RecordingStatus = "pending" | "recording" | "processing" | "ready" | "failed" | "skipped";
export type ProcessingStatus = "processing" | "ready" | "failed";

export interface ProfileLite {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role?: UserRole;
  follower_count?: number;
}
export interface Profile extends ProfileLite {
  bio: string | null;
  banner_url: string | null;
  favorite_sports: string[];
  follower_count: number;
  role: UserRole;
  created_at: string;
}
export interface Sport {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  provider_sport_name?: string | null;
}
export interface SportWithCounts extends Sport {
  live_count: number;
  upcoming_count: number;
  total_count: number;
}
export interface Competition {
  id: string;
  sport_id: string;
  name: string;
  slug: string;
  country: string | null;
  logo_url: string | null;
  is_active: boolean;
  sort_order: number;
}
export interface Team {
  id: string;
  sport_id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
}
export interface Match {
  id: string;
  sport_id: string;
  title: string;
  status: MatchStatus;
  starts_at: string;
  home_score: number | null;
  away_score: number | null;
  period: string | null;
  venue: string | null;
  country: string | null;
  language: string | null;
  data_synced_at: string | null;
  provider: string | null;
  sport: Pick<Sport, "slug" | "name"> | null;
  competition: Pick<Competition, "id" | "name" | "slug" | "logo_url"> | null;
  home_team: Pick<Team, "id" | "name" | "short_name" | "logo_url"> | null;
  away_team: Pick<Team, "id" | "name" | "short_name" | "logo_url"> | null;
  isFixture?: boolean;
}
export interface Stream {
  id: string;
  owner_id: string;
  match_id: string | null;
  sport_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  thumbnail_focus_x: number;
  thumbnail_focus_y: number;
  source_type: SourceType;
  provider: string | null;
  provider_stream_id: string | null;
  playback_ref: string | null;
  language: string | null;
  visibility: Visibility;
  status: StreamStatus;
  is_published: boolean;
  recording_enabled: boolean;
  chat_enabled: boolean;
  chat_slow_mode_seconds: number;
  scheduled_start: string | null;
  started_at: string | null;
  ended_at: string | null;
  source_health: SourceHealth;
  source_health_detail: string | null;
  source_checked_at: string | null;
  last_error: string | null;
  peak_viewers: number;
  created_at: string;
  updated_at: string;
  owner: ProfileLite | null;
  sport: Pick<Sport, "slug" | "name"> | null;
  match: Pick<Match, "id" | "title" | "home_team" | "away_team" | "home_score" | "away_score" | "status" | "competition"> | null;
  viewers: number | null;
  isFixture?: boolean;
}
export interface Video {
  id: string;
  stream_id: string | null;
  owner_id: string;
  sport_id: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  thumbnail_focus_x: number;
  thumbnail_focus_y: number;
  provider_asset_id: string;
  duration_seconds: number | null;
  language: string | null;
  visibility: Visibility;
  processing_status: ProcessingStatus;
  published_at: string | null;
  broadcast_started_at: string | null;
  view_count: number;
  created_at: string;
  owner: ProfileLite | null;
  sport: Pick<Sport, "slug" | "name"> | null;
  isFixture?: boolean;
}
export interface Recording {
  id: string;
  stream_id: string;
  provider_recording_id: string | null;
  status: RecordingStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  processing_status: string | null;
  error: string | null;
  created_at: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
export interface CurrentUser {
  id: string;
  email: string | null;
  profile: Profile;
  suspended: boolean;
  rightsAccepted: boolean;
  notificationPrefs: { live_started: boolean; recording_ready: boolean; match_reminders: boolean };
}
