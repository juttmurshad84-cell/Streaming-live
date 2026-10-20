import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/blocks";
import { StreamerCard } from "@/components/cards";
import { requireUser } from "@/lib/auth";
import { listFollowing } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "Following", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const user = await requireUser("/dashboard/following");
  const list = (await listFollowing(user.id)).sort((a, b) => Number(b.isLive) - Number(a.isLive));
  return (
    <div>
      <PageHeader title="Following" description="Streamers you follow. Live channels are listed first." />
      {list.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{list.map((p) => <StreamerCard key={p.id} streamer={{ ...p, follower_count: p.follower_count ?? 0, sports: [] }} />)}</div> : <EmptyState title="You’re not following anyone yet" description="Follow streamers to get notified when they go live." action={<Link href="/live" className="btn-primary btn-sm">Find streams</Link>} />}
    </div>
  );
}
