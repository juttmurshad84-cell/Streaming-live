-- ArenaLive core schema.
-- Target: Supabase (PostgreSQL 15+). Auth lives in the `auth` schema managed by Supabase.
-- Everything here is idempotent only at the migration-runner level; apply once via `supabase db push`.

-- ───────────────────────── Enums ─────────────────────────
create type public.user_role      as enum ('viewer', 'streamer', 'moderator', 'admin');
create type public.visibility     as enum ('public', 'unlisted', 'private');
create type public.stream_status  as enum ('draft', 'scheduled', 'live', 'ended', 'disabled');
create type public.source_type    as enum (
  'platform_webrtc',  -- browser/mobile camera via WHIP (Cloudflare Stream live input)
  'platform_rtmps',   -- OBS via RTMPS/SRT (Cloudflare Stream live input, recordable)
  'hls', 'dash', 'mp4', 'youtube', 'embed'
);
create type public.source_health  as enum ('unknown', 'healthy', 'degraded', 'failed');
create type public.match_status   as enum ('scheduled', 'live', 'finished', 'postponed', 'cancelled');
create type public.recording_status as enum ('pending', 'recording', 'processing', 'ready', 'failed', 'skipped');
create type public.processing_status as enum ('processing', 'ready', 'failed');
create type public.report_target  as enum ('stream', 'video', 'profile', 'chat_message');
create type public.report_status  as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Profiles ─────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name   text not null check (char_length(display_name) between 1 and 60),
  bio            text check (char_length(bio) <= 500),
  avatar_url     text,
  banner_url     text,
  favorite_sports text[] not null default '{}',
  role           public.user_role not null default 'viewer',
  follower_count integer not null default 0 check (follower_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Non-public account state. Owner can read; only staff/service can write the sensitive parts.
create table public.profile_private (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  notification_prefs jsonb not null default
    '{"live_started": true, "recording_ready": true, "match_reminders": true}'::jsonb,
  rights_agreement_accepted_at timestamptz,
  recording_approved boolean not null default false,
  strikes        integer not null default 0 check (strikes >= 0),
  suspended_at   timestamptz,
  suspended_reason text,
  updated_at     timestamptz not null default now()
);
create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function public.set_updated_at();

-- Role helpers. SECURITY DEFINER + empty search_path so they can be used inside RLS policies.
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('moderator', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_suspended(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select suspended_at is not null from public.profile_private where user_id = uid), false)
$$;

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

-- Internal flag set by trusted SECURITY DEFINER functions (transaction-local).
create or replace function public.internal_bypass() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.internal_bypass', true), '') = 'on'
$$;

-- Prevent privilege escalation: role changes only by admins/service role.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not (public.is_admin() or public.is_service_role() or public.internal_bypass()) then
    raise exception 'only administrators can change roles' using errcode = '42501';
  end if;
  if new.follower_count is distinct from old.follower_count and not public.is_service_role()
     and pg_trigger_depth() <= 1 then
    raise exception 'follower_count is maintained by the system' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.protect_profile_private() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recording_approved is distinct from old.recording_approved
     and not (public.is_admin() or public.is_service_role()) then
    raise exception 'recording approval can only be changed by an admin' using errcode = '42501';
  end if;
  if not (public.is_staff() or public.is_service_role()) then
    if new.recording_approved is distinct from old.recording_approved
       or new.strikes is distinct from old.strikes
       or new.suspended_at is distinct from old.suspended_at
       or new.suspended_reason is distinct from old.suspended_reason then
      raise exception 'account standing can only be changed by staff' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profile_private_protect before update on public.profile_private
  for each row execute function public.protect_profile_private();

-- Create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), candidate), 60));
  insert into public.profile_private (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Viewer → streamer upgrade requires explicit confirmation of publishing rights.
create or replace function public.become_streamer() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if public.is_suspended() then raise exception 'account suspended' using errcode = '42501'; end if;
  update public.profile_private set rights_agreement_accepted_at = coalesce(rights_agreement_accepted_at, now())
   where user_id = auth.uid();
  perform set_config('app.internal_bypass', 'on', true);
  update public.profiles set role = 'streamer' where id = auth.uid() and role = 'viewer';
  perform set_config('app.internal_bypass', 'off', true);
end $$;

-- ───────────────────────── Sports reference data ─────────────────────────
create table public.sports_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  image_url   text,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  provider_sport_name text,            -- name used by the sports-data provider, e.g. "Soccer"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger sports_categories_updated_at before update on public.sports_categories
  for each row execute function public.set_updated_at();

create table public.competitions (
  id          uuid primary key default gen_random_uuid(),
  sport_id    uuid not null references public.sports_categories (id) on delete restrict,
  name        text not null,
  slug        text not null,
  country     text,
  logo_url    text,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  provider    text,
  external_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (sport_id, slug),
  unique (provider, external_id)
);
create trigger competitions_updated_at before update on public.competitions
  for each row execute function public.set_updated_at();

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  sport_id    uuid not null references public.sports_categories (id) on delete restrict,
  name        text not null,
  short_name  text,
  logo_url    text,
  country     text,
  provider    text,
  external_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (provider, external_id)
);
create index teams_name_idx on public.teams (lower(name));
create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  sport_id       uuid not null references public.sports_categories (id) on delete restrict,
  competition_id uuid references public.competitions (id) on delete set null,
  home_team_id   uuid references public.teams (id) on delete set null,
  away_team_id   uuid references public.teams (id) on delete set null,
  title          text not null,
  status         public.match_status not null default 'scheduled',
  starts_at      timestamptz not null,
  home_score     integer,
  away_score     integer,
  period         text,                 -- e.g. "2nd half", "Set 3"
  venue          text,
  country        text,
  language       text,
  provider       text,
  external_id    text,
  data_synced_at timestamptz,          -- freshness indicator for scores/status
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (provider, external_id)
);
create index matches_status_start_idx on public.matches (status, starts_at);
create index matches_sport_start_idx on public.matches (sport_id, starts_at);
create index matches_competition_idx on public.matches (competition_id);
create index matches_home_idx on public.matches (home_team_id);
create index matches_away_idx on public.matches (away_team_id);
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- ───────────────────────── Streams ─────────────────────────
create table public.streams (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  match_id         uuid references public.matches (id) on delete set null,
  sport_id         uuid not null references public.sports_categories (id) on delete restrict,
  title            text not null check (char_length(title) between 3 and 120),
  description      text check (char_length(description) <= 5000),
  thumbnail_url    text,
  thumbnail_alt    text check (char_length(thumbnail_alt) <= 200),
  thumbnail_focus_x numeric(5,2) not null default 50 check (thumbnail_focus_x between 0 and 100),
  thumbnail_focus_y numeric(5,2) not null default 50 check (thumbnail_focus_y between 0 and 100),
  source_type      public.source_type not null,
  provider         text,                         -- 'cloudflare' for platform sources
  provider_stream_id text,                       -- live input uid (NOT a secret)
  playback_ref     text,                         -- external URL / YouTube id / embed URL
  language         text check (language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  visibility       public.visibility not null default 'public',
  status           public.stream_status not null default 'draft',
  is_published     boolean not null default false,
  recording_enabled boolean not null default true,
  chat_enabled     boolean not null default true,
  chat_slow_mode_seconds integer not null default 0 check (chat_slow_mode_seconds between 0 and 300),
  scheduled_start  timestamptz,
  started_at       timestamptz,
  ended_at         timestamptz,
  source_health    public.source_health not null default 'unknown',
  source_health_detail text,
  source_checked_at timestamptz,
  last_error       text,
  peak_viewers     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (source_type not in ('platform_webrtc', 'platform_rtmps') or provider_stream_id is not null),
  check (source_type in ('platform_webrtc', 'platform_rtmps') or playback_ref is not null)
);
create unique index streams_provider_stream_uidx on public.streams (provider, provider_stream_id)
  where provider_stream_id is not null;
create index streams_owner_idx on public.streams (owner_id, created_at desc);
create index streams_discovery_idx on public.streams (status, visibility, is_published, started_at desc);
create index streams_sport_idx on public.streams (sport_id);
create index streams_match_idx on public.streams (match_id);
create trigger streams_updated_at before update on public.streams
  for each row execute function public.set_updated_at();

-- Owners may not forge lifecycle/provider fields. Webhooks use the service role.
create or replace function public.protect_stream_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_service_role() or public.internal_bypass() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'scheduled') then
      raise exception 'new streams must start as draft or scheduled' using errcode = '42501';
    end if;
    if new.provider is not null or new.provider_stream_id is not null or new.source_health <> 'unknown' then
      raise exception 'provider fields are system-managed' using errcode = '42501';
    end if;
    new.recording_enabled := false; -- recording is granted by the server after policy/quota checks
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then
    raise exception 'owner cannot be changed' using errcode = '42501';
  end if;
  if new.provider is distinct from old.provider
     or new.provider_stream_id is distinct from old.provider_stream_id
     or new.started_at is distinct from old.started_at
     or new.ended_at is distinct from old.ended_at
     or new.source_health is distinct from old.source_health
     or new.peak_viewers is distinct from old.peak_viewers
     or new.recording_enabled is distinct from old.recording_enabled
     or new.last_error is distinct from old.last_error then
    raise exception 'lifecycle/provider fields are system-managed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    -- Owners may move between draft/scheduled. Staff may also disable/re-enable.
    if not (new.status in ('draft', 'scheduled') and old.status in ('draft', 'scheduled'))
       and not (public.is_staff() and (new.status = 'disabled' or old.status = 'disabled')) then
      raise exception 'status is system-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger streams_protect before insert or update on public.streams
  for each row execute function public.protect_stream_columns();

