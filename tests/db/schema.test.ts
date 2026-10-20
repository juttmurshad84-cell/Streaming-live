import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { anon, as, createDb, createUser, run, service } from "./harness";

let db: PGlite;
let alice: string; // streamer
let bob: string; // viewer
let carol: string; // viewer
let admin: string;
let sportId: string;

async function newStream(owner: string, over: Partial<Record<string, unknown>> = {}) {
  const row = await run<{ id: string }>(
    db,
    service,
    `insert into streams (owner_id, sport_id, title, source_type, provider, provider_stream_id, status, is_published, visibility, started_at)
     values ($1, $2, $3, 'platform_rtmps', 'cloudflare', $4, $5, $6, $7, now()) returning id`,
    [
      owner,
      sportId,
      (over.title as string) ?? "Test stream",
      `uid-${Math.random().toString(36).slice(2)}`,
      over.status ?? "live",
      over.is_published ?? true,
      over.visibility ?? "public",
    ],
  );
  return row[0].id;
}

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, "alice@example.com", "alice");
  bob = await createUser(db, "bob@example.com", "bob");
  carol = await createUser(db, "carol@example.com", "carol");
  admin = await createUser(db, "admin@example.com", "admin");
  await run(db, service, "update profiles set role = 'admin' where id = $1", [admin]);
  sportId = (await db.query<{ id: string }>("select id from sports_categories where slug = 'football'")).rows[0].id;
  await run(db, as(alice), "select become_streamer()");
});

describe("profiles & roles", () => {
  it("creates a profile and private row for each new auth user, with unique usernames", async () => {
    const dup = await createUser(db, "alice2@example.com", "alice");
    const rows = await db.query<{ username: string }>("select username from profiles where id = $1", [dup]);
    expect(rows.rows[0].username).toBe("alice1");
    const priv = await db.query("select 1 from profile_private where user_id = $1", [dup]);
    expect(priv.rows).toHaveLength(1);
  });

  it("blocks self role escalation but allows admin/service changes", async () => {
    await expect(run(db, as(bob), "update profiles set role = 'admin' where id = $1", [bob])).rejects.toThrow(/only administrators/);
    await run(db, as(admin), "select set_user_role($1, 'moderator')", [carol]);
    expect((await db.query<{ role: string }>("select role from profiles where id = $1", [carol])).rows[0].role).toBe("moderator");
    await run(db, as(admin), "select set_user_role($1, 'viewer')", [carol]);
  });

  it("become_streamer records the rights agreement", async () => {
    const r = await db.query<{ role: string; at: string | null }>(
      "select p.role, pp.rights_agreement_accepted_at at from profiles p join profile_private pp on pp.user_id = p.id where p.id = $1",
      [alice],
    );
    expect(r.rows[0].role).toBe("streamer");
    expect(r.rows[0].at).not.toBeNull();
  });

  it("hides private account state from other users", async () => {
    const mine = await run(db, as(bob), "select * from profile_private");
    expect(mine).toHaveLength(1);
    expect(await run(db, anon, "select * from profile_private")).toHaveLength(0);
  });

  it("does not let users clear their own suspension", async () => {
    await run(db, service, "update profile_private set strikes = 1 where user_id = $1", [bob]);
    await expect(
      run(db, as(bob), "update profile_private set strikes = 0, suspended_at = null where user_id = $1", [bob]),
    ).rejects.toThrow(/staff/);
    await run(db, service, "update profile_private set strikes = 0 where user_id = $1", [bob]);
  });
});

