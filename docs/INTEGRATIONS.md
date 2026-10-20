# Integrations

Provider capabilities below were checked against Cloudflare's and TheSportsDB's documentation in October 2026. Provider pricing and limits change — re-check before launch. `/admin/integrations` shows which variables are present (presence only, never values) and `/api/health` reports connectivity.

## Cloudflare Stream

Chosen because one provider covers browser ingest (WebRTC/WHIP), OBS ingest (RTMPS/SRT), automatic recording, HLS/DASH delivery, signed playback and webhooks. All provider calls live in `src/lib/providers/cloudflare.ts`; the rest of the app talks to a small abstraction, so Mux (or another provider) could be swapped in by implementing the same functions.

### Capabilities and limits that shape the product

| Path | Ingest | Playback | Recorded? |
|---|---|---|---|
| **OBS / encoder** | RTMPS (SRT also supported by Cloudflare) | Signed HLS/DASH | **Yes** — `recording.mode = automatic`, replay created after the broadcast ends and is processed |
| **Browser "Go Live"** | WebRTC **WHIP** | **WHEP** only | **No** — WHIP input cannot be recorded or played via HLS/DASH |

Other documented WebRTC limits: WHIP and WHEP must be used together; no simulcast; no live viewer counts or broadcast metrics; codecs VP8, VP9, H264 (Constrained Baseline 3.1); WebRTC is billed per delivered minute (about $1 per 1,000 minutes at time of writing). The UI says plainly that browser broadcasts are live-only.

### Stream keys

Stream keys / WHIP URLs are secrets. They are **never stored in our database** and never in a public API. The owner-only endpoint `GET /api/streams/[id]/ingest` fetches them from Cloudflare on demand with `Cache-Control: no-store`; the dashboard reveals them on click. "Regenerate" replaces the Cloudflare live input (invalidating the old key) and "Disable" turns the input off. Take care not to log or screenshot them.

### Webhooks (signature-verified, idempotent)

Both endpoints fail closed (`503`) when their secret is missing, reject bad signatures (`401`), record each event in `webhook_events` (unique per event id, so redeliveries are no-ops), and return `500` on processing failure so Cloudflare retries.

**1. Video webhook** — tells us when a recording is ready or failed. `POST /api/webhooks/cloudflare/stream`, HMAC-SHA256 over `"<time>.<raw body>"` using the `Webhook-Signature: time=…,sig1=…` header, 5-minute tolerance, constant-time compare. Only one video webhook can exist per Cloudflare account.

```bash
export CF_ACCOUNT_ID=…  CF_API_TOKEN=…  SITE=https://your.domain
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/webhook" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  --data "{\"notificationUrl\":\"$SITE/api/webhooks/cloudflare/stream\"}"
# → result.secret  ==> CLOUDFLARE_VIDEO_WEBHOOK_SECRET
```

