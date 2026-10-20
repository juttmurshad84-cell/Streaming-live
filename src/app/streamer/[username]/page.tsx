import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, Section } from "@/components/blocks";
import { StreamCard, VideoCard } from "@/components/cards";
import { Avatar } from "@/components/media";
import { ReportButton, ShareButton } from "@/components/ShareReport";
import { FollowButton } from "@/components/ToggleButtons";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByUsername, isFollowing } from "@/lib/data/profiles";
import { listPublicStreams } from "@/lib/data/streams";
import { listPublicVideos } from "@/lib/data/videos";
import { formatCount, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProfileByUsername((await params).username);
  return p ? { title: p.display_name, description: p.bio?.slice(0, 160) ?? `${p.display_name} on ArenaLive` } : { title: "Streamer not found" };
}

export default async function StreamerPage({ params }: Props) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();
  const user = await getCurrentUser();
  const [following, live, upcoming, past, videos] = await Promise.all([
    isFollowing(user?.id ?? null, profile.id),
    listPublicStreams({ ownerId: profile.id, status: "live", pageSize: 4 }),
    listPublicStreams({ ownerId: profile.id, status: "scheduled", pageSize: 4 }),
    listPublicStreams({ ownerId: profile.id, status: "ended", pageSize: 4 }),
    listPublicVideos({ ownerId: profile.id, pageSize: 8 }),
  ]);
  const path = `/streamer/${profile.username}`;
  const isSelf = user?.id === profile.id;
  return (
    <div>
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-r from-primary/40 via-surface to-accent/20 sm:h-52">
        {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg to-transparent" />
      </div>
      <div className="container-page -mt-10 sm:-mt-12">
        <div className="flex flex-wrap items-end gap-4">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={96} className="ring-4 ring-bg" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-2xl font-bold">{profile.display_name}</h1>
            <p className="text-sm text-muted">@{profile.username} · {formatCount(profile.follower_count) || 0} followers · Joined {formatDate(profile.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <FollowButton streamerId={profile.id} initial={following} signedIn={Boolean(user)} isSelf={isSelf} next={path} />
            <ShareButton title={profile.display_name} path={path} />
            {!isSelf && <ReportButton targetType="profile" targetId={profile.id} signedIn={Boolean(user)} next={path} />}
          </div>
        </div>
        {profile.bio && <p className="mt-4 max-w-3xl whitespace-pre-line text-sm text-muted">{profile.bio}</p>}
        {live.items.length > 0 && <Section title="Live now"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{live.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div></Section>}
        {upcoming.items.length > 0 && <Section title="Scheduled"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{upcoming.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div></Section>}
        <Section title="Videos">{videos.items.length ? <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{videos.items.map((v) => <VideoCard key={v.id} video={v} />)}</div> : <EmptyState title="No public videos yet" />}</Section>
        {past.items.length > 0 && <Section title="Past broadcasts"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{past.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div></Section>}
      </div>
    </div>
  );
}
