import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/blocks";
import { StatusBadge } from "@/components/media";
import { StreamerOptIn } from "@/components/StreamerOptIn";
import { hasRole, requireUser } from "@/lib/auth";
import { listFollowers, unreadCount } from "@/lib/data/profiles";
import { listOwnerStreams } from "@/lib/data/streams";
import { listOwnerRecordings, listOwnerVideos } from "@/lib/data/videos";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const streamer = hasRole(user, "streamer");
  const [unread, streams, videos, recs, followers] = await Promise.all([
    unreadCount(user.id),
    streamer ? listOwnerStreams(user.id) : Promise.resolve([]),
    streamer ? listOwnerVideos(user.id) : Promise.resolve([]),
    streamer ? listOwnerRecordings(user.id) : Promise.resolve([]),
    streamer ? listFollowers(user.id) : Promise.resolve([]),
  ]);
  const live = streams.filter((s) => s.status === "live");
  const pending = recs.filter((r) => ["pending", "recording", "processing", "failed"].includes(r.status));
  const stats = [
    { label: "Followers", value: user.profile.follower_count, href: `/streamer/${user.profile.username}` },
    { label: "Streams", value: streams.length, href: "/dashboard/streams" },
    { label: "Videos", value: videos.length, href: "/dashboard/videos" },
    { label: "Unread notifications", value: unread, href: "/dashboard/notifications" },
  ];
  return (
    <div>
      <PageHeader title={`Hi, ${user.profile.display_name}`} description="Your channel at a glance. Numbers are real counts from the database." actions={streamer ? <><Link href="/dashboard/streams/new" className="btn-secondary">New stream</Link><Link href="/dashboard/go-live" className="btn-primary">Go live</Link></> : undefined} />
      {sp.denied && <p role="alert" className="mb-4 text-sm text-red-300">You don’t have access to that page.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => <Link key={s.label} href={s.href} className="card p-4 transition hover:border-accent/50"><p className="text-xs text-muted">{s.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p></Link>)}
      </div>

      {!streamer ? (
        <section className="card mt-6 p-6"><h2 className="mb-3 text-lg font-semibold">Start streaming</h2><StreamerOptIn /></section>
      ) : (
        <>
          {live.length > 0 && <section className="card mt-6 border-live/40 p-4"><h2 className="mb-2 flex items-center gap-2 font-semibold"><StatusBadge status="live" />You are live</h2>{live.map((s) => <p key={s.id} className="text-sm"><Link className="text-accent hover:underline" href={`/watch/${s.id}`}>{s.title}</Link> · started {timeAgo(s.started_at)}</p>)}</section>}
          <section className="mt-6" aria-labelledby="d-streams">
            <div className="mb-3 flex items-center justify-between"><h2 id="d-streams" className="text-lg font-semibold">Recent streams</h2><Link href="/dashboard/streams" className="text-sm text-accent hover:underline">All streams</Link></div>
            {streams.length ? (
              <div className="card divide-y divide-line">
                {streams.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                    <StatusBadge status={s.status} /><Link href={`/dashboard/streams/${s.id}/edit`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{s.title}</Link>
                    <span className="text-xs text-muted">{s.scheduled_start ? formatDateTime(s.scheduled_start) + " UTC" : timeAgo(s.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No streams yet" description="Create your first stream to get connection details for OBS or your browser." action={<Link href="/dashboard/streams/new" className="btn-primary btn-sm">Create a stream</Link>} />}
          </section>
          {pending.length > 0 && (
            <section className="mt-6" aria-labelledby="d-rec">
              <h2 id="d-rec" className="mb-3 text-lg font-semibold">Recordings in progress</h2>
              <div className="card divide-y divide-line">
                {pending.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="chip capitalize">{r.status}</span><span className="min-w-0 flex-1 truncate">{r.stream?.title ?? "Stream"}</span>
                    {r.status === "failed" && <span className="text-xs text-red-300">{r.error ?? "Provider reported a failure"}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="mt-6 text-xs text-muted">{followers.length} follower{followers.length === 1 ? "" : "s"} shown on your channel. ArenaLive does not display estimated or simulated analytics.</p>
        </>
      )}
    </div>
  );
}
