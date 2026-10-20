import "server-only";

/**
 * Central place to read configuration. Secrets are only ever read on the server.
 * Nothing in this file is imported by client components (it imports `server-only`).
 */
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  cfApiToken: process.env.CLOUDFLARE_API_TOKEN,
  cfCustomerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE,
  cfLiveWebhookSecret: process.env.CLOUDFLARE_LIVE_WEBHOOK_SECRET,
  cfVideoWebhookSecret: process.env.CLOUDFLARE_VIDEO_WEBHOOK_SECRET,
  sportsProvider: process.env.SPORTS_PROVIDER ?? "thesportsdb",
  sportsApiKey: process.env.SPORTS_API_KEY,
  cronSecret: process.env.CRON_SECRET,
  approvedEmbedHosts: (process.env.APPROVED_EMBED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  sentryDsn: process.env.SENTRY_DSN,
};

export const hasSupabase = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasServiceRole = () => hasSupabase() && Boolean(env.supabaseServiceKey);
export const hasCloudflare = () =>
  Boolean(env.cfAccountId && env.cfApiToken && env.cfCustomerCode);
export const hasSportsApi = () => Boolean(env.sportsApiKey);

export type IntegrationState = "configured" | "partial" | "missing";
export interface IntegrationStatus {
  key: string;
  name: string;
  state: IntegrationState;
  detail: string;
  missing: string[];
}

/** Presence-only checks: never returns a secret value. Live connectivity is checked separately. */
export function integrationStatuses(): IntegrationStatus[] {
  const list = (pairs: [string, unknown][]) => pairs.filter(([, v]) => !v).map(([k]) => k);
  const mk = (
    key: string,
    name: string,
    pairs: [string, unknown][],
    okDetail: string,
    missingDetail: string,
  ): IntegrationStatus => {
    const missing = list(pairs);
    const state: IntegrationState =
      missing.length === 0 ? "configured" : missing.length === pairs.length ? "missing" : "partial";
    return { key, name, state, detail: state === "configured" ? okDetail : missingDetail, missing };
  };
  return [
    mk("database", "Database (Supabase Postgres)",
      [["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabaseAnonKey], ["SUPABASE_SERVICE_ROLE_KEY", env.supabaseServiceKey]],
      "Environment variables present. Run /api/health to verify connectivity and that migrations were applied.",
      "Without these the app runs in development-fixture mode with sample data only."),
    mk("auth", "Authentication (Supabase Auth)",
      [["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabaseAnonKey]],
      "Environment variables present. Confirm email templates and redirect URLs in the Supabase dashboard.",
      "Sign-in, registration and every authenticated feature are disabled."),
    mk("streaming", "Streaming provider (Cloudflare Stream live inputs)",
      [["CLOUDFLARE_ACCOUNT_ID", env.cfAccountId], ["CLOUDFLARE_API_TOKEN", env.cfApiToken], ["CLOUDFLARE_STREAM_CUSTOMER_CODE", env.cfCustomerCode]],
      "Credentials present. Broadcasting still requires a live end-to-end test (see docs/TESTING.md).",
      "Go Live (browser and OBS) cannot create live inputs."),
    mk("recording", "Video recording & replay webhooks",
      [["CLOUDFLARE_LIVE_WEBHOOK_SECRET", env.cfLiveWebhookSecret], ["CLOUDFLARE_VIDEO_WEBHOOK_SECRET", env.cfVideoWebhookSecret]],
      "Webhook secrets present. Register both webhooks in Cloudflare and run a recorded OBS test.",
      "Live status and replays cannot be driven by provider events; only manual reconciliation works."),
    mk("sports", "Sports-data API",
      [["SPORTS_API_KEY", env.sportsApiKey], ["CRON_SECRET", env.cronSecret]],
      `Provider: ${env.sportsProvider}. Scheduled sync is driven by /api/cron/sync-sports.`,
      "Fixtures and scores are not synchronised. Existing rows are shown with their last-synced time."),
    mk("storage", "File storage (Supabase Storage: thumbnails)",
      [["SUPABASE_SERVICE_ROLE_KEY", env.supabaseServiceKey], ["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl]],
      "Bucket `thumbnails` is created by migration 0002. Video binaries live in Cloudflare Stream, not in Supabase.",
      "Thumbnail uploads are disabled; image URLs can still be pasted."),
    mk("notifications", "Notifications",
      [["SUPABASE_SERVICE_ROLE_KEY", env.supabaseServiceKey], ["CRON_SECRET", env.cronSecret]],
      "In-app notifications are written by webhooks and the reminder cron. Email delivery is not implemented.",
      "In-app notifications cannot be generated."),
    mk("monitoring", "Error monitoring",
      [["SENTRY_DSN", env.sentryDsn]],
      "DSN present, but the Sentry SDK is not bundled; wire it in src/instrumentation.ts.",
      "Only structured JSON logs to stdout are emitted."),
  ];
}
