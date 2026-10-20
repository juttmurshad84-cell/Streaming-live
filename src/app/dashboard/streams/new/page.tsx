import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/blocks";
import { StreamForm } from "@/components/StreamForm";
import { requireRole } from "@/lib/auth";
import { streamFormData } from "@/lib/data/forms";

export const metadata: Metadata = { title: "New stream", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewStreamPage() {
  const user = await requireRole("streamer", "/dashboard/streams/new");
  const d = await streamFormData(user.id);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Create a stream" description="Set up the listing first. Nothing is public until you publish it." />
      {!d.platformReady && <div className="mb-6"><Notice tone="warn" title="Platform broadcasting is not configured">Cloudflare Stream credentials or the Supabase service role are missing on this server, so OBS and browser broadcasting are disabled. You can still add an external source URL. See docs/INTEGRATIONS.md.</Notice></div>}
      <StreamForm sports={d.sports} matches={d.matches} platformReady={d.platformReady} recordingAllowed={d.recordingAllowed} recordingNote={d.recordingNote} />
    </div>
  );
}
