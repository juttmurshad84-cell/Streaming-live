import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatCount, formatDateTime, formatDuration, languageName, liveDuration, timeAgo } from "@/lib/format";
import type { Match, SportWithCounts, Stream, Video } from "@/lib/types";
import { sportMeta } from "@/lib/sports-meta";
import type { FeaturedStreamer } from "@/lib/data/profiles";
import { Avatar, SportEmoji, StatusBadge, TeamLogo, Thumbnail } from "./media";
import { Countdown } from "./Countdown";
import { ReminderButton } from "./ReminderButton";
import { EyeIcon } from "./icons";

export function StreamCard({ stream, priority }: { stream: Stream; priority?: boolean }) {
  const m = stream.match;
  return (
    <article className="group">
      <Link href={`/watch/${stream.id}`} className="block overflow-hidden rounded-2xl border border-line bg-card shadow-card transition hover:border-accent/50 hover:bg-card-hover">
        <Thumbnail src={stream.thumbnail_url} alt={stream.thumbnail_alt || stream.title} focusX={stream.thumbnail_focus_x} focusY={stream.thumbnail_focus_y} sportSlug={stream.sport?.slug} priority={priority}>
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5"><StatusBadge status={stream.status} isFixture={stream.isFixture} /></div>
          <div className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm backdrop-blur"><SportEmoji slug={stream.sport?.slug} /></div>
          {stream.status === "live" && !stream.isFixture && stream.viewers != null && (
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium backdrop-blur"><EyeIcon width={13} height={13} />{formatCount(stream.viewers) || 0}</span>
          )}
          {stream.status === "live" && stream.started_at && <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium tabular-nums backdrop-blur" suppressHydrationWarning>{liveDuration(stream.started_at)}</span>}
        </Thumbnail>
        <div className="space-y-2 p-3.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{stream.title}</h3>
          {m && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <TeamLogo team={m.home_team} size={20} /><span className="truncate">{m.home_team?.short_name ?? m.home_team?.name}</span>
              <span className="text-fg/60">vs</span>
              <TeamLogo team={m.away_team} size={20} /><span className="truncate">{m.away_team?.short_name ?? m.away_team?.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted">
            {stream.owner && <><Avatar src={stream.owner.avatar_url} name={stream.owner.display_name} size={20} /><span className="truncate">{stream.owner.display_name}</span></>}
            {stream.language && <span className="chip ml-auto shrink-0 py-0.5">{languageName(stream.language)}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function VideoCard({ video }: { video: Video }) {
  return (
    <article className="group">
      <Link href={`/videos/${video.id}`} className="block">
        <Thumbnail src={video.thumbnail_url} alt={video.thumbnail_alt || video.title} focusX={video.thumbnail_focus_x} focusY={video.thumbnail_focus_y} sportSlug={video.sport?.slug} className="rounded-2xl border border-line">
          {video.duration_seconds ? <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{formatDuration(video.duration_seconds)}</span> : null}
          {video.isFixture && <span className="absolute left-2.5 top-2.5"><StatusBadge status="" isFixture /></span>}
        </Thumbnail>
        <div className="mt-3 flex gap-3">
          {video.owner && <Avatar src={video.owner.avatar_url} name={video.owner.display_name} size={36} />}
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">{video.title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">{video.owner?.display_name}</p>
            <p className="text-xs text-muted">
              {!video.isFixture && <>{formatCount(video.view_count) || 0} views · </>}{timeAgo(video.published_at)}{video.sport && <> · {video.sport.name}</>}
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function MatchCard({ match, reminder }: { match: Match; reminder?: { enabled: boolean; set: boolean } }) {
  const showScore = match.home_score != null && match.away_score != null && match.status !== "scheduled";
  return (
    <article className="card flex flex-col gap-3 p-4 transition hover:border-accent/50">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5"><SportEmoji slug={match.sport?.slug} /><span className="truncate">{match.competition?.name ?? match.sport?.name}</span></span>
        <StatusBadge status={match.status} isFixture={match.isFixture} />
      </div>
      <Link href={`/matches/${match.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl py-1 hover:bg-card-hover">
        <div className="flex min-w-0 flex-col items-center gap-1.5 text-center"><TeamLogo team={match.home_team} size={44} /><span className="line-clamp-2 text-sm font-medium">{match.home_team?.name ?? "TBC"}</span></div>
        <div className="text-center">
          {showScore ? <span className="text-2xl font-bold tabular-nums">{match.home_score}<span className="mx-1 text-muted">–</span>{match.away_score}</span> : <span className="text-sm font-semibold text-muted">vs</span>}
          {match.status === "live" && match.period && <p className="mt-0.5 text-[11px] font-medium text-live">{match.period}</p>}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1.5 text-center"><TeamLogo team={match.away_team} size={44} /><span className="line-clamp-2 text-sm font-medium">{match.away_team?.name ?? "TBC"}</span></div>
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
        <div>
          <time dateTime={match.starts_at} suppressHydrationWarning>{formatDateTime(match.starts_at)}</time>
          {match.status === "scheduled" && <div className="text-fg"><Countdown to={match.starts_at} /></div>}
        </div>
        {match.status === "scheduled" && reminder && <ReminderButton matchId={match.id} initial={reminder.set} enabled={reminder.enabled} />}
      </div>
    </article>
  );
}

export function SportCard({ sport }: { sport: SportWithCounts }) {
  const meta = sportMeta(sport.slug);
  return (
    <Link href={`/sports/${sport.slug}`} className="group relative block overflow-hidden rounded-2xl border border-line">
      <div className="relative aspect-[4/3] w-full" style={{ background: sport.image_url ? undefined : `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
        {sport.image_url && <img src={sport.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "repeating-linear-gradient(115deg, rgb(255 255 255 / .1) 0 2px, transparent 2px 24px)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <span className="absolute right-3 top-2 text-4xl transition-transform group-hover:scale-110" aria-hidden>{meta.emoji}</span>
        <div className="absolute inset-x-3 bottom-3">
          <h3 className="text-base font-bold">{sport.name}</h3>
          <p className="text-xs text-white/80">{sport.live_count > 0 && <span className="font-semibold text-red-300">{sport.live_count} live · </span>}{sport.total_count} {sport.total_count === 1 ? "event" : "events"}</p>
        </div>
      </div>
    </Link>
  );
}

export function StreamerCard({ streamer }: { streamer: FeaturedStreamer }) {
  return (
    <Link href={`/streamer/${streamer.username}`} className="card flex flex-col items-center gap-2 p-4 text-center transition hover:border-accent/50 hover:bg-card-hover">
      <div className="relative">
        <Avatar src={streamer.avatar_url} name={streamer.display_name} size={64} className={cn(streamer.isLive && "ring-2 ring-live ring-offset-2 ring-offset-card")} />
        {streamer.isLive && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-live px-1.5 text-[10px] font-bold">LIVE</span>}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{streamer.display_name}</p>
        <p className="text-xs text-muted">{formatCount(streamer.follower_count) || 0} followers</p>
        {streamer.sports.length > 0 && <p className="mt-1 truncate text-xs text-muted">{streamer.sports.join(" · ")}</p>}
      </div>
    </Link>
  );
}