describe("streams RLS and lifecycle protection", () => {
  it("viewers cannot create streams; streamers can", async () => {
    const sql = `insert into streams (owner_id, sport_id, title, source_type, playback_ref) values ($1, $2, 'My match', 'hls', 'https://example.com/a.m3u8')`;
    await expect(run(db, as(bob), sql, [bob, sportId])).rejects.toThrow(/row-level security/);
    await run(db, as(alice), sql, [alice, sportId]);
  });

  it("cannot create a stream owned by someone else", async () => {
    await expect(
      run(db, as(alice), `insert into streams (owner_id, sport_id, title, source_type, playback_ref) values ($1, $2, 'Spoof', 'hls', 'https://e.com/a.m3u8')`, [bob, sportId]),
    ).rejects.toThrow(/row-level security/);
  });

  it("owners cannot forge LIVE status or provider fields", async () => {
    const id = await newStream(alice, { status: "scheduled" });
    await expect(run(db, as(alice), "update streams set status = 'live' where id = $1", [id])).rejects.toThrow(/system-managed/);
    await expect(run(db, as(alice), "update streams set provider_stream_id = 'x' where id = $1", [id])).rejects.toThrow(/system-managed/);
    await run(db, as(alice), "update streams set title = 'Renamed' where id = $1", [id]);
    await run(db, service, "update streams set status = 'live' where id = $1", [id]);
  });

  it("public discovery excludes unlisted, private, unpublished and disabled streams", async () => {
    const pub = await newStream(alice, { title: "pub-visible" });
    const unl = await newStream(alice, { title: "unl-hidden", visibility: "unlisted" });
    const prv = await newStream(alice, { title: "prv-hidden", visibility: "private" });
    const draft = await newStream(alice, { title: "draft-hidden", is_published: false });
    const dis = await newStream(alice, { title: "disabled-hidden", status: "disabled" });
    const ids = (await run<{ id: string }>(db, anon, "select id from streams")).map((r) => r.id);
    expect(ids).toContain(pub);
    for (const hidden of [unl, prv, draft, dis]) expect(ids).not.toContain(hidden);
    const owner = (await run<{ id: string }>(db, as(alice), "select id from streams")).map((r) => r.id);
    for (const mine of [pub, unl, prv, draft, dis]) expect(owner).toContain(mine);
    const other = (await run<{ id: string }>(db, as(bob), "select id from streams")).map((r) => r.id);
    expect(other).not.toContain(prv);
  });

  it("another user cannot edit or delete someone else's stream", async () => {
    const id = await newStream(alice, { status: "scheduled" });
    const upd = await run(db, as(bob), "update streams set title = 'hacked' where id = $1 returning id", [id]);
    expect(upd).toHaveLength(0);
    const del = await run(db, as(bob), "delete from streams where id = $1 returning id", [id]);
    expect(del).toHaveLength(0);
  });

  it("suspended accounts cannot create streams", async () => {
    await run(db, as(admin), "select set_account_suspension($1, true, 'test')", [alice]);
    await expect(
      run(db, as(alice), `insert into streams (owner_id, sport_id, title, source_type, playback_ref) values ($1, $2, 'Nope', 'hls', 'https://e.com/a.m3u8')`, [alice, sportId]),
    ).rejects.toThrow(/row-level security/);
    await run(db, as(admin), "select set_account_suspension($1, false)", [alice]);
  });
});