create table public.stream_viewer_sessions (
  id           uuid primary key default gen_random_uuid(),
  stream_id    uuid not null references public.streams (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  session_key  text not null check (char_length(session_key) between 16 and 64),
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (stream_id, session_key)
);
create index stream_viewer_sessions_live_idx on public.stream_viewer_sessions (stream_id, last_seen_at desc);

-- ───────────────────────── Recordings & videos ─────────────────────────
create table public.stream_recordings (
  id                    uuid primary key default gen_random_uuid(),
  stream_id             uuid not null references public.streams (id) on delete cascade,
  owner_id              uuid not null references public.profiles (id) on delete cascade,
  provider              text not null default 'cloudflare',
  provider_recording_id text,                           -- Cloudflare video uid of the recording
  status                public.recording_status not null default 'pending',
  started_at            timestamptz,
  ended_at              timestamptz,
  duration_seconds      numeric(12,2) check (duration_seconds is null or duration_seconds >= 0),
  processing_status     text,
  error                 text,
  storage_ref           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, provider_recording_id)
);
create index stream_recordings_stream_idx on public.stream_recordings (stream_id);
create index stream_recordings_owner_idx on public.stream_recordings (owner_id, created_at desc);
create trigger stream_recordings_updated_at before update on public.stream_recordings
  for each row execute function public.set_updated_at();

