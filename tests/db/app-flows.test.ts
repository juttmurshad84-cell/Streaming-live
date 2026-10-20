import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { anon, as, createDb, createUser, run, service } from "./harness";

/** Replays the exact database writes our server actions perform, under the role each one uses. */
let db: PGlite;
let owner: string, viewer: string, mod: string, admin: string, sport: string;
let ext: string; // external stream owned by `owner`

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "o@x.io", "owner");
  viewer = await createUser(db, "v@x.io", "viewer1");
  mod = await createUser(db, "m@x.io", "mod");
  admin = await createUser(db, "a@x.io", "admin");
  await run(db, service, "update profiles set role='moderator' where id=$1", [mod]);
  await run(db, service, "update profiles set role='admin' where id=$1", [admin]);
  sport = (await db.query<{ id: string }>("select id from sports_categories where slug='cricket'")).rows[0].id;
  await run(db, as(owner), "select become_streamer()");
}, 60_000);

describe("createStreamAction writes", () => {
  it("platform stream via service role (provider fields + recording) works", async () => {
    const r = await run(db, service, "insert into streams (owner_id, sport_id, title, source_type, provider, provider_stream_id, recording_enabled, visibility, status, is_published) values ($1,$2,'Platform stream','platform_rtmps','cloudflare','uid1',true,'public','draft',false) returning recording_enabled", [owner, sport]);
    expect(r[0]).toEqual({ recording_enabled: true });
  });
  it("owner cannot insert provider fields or non-unknown health directly", async () => {
    await expect(run(db, as(owner), "insert into streams (owner_id, sport_id, title, source_type, provider, provider_stream_id) values ($1,$2,'xxxx','platform_rtmps','cloudflare','evil')", [owner, sport])).rejects.toThrow();
    await expect(run(db, as(owner), "insert into streams (owner_id, sport_id, title, source_type, playback_ref, source_health) values ($1,$2,'xxxx','hls','https://a/b.m3u8','healthy')", [owner, sport])).rejects.toThrow();
  });
  it("external stream via user client: recording_enabled is forced off", async () => {
    const r = await run<{ id: string; recording_enabled: boolean }>(db, as(owner), "insert into streams (owner_id, sport_id, title, source_type, playback_ref, recording_enabled, status) values ($1,$2,'External stream','hls','https://a/b.m3u8',true,'draft') returning id, recording_enabled", [owner, sport]);
    expect(r[0].recording_enabled).toBe(false);
    ext = r[0].id;
  });
  it("service role records validated source health afterwards", async () => {
    const r = await run(db, service, "update streams set source_health='healthy', source_health_detail='ok', source_checked_at=now() where id=$1 returning source_health", [ext]);
    expect(r[0]).toEqual({ source_health: "healthy" });
  });
  it("a viewer cannot insert a stream", async () => {
    await expect(run(db, as(viewer), "insert into streams (owner_id, sport_id, title, source_type, playback_ref) values ($1,$2,'xxxx','hls','https://a/b.m3u8')", [viewer, sport])).rejects.toThrow();
  });
});

describe("updateStreamAction / publish writes", () => {
  it("owner can edit listing fields, publish, and move draft→scheduled", async () => {
    const r = await run(db, as(owner), "update streams set title='New', description='d', visibility='unlisted', thumbnail_alt='a', thumbnail_focus_x=10, chat_slow_mode_seconds=5, scheduled_start=now()+interval '1 day', is_published=true, status='scheduled' where id=$1 returning title", [ext]);
    expect(r).toHaveLength(1);
  });
  it("owner cannot toggle recording_enabled, status=live, or health", async () => {
    await expect(run(db, as(owner), "update streams set recording_enabled=true where id=$1", [ext])).rejects.toThrow();
    await expect(run(db, as(owner), "update streams set status='live' where id=$1", [ext])).rejects.toThrow();
    await expect(run(db, as(owner), "update streams set source_health='degraded' where id=$1", [ext])).rejects.toThrow();
  });
  it("another user cannot edit it (0 rows)", async () => {
    expect(await run(db, as(viewer), "update streams set title='hack' where id=$1 returning id", [ext])).toHaveLength(0);
  });
});