describe("videos & recordings", () => {
  let streamId: string;
  let recId: string;
  beforeAll(async () => {
    streamId = await newStream(alice, { status: "ended" });
    recId = (
      await run<{ id: string }>(db, service, `insert into stream_recordings (stream_id, owner_id, provider_recording_id, status) values ($1, $2, 'rec-1', 'processing') returning id`, [streamId, alice])
    )[0].id;
  });

  it("recording provider ids are unique (idempotent webhook processing)", async () => {
    await expect(
      run(db, service, `insert into stream_recordings (stream_id, owner_id, provider_recording_id) values ($1, $2, 'rec-1')`, [streamId, alice]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("never allows publishing an incomplete video", async () => {
    await expect(
      run(db, service, `insert into videos (owner_id, stream_id, recording_id, title, provider_asset_id, processing_status, published_at) values ($1, $2, $3, 'x', 'asset-bad', 'processing', now())`, [alice, streamId, recId]),
    ).rejects.toThrow(/check constraint/);
  });

  it("enforces visibility: public+ready visible to anon; private/unlisted/processing are not", async () => {
    const mk = (asset: string, vis: string, st: string, pub: boolean) =>
      run<{ id: string }>(db, service, `insert into videos (owner_id, title, provider_asset_id, visibility, processing_status, published_at) values ($1, $2, $3, $4, $5, ${pub ? "now()" : "null"}) returning id`, [alice, asset, asset, vis, st]);
    const pub = (await mk("v-pub", "public", "ready", true))[0].id;
    const unl = (await mk("v-unl", "unlisted", "ready", true))[0].id;
    const prv = (await mk("v-prv", "private", "ready", true))[0].id;
    const prc = (await mk("v-prc", "public", "processing", false))[0].id;
    const seen = (await run<{ id: string }>(db, anon, "select id from videos")).map((r) => r.id);
    expect(seen).toEqual([pub]);
    const mine = (await run<{ id: string }>(db, as(alice), "select id from videos")).map((r) => r.id);
    expect(mine).toEqual(expect.arrayContaining([pub, unl, prv, prc]));
    expect((await run(db, as(bob), "select id from videos where id = $1", [prv]))).toHaveLength(0);
  });

  it("owner can edit metadata but not system fields; cannot insert or hard-delete", async () => {
    const id = (await run<{ id: string }>(db, service, `insert into videos (owner_id, title, provider_asset_id, processing_status, published_at) values ($1, 't', 'v-edit', 'ready', now()) returning id`, [alice]))[0].id;
    await run(db, as(alice), "update videos set title = 'new', visibility = 'unlisted' where id = $1", [id]);
    await expect(run(db, as(alice), "update videos set view_count = 99999 where id = $1", [id])).rejects.toThrow(/system-managed/);
    await expect(run(db, as(alice), "update videos set processing_status = 'failed' where id = $1", [id])).rejects.toThrow(/system-managed/);
    await expect(run(db, as(alice), `insert into videos (owner_id, title, provider_asset_id) values ($1, 'x', 'forged')`, [alice])).rejects.toThrow(/permission denied/);
    await expect(run(db, as(alice), "delete from videos where id = $1", [id])).rejects.toThrow(/permission denied/);
  });
});

describe("chat", () => {
  let live: string;
  beforeAll(async () => {
    live = await newStream(alice, { title: "chat-room" });
  });

  it("requires auth and a live stream", async () => {
    await expect(run(db, anon, "select post_chat_message($1, 'hi')", [live])).rejects.toThrow(/permission denied|sign in/);
    const ended = await newStream(alice, { status: "ended" });
    await expect(run(db, as(bob), "select post_chat_message($1, 'hi')", [ended])).rejects.toThrow(/not available/);
  });

  it("does not allow direct inserts that bypass the RPC", async () => {
    await expect(run(db, as(bob), "insert into chat_messages (stream_id, user_id, body) values ($1, $2, 'x')", [live, bob])).rejects.toThrow(/permission denied/);
  });

  it("posts, rejects duplicates and spam, and rate-limits", async () => {
    await run(db, as(bob), "select post_chat_message($1, 'Great goal!')", [live]);
    await expect(run(db, as(bob), "select post_chat_message($1, 'great goal!')", [live])).rejects.toThrow(/duplicate/);
    await expect(run(db, as(bob), "select post_chat_message($1, 'http://a.com http://b.com http://c.com')", [live])).rejects.toThrow(/too many links/);
    await expect(run(db, as(bob), "select post_chat_message($1, 'aaaaaaaaaaaaaaaaaaaaaaaaa')", [live])).rejects.toThrow(/spam/);
    for (let i = 0; i < 4; i++) await run(db, as(bob), "select post_chat_message($1, $2)", [live, `msg ${i}`]);
    await expect(run(db, as(bob), "select post_chat_message($1, 'one too many')", [live])).rejects.toThrow(/too quickly/);
    await db.query("delete from chat_messages where user_id = $1", [bob]);
  });

  it("slow mode applies to viewers but not to the owner", async () => {
    const id = await newStream(alice);
    await run(db, as(alice), "update streams set chat_slow_mode_seconds = 30 where id = $1", [id]);
    await run(db, as(carol), "select post_chat_message($1, 'first')", [id]);
    await expect(run(db, as(carol), "select post_chat_message($1, 'second')", [id])).rejects.toThrow(/slow mode/);
    await run(db, as(alice), "select post_chat_message($1, 'owner a')", [id]);
    await run(db, as(alice), "select post_chat_message($1, 'owner b')", [id]);
  });

  it("only owner/staff may delete others' messages and mute users; actions are audited", async () => {
    const id = await newStream(alice);
    const msg = (await run<{ post_chat_message: { id: string } }>(db, as(bob), "select post_chat_message($1, 'hello room')", [id]))[0] as unknown as { post_chat_message: string };
    const msgId = (await db.query<{ id: string }>("select id from chat_messages where stream_id = $1", [id])).rows[0].id;
    void msg;
    await expect(run(db, as(carol), "select delete_chat_message($1)", [msgId])).rejects.toThrow(/not allowed/);
    await expect(run(db, as(carol), "select mute_chat_user($1, $2, 10)", [id, bob])).rejects.toThrow(/not allowed/);
    await run(db, as(alice), "select mute_chat_user($1, $2, 10, 'spam')", [id, bob]);
    await expect(run(db, as(bob), "select post_chat_message($1, 'still here?')", [id])).rejects.toThrow(/muted/);
    await run(db, as(alice), "select delete_chat_message($1, 'rude')", [msgId]);
    const vis = await run(db, anon, "select id from chat_messages where id = $1 and deleted_at is null", [msgId]);
    expect(vis).toHaveLength(0);
    const audit = await db.query("select action from moderation_actions where metadata ->> 'stream_id' = $1 order by created_at", [id]);
    expect(audit.rows.map((r) => (r as { action: string }).action)).toEqual(expect.arrayContaining(["chat_user_muted", "chat_message_deleted"]));
    await run(db, as(alice), "select unmute_chat_user($1, $2)", [id, bob]);
  });

  it("chat on private streams is invisible to non-members", async () => {
    const id = await newStream(alice, { visibility: "private" });
    await run(db, as(alice), "select post_chat_message($1, 'secret')", [id]);
    expect(await run(db, as(bob), "select 1 from chat_messages where stream_id = $1", [id])).toHaveLength(0);
    await expect(run(db, as(bob), "select post_chat_message($1, 'let me in')", [id])).rejects.toThrow(/not available/);
  });
});

describe("follows, favorites, notifications", () => {
  it("maintains follower_count and prevents self-follow / count forgery", async () => {
    await run(db, as(bob), "insert into follows (follower_id, streamer_id) values ($1, $2)", [bob, alice]);
    await run(db, as(carol), "insert into follows (follower_id, streamer_id) values ($1, $2)", [carol, alice]);
    expect((await db.query<{ follower_count: number }>("select follower_count from profiles where id = $1", [alice])).rows[0].follower_count).toBe(2);
    await expect(run(db, as(alice), "insert into follows (follower_id, streamer_id) values ($1, $1)", [alice])).rejects.toThrow(/check constraint/);
    await expect(run(db, as(bob), "insert into follows (follower_id, streamer_id) values ($1, $2)", [carol, alice])).rejects.toThrow(/row-level security/);
    await expect(run(db, as(alice), "update profiles set follower_count = 1000000 where id = $1", [alice])).rejects.toThrow(/maintained by the system/);
    await run(db, as(carol), "delete from follows where follower_id = $1", [carol]);
    expect((await db.query<{ follower_count: number }>("select follower_count from profiles where id = $1", [alice])).rows[0].follower_count).toBe(1);
  });

  it("favorites are private and exactly-one-target", async () => {
    const s = await newStream(alice);
    await run(db, as(bob), "insert into favorites (user_id, stream_id) values ($1, $2)", [bob, s]);
    await expect(run(db, as(bob), "insert into favorites (user_id, stream_id) values ($1, $2)", [bob, s])).rejects.toThrow(/duplicate/);
    await expect(run(db, as(bob), "insert into favorites (user_id, stream_id, sport_id) values ($1, $2, $3)", [bob, s, sportId])).rejects.toThrow(/check constraint/);
    expect(await run(db, as(carol), "select 1 from favorites")).toHaveLength(0);
  });

  it("go-live notifications reach followers once, honour preferences, and are service-only", async () => {
    const s = await newStream(alice, { title: "notify-me" });
    await expect(run(db, as(bob), "select notify_followers_live($1)", [s])).rejects.toThrow(/permission denied/);
    const first = await run<{ notify_followers_live: number }>(db, service, "select notify_followers_live($1)", [s]);
    expect(first[0].notify_followers_live).toBe(1);
    const again = await run<{ notify_followers_live: number }>(db, service, "select notify_followers_live($1)", [s]);
    expect(again[0].notify_followers_live).toBe(0);
    expect(await run(db, as(bob), "select 1 from notifications where type = 'stream_live'")).toHaveLength(1);
    expect(await run(db, as(carol), "select 1 from notifications")).toHaveLength(0);
    // opt out
    await db.query(`update profile_private set notification_prefs = jsonb_set(notification_prefs, '{live_started}', 'false') where user_id = $1`, [bob]);
    const s2 = await newStream(alice, { title: "notify-2" });
    const r = await run<{ notify_followers_live: number }>(db, service, "select notify_followers_live($1)", [s2]);
    expect(r[0].notify_followers_live).toBe(0);
  });

  it("users may only mark notifications read", async () => {
    const n = (await run<{ id: string }>(db, as(bob), "select id from notifications limit 1"))[0].id;
    await run(db, as(bob), "update notifications set read_at = now() where id = $1", [n]);
    await expect(run(db, as(bob), "update notifications set title = 'x' where id = $1", [n])).rejects.toThrow(/permission denied/);
    await expect(run(db, as(bob), "insert into notifications (user_id, type, title) values ($1, 'system', 'x')", [bob])).rejects.toThrow(/row-level security/);
  });
});

describe("moderation & compliance", () => {
  it("reports: one open report per reporter/target; reporter sees only own; staff see all", async () => {
    const s = await newStream(alice);
    await run(db, as(bob), "insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'stream', $2, 'spam')", [bob, s]);
    await expect(run(db, as(bob), "insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'stream', $2, 'abuse')", [bob, s])).rejects.toThrow(/duplicate/);
    expect(await run(db, as(carol), "select 1 from reports")).toHaveLength(0);
    expect((await run(db, as(admin), "select 1 from reports")).length).toBeGreaterThan(0);
    expect(await run(db, as(bob), "update reports set status = 'dismissed' returning id")).toHaveLength(0);
  });

  it("three strikes suspend an account (repeat infringer policy); only staff can strike", async () => {
    await expect(run(db, as(bob), "select add_strike($1, 'x')", [carol])).rejects.toThrow(/staff only/);
    for (let i = 0; i < 3; i++) await run(db, as(admin), "select add_strike($1, 'copyright')", [carol]);
    expect(await run(db, as(admin), "select 1 from profile_private where user_id = $1 and suspended_at is not null", [carol])).toHaveLength(1);
    expect(await run(db, as(admin), "select 1 from moderation_actions where action = 'account_suspended' and target_id = $1", [carol.toString()])).toHaveLength(1);
  });

  it("webhook ledger and audit log are not accessible to normal users", async () => {
    await expect(run(db, as(bob), "select * from webhook_events")).rejects.toThrow(/permission denied/);
    await expect(run(db, as(bob), "insert into moderation_actions (action, target_type, target_id) values ('x','y','z')")).rejects.toThrow(/permission denied/);
    expect(await run(db, as(bob), "select * from moderation_actions")).toHaveLength(0);
    await run(db, service, "insert into webhook_events (provider, event_key, event_type, payload) values ('cloudflare', 'k1', 't', '{}')");
    await expect(run(db, service, "insert into webhook_events (provider, event_key, event_type, payload) values ('cloudflare', 'k1', 't', '{}')")).rejects.toThrow(/duplicate/);
  });

  it("site settings are staff-only readable and admin-only writable", async () => {
    expect(await run(db, as(bob), "select * from site_settings")).toHaveLength(0);
    expect((await run(db, as(admin), "select * from site_settings")).length).toBeGreaterThan(0);
    expect(await run(db, as(bob), "update site_settings set value = '{}' returning key")).toHaveLength(0);
  });
});

describe("viewer sessions & sports counts", () => {
  it("counts distinct concurrent viewers and tracks peak", async () => {
    const s = await newStream(alice);
    await run(db, anon, "select viewer_heartbeat($1, 'aaaaaaaaaaaaaaaa1')", [s]);
    await run(db, anon, "select viewer_heartbeat($1, 'aaaaaaaaaaaaaaaa2')", [s]);
    const n = await run<{ viewer_heartbeat: number }>(db, anon, "select viewer_heartbeat($1, 'aaaaaaaaaaaaaaaa2')", [s]);
    expect(n[0].viewer_heartbeat).toBe(2);
    const counts = await run<{ viewers: number }>(db, service, "select * from viewer_counts(array[$1::uuid])", [s]);
    expect(counts[0].viewers).toBe(2);
    expect((await db.query<{ peak_viewers: number }>("select peak_viewers from streams where id = $1", [s])).rows[0].peak_viewers).toBe(2);
    await expect(run(db, anon, "select * from viewer_counts(array[$1::uuid])", [s])).rejects.toThrow(/permission denied/);
    await expect(run(db, anon, "select * from stream_viewer_sessions")).rejects.toThrow(/permission denied/);
  });

  it("sport_event_counts aggregates matches", async () => {
    await db.query(`insert into matches (sport_id, title, status, starts_at) values ($1, 'A v B', 'live', now()), ($1, 'C v D', 'scheduled', now() + interval '1 day')`, [sportId]);
    const rows = await run<{ live_count: number; upcoming_count: number }>(db, anon, "select * from sport_event_counts() where sport_id = $1", [sportId]);
    expect(rows[0]).toMatchObject({ live_count: 1, upcoming_count: 1 });
  });
});
