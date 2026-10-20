import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/blocks";
import { StreamCard } from "@/components/cards";
import { LiveChat } from "@/components/LiveChat";
import { Avatar, StatusBadge, TeamLogo } from "@/components/media";
import { Player } from "@/components/Player";
import { ReportButton, ShareButton } from "@/components/ShareReport";
import { FavoriteButton, FollowButton } from "@/components/ToggleButtons";
import { ViewerCount } from "@/components/ViewerHeartbeat";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { isFavorite, isFollowing } from "@/lib/data/profiles";
import { getStreamForViewer } from "@/lib/data/streams";
import { listPublicStreams } from "@/lib/data/streams";
import { formatCount, formatDateTime, languageName } from "@/lib/format";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ streamId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { streamId } = await params;
  const user = await getCurrentUser();
  const s = await getStreamForViewer(streamId, { id: user?.id ?? null, staff: hasRole(user, "moderator") });
  if (!s) return { title: "Stream not found", robots: { index: false } };
  return { title: s.title, description: s.description?.slice(0, 160) ?? `Watch ${s.title} on ArenaLive.`, robots: s.visibility === "public" ? undefined : { index: false, follow: false }, openGraph: { title: s.title, images: s.thumbnail_url ? [s.thumbnail_url] : undefined } };
}

export default async function WatchPage({ params }: Props) {
  const { streamId } = await params;
  const user = await getCurrentUser();
  const stream = await getStreamForViewer(streamId, { id: user?.id ?? null, staff: hasRole(user, "moderator") });
  if (!stream) notFound();
  const path = `/watch/${stream.id}`;
  const isOwner = user?.id === stream.owner_id;
  const [following, fav, related] = await Promise.all([
    isFollowing(user?.id ?? null, stream.owner_id),
    isFavorite(user?.id ?? null, "stream", stream.id),
    listPublicStreams({ status: "live", sport: stream.sport?.slug, excludeId: stream.id, pageSize: 4 }),
  ]);
  const live = stream.status === "live";
  const m = stream.match;
  return (
    <div className="container-page py-4 sm:py-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Player kind="stream" id={stream.id} title={stream.title} poster={stream.thumbnail_url} />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={stream.status} isFixture={stream.isFixture} />{stream.visibility !== "public" && <span className="chip capitalize">{stream.visibility}</span>}{stream.sport && <Link href={`/sports/${stream.sport.slug}`} className="chip hover:text-fg">{stream.sport.name}</Link>}{stream.language && <span className="chip">{languageName(stream.language)}</span>}</div>
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">{stream.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {stream.owner && (
                <div className="flex items-center gap-3">
                  <Link href={`/streamer/${stream.owner.username}`}><Avatar src={stream.owner.avatar_url} name={stream.owner.display_name} size={44} /></Link>
                  <div><Link href={`/streamer/${stream.owner.username}`} className="font-semibold hover:text-accent">{stream.owner.display_name}</Link><p className="text-xs text-muted">{formatCount(stream.owner.follower_count) || 0} followers</p></div>
                  <FollowButton streamerId={stream.owner_id} initial={following} signedIn={Boolean(user)} isSelf={isOwner} next={path} compact />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!stream.isFixture && <ViewerCount streamId={stream.id} initial={stream.viewers} live={live} />}
                <FavoriteButton kind="stream" id={stream.id} initial={fav} signedIn={Boolean(user)} next={path} />
                <ShareButton title={stream.title} path={path} />
                {!isOwner && <ReportButton targetType="stream" targetId={stream.id} signedIn={Boolean(user)} next={path} />}
                {isOwner && <Link href={`/dashboard/streams/${stream.id}/edit`} className="btn-secondary">Manage</Link>}
              </div>
            </div>
            {m && (
              <Link href={`/matches/${m.id}`} className="card flex items-center gap-3 p-3 hover:border-accent/50">
                <TeamLogo team={m.home_team} size={32} /><span className="text-sm font-medium">{m.home_team?.name}</span>
                <span className="font-bold tabular-nums">{m.home_score != null && m.away_score != null && m.status !== "scheduled" ? `${m.home_score} – ${m.away_score}` : "vs"}</span>
                <span className="text-sm font-medium">{m.away_team?.name}</span><TeamLogo team={m.away_team} size={32} />
                <span className="ml-auto text-xs text-muted">Match details →</span>
              </Link>
            )}
            {stream.description && <div className="card whitespace-pre-line p-4 text-sm text-muted">{stream.description}</div>}
            {stream.scheduled_start && !live && stream.status !== "ended" && <p className="text-sm text-muted">Scheduled for {formatDateTime(stream.scheduled_start)} UTC.</p>}
            <p className="text-xs text-muted/80">Streamed by its owner, who has confirmed they hold the rights to broadcast this content. Think it infringes? <Link href="/copyright-policy#complaint" className="text-accent hover:underline">File a copyright complaint</Link>.</p>
          </div>
        </div>
        <aside className="min-w-0 lg:h-[calc(100vh-7rem)] lg:max-h-[46rem]">
          {stream.isFixture ? (
            <div className="card p-4 text-sm text-muted">Chat is disabled for sample fixtures.</div>
          ) : (
            <LiveChat streamId={stream.id} enabled={stream.chat_enabled} slowMode={stream.chat_slow_mode_seconds} signedIn={Boolean(user)} userId={user?.id ?? null} canModerate={isOwner || hasRole(user, "moderator")} next={path} />
          )}
        </aside>
      </div>
      {related.items.length > 0 && <Section title={`More live${stream.sport ? ` in ${stream.sport.name}` : ""}`} href="/live"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{related.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div></Section>}
    </div>
  );
}