create table public.videos (
  id                uuid primary key default gen_random_uuid(),
  stream_id         uuid references public.streams (id) on delete set null,
  recording_id      uuid references public.stream_recordings (id) on delete set null,
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  sport_id          uuid references public.sports_categories (id) on delete set null,
  title             text not null check (char_length(title) between 1 and 120),
  description       text check (char_length(description) <= 5000),
  thumbnail_url     text,
  thumbnail_alt     text check (char_length(thumbnail_alt) <= 200),
  thumbnail_focus_x numeric(5,2) not null default 50,
  thumbnail_focus_y numeric(5,2) not null default 50,
  provider          text not null default 'cloudflare',
  provider_asset_id text not null,                      -- Cloudflare video uid
  playback_ref      text,                               -- HLS manifest path (unsigned form) for reference
  duration_seconds  numeric(12,2) check (duration_seconds is null or duration_seconds >= 0),
  language          text,
  visibility        public.visibility not null default 'public',
  processing_status public.processing_status not null default 'processing',
  published_at      timestamptz,
  broadcast_started_at timestamptz,
  view_count        bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_asset_id),
  -- Never publish an incomplete recording.
  check (published_at is null or processing_status = 'ready')
);
create index videos_owner_idx on public.videos (owner_id, created_at desc);
create index videos_discovery_idx on public.videos (visibility, processing_status, published_at desc);
create index videos_popular_idx on public.videos (view_count desc) where processing_status = 'ready';
create index videos_sport_idx on public.videos (sport_id);
create trigger videos_updated_at before update on public.videos
  for each row execute function public.set_updated_at();

