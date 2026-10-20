# ArenaLive

A live sports streaming and video platform (working name — "ArenaLive" is temporary). Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Realtime, Storage, RLS) · Cloudflare Stream.

> **Read this first.** ArenaLive streams what *its users broadcast* (browser or OBS) and what they link from sources they are entitled to use. A sports-data API provides fixtures and scores only — **it does not grant broadcast rights**, and the platform never rebroadcasts TV feeds, bypasses DRM/paywalls/geo-blocks, or fetches third-party video server-side. Terms/Privacy are **templates that need legal review** before launch.

## What is in the box

| Area | What exists |
|---|---|
| Public site | Home (featured, live, 11 sports, trending, upcoming, latest videos, streamers), `/live`, `/sports[/slug]`, `/upcoming`, `/completed`, `/matches/[id]`, `/watch/[id]`, `/videos[/id]`, `/streamer/[username]`, `/search` |
| Accounts | Register, login, forgot/reset password, settings, roles (guest · viewer · streamer · moderator · admin) |
| Creator tools | Stream CRUD, thumbnail upload/URL/crop/focal-point, source validation (SSRF-safe), **Go Live** from the browser (WHIP) or **OBS** (RTMPS), replay management, followers, favorites, notifications |
| Playback | HLS (hls.js / native), DASH (dash.js), MP4, YouTube (nocookie) and allow-listed embeds, platform live (WHEP) and recordings (signed HLS/DASH) |
| Community | Realtime chat with slow mode, mutes, blocks, message deletion; reports; copyright complaint form |
| Moderation/Admin | Reports queue, stream/video takedown, strikes → suspension, users & roles, categories, recording policy, integrations status page, audit log |
| Backend | 22-table Postgres schema with RLS + trigger guards, signed idempotent webhooks, cron jobs, in-memory rate limits |

Pages: 41 page routes plus API routes (every route in the brief). Database: the 15 required tables plus 7 supporting ones (see `supabase/migrations/0001_schema.sql`).

## Quick start (no accounts needed)

```bash
npm install
npm run dev          # http://localhost:3000
```

Without Supabase variables the site runs in **development-fixtures mode**: public pages render labelled *sample* data (a "SAMPLE" badge and a banner are shown), and `/dashboard`, `/admin`, `/settings` redirect to `/login`, which explains that nothing is configured. Nothing in this mode is a real broadcast.

For a working installation follow **[docs/SETUP.md](docs/SETUP.md)** (Supabase + Cloudflare + sports data), then **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | All Vitest suites (unit + Postgres/RLS suites on in-process PGlite) |
| `npm run test:db` | Only the database suites |

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — local setup, Supabase, first admin, Cloudflare, sports data
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — hosting, cron, webhooks, go-live checklist
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — provider capabilities & limits, webhook registration, security model, known gaps
- [docs/TESTING.md](docs/TESTING.md) — what is automatically tested, what is **not**, and the manual test plan

## Honest status

Verified in this repository: type-check, lint, production build, 130+ automated tests (security helpers, SSRF, webhook signatures, recording ingestion idempotency, image pipeline, sports normalisation, and the full RLS/trigger model including the exact writes our server actions make).

**Not verified end-to-end** (needs your Supabase project and Cloudflare account, which were not available while building): sign-up/login against real Supabase Auth, server actions against a real PostgREST stack, Cloudflare API calls, real webhook delivery, an actual OBS or browser broadcast reaching Cloudflare, WHIP "live" detection, and a visual pass in real browsers. The code paths exist and are unit-tested where possible, but treat them as **unproven until you run the manual plan in [docs/TESTING.md](docs/TESTING.md)**. Nothing in the UI claims a stream is live unless Cloudflare reports it live.
