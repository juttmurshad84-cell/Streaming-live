import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/blocks";
import { GoLivePanel } from "@/components/GoLivePanel";
import { requireRole } from "@/lib/auth";
import { listOwnerStreams } from "@/lib/data/streams";
import { hasCloudflare, hasServiceRole } from "@/lib/env";
import { first } from "@/lib/params";

export const metadata: Metadata = { title: "Go live", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function GoLivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("streamer", "/dashboard/go-live");
  const sp = await searchParams;
  const all = (await listOwnerStreams(user.id)).filter((s) => s.source_type.startsWith("platform") && s.status !== "disabled");
  const candidates = all.filter((s) => s.status !== "ended" || s.id === first(sp.stream));
  const selected = candidates.find((s) => s.id === first(sp.stream)) ?? candidates.find((s) => s.status === "live") ?? candidates[0];
  const configured = hasCloudflare() && hasServiceRole();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Go live" description="Broadcast from OBS or straight from your browser." />
      {!configured && <div className="mb-6"><Notice tone="warn" title="Streaming provider not configured">Set the Cloudflare Stream variables and the Supabase service-role key on the server to enable platform broadcasting. Nothing here will simulate a broadcast.</Notice></div>}
      {!selected ? (
        <EmptyState title="No platform streams ready" description="Create a stream with the OBS or Browser option to get started." action={<Link href="/dashboard/streams/new" className="btn-primary btn-sm">Create a stream</Link>} />
      ) : (
        <div className="space-y-5">
          {candidates.length > 1 && (
            <form className="flex items-end gap-2"><div className="flex-1"><label htmlFor="stream" className="label">Stream</label><select id="stream" name="stream" defaultValue={selected.id} className="input">{candidates.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.source_type === "platform_rtmps" ? "OBS" : "Browser"}, {s.status})</option>)}</select></div><button className="btn-secondary">Switch</button></form>
          )}
          {!selected.is_published && <Notice tone="warn" title="This stream is unpublished">Viewers can’t find or watch it until you <Link className="underline" href={`/dashboard/streams/${selected.id}/edit`}>publish it</Link>.</Notice>}
          {configured ? <GoLivePanel key={selected.id} streamId={selected.id} sourceType={selected.source_type as "platform_rtmps" | "platform_webrtc"} initialStatus={selected.status} recording={selected.recording_enabled} title={selected.title} /> : null}
        </div>
      )}
    </div>
  );
}
