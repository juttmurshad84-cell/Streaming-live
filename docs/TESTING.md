# Testing

```bash
npm run typecheck   # tsc
npm run lint        # eslint (0 errors, 0 warnings)
npm test            # vitest: unit + database suites
npm run build       # production build
```

## Automated coverage (what the tests do and do not prove)

| Suite | Covers |
|---|---|
| `tests/unit/security.test.ts` | SSRF address/shape checks, safe fetch, rate limiter, webhook HMAC + timestamp tolerance, constant-time secret compare, source classification (HTTPS-only, YouTube, embed allow-list) |
| `tests/unit/recording.test.ts` | Recording ingestion idempotency; incomplete recordings are never published; deleted replays are not resurrected |
| `tests/unit/images.test.ts` | Magic-byte sniffing, size/dimension limits, focal-point crop, 1280×720 WebP output |
| `tests/unit/sports.test.ts` | Status mapping (never infers LIVE), event normalisation, retry/429 behaviour |
| `tests/db/schema.test.ts` | Migrations on PGlite; RLS and trigger guards: profiles/roles, stream/video visibility, chat RPCs (mute, slow mode), follows, reports, privilege-escalation attempts |
| `tests/db/app-flows.test.ts` | The exact writes our server actions perform, under the role each uses (owner / moderator / admin / service / anon); first-admin bootstrap; RLS on every table; the 15 required tables exist |
| `tests/db/columns.test.ts` | Static check that every table/column/FK hint/RPC name+param used in `src/` exists in the migrated schema (catches typos the untyped Supabase client would not) |

**Limits of these tests:** the database runs on PGlite with stubbed `auth`/roles, not on Supabase; server actions and route handlers are **not executed** against a real PostgREST/Auth stack; React components have no automated tests (no jsdom/Playwright suite); no provider (Cloudflare, TheSportsDB) is called. The column checker verifies names, not types or business semantics.

Smoke-tested manually in fixtures mode with `next start`: all public/auth/static routes return 200, unknown ids return 404, protected areas redirect to `/login`, webhooks and cron fail closed (503/401) without secrets, `/api/health` reports `degraded`.

## Manual test plan (required before launch)

Run against a real Supabase project + Cloudflare account (staging).

1. **Auth** — register (confirm e-mail), login, logout, forgot/reset password, change settings. Try `/dashboard` and `/admin` logged out (redirect) and as a viewer (403/redirect for `/admin`).
2. **Roles** — create first admin (SETUP.md); promote a streamer; promote a moderator; confirm a moderator cannot reach users/categories/integrations and cannot approve recording.
3. **Stream CRUD** — create an external HLS stream (use a source you own/test stream), thumbnail via upload, URL, crop + focal point; publish; check public/unlisted/private behaviour from a logged-out window and a second account.
4. **OBS broadcast** — create a platform (RTMPS) stream, reveal the key, stream from OBS (H.264 + AAC, keyframe interval 2s). Verify: status becomes live (webhook + sync), viewers can watch, chat works, ending the stream produces a replay in `/dashboard/videos` only after processing, notification arrives, replay plays with the chosen visibility. Regenerate the key and confirm the old one stops working. Reconnect within the reconnect window and check you get one replay.
5. **Browser broadcast (WHIP)** — Go Live from the dashboard with camera/mic; confirm viewers play it via WHEP, that **it is reported live**, and that ending it returns the stream to ended with no replay. If it never turns live, see Troubleshooting.
6. **Webhooks** — register both webhooks; replay a delivery from Cloudflare and confirm a duplicate does nothing; send a request with a wrong signature/secret and expect 401.
7. **Moderation** — report a stream, a video, a chat message; resolve from `/admin/reports`; mute/delete chat; disable a stream (ingest is cut) and re-enable; submit a copyright complaint from a logged-out window; uphold it and confirm takedown + strike; reach 3 strikes → suspended.
8. **Private video leak check** — copy a private replay's playback URL from the network tab as the owner, open it logged out: must fail (signed token expiry/visibility 404).
9. **Sports sync** — set `SPORTS_API_KEY`, run sync from `/admin/integrations`, check `/upcoming`, `/completed`, `/matches/[id]`; re-run to confirm it is idempotent and handles the rate limit.
10. **Cron** — `curl` both endpoints with and without the bearer token (401/200).
11. **Responsive/visual & accessibility** — 360 px, 768 px, 1280 px+ on Chrome/Safari/Firefox; keyboard navigation; Lighthouse. This was **not** done during development.
12. **Secrets audit** — search the built client bundle and network responses for `SUPABASE_SERVICE_ROLE_KEY`, Cloudflare token, stream keys (`grep -r` in `.next/static`).

## Troubleshooting

- **Browser stream never goes live** — Cloudflare may not report WebRTC inputs through live notifications/lifecycle. Inspect `GET .../stream/live_inputs/<uid>` and `https://customer-<CODE>.cloudflarestream.com/<uid>/lifecycle` while broadcasting; adapt `reconcileStream` in `src/lib/stream-sync.ts` to whichever signal Cloudflare exposes (or confirm via the WHEP endpoint).
- **Replay stuck "processing"** — run maintenance from `/admin/integrations`; check `webhook_events` for failed rows and the video webhook secret.
- **Cron returns 503** — `CRON_SECRET` is unset.