describe("staff & admin actions", () => {
  it("moderator can disable and re-enable a stream with the user client", async () => {
    expect(await run(db, as(mod), "update streams set status='disabled', is_published=false where id=$1 returning id", [ext])).toHaveLength(1);
    expect(await run(db, as(mod), "update streams set status='draft' where id=$1 returning id", [ext])).toHaveLength(1);
  });
  it("owner cannot re-enable a disabled stream", async () => {
    await run(db, as(mod), "update streams set status='disabled' where id=$1", [ext]);
    await expect(run(db, as(owner), "update streams set status='draft' where id=$1", [ext])).rejects.toThrow();
    await run(db, as(mod), "update streams set status='draft' where id=$1", [ext]);
  });
  it("admin sets recording approval + audit log via rpc; moderator cannot approve", async () => {
    expect(await run(db, as(admin), "update profile_private set recording_approved=true where user_id=$1 returning user_id", [owner])).toHaveLength(1);
    await expect(run(db, as(mod), "update profile_private set recording_approved=false where user_id=$1", [owner])).rejects.toThrow();
    await expect(run(db, as(owner), "update profile_private set recording_approved=false where user_id=$1", [owner])).rejects.toThrow();
    await run(db, as(admin), "select log_moderation_action('recording_approved','profile',$1)", [owner]);
    const log = await run(db, service, "select action from moderation_actions where target_id=$1", [owner]);
    expect(log.length).toBeGreaterThan(0);
  });
  it("admin can upsert recording settings; others cannot", async () => {
    const ok = await run(db, as(admin), `insert into site_settings (key, value, updated_by) values ('recording','{"policy":"approved_only"}',$1) on conflict (key) do update set value=excluded.value returning key`, [admin]);
    expect(ok).toHaveLength(1);
    await expect(run(db, as(mod), `insert into site_settings (key, value) values ('recording','{"policy":"all_streamers"}') on conflict (key) do update set value=excluded.value`)).rejects.toThrow();
  });
  it("admin can write sport categories; others cannot", async () => {
    expect(await run(db, as(admin), "insert into sports_categories (name, slug, sort_order, is_active) values ('Darts','darts',200,true) returning id")).toHaveLength(1);
    await expect(run(db, as(owner), "insert into sports_categories (name, slug) values ('X','x')")).rejects.toThrow();
  });
  it("admin and service role can set suspension; user cannot self-unsuspend", async () => {
    await run(db, as(admin), "select set_account_suspension($1, true, 'test')", [viewer]);
    const s = await run<{ suspended_at: string | null }>(db, service, "select suspended_at from profile_private where user_id=$1", [viewer]);
    expect(s[0].suspended_at).not.toBeNull();
    expect(await run(db, as(viewer), "update profile_private set suspended_at=null where user_id=$1 returning user_id", [viewer]).catch(() => [])).toHaveLength(0);
    await run(db, as(admin), "select set_account_suspension($1, false)", [viewer]);
  });
});

describe("social writes", () => {
  it("follow / unfollow / favorite / reminder / block / notification read", async () => {
    expect(await run(db, as(viewer), "insert into follows (follower_id, streamer_id) values ($1,$2) returning 1 as x", [viewer, owner])).toHaveLength(1);
    await expect(run(db, as(viewer), "insert into follows (follower_id, streamer_id) values ($1,$1)", [viewer])).rejects.toThrow();
    expect(await run(db, as(viewer), "delete from follows where follower_id=$1 and streamer_id=$2 returning 1 as x", [viewer, owner])).toHaveLength(1);
    expect(await run(db, as(viewer), "insert into favorites (user_id, stream_id) values ($1,$2) returning id", [viewer, ext])).toHaveLength(1);
    expect(await run(db, as(viewer), "insert into favorites (user_id, sport_id) values ($1,$2) returning id", [viewer, sport])).toHaveLength(1);
    const m = await run<{ id: string }>(db, service, "insert into matches (sport_id, title, starts_at, status) values ($1,'A vs B', now()+interval '1 day','scheduled') returning id", [sport]);
    expect(await run(db, as(viewer), "insert into match_reminders (user_id, match_id) values ($1,$2) returning 1 as x", [viewer, m[0].id])).toHaveLength(1);
    expect(await run(db, as(viewer), "insert into user_blocks (blocker_id, blocked_id) values ($1,$2) on conflict (blocker_id, blocked_id) do update set blocked_id=excluded.blocked_id returning 1 as x", [viewer, owner])).toHaveLength(1);
    await run(db, service, "insert into notifications (user_id, type, title) values ($1,'system','hi')", [viewer]);
    expect(await run(db, as(viewer), "update notifications set read_at=now() where user_id=$1 and read_at is null returning id", [viewer])).toHaveLength(1);
    expect(await run(db, as(owner), "update notifications set read_at=now() where user_id=$1 returning id", [viewer])).toHaveLength(0);
  });
  it("profile + notification prefs updates; cannot change role or follower_count", async () => {
    expect(await run(db, as(viewer), "update profiles set display_name='V', bio='b', avatar_url='https://x/a.webp', favorite_sports=array['cricket'] where id=$1 returning id", [viewer])).toHaveLength(1);
    expect(await run(db, as(viewer), `update profile_private set notification_prefs='{"live_started":false}' where user_id=$1 returning user_id`, [viewer])).toHaveLength(1);
    await expect(run(db, as(viewer), "update profiles set role='admin' where id=$1", [viewer])).rejects.toThrow();
    await expect(run(db, as(viewer), "update profiles set follower_count=999 where id=$1", [viewer])).rejects.toThrow();
  });
});

