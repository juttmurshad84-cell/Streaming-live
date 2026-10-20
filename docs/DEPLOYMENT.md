# Deployment

ArenaLive is a standard Next.js server app. Any Node host works; Vercel is the documented path. Video bytes never pass through the app: ingest and playback go straight to Cloudflare.

## Vercel

1. Import the repository. Framework preset: Next.js. Build `npm run build`.
2. Add every variable from `.env.example` (Production and Preview). `NEXT_PUBLIC_SITE_URL` must be the final HTTPS origin.
3. `vercel.json` registers two crons — **daily** by default because that is what Vercel's Hobby plan allows (check current limits for your plan):
   - `/api/cron/sync-sports` — fixtures/scores
   - `/api/cron/maintenance` — reconciles stuck "live" streams against Cloudflare, enforces max duration, retention, reminder dispatch
   Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. On a plan that allows it, run maintenance every 5 minutes (`*/5 * * * *`) and sports sync every 30 minutes–6 hours. Alternatively call the endpoints from any scheduler (`curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/maintenance`).
4. Register the Cloudflare webhooks against the production URL (INTEGRATIONS.md).

## Self-hosting

`npm run build && npm start` behind a TLS-terminating proxy. Forward the real client IP in `x-forwarded-for` (used by the rate limiter and the copyright form). Run cron via system cron/GitHub Actions as above.

### Known operational limits

- **Rate limiting is in-process memory.** With several instances or serverless cold starts each has its own counters, so limits are approximate. Put a shared limiter (Redis/Upstash, or provider WAF rules) in front for production abuse protection.
- **Chat** uses Supabase Realtime `postgres_changes`; large rooms may need Supabase quotas raised or a broadcast-channel redesign.
- **Viewer counts** come from heartbeat sessions (service-role only). Cloudflare provides no live viewer counts for WebRTC.

## Go-live checklist

- [ ] Migrations applied; `/api/health` is `ok`; RLS enabled on all tables (the tests assert this on PGlite — re-check in the Supabase dashboard).
- [ ] First admin created; role changes tested.
- [ ] Supabase Auth: Site URL, redirect URLs, SMTP, e-mail confirmation on.
- [ ] Cloudflare token scoped to Stream only; webhooks registered and one test event received (check `webhook_events` rows).
- [ ] **A real OBS broadcast and a real browser broadcast tested end-to-end** (docs/TESTING.md §Manual). Confirm recording → replay for OBS and that WHIP streams show as live.
- [ ] `CRON_SECRET` set; crons visible in the host dashboard.
- [ ] `NEXT_PUBLIC_CONTACT_EMAIL` set to a monitored mailbox (copyright complaints depend on it being answered).
- [ ] Terms, Privacy, Copyright policy reviewed by counsel; designate a DMCA/IP agent if you operate in the US.
- [ ] Recording policy and retention decided; Cloudflare billing alerts set.
- [ ] Decide the production brand (ArenaLive is a placeholder): update `src/components/blocks`/Navbar/Footer text, metadata in `src/app/layout.tsx`, legal pages.
