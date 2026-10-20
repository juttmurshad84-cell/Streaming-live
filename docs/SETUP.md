# Setup

Prerequisites: Node.js ≥ 20.9 (developed on 22), npm, a Supabase project, a Cloudflare account with **Stream** enabled (paid), optionally a TheSportsDB key.

## 1. Install and run in fixtures mode

```bash
npm install
cp .env.example .env.local   # leave empty to stay in fixtures mode
npm run dev
```

## 2. Supabase

1. Create a project at supabase.com. Copy **Project URL**, **anon key** and **service_role key** into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The service-role key is server-only; never expose it.
2. Apply the schema, in order, with either the Supabase CLI (`supabase link` then `supabase db push`) or the SQL editor:
   - `supabase/migrations/0001_schema.sql` — tables, enums, RLS, trigger guards, RPCs
   - `supabase/migrations/0002_storage_realtime.sql` — `thumbnails` bucket and realtime publication (`chat_messages`, `notifications`, `streams`)
   - `supabase/migrations/0003_video_views.sql` — view counter RPC
   - `supabase/seed.sql` — the 11 sports categories (reference data only; no fake streams/users are seeded)
3. **Authentication → URL configuration**: set *Site URL* to `NEXT_PUBLIC_SITE_URL` and add `${SITE_URL}/auth/callback` to *Redirect URLs*. Configure SMTP for production (the built-in mailer is heavily rate-limited).
4. Verify: `GET /api/health` should return `ok` once the database is reachable and migrations are applied.

> The schema was validated on PGlite (embedded Postgres), not on Supabase itself. If a migration fails on your project (e.g. a Supabase-specific `storage`/`realtime` difference) fix and re-run; `0002` is written to be skipped where those schemas do not exist.

### Create the first admin

Roles cannot be self-assigned (a trigger blocks it, even from the SQL editor). Register normally, then run this **single transaction** in the SQL editor — it sets the same transaction-local marker the service role uses:

```sql
begin;
select set_config('request.jwt.claim.role', 'service_role', true);
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = 'you@example.com');
commit;
```

After that, admins promote others from `/admin/users`. This procedure is covered by `tests/db/app-flows.test.ts`.

## 3. Cloudflare Stream

See [INTEGRATIONS.md](INTEGRATIONS.md#cloudflare-stream) for details and limits. In short:

1. Cloudflare dashboard → Stream → enable it. Note your **Account ID** and the **customer code** (`customer-<CODE>.cloudflarestream.com`).
2. Create an API token with **Account → Stream → Edit**.
3. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE`.
4. Register the two webhooks **after the site is reachable on a public HTTPS URL** (they cannot target localhost) — commands in INTEGRATIONS.md. Set `CLOUDFLARE_VIDEO_WEBHOOK_SECRET` and `CLOUDFLARE_LIVE_WEBHOOK_SECRET`.

## 4. Sports data (optional)

Set `SPORTS_API_KEY` (TheSportsDB; `123` is the public test key, 30 requests/minute). Run a sync from `/admin/integrations` ("Run sports sync now") or schedule `/api/cron/sync-sports`. Match data only populates fixtures/scores; it never creates a playable stream.

## 5. Other variables

`CRON_SECRET` (required for cron routes), `APPROVED_EMBED_HOSTS` (generic iframe embed allow-list), `NEXT_PUBLIC_CONTACT_EMAIL` (shown on legal/contact pages). Full reference: `.env.example`.

## 6. Recording policy

`/admin/integrations` edits the `recording` policy in `site_settings`: `all_streamers` (default), `approved_only` or `disabled`, max duration, per-user quota, retention days, reconnect window. Cloudflare bills recorded storage per minute, so consider `approved_only` until you have seen costs. Browser (WebRTC) broadcasts are **never** recorded — a Cloudflare limitation.
