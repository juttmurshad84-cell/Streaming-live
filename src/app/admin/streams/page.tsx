import type { Metadata } from "next";
import Link from "next/link";
import { adminRevokeKeyAction } from "@/app/actions/streams";
import { setStreamDisabledAction } from "@/app/actions/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatusBadge } from "@/components/media";
import { FilterBar } from "@/components/FilterBar";
import { hasRole, requireRole } from "@/lib/auth";
import { listAdminStreams } from "@/lib/data/streams";
import { formatCount, timeAgo } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Admin · Streams" };
export const dynamic = "force-dynamic";

export default async function AdminStreamsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("moderator", "/admin/streams");
  const { get, page } = await readParams(searchParams);
  const res = await listAdminStreams({ q: get("q"), status: get("status"), page });
  return (
    <div>
      <PageHeader title="Streams" description={`${res.total} total`} />
      <FilterBar action="/admin/streams" values={{ q: get("q") }} showLanguage={false} />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">{["", "live", "scheduled", "draft", "ended", "disabled"].map((s) => <Link key={s} href={s ? `/admin/streams?status=${s}` : "/admin/streams"} className={`chip ${get("status") === (s || undefined) ? "border-accent text-accent" : ""}`}>{s || "all"}</Link>)}</div>
      {res.items.length === 0 ? <EmptyState title="No streams" /> : (
        <div className="card divide-y divide-line">
          {res.items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2"><StatusBadge status={s.status} /><span className="chip">{s.source_type}</span><span className="chip capitalize">{s.visibility}</span>{!s.is_published && <span className="chip">unpublished</span>}</div>
                <Link href={`/watch/${s.id}`} className="block truncate font-medium hover:text-accent">{s.title}</Link>
                <p className="text-xs text-muted">by {s.owner?.display_name ?? "?"} (@{s.owner?.username}) · {timeAgo(s.created_at)} · peak {formatCount(s.peak_viewers) || 0}</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {s.status === "disabled"
                  ? <ConfirmAction label="Re-enable" action={setStreamDisabledAction} args={[s.id, false]} />
                  : <ConfirmAction label="Disable" variant="danger" confirm="Disable this stream and cut its ingest?" action={setStreamDisabledAction} args={[s.id, true, "Disabled by staff"]} />}
                {hasRole(user, "admin") && s.source_type.startsWith("platform") && <ConfirmAction label="Revoke key" variant="ghost" confirm="Revoke the stream key? The owner gets a new input; any live encoder is disconnected." action={adminRevokeKeyAction} args={[s.id]} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/admin/streams" params={{ q: get("q"), status: get("status") }} />
    </div>
  );
}
