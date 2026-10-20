import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteStreamAction, setPublishedAction } from "@/app/actions/streams";
import { Notice, PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatusBadge } from "@/components/media";
import { StreamForm } from "@/components/StreamForm";
import { hasRole, requireRole } from "@/lib/auth";
import { streamFormData } from "@/lib/data/forms";
import { getOwnedStream } from "@/lib/data/streams";
import { listOwnerStreamRecordings } from "@/lib/data/videos";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Edit stream", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditStreamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const user = await requireRole("streamer", `/dashboard/streams/${id}/edit`);
  const stream = await getOwnedStream(id, user.id, hasRole(user, "moderator"));
  if (!stream) notFound();
  const [d, recs, sp] = await Promise.all([streamFormData(stream.owner_id), listOwnerStreamRecordings(stream.id), searchParams]);
  const platform = stream.source_type.startsWith("platform");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit stream" actions={<><Link href={`/watch/${stream.id}`} className="btn-secondary">View page</Link>{platform && stream.status !== "disabled" && <Link href={`/dashboard/go-live?stream=${stream.id}`} className="btn-primary">Go live</Link>}</>} />
      {sp.created && <div className="mb-4"><Notice tone="ok" title="Stream created">Review the details, then {platform ? "open Go live for your connection details, and " : ""}publish when you’re ready.</Notice></div>}
      {stream.status === "disabled" && <div className="mb-4"><Notice tone="error" title="Disabled by a moderator">This stream cannot be published or broadcast. Contact support to appeal.</Notice></div>}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={stream.status} /><span className="chip capitalize">{stream.visibility}</span><span className="chip">{stream.is_published ? "Published" : "Unpublished"}</span>{stream.source_health !== "unknown" && <span className="chip">Source {stream.source_health}</span>}</div>
        {stream.status !== "disabled" && <ConfirmAction label={stream.is_published ? "Unpublish" : "Publish"} variant={stream.is_published ? "secondary" : "primary"} small={false} action={setPublishedAction} args={[stream.id, !stream.is_published]} />}
      </div>
      {stream.source_health_detail && <p className="mb-4 text-xs text-muted">Source check: {stream.source_health_detail}</p>}
      <StreamForm stream={stream} sports={d.sports} matches={d.matches} platformReady={d.platformReady} recordingAllowed={d.recordingAllowed} recordingNote={d.recordingNote} />
      {recs.length > 0 && (
        <section className="mt-10"><h2 className="mb-3 text-lg font-semibold">Recordings</h2>
          <div className="card divide-y divide-line text-sm">{recs.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-3 p-3"><span className="chip capitalize">{r.status}</span><span className="text-muted">{formatDateTime(r.created_at)} UTC</span>{r.error && <span className="text-red-300">{r.error}</span>}</div>)}</div>
        </section>
      )}
      <section className="mt-10 rounded-2xl border border-live/30 p-5"><h2 className="font-semibold text-red-300">Danger zone</h2><p className="mb-3 mt-1 text-sm text-muted">Deleting removes the listing and its provider live input. Saved replays are kept.</p>
        <ConfirmAction label="Delete stream" variant="danger" small={false} confirm="Delete this stream permanently?" action={deleteStreamAction} args={[stream.id]} redirectTo="/dashboard/streams" />
      </section>
    </div>
  );
}
