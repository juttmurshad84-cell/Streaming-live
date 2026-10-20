import type { Metadata } from "next";
import Link from "next/link";
import { retryRecordingAction } from "@/app/actions/streams";
import { EmptyState, Notice, PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Thumbnail } from "@/components/media";
import { VideoEditor } from "@/components/VideoEditor";
import { requireRole } from "@/lib/auth";
import { listOwnerRecordings, listOwnerVideos } from "@/lib/data/videos";
import { formatCount, formatDateTime, formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "My videos", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyVideosPage() {
  const user = await requireRole("streamer", "/dashboard/videos");
  const [videos, recs] = await Promise.all([listOwnerVideos(user.id), listOwnerRecordings(user.id)]);
  const inFlight = recs.filter((r) => ["pending", "recording", "processing", "failed"].includes(r.status));
  return (
    <div>
      <PageHeader title="My videos" description="Replays are created automatically from recorded OBS broadcasts once the provider finishes processing. Browser (WebRTC) broadcasts are not recorded." />
      {inFlight.length > 0 && (
        <section className="mb-6" aria-labelledby="inflight"><h2 id="inflight" className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted">Recordings in progress</h2>
          <div className="card divide-y divide-line text-sm">
            {inFlight.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="chip capitalize">{r.status}</span><span className="min-w-0 flex-1 truncate">{r.stream?.title ?? "Stream"} · {formatDateTime(r.created_at)} UTC</span>
                {r.error && <span className="text-xs text-red-300">{r.error}</span>}
                {r.stream && r.status !== "recording" && <ConfirmAction label="Check now" action={retryRecordingAction} args={[r.stream_id]} />}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">A replay is only published after the provider reports the video as ready.</p>
        </section>
      )}
      {videos.length === 0 ? <EmptyState title="No videos yet" description="Broadcast with OBS and recording enabled; your replay appears here after processing." action={<Link href="/dashboard/streams/new" className="btn-primary btn-sm">Create a stream</Link>} /> : (
        <div className="space-y-4">
          {videos.map((v) => (
            <details key={v.id} className="card overflow-hidden">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 p-3">
                <div className="w-40 shrink-0"><Thumbnail src={v.thumbnail_url} alt={v.title} focusX={v.thumbnail_focus_x} focusY={v.thumbnail_focus_y} sportSlug={v.sport?.slug} className="rounded-lg" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.title}</p>
                  <p className="text-xs text-muted">{v.processing_status !== "ready" ? <span className="capitalize">{v.processing_status}</span> : v.published_at ? `Published ${formatDateTime(v.published_at)} UTC` : "Not published"} · {formatDuration(v.duration_seconds) || "—"} · {formatCount(v.view_count) || 0} views</p>
                  <div className="mt-1 flex gap-2"><span className="chip capitalize">{v.visibility}</span><Link href={`/videos/${v.id}`} className="chip hover:text-fg">Open</Link></div>
                </div>
                <span className="btn-secondary btn-sm">Edit</span>
              </summary>
              <VideoEditor video={v} />
            </details>
          ))}
        </div>
      )}
      <div className="mt-8"><Notice tone="info" title="Retention">Replays may be removed automatically after the retention period set by the administrator.</Notice></div>
    </div>
  );
}
