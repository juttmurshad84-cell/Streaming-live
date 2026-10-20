import type { Metadata } from "next";
import Link from "next/link";
import { deleteVideoAction } from "@/app/actions/videos";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { VisibilitySelect } from "@/components/AdminControls";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FilterBar } from "@/components/FilterBar";
import { requireRole } from "@/lib/auth";
import { listAdminVideos } from "@/lib/data/videos";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Admin · Videos" };
export const dynamic = "force-dynamic";

export default async function AdminVideosPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("moderator", "/admin/videos");
  const { get, page } = await readParams(searchParams);
  const res = await listAdminVideos({ q: get("q"), status: get("status"), page });
  return (
    <div>
      <PageHeader title="Videos" description={`${res.total} total. Removing a video also deletes the provider asset.`} />
      <FilterBar action="/admin/videos" values={{ q: get("q") }} showLanguage={false} />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">{["", "processing", "ready", "failed"].map((s) => <Link key={s} href={s ? `/admin/videos?status=${s}` : "/admin/videos"} className={`chip ${get("status") === (s || undefined) ? "border-accent text-accent" : ""}`}>{s || "all"}</Link>)}</div>
      {res.items.length === 0 ? <EmptyState title="No videos" /> : (
        <div className="card divide-y divide-line">
          {res.items.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/videos/${v.id}`} className="block truncate font-medium hover:text-accent">{v.title}</Link>
                <p className="text-xs text-muted"><span className="capitalize">{v.processing_status}</span> · by @{v.owner?.username} · {formatDuration(v.duration_seconds) || "—"} · {formatCount(v.view_count) || 0} views · {timeAgo(v.created_at)}</p>
              </div>
              <VisibilitySelect videoId={v.id} value={v.visibility} />
              <ConfirmAction label="Remove" variant="danger" confirm="Permanently remove this video and its provider asset?" action={deleteVideoAction} args={[v.id]} />
            </div>
          ))}
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/admin/videos" params={{ q: get("q"), status: get("status") }} />
    </div>
  );
}
