import type { Metadata } from "next";
import Link from "next/link";
import { deleteStreamAction, setPublishedAction } from "@/app/actions/streams";
import { EmptyState, PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatusBadge } from "@/components/media";
import { requireRole } from "@/lib/auth";
import { listOwnerStreams } from "@/lib/data/streams";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My streams", robots: { index: false } };
export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { platform_rtmps: "OBS (RTMPS)", platform_webrtc: "Browser (WebRTC)", hls: "HLS URL", dash: "DASH URL", mp4: "MP4 URL", youtube: "YouTube", embed: "Embed" };

export default async function MyStreamsPage() {
  const user = await requireRole("streamer", "/dashboard/streams");
  const streams = await listOwnerStreams(user.id);
  return (
    <div>
      <PageHeader title="My streams" description="Create, schedule and manage your broadcasts." actions={<Link href="/dashboard/streams/new" className="btn-primary">New stream</Link>} />
      {streams.length === 0 ? <EmptyState title="No streams yet" description="Create a stream to get started." action={<Link href="/dashboard/streams/new" className="btn-primary btn-sm">Create a stream</Link>} /> : (
        <div className="card divide-y divide-line">
          {streams.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2"><StatusBadge status={s.status} /><span className="chip">{SOURCE[s.source_type]}</span><span className="chip capitalize">{s.visibility}</span>{!s.is_published && s.status !== "disabled" && <span className="chip">Unpublished</span>}</div>
                <Link href={`/dashboard/streams/${s.id}/edit`} className="block truncate font-medium hover:text-accent">{s.title}</Link>
                <p className="text-xs text-muted">{s.scheduled_start ? `Scheduled ${formatDateTime(s.scheduled_start)} UTC` : `Created ${formatDateTime(s.created_at)} UTC`}{s.source_health !== "unknown" && <> · source {s.source_health}</>}</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {s.source_type.startsWith("platform") && s.status !== "disabled" && <Link href={`/dashboard/go-live?stream=${s.id}`} className="btn-primary btn-sm">Go live</Link>}
                <Link href={`/dashboard/streams/${s.id}/edit`} className="btn-secondary btn-sm">Edit</Link>
                {s.status !== "disabled" && <ConfirmAction label={s.is_published ? "Unpublish" : "Publish"} action={setPublishedAction} args={[s.id, !s.is_published]} />}
                <Link href={`/watch/${s.id}`} className="btn-ghost btn-sm">View</Link>
                <ConfirmAction label="Delete" variant="danger" confirm="Delete this stream? Replays you've already saved are kept." action={deleteStreamAction} args={[s.id]} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
