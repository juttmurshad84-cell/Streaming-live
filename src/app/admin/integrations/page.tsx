import type { Metadata } from "next";
import { runMaintenanceAction, runSportsSyncAction, saveRecordingSettingsAction } from "@/app/actions/admin";
import { Notice, PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/forms";
import { requireRole } from "@/lib/auth";
import { lastSportsSync, recentWebhookEvents } from "@/lib/data/admin";
import { env, integrationStatuses } from "@/lib/env";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getRecordingSettings } from "@/lib/recording";

export const metadata: Metadata = { title: "Admin · Integrations" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TONE = { configured: "bg-ok/15 text-green-300 border-ok/30", partial: "bg-warn/15 text-amber-200 border-warn/30", missing: "bg-live/15 text-red-300 border-live/30" } as const;
const LABEL = { configured: "Variables present", partial: "Partially configured", missing: "Not configured" } as const;

export default async function IntegrationsPage() {
  await requireRole("admin", "/admin/integrations");
  const [settings, events, lastSync] = await Promise.all([getRecordingSettings().catch(() => null), recentWebhookEvents(), lastSportsSync()]);
  const site = env.siteUrl.replace(/\/$/, "");
  return (
    <div className="space-y-10">
      <div>
        <PageHeader title="Integrations" description="Presence of configuration only. Secret values are never shown." />
        <Notice tone="warn" title="“Variables present” is not “verified”">This page checks that environment variables exist, not that the provider accepted them. Verify live broadcasting and recording end-to-end with a real OBS test (docs/TESTING.md) and check <a className="underline" href="/api/health">/api/health</a>.</Notice>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {integrationStatuses().map((i) => (
            <article key={i.key} className="card p-4">
              <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">{i.name}</h2><span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[i.state]}`}>{LABEL[i.state]}</span></div>
              <p className="text-sm text-muted">{i.detail}</p>
              {i.missing.length > 0 && <p className="mt-2 text-xs text-muted">Missing: {i.missing.map((m) => <code key={m} className="mr-1 rounded bg-surface px-1.5 py-0.5">{m}</code>)}</p>}
            </article>
          ))}
        </div>
      </div>

      <section aria-labelledby="wh">
        <h2 id="wh" className="mb-3 text-xl font-bold">Cloudflare webhooks</h2>
        <div className="card space-y-3 p-4 text-sm">
          <p className="text-muted">Register these URLs in Cloudflare (see docs/INTEGRATIONS.md for the exact API calls). Requests are rejected unless the signature or shared secret matches.</p>
          <div><p className="text-xs text-muted">Video / recording ready (signed, <code>Webhook-Signature</code>)</p><code className="break-all text-accent">{site}/api/webhooks/cloudflare/stream</code></div>
          <div><p className="text-xs text-muted">Live input connected / disconnected / errored (<code>cf-webhook-auth</code>)</p><code className="break-all text-accent">{site}/api/webhooks/cloudflare/live</code></div>
          <h3 className="pt-2 text-sm font-semibold">Recent events</h3>
          {events.length === 0 ? <p className="text-muted">No webhook has been received yet. Until one is, recording webhooks are untested on this deployment.</p> : (
            <div className="divide-y divide-line rounded-xl border border-line">{events.map((e) => <div key={e.id} className="flex flex-wrap items-center gap-2 p-2.5 text-xs"><span className="chip">{e.provider}</span><span>{e.event_type}</span><span className={e.error ? "text-red-300" : e.processed_at ? "text-green-300" : "text-amber-300"}>{e.error ? `error: ${e.error.slice(0, 80)}` : e.processed_at ? "processed" : "pending retry"}</span><span className="ml-auto text-muted">{timeAgo(e.received_at)}</span></div>)}</div>
          )}
        </div>
      </section>

      <section aria-labelledby="rec">
        <h2 id="rec" className="mb-3 text-xl font-bold">Recording policy</h2>
        {settings ? (
          <ActionForm action={saveRecordingSettingsAction} className="card grid gap-4 p-4 sm:grid-cols-2">
            <SelectField name="policy" label="Who can record" defaultValue={settings.policy} options={[{ value: "all_streamers", label: "All streamers" }, { value: "approved_only", label: "Approved streamers only" }, { value: "disabled", label: "Nobody (recording off)" }]} />
            <TextField name="max_duration_minutes" label="Max broadcast length (minutes)" defaultValue={String(settings.max_duration_minutes)} hint="Enforced by the maintenance cron (stops the input)." />
            <TextField name="retention_days" label="Replay retention (days)" defaultValue={String(settings.retention_days)} hint="Older replays are deleted by the maintenance cron." />
            <TextField name="per_user_quota_minutes" label="Per-user storage quota (minutes)" defaultValue={String(settings.per_user_quota_minutes)} />
            <TextField name="reconnect_window_seconds" label="Reconnect window (seconds)" defaultValue={String(settings.reconnect_window_seconds)} hint="Short drops within this window continue the same recording." />
            <div className="sm:col-span-2"><SubmitButton>Save policy</SubmitButton></div>
          </ActionForm>
        ) : <Notice tone="warn">Recording policy needs the database.</Notice>}
      </section>

      <section aria-labelledby="ops">
        <h2 id="ops" className="mb-3 text-xl font-bold">Sports data & maintenance</h2>
        <div className="card space-y-3 p-4 text-sm">
          <p className="text-muted">Provider: <strong className="text-fg">{env.sportsProvider}</strong>. Last match sync: {lastSync ? `${formatDateTime(lastSync)} UTC` : "never"}. Match data is for listings and scores only and grants no streaming rights. Free tier: no live scores, 30 requests/minute.</p>
          <div className="flex flex-wrap gap-2">
            <ConfirmAction label="Run sports sync now" pendingLabel="Syncing (up to a minute)…" small={false} action={runSportsSyncAction} args={[]} />
            <ConfirmAction label="Run maintenance now" small={false} variant="secondary" confirm="Runs reminders, stale-session cleanup, live reconciliation, retention deletes. Continue?" action={runMaintenanceAction} args={[]} />
          </div>
          <p className="text-xs text-muted">Both also run on a schedule via <code>/api/cron/*</code> (see vercel.json, requires <code>CRON_SECRET</code>).</p>
        </div>
      </section>
    </div>
  );
}
