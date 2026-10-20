import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoCard } from "@/components/cards";
import { Avatar } from "@/components/media";
import { Player } from "@/components/Player";
import { ReportButton, ShareButton } from "@/components/ShareReport";
import { FavoriteButton, FollowButton } from "@/components/ToggleButtons";
import { ViewTracker } from "@/components/ViewTracker";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { isFavorite, isFollowing } from "@/lib/data/profiles";
import { getVideoForViewer, listPublicVideos } from "@/lib/data/videos";
import { formatCount, formatDate, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ videoId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  const v = await getVideoForViewer((await params).videoId, { id: user?.id ?? null, staff: hasRole(user, "moderator") });
  if (!v) return { title: "Video not found", robots: { index: false } };
  return { title: v.title, description: v.description?.slice(0, 160) ?? `Replay: ${v.title}`, robots: v.visibility === "public" ? undefined : { index: false, follow: false } };
}

export default async function VideoPage({ params }: Props) {
  const { videoId } = await params;
  const user = await getCurrentUser();
  const video = await getVideoForViewer(videoId, { id: user?.id ?? null, staff: hasRole(user, "moderator") });
  if (!video) notFound();
  const path = `/videos/${video.id}`;
  const isOwner = user?.id === video.owner_id;
  const [following, fav, related] = await Promise.all([
    isFollowing(user?.id ?? null, video.owner_id),
    isFavorite(user?.id ?? null, "video", video.id),
    listPublicVideos({ sport: video.sport?.slug, excludeId: video.id, pageSize: 6 }),
  ]);
  return (
    <div className="container-page py-4 sm:py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Player kind="video" id={video.id} title={video.title} poster={video.thumbnail_url} autoPlay={false} />
          {!video.isFixture && video.visibility !== "private" && <ViewTracker videoId={video.id} />}
          <h1 className="text-xl font-bold sm:text-2xl">{video.title}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {video.owner && (
              <div className="flex items-center gap-3">
                <Link href={`/streamer/${video.owner.username}`}><Avatar src={video.owner.avatar_url} name={video.owner.display_name} size={44} /></Link>
                <div><Link href={`/streamer/${video.owner.username}`} className="font-semibold hover:text-accent">{video.owner.display_name}</Link><p className="text-xs text-muted">{formatCount(video.owner.follower_count) || 0} followers</p></div>
                <FollowButton streamerId={video.owner_id} initial={following} signedIn={Boolean(user)} isSelf={isOwner} next={path} compact />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <FavoriteButton kind="video" id={video.id} initial={fav} signedIn={Boolean(user)} next={path} />
              <ShareButton title={video.title} path={path} />
              {!isOwner && <ReportButton targetType="video" targetId={video.id} signedIn={Boolean(user)} next={path} />}
              {isOwner && <Link href="/dashboard/videos" className="btn-secondary">Manage</Link>}
            </div>
          </div>
          <div className="card p-4 text-sm">
            <p className="mb-2 text-xs text-muted">{!video.isFixture && <>{formatCount(video.view_count) || 0} views · </>}{formatDate(video.published_at)}{video.duration_seconds ? ` · ${formatDuration(video.duration_seconds)}` : ""}{video.sport && <> · <Link href={`/sports/${video.sport.slug}`} className="hover:text-fg">{video.sport.name}</Link></>}{video.visibility !== "public" && <> · <span className="capitalize">{video.visibility}</span></>}</p>
            <p className="whitespace-pre-line text-muted">{video.description || "No description."}</p>
          </div>
          <p className="text-xs text-muted/80">Think this infringes your rights? <Link href="/copyright-policy#complaint" className="text-accent hover:underline">File a copyright complaint</Link>.</p>
        </div>
        <aside className="min-w-0"><h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">More replays</h2><div className="space-y-5">{related.items.map((v) => <VideoCard key={v.id} video={v} />)}</div></aside>
      </div>
    </div>
  );
}