create or replace function public.protect_video_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_service_role() or public.internal_bypass() then return new; end if;
  if new.provider is distinct from old.provider
     or new.provider_asset_id is distinct from old.provider_asset_id
     or new.playback_ref is distinct from old.playback_ref
     or new.processing_status is distinct from old.processing_status
     or new.published_at is distinct from old.published_at
     or new.view_count is distinct from old.view_count
     or new.owner_id is distinct from old.owner_id
     or new.duration_seconds is distinct from old.duration_seconds then
    raise exception 'system-managed video fields cannot be edited' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger videos_protect before update on public.videos
  for each row execute function public.protect_video_columns();

-- ───────────────────────── Social ─────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  streamer_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, streamer_id),
  check (follower_id <> streamer_id)
);
create index follows_streamer_idx on public.follows (streamer_id);

create or replace function public.sync_follower_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.streamer_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.streamer_id;
  end if;
  return null;
end $$;
create trigger follows_count after insert or delete on public.follows
  for each row execute function public.sync_follower_count();

create table public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  stream_id  uuid references public.streams (id) on delete cascade,
  video_id   uuid references public.videos (id) on delete cascade,
  team_id    uuid references public.teams (id) on delete cascade,
  sport_id   uuid references public.sports_categories (id) on delete cascade,
  match_id   uuid references public.matches (id) on delete cascade,  -- match reminder/save
  created_at timestamptz not null default now(),
  check (num_nonnulls(stream_id, video_id, team_id, sport_id, match_id) = 1)
);
create unique index favorites_stream_uidx on public.favorites (user_id, stream_id) where stream_id is not null;
create unique index favorites_video_uidx  on public.favorites (user_id, video_id)  where video_id is not null;
create unique index favorites_team_uidx   on public.favorites (user_id, team_id)   where team_id is not null;
create unique index favorites_sport_uidx  on public.favorites (user_id, sport_id)  where sport_id is not null;
create unique index favorites_match_uidx  on public.favorites (user_id, match_id)  where match_id is not null;
create index favorites_user_idx on public.favorites (user_id, created_at desc);

create table public.match_reminders (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  match_id   uuid not null references public.matches (id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index match_reminders_pending_idx on public.match_reminders (match_id) where notified_at is null;

-- ───────────────────────── Chat ─────────────────────────
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  stream_id  uuid not null references public.streams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index chat_messages_stream_idx on public.chat_messages (stream_id, created_at desc);
create index chat_messages_user_idx on public.chat_messages (user_id, created_at desc);

create table public.chat_mutes (
  stream_id  uuid not null references public.streams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  muted_by   uuid references public.profiles (id) on delete set null,
  reason     text,
  until      timestamptz,                  -- null = until lifted
  created_at timestamptz not null default now(),
  primary key (stream_id, user_id)
);

create table public.user_blocks (          -- viewer-level "hide this user" in chat
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ───────────────────────── Notifications ─────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('stream_live', 'recording_ready', 'recording_failed', 'match_reminder', 'moderation', 'system')),
  title      text not null,
  body       text,
  link       text,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create unique index notifications_dedupe_uidx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ───────────────────────── Moderation & compliance ─────────────────────────
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id   uuid not null,
  reason      text not null check (reason in ('spam', 'abuse', 'copyright', 'illegal', 'violence', 'other')),
  details     text check (char_length(details) <= 2000),
  status      public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at  timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create unique index reports_one_open_per_reporter_uidx
  on public.reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');

create table public.copyright_complaints (
  id            uuid primary key default gen_random_uuid(),
  complainant_name  text not null,
  complainant_email text not null,
  company       text,
  work_description text not null,
  infringing_urls text[] not null check (cardinality(infringing_urls) between 1 and 20),
  good_faith_statement boolean not null check (good_faith_statement),
  accuracy_statement boolean not null check (accuracy_statement),
  signature     text not null,
  stream_id     uuid references public.streams (id) on delete set null,
  video_id      uuid references public.videos (id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'reviewing', 'upheld', 'rejected', 'counter_notice')),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  resolution_note text,
  created_at    timestamptz not null default now()
);
create index copyright_complaints_status_idx on public.copyright_complaints (status, created_at desc);

create table public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  reason      text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

-- Provider webhooks (idempotency ledger).
create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_key    text not null,               -- provider event id or deterministic hash
  event_type   text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, event_key)
);

create table public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value) values
  ('recording', '{"policy": "all_streamers", "max_duration_minutes": 480, "retention_days": 90, "per_user_quota_minutes": 3000, "reconnect_window_seconds": 60}'::jsonb)
