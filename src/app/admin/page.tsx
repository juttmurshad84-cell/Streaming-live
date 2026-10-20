import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/blocks";
import { adminCounts, recentModeration } from "@/lib/data/admin";
import { timeAgo } from "@/lib/format";
import { hasRole, requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireRole("moderator", "/admin");
  const [counts, log] = await Promise.all([adminCounts(), recentModeration()]);
  const cards = counts ? [
    { label: "Open reports", value: counts.openReports, href: "/admin/reports", warn: counts.openReports > 0 },
    { label: "Open copyright complaints", value: counts.openComplaints, href: "/admin/reports", warn: counts.openComplaints > 0 },
    { label: "Live streams", value: counts.liveStreams, href: "/admin/streams?status=live" },
    { label: "Failed recordings", value: counts.failedRecordings, href: "/admin/videos", warn: counts.failedRecordings > 0 },
    { label: "Streams", value: counts.streams, href: "/admin/streams" },
    { label: "Videos", value: counts.videos, href: "/admin/videos" },
    ...(hasRole(user, "admin") ? [{ label: "Users", value: counts.users, href: "/admin/users" }] : []),
  ] : [];
  return (
    <div>
      <PageHeader title="Admin overview" description="Real counts from the database. Staff actions are written to the audit log below." />
      {!counts && <Notice tone="warn" title="No database configured">Admin tools need Supabase. See docs/SETUP.md.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((c) => <Link key={c.label} href={c.href} className={`card p-4 transition hover:border-accent/50 ${c.warn ? "border-amber-500/40" : ""}`}><p className="text-xs text-muted">{c.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{c.value}</p></Link>)}</div>
      <section className="mt-8" aria-labelledby="audit"><h2 id="audit" className="mb-3 text-lg font-semibold">Recent moderation activity</h2>
        {log.length ? <div className="card divide-y divide-line text-sm">{log.map((l) => <div key={l.id} className="flex flex-wrap gap-x-3 gap-y-1 p-3"><span className="font-mono text-xs text-accent">{l.action}</span><span className="text-muted">{l.target_type} {String(l.target_id).slice(0, 8)}</span>{l.reason && <span className="text-muted">— {l.reason}</span>}<span className="ml-auto text-xs text-muted">{l.actor?.username ?? "system"} · {timeAgo(l.created_at)}</span></div>)}</div> : <p className="text-sm text-muted">No moderation actions recorded yet.</p>}
      </section>
    </div>
  );
}