**2. Live-input notifications** — "connected / disconnected / errored". `POST /api/webhooks/cloudflare/live`, authenticated by the shared secret Cloudflare echoes in the `cf-webhook-auth` header (this channel has no HMAC). Set up in the dashboard: *Notifications → Destinations → Webhooks → Create* (URL `$SITE/api/webhooks/cloudflare/live`, **Secret** = a long random value = `CLOUDFLARE_LIVE_WEBHOOK_SECRET`), then *Notifications → Add → Stream* (Stream Live Notifications), attach that webhook, leave the input filter blank for all inputs. The API equivalent is a notification policy with `alert_type: "stream_live_notifications"` (see Cloudflare's *Alerting → Policies* API reference); the dashboard route is the documented one.

The route reads `data.input_id` and `data.event_type` (`live_input.connected|disconnected|errored`); confirm that against a real test delivery ("Save and Test" in the dashboard) — we could not receive a real delivery while building.

### Live state is never self-asserted

Clients cannot mark a stream live. Only provider reconciliation does: webhooks, `POST /api/streams/[id]/sync` (called by the dashboard while the owner has the page open) and the maintenance cron.

### Recording → replay pipeline

Recording rows are created when a broadcast ends; the video webhook (or recording reconciliation) ingests the provider asset. **A replay is only published once the provider reports `ready`**; failures set `recording_failed` and notify the owner. Duplicate "ready" events never create a second replay, and deleting a replay leaves a tombstone so a late webhook cannot resurrect it. Recordings use signed playback tokens — private/unlisted replays are not reachable through public asset URLs. Visibility is enforced by the playback API (`/api/playback/video/[id]` returns 404 when the viewer may not see it).

### What is NOT verified

No call to Cloudflare was made from this codebase against a real account. Specifically untested: live-input creation payloads, signed-token playback of a *live* input, WHIP session establishment and **whether Cloudflare reports WHIP inputs as live through the lifecycle API/notifications** (if not, browser broadcasts will stay "scheduled" — see Troubleshooting in TESTING.md), recording readiness timing, and real webhook delivery. HMAC verification, ingestion idempotency and the DB side are covered by automated tests.

## Sports data (TheSportsDB)

`src/lib/sports/*`. Used only for fixtures, teams, competitions and scores (table `matches` etc.). Separate from video: a match page lists *platform streams the owners linked to that match*; it never creates or finds a video feed.

- v1 API `https://www.thesportsdb.com/api/v1/json/{key}/…`; free key `123`, **30 requests/minute**. The sync caps itself at 25 requests per run, retries 5xx, treats `429` as a clean "rate limited" stop, and never retries 4xx.
- Premium (v2, livescores, highlights) is not implemented.
- Status mapping never infers "live" from the clock; null scores stay null; timestamps are normalised to UTC.
- Match thumbnails/logos from the provider are displayed from their CDN (`r2.thesportsdb.com`, `www.thesportsdb.com` are allow-listed in `next.config.ts`).
- Check TheSportsDB's current terms (attribution, commercial use, premium requirements for production traffic) before launch. A sports-data licence is **not** a broadcast licence.
- Coverage depends on `sports_categories.provider_sport_name`; Esports and "Other" have none, so they have no synced fixtures.

## Supabase

Auth (cookie sessions via `@supabase/ssr`; `src/proxy.ts` refreshes sessions and gates `/dashboard`, `/settings`, `/admin`), Postgres with RLS, Realtime (chat, notifications, stream status), Storage (`thumbnails` bucket, public-read, owner-folder writes).

### Security model (database is the source of truth)

- RLS on every table; role checks via `is_admin()`, `is_staff()` (moderator+), `is_suspended()`.
- Trigger guards prevent privilege escalation even through direct REST calls: `profiles.role`, follower counts, strikes/suspension (`profile_private`), `recording_approved` (admins only), stream lifecycle/provider fields and `recording_enabled`, video system fields. Chat, mutes, moderation log, recordings, video insert/delete are writable only through security-definer RPCs or the service role.
- Privileged writes (provider fields, webhooks, cron, copyright complaints) use the service-role client in server code only (`src/lib/supabase/server.ts`, `server-only`).
- Unlisted/private rows are resolved server-side with `canView*` checks; the client cannot enumerate them.

## Source management & SSRF

Streamers add HLS/DASH/MP4/YouTube/embed sources. Rules (`src/lib/sources.ts`, `src/lib/security/*`): HTTPS only; YouTube is converted to a `youtube-nocookie` embed; generic iframes only for hosts in `APPROVED_EMBED_HOSTS`; the validator that probes a URL blocks private/loopback/link-local/metadata address ranges. **Playback of external sources happens in the viewer's browser — the server never proxies video.** We do not bypass DRM, paywalls or geo-restrictions; adding a source asserts the owner has the right to publish it. The server-side probe resolves DNS at connect time (so DNS rebinding cannot swap in a private address), re-validates each of at most 3 redirects, and enforces timeouts and a byte cap. Residual risk: the viewer's browser fetches the external URL itself, so a source can change after validation; health status is a hint, not a guarantee.

## Thumbnails

Upload (JPEG/PNG/WebP, magic-byte sniffed, ≤5 MB, min 320×180), or from a URL (fetched through the SSRF-safe fetcher), with a client crop + focal point. The server **always re-encodes to 1280×720 WebP** (16:9, focal-point crop) into our bucket; originals and EXIF are discarded.

## Copyright & takedown

`/copyright-policy#complaint` is a public form (IP rate-limited) stored in `copyright_complaints`. Staff review in `/admin/reports`; an upheld complaint disables the stream / makes the video private and adds a strike (3 strikes suspend the account). Counter-notice handling is manual (via the contact address). This is a workflow aid, not legal advice — see the review notice on the Terms/Privacy pages.