on conflict do nothing;

-- ───────────────────────── Realtime / RPC ─────────────────────────
-- Concurrent viewers: sessions that pinged within the last 45 seconds.
create or replace function public.viewer_heartbeat(p_stream uuid, p_key text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if p_key is null or char_length(p_key) < 16 then raise exception 'invalid session key'; end if;
  if not exists (select 1 from public.streams s where s.id = p_stream and s.status = 'live') then return 0; end if;
  insert into public.stream_viewer_sessions (stream_id, user_id, session_key)
  values (p_stream, auth.uid(), p_key)
  on conflict (stream_id, session_key) do update set last_seen_at = now();
  select count(*) into n from public.stream_viewer_sessions
   where stream_id = p_stream and last_seen_at > now() - interval '45 seconds';
  perform set_config('app.internal_bypass', 'on', true);
  update public.streams set peak_viewers = greatest(peak_viewers, n) where id = p_stream and peak_viewers < n;
  perform set_config('app.internal_bypass', 'off', true);
  return n;
end $$;

create or replace function public.viewer_counts(p_streams uuid[]) returns table (stream_id uuid, viewers integer)
language sql stable security definer set search_path = '' as $$
  select s.stream_id, count(*)::int
    from public.stream_viewer_sessions s
   where s.stream_id = any (p_streams) and s.last_seen_at > now() - interval '45 seconds'
   group by s.stream_id
$$;

create or replace function public.sport_event_counts() returns table (sport_id uuid, live_count integer, upcoming_count integer, total_count integer)
language sql stable set search_path = '' as $$
  select m.sport_id,
         count(*) filter (where m.status = 'live')::int,
         count(*) filter (where m.status = 'scheduled' and m.starts_at > now())::int,
         count(*)::int
    from public.matches m
   group by m.sport_id
$$;

-- Chat: single entry point so rate limiting, slow mode, mutes and abuse checks cannot be bypassed.
create or replace function public.post_chat_message(p_stream uuid, p_body text) returns public.chat_messages
language plpgsql security definer set search_path = '' as $$
declare
  s public.streams;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  last_at timestamptz;
  recent int;
  links int;
  msg public.chat_messages;
begin
  if auth.uid() is null then raise exception 'sign in to chat' using errcode = '28000'; end if;
  if public.is_suspended() then raise exception 'account suspended' using errcode = '42501'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then raise exception 'message must be 1-500 characters'; end if;

  select * into s from public.streams where id = p_stream;
  if not found or s.status <> 'live' or not s.chat_enabled then
    raise exception 'chat is not available for this stream';
  end if;
  if s.visibility = 'private' and s.owner_id <> auth.uid() and not public.is_staff() then
    raise exception 'chat is not available for this stream';
  end if;
  if exists (select 1 from public.chat_mutes m
              where m.stream_id = p_stream and m.user_id = auth.uid() and (m.until is null or m.until > now())) then
    raise exception 'you are muted in this chat' using errcode = '42501';
  end if;

  -- rate limit: 5 messages / 10s, 40 / minute (per user, all streams)
  select count(*) into recent from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'you are sending messages too quickly'; end if;
  select count(*) into recent from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '1 minute';
  if recent >= 40 then raise exception 'rate limit exceeded, slow down'; end if;

  -- slow mode (owner/staff exempt)
  if s.chat_slow_mode_seconds > 0 and s.owner_id <> auth.uid() and not public.is_staff() then
    select max(created_at) into last_at from public.chat_messages where stream_id = p_stream and user_id = auth.uid();
    if last_at is not null and last_at > now() - make_interval(secs => s.chat_slow_mode_seconds) then
      raise exception 'slow mode is on: wait % seconds between messages', s.chat_slow_mode_seconds;
    end if;
  end if;

  -- basic spam heuristics: duplicate message within 30s, too many links, shouting walls of repeated chars
  if exists (select 1 from public.chat_messages where user_id = auth.uid() and stream_id = p_stream
              and lower(chat_messages.body) = lower(v_body) and created_at > now() - interval '30 seconds' and deleted_at is null) then
    raise exception 'duplicate message';
  end if;
  links := (select count(*) from regexp_matches(v_body, '(https?://|www\.)', 'gi'));
  if links > 2 then raise exception 'too many links'; end if;
  if v_body ~ '(.)\1{14,}' then raise exception 'message looks like spam'; end if;

  insert into public.chat_messages (stream_id, user_id, body) values (p_stream, auth.uid(), v_body) returning * into msg;
  return msg;
end $$;

create or replace function public.delete_chat_message(p_message uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_messages;
  s public.streams;
begin
  select * into m from public.chat_messages where id = p_message;
  if not found then raise exception 'message not found'; end if;
  select * into s from public.streams where id = m.stream_id;
  if not (auth.uid() = m.user_id or auth.uid() = s.owner_id or public.is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.chat_messages set deleted_at = now(), deleted_by = auth.uid() where id = p_message and deleted_at is null;
  if auth.uid() <> m.user_id then
    insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, metadata)
    values (auth.uid(), 'chat_message_deleted', 'chat_message', p_message::text, p_reason, jsonb_build_object('stream_id', m.stream_id, 'author', m.user_id));
  end if;
end $$;

create or replace function public.mute_chat_user(p_stream uuid, p_user uuid, p_minutes integer default null, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.streams;
begin
  select * into s from public.streams where id = p_stream;
  if not found then raise exception 'stream not found'; end if;
  if not (auth.uid() = s.owner_id or public.is_staff()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user = s.owner_id then raise exception 'cannot mute the streamer'; end if;
  if p_user = auth.uid() then raise exception 'cannot mute yourself'; end if;
  insert into public.chat_mutes (stream_id, user_id, muted_by, reason, until)
  values (p_stream, p_user, auth.uid(), p_reason, case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end)
  on conflict (stream_id, user_id) do update set muted_by = excluded.muted_by, reason = excluded.reason, until = excluded.until, created_at = now();
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'chat_user_muted', 'profile', p_user::text, p_reason, jsonb_build_object('stream_id', p_stream, 'minutes', p_minutes));
end $$;

create or replace function public.unmute_chat_user(p_stream uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.streams;
begin
  select * into s from public.streams where id = p_stream;
  if not found then raise exception 'stream not found'; end if;
  if not (auth.uid() = s.owner_id or public.is_staff()) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.chat_mutes where stream_id = p_stream and user_id = p_user;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'chat_user_unmuted', 'profile', p_user::text, jsonb_build_object('stream_id', p_stream));
end $$;

-- Fan-out "went live" notifications to followers (service role only).
create or replace function public.notify_followers_live(p_stream uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.streams;
  owner_name text;
  n integer;
begin
  select * into s from public.streams where id = p_stream;
  if not found or not s.is_published or s.visibility <> 'public' then return 0; end if;
  select display_name into owner_name from public.profiles where id = s.owner_id;
  with ins as (
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    select f.follower_id, 'stream_live', owner_name || ' is live', s.title, '/watch/' || s.id::text, 'live:' || s.id::text || ':' || coalesce(s.started_at::text, '')
      from public.follows f
      join public.profile_private pp on pp.user_id = f.follower_id
     where f.streamer_id = s.owner_id and coalesce((pp.notification_prefs ->> 'live_started')::boolean, true)
    on conflict do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- Remind users who opted in about matches starting within `p_window`.
create or replace function public.dispatch_match_reminders(p_window interval default interval '30 minutes') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with due as (
    select r.user_id, r.match_id, m.title, m.starts_at
      from public.match_reminders r
      join public.matches m on m.id = r.match_id
      join public.profile_private pp on pp.user_id = r.user_id
     where r.notified_at is null and m.status = 'scheduled'
       and m.starts_at <= now() + p_window and m.starts_at > now() - interval '10 minutes'
       and coalesce((pp.notification_prefs ->> 'match_reminders')::boolean, true)
  ), ins as (
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    select user_id, 'match_reminder', 'Starting soon: ' || title, 'Kick-off at ' || to_char(starts_at at time zone 'UTC', 'HH24:MI "UTC"'), '/matches/' || match_id::text, 'reminder:' || match_id::text
      from due
    on conflict do nothing
    returning 1)
  select count(*) into n from ins;
  update public.match_reminders r set notified_at = now()
   where r.notified_at is null
     and exists (select 1 from public.matches m where m.id = r.match_id and m.starts_at <= now() + p_window);
  return n;
end $$;

-- Staff moderation helpers (all logged).
create or replace function public.set_account_suspension(p_user uuid, p_suspend boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'you cannot suspend yourself'; end if;
  update public.profile_private
     set suspended_at = case when p_suspend then now() else null end,
         suspended_reason = case when p_suspend then p_reason else null end
   where user_id = p_user;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), case when p_suspend then 'account_suspended' else 'account_restored' end, 'profile', p_user::text, p_reason);
end $$;

create or replace function public.set_user_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  update public.profiles set role = p_role where id = p_user;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'role_changed', 'profile', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.add_strike(p_user uuid, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  update public.profile_private set strikes = strikes + 1 where user_id = p_user returning strikes into n;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'strike_added', 'profile', p_user::text, p_reason, jsonb_build_object('strikes', n));
  -- Repeat-infringer policy: three strikes suspends the account.
  if n >= 3 then
    update public.profile_private set suspended_at = coalesce(suspended_at, now()), suspended_reason = 'Repeat infringer policy (3 strikes)' where user_id = p_user;
    insert into public.moderation_actions (actor_id, action, target_type, target_id, reason)
    values (auth.uid(), 'account_suspended', 'profile', p_user::text, 'Repeat infringer policy (3 strikes)');
  end if;
  return n;
end $$;

create or replace function public.log_moderation_action(p_action text, p_target_type text, p_target_id text, p_reason text default null, p_metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_staff() or public.is_service_role()) then raise exception 'staff only' using errcode = '42501'; end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, p_metadata);
end $$;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.profiles             enable row level security;
alter table public.profile_private      enable row level security;
alter table public.sports_categories    enable row level security;
alter table public.competitions         enable row level security;
alter table public.teams                enable row level security;
alter table public.matches              enable row level security;
alter table public.streams              enable row level security;
alter table public.stream_viewer_sessions enable row level security;
alter table public.stream_recordings    enable row level security;
alter table public.videos               enable row level security;
alter table public.follows              enable row level security;
alter table public.favorites            enable row level security;
alter table public.match_reminders      enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.chat_mutes           enable row level security;
alter table public.user_blocks          enable row level security;
alter table public.notifications        enable row level security;
alter table public.reports              enable row level security;
alter table public.copyright_complaints enable row level security;
alter table public.moderation_actions   enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.site_settings        enable row level security;

-- profiles: public read; owner edits own non-privileged columns; admin edits all.
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() and not public.is_suspended()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy profile_private_read on public.profile_private for select using (user_id = auth.uid() or public.is_staff());
create policy profile_private_update_own on public.profile_private for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profile_private_update_staff on public.profile_private for update using (public.is_staff()) with check (public.is_staff());

-- reference data: public read, admin write
create policy sports_read on public.sports_categories for select using (is_active or public.is_staff());
create policy sports_admin on public.sports_categories for all using (public.is_admin()) with check (public.is_admin());
create policy competitions_read on public.competitions for select using (true);
create policy competitions_admin on public.competitions for all using (public.is_admin()) with check (public.is_admin());
create policy teams_read on public.teams for select using (true);
create policy teams_admin on public.teams for all using (public.is_admin()) with check (public.is_admin());
create policy matches_read on public.matches for select using (true);
create policy matches_admin on public.matches for all using (public.is_admin()) with check (public.is_admin());

-- streams: PUBLIC + published listings readable by everyone; unlisted/private only by owner/staff
-- (unlisted links are resolved server-side after an explicit access check).
create policy streams_read on public.streams for select using (
  (is_published and visibility = 'public' and status <> 'disabled')
  or owner_id = auth.uid() or public.is_staff()
);
create policy streams_insert on public.streams for insert with check (
  owner_id = auth.uid()
  and public.app_role() in ('streamer', 'moderator', 'admin')
  and not public.is_suspended()
);
create policy streams_update on public.streams for update
  using ((owner_id = auth.uid() and not public.is_suspended()) or public.is_staff())
  with check ((owner_id = auth.uid() and not public.is_suspended()) or public.is_staff());
create policy streams_delete on public.streams for delete using (
  (owner_id = auth.uid() and status <> 'live') or public.is_admin()
);

-- viewer sessions: only via RPC (no policies = no direct access).
-- recordings: owner/staff can read; writes by service role only.
create policy recordings_read on public.stream_recordings for select using (owner_id = auth.uid() or public.is_staff());

-- videos
create policy videos_read on public.videos for select using (
  (visibility = 'public' and processing_status = 'ready' and published_at is not null)
  or owner_id = auth.uid() or public.is_staff()
);
create policy videos_update on public.videos for update
  using ((owner_id = auth.uid() and not public.is_suspended()) or public.is_staff())
  with check ((owner_id = auth.uid() and not public.is_suspended()) or public.is_staff());
-- Deletion is performed server-side so the provider asset is removed too (no delete policy).

-- follows / favorites / reminders / blocks
create policy follows_read on public.follows for select using (follower_id = auth.uid() or streamer_id = auth.uid() or public.is_staff());
create policy follows_insert on public.follows for insert with check (follower_id = auth.uid() and not public.is_suspended());
create policy follows_delete on public.follows for delete using (follower_id = auth.uid());

create policy favorites_all on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_suspended());
create policy reminders_all on public.match_reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_all on public.user_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- chat: readable if the stream is readable (RLS on streams applies to this sub-select); writes only through RPC.
create policy chat_read on public.chat_messages for select using (
  exists (select 1 from public.streams s where s.id = chat_messages.stream_id)
);
create policy chat_mutes_read on public.chat_mutes for select using (
  user_id = auth.uid() or public.is_staff()
  or exists (select 1 from public.streams s where s.id = chat_mutes.stream_id and s.owner_id = auth.uid())
);

-- notifications: owner reads, and may only change read_at (column grant below)
create policy notifications_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- reports
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid() and not public.is_suspended());
create policy reports_read on public.reports for select using (reporter_id = auth.uid() or public.is_staff());
create policy reports_staff_update on public.reports for update using (public.is_staff()) with check (public.is_staff());

create policy copyright_staff_read on public.copyright_complaints for select using (public.is_staff());
create policy copyright_staff_update on public.copyright_complaints for update using (public.is_staff()) with check (public.is_staff());
-- inserts happen server-side (service role) after validation and rate limiting.

create policy moderation_staff_read on public.moderation_actions for select using (public.is_staff());
create policy settings_staff_read on public.site_settings for select using (public.is_staff());
create policy settings_admin_write on public.site_settings for all using (public.is_admin()) with check (public.is_admin());
-- webhook_events: no policies — service role only.

-- ───────────────────────── Grants ─────────────────────────
-- Supabase grants broad defaults to anon/authenticated; tighten where RLS alone is not enough.
revoke all on public.webhook_events from anon, authenticated;
revoke all on public.stream_viewer_sessions from anon, authenticated;
revoke all on public.copyright_complaints from anon, authenticated;
grant select, update on public.copyright_complaints to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.chat_messages from anon, authenticated;
revoke insert, update, delete on public.chat_mutes from anon, authenticated;
revoke insert, update, delete on public.moderation_actions from anon, authenticated;
revoke insert, update, delete on public.stream_recordings from anon, authenticated;
revoke insert, delete on public.videos from anon, authenticated;

revoke execute on function public.notify_followers_live(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_match_reminders(interval) from public, anon, authenticated;
revoke execute on function public.viewer_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.notify_followers_live(uuid) to service_role;
grant execute on function public.dispatch_match_reminders(interval) to service_role;
grant execute on function public.viewer_counts(uuid[]) to service_role;
revoke execute on function public.post_chat_message(uuid, text) from public, anon;
revoke execute on function public.delete_chat_message(uuid, text) from public, anon;
revoke execute on function public.mute_chat_user(uuid, uuid, integer, text) from public, anon;
revoke execute on function public.unmute_chat_user(uuid, uuid) from public, anon;
revoke execute on function public.become_streamer() from public, anon;
revoke execute on function public.set_account_suspension(uuid, boolean, text) from public, anon;
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
revoke execute on function public.add_strike(uuid, text) from public, anon;
revoke execute on function public.log_moderation_action(text, text, text, text, jsonb) from public, anon;

grant execute on function public.post_chat_message(uuid, text) to authenticated;
grant execute on function public.delete_chat_message(uuid, text) to authenticated;
grant execute on function public.mute_chat_user(uuid, uuid, integer, text) to authenticated;
grant execute on function public.unmute_chat_user(uuid, uuid) to authenticated;
grant execute on function public.become_streamer() to authenticated;
grant execute on function public.set_account_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.add_strike(uuid, text) to authenticated;
grant execute on function public.log_moderation_action(text, text, text, text, jsonb) to authenticated, service_role;