describe("reports & copyright", () => {
  it("user reports once; duplicate open report is rejected; staff resolves", async () => {
    const r = await run<{ id: string }>(db, as(viewer), "insert into reports (reporter_id, target_type, target_id, reason) values ($1,'stream',$2,'spam') returning id", [viewer, ext]);
    await expect(run(db, as(viewer), "insert into reports (reporter_id, target_type, target_id, reason) values ($1,'stream',$2,'abuse')", [viewer, ext])).rejects.toMatchObject({ code: "23505" });
    expect(await run(db, as(mod), "update reports set status='actioned', resolved_by=$2, resolved_at=now(), resolution_note='ok' where id=$1 returning id", [r[0].id, mod])).toHaveLength(1);
    expect(await run(db, as(viewer), "update reports set status='dismissed' where id=$1 returning id", [r[0].id])).toHaveLength(0);
  });
  it("copyright complaint: service role inserts; anon/users cannot; staff can review", async () => {
    const ins = "insert into copyright_complaints (complainant_name, complainant_email, work_description, infringing_urls, good_faith_statement, accuracy_statement, signature, stream_id) values ('N','n@x.io','desc',array['https://x/watch/1'],true,true,'N',$1) returning id";
    const c = await run<{ id: string }>(db, service, ins, [ext]);
    await expect(run(db, anon, ins, [ext])).rejects.toThrow();
    await expect(run(db, as(viewer), ins, [ext])).rejects.toThrow();
    expect(await run(db, as(viewer), "select id from copyright_complaints")).toHaveLength(0);
    expect(await run(db, as(mod), "update copyright_complaints set status='upheld', reviewed_by=$2, reviewed_at=now() where id=$1 returning id", [c[0].id, mod])).toHaveLength(1);
  });
  it("add_strike by staff; three strikes suspend", async () => {
    for (let i = 0; i < 3; i++) await run(db, as(mod), "select add_strike($1, 'test')", [owner]);
    const p = await run<{ strikes: number; suspended_at: string | null }>(db, service, "select strikes, suspended_at from profile_private where user_id=$1", [owner]);
    expect(p[0].strikes).toBeGreaterThanOrEqual(3);
    expect(p[0].suspended_at).not.toBeNull();
  });
});

describe("video & recording writes", () => {
  it("owner edits video fields but cannot publish/alter system fields; service deletes with tombstone", async () => {
    await run(db, as(admin), "select set_account_suspension($1, false)", [owner]); // lifted after the strike test
    const rec = await run<{ id: string }>(db, service, "insert into stream_recordings (stream_id, owner_id, status, provider_recording_id) values ($1,$2,'ready','vid1') returning id", [ext, owner]);
    const v = await run<{ id: string }>(db, service, "insert into videos (stream_id, recording_id, owner_id, sport_id, title, provider_asset_id, processing_status, published_at, visibility) values ($1,$2,$3,$4,'R','vid1','ready',now(),'public') returning id", [ext, rec[0].id, owner, sport]);
    expect(await run(db, as(owner), "update videos set title='T', description='d', visibility='private', thumbnail_alt='a', thumbnail_focus_x=20 where id=$1 returning id", [v[0].id])).toHaveLength(1);
    await expect(run(db, as(owner), "update videos set provider_asset_id='other' where id=$1", [v[0].id])).rejects.toThrow();
    await expect(run(db, as(owner), "update videos set view_count=1000 where id=$1", [v[0].id])).rejects.toThrow();
    await expect(run(db, as(owner), "delete from videos where id=$1", [v[0].id])).rejects.toThrow();
    await run(db, service, "update stream_recordings set status='skipped', error='Deleted by owner' where id=$1", [rec[0].id]);
    expect(await run(db, service, "delete from videos where id=$1 returning id", [v[0].id])).toHaveLength(1);
  });
});
