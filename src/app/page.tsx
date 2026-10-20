import Link from "next/link";
import { hoursAgoIso } from "@/lib/time";
import { EmptyState, Section } from "@/components/blocks";
import { MatchCard, SportCard, StreamCard, StreamerCard, VideoCard } from "@/components/cards";
import { StatusBadge, Thumbnail } from "@/components/media";
import { CalendarIcon, LiveIcon, PlayIcon, VideoIcon } from "@/components/icons";

import { listMatches, reminderSet } from "@/lib/data/matches";
import { listFeaturedStreamers } from "@/lib/data/profiles";
import { listSportsWithCounts } from "@/lib/data/sports";
import { listPublicStreams, listTrendingStreams } from "@/lib/data/streams";
import { listPublicVideos } from "@/lib/data/videos";
import { formatCount, formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, live, sports, trending, upcoming, videos, streamers] = await Promise.all([
    getCurrentUser(),
    listPublicStreams({ status: "live", sort: "viewers", pageSize: 8 }),
    listSportsWithCounts(),
    listTrendingStreams(6),
    listMatches({ status: "upcoming", from: hoursAgoIso(3), pageSize: 6 }),
    listPublicVideos({ sort: "newest", pageSize: 8 }),
    listFeaturedStreamers(6),
  ]);
 
  const reminders = await reminderSet(user?.id ?? null, upcoming.items.map((m) => m.id));
  // "Featured" is editorial-free and honest: the most-watched live stream, else the next fixture.
  const hero = live.items[0] ?? null;
  const nextMatch = upcoming.items[0] ?? null;

  return (
    <div className="container-page">
      <section aria-label="Featured" className="pt-6 sm:pt-8">
        {hero ? (
          <div className="grid overflow-hidden rounded-3xl border border-line bg-card shadow-card lg:grid-cols-[1.6fr_1fr]">
            <Link href={`/watch/${hero.id}`} className="group relative block">
              <Thumbnail src={hero.thumbnail_url} alt={hero.thumbnail_alt || hero.title} focusX={hero.thumbnail_focus_x} focusY={hero.thumbnail_focus_y} sportSlug={hero.sport?.slug} priority sizes="(min-width:1024px) 60vw, 100vw" className="h-full min-h-60 rounded-none lg:aspect-auto">
                <div className="absolute left-4 top-4"><StatusBadge status="live" isFixture={hero.isFixture} /></div>
              </Thumbnail>
            </Link>
            <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">{hero.isFixture ? "Sample stream" : "Featured · Live now"}</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{hero.title}</h1>
              {hero.description && <p className="line-clamp-3 text-sm text-muted">{hero.description}</p>}
              <p className="text-sm text-muted">{hero.owner?.display_name}{hero.sport && <> · {hero.sport.name}</>}{!hero.isFixture && hero.viewers != null && <> · {formatCount(hero.viewers) || 0} watching</>}</p>
              <div><Link href={`/watch/${hero.id}`} className="btn-primary px-6 py-3"><PlayIcon width={18} height={18} />Watch now</Link></div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface via-card to-surface p-8 sm:p-12">
            <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">ArenaLive</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Live sports, fixtures and replays in one place.</h1>
            <p className="mt-3 max-w-xl text-muted">Nothing is live right now. {nextMatch ? <>Next up: <strong className="text-fg">{nextMatch.title}</strong> — {formatDateTime(nextMatch.starts_at)} UTC.</> : "Check back soon, or browse replays below."}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {nextMatch ? <Link href={`/matches/${nextMatch.id}`} className="btn-primary"><CalendarIcon width={18} height={18} />View next match</Link> : <Link href="/upcoming" className="btn-primary"><CalendarIcon width={18} height={18} />Upcoming fixtures</Link>}
              <Link href="/videos" className="btn-secondary"><VideoIcon width={18} height={18} />Browse replays</Link>
            </div>
          </div>
        )}
      </section>

      <Section id="live-now" title="Live now" href="/live">
        {live.items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{live.items.slice(hero ? 1 : 0, 8).map((s) => <StreamCard key={s.id} stream={s} />)}</div>
        ) : (
          <EmptyState icon={<LiveIcon />} title="No live streams right now" description="When a streamer goes live it appears here instantly. Follow streamers to get a notification." action={<Link href="/upcoming" className="btn-secondary btn-sm">See upcoming matches</Link>} />
        )}
      </Section>

      <Section id="browse-sports" title="Browse sports" href="/sports">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{sports.map((s) => <SportCard key={s.id} sport={s} />)}</div>
      </Section>

      {trending.length > 0 && (
        <Section id="trending" title="Trending" href="/live?sort=viewers">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trending.map((s) => <StreamCard key={s.id} stream={s} />)}</div>
        </Section>
      )}

      <Section id="upcoming" title="Upcoming matches" href="/upcoming">
        {upcoming.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.items.map((m) => <MatchCard key={m.id} match={m} reminder={{ enabled: Boolean(user), set: reminders.has(m.id) }} />)}</div>
        ) : (
          <EmptyState icon={<CalendarIcon />} title="No upcoming matches yet" description="Fixtures appear here after the sports-data sync runs. Streamers can also schedule their own events." />
        )}
      </Section>

      <Section id="latest-videos" title="Latest videos" href="/videos">
        {videos.items.length ? (
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{videos.items.map((v) => <VideoCard key={v.id} video={v} />)}</div>
        ) : (
          <EmptyState icon={<VideoIcon />} title="No replays yet" description="Replays are published automatically once a recorded broadcast finishes processing." />
        )}
      </Section>

      {streamers.length > 0 && (
        <Section id="streamers" title="Featured streamers">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{streamers.map((s) => <StreamerCard key={s.id} streamer={s} />)}</div>
        </Section>
      )}
    </div>
  );
}
