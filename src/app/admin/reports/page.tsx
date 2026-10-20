import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/blocks";
import { ResolveComplaintForm, ResolveReportForm } from "@/components/AdminControls";
import { requireRole } from "@/lib/auth";
import { listComplaints, listReports } from "@/lib/data/admin";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Reports" };
export const dynamic = "force-dynamic";

const href = (t: string, id: string) => (t === "stream" ? `/watch/${id}` : t === "video" ? `/videos/${id}` : null);

export default async function AdminReportsPage() {
  await requireRole("moderator", "/admin/reports");
  const [open, closed, complaints, closedComplaints] = await Promise.all([listReports("open"), listReports("closed", 15), listComplaints("open"), listComplaints("closed", 10)]);
  return (
    <div className="space-y-10">
      <section aria-labelledby="cc">
        <PageHeader title="Copyright complaints" description="Formal complaints submitted through the public form. “Uphold” disables the stream / hides the video and records a strike. Keep the complainant’s statements on file." />
        {complaints.length === 0 ? <EmptyState title="No open complaints" /> : (
          <div className="space-y-4">{complaints.map((c) => (
            <article key={c.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="chip capitalize">{c.status}</span><strong>{c.complainant_name}</strong>{c.company && <span className="text-muted">({c.company})</span>}<a className="text-accent hover:underline" href={`mailto:${c.complainant_email}`}>{c.complainant_email}</a><span className="ml-auto text-xs text-muted">{formatDateTime(c.created_at)} UTC</span></div>
              <p className="whitespace-pre-line text-sm text-muted">{c.work_description}</p>
              <ul className="space-y-1 text-xs">{c.infringing_urls.map((u) => <li key={u} className="break-all text-accent">{u}</li>)}</ul>
              <p className="text-xs text-muted">Signed: {c.signature} · {c.stream_id ? "linked to a stream" : c.video_id ? "linked to a video" : "no matching content detected"}</p>
              <ResolveComplaintForm id={c.id} />
            </article>
          ))}</div>
        )}
      </section>
      <section aria-labelledby="rp">
        <h2 id="rp" className="mb-3 text-xl font-bold">User reports</h2>
        {open.length === 0 ? <EmptyState title="No open reports" description="Nice and quiet." /> : (
          <div className="space-y-4">{open.map((r) => {
            const link = href(r.target_type, r.target_id);
            return (
              <article key={r.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm"><span className="chip capitalize">{r.status}</span><span className="chip">{r.target_type.replace("_", " ")}</span><span className="chip capitalize">{r.reason}</span>{link ? <Link href={link} className="text-accent hover:underline">Open target</Link> : <span className="font-mono text-xs text-muted">{r.target_id.slice(0, 8)}</span>}<span className="ml-auto text-xs text-muted">by @{r.reporter?.username ?? "?"} · {timeAgo(r.created_at)}</span></div>
                {r.details && <p className="whitespace-pre-line text-sm text-muted">{r.details}</p>}
                <ResolveReportForm id={r.id} targetType={r.target_type} />
              </article>
            );
          })}</div>
        )}
      </section>
      {(closed.length > 0 || closedComplaints.length > 0) && (
        <section aria-labelledby="hist"><h2 id="hist" className="mb-3 text-lg font-semibold">Recently closed</h2>
          <div className="card divide-y divide-line text-sm">
            {closed.map((r) => <div key={r.id} className="flex flex-wrap gap-2 p-3"><span className="chip capitalize">{r.status}</span><span>{r.target_type} · {r.reason}</span>{r.resolution_note && <span className="text-muted">— {r.resolution_note}</span>}<span className="ml-auto text-xs text-muted">{timeAgo(r.created_at)}</span></div>)}
            {closedComplaints.map((c) => <div key={c.id} className="flex flex-wrap gap-2 p-3"><span className="chip capitalize">{c.status.replace("_", " ")}</span><span>Copyright · {c.complainant_name}</span><span className="ml-auto text-xs text-muted">{timeAgo(c.created_at)}</span></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
