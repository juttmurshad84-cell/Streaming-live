import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Section } from "@/components/blocks";
import { MatchCard, StreamCard, VideoCard } from "@/components/cards";
import { FavoriteButton } from "@/components/ToggleButtons";
import { getCurrentUser } from "@/lib/auth";
import { listMatches, reminderSet } from "@/lib/data/matches";
import { isFavorite } from "@/lib/data/profiles";
import { getSportBySlug, listCompetitions } from "@/lib/data/sports";
import { listPublicStreams } from "@/lib/data/streams";
import { listPublicVideos } from "@/lib/data/videos";
import { sportMeta } from "@/lib/sports-meta";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sport = await getSportBySlug((await params).slug);
  return sport ? { title: sport.name, description: `Live ${sport.name.toLowerCase()} streams, fixtures and replays.` } : { title: "Sport not found" };
}

export default async function SportPage({ params }: Props) {
  const { slug } = await params;
  const sport = await getSportBySlug(slug);
  if (!sport) notFound();
  const user = await getCurrentUser();
  const [live, upcoming, finished, videos, comps, fav] = await Promise.all([
    listPublicStreams({ status: "live", sport: slug, pageSize: 8 }),
    listMatches({ status: "upcoming", sport: slug, from: new Date(Date.now() - 3 * 3600_000).toISOString(), pageSize: 6 }),
    listMatches({ status: "completed", sport: slug, pageSize: 6 }),
    listPublicVideos({ sport: slug, pageSize: 8 }),
    listCompetitions(sport.id),
    isFavorite(user?.id ?? null, "sport", sport.id),
  ]);
  const reminders = await reminderSet(user?.id ?? null, upcoming.items.map((m) => m.id));
  const meta = sportMeta(slug);
  return (
    <div className="container-page py-8">
      <div className="mb-2 overflow-hidden rounded-3xl border border-line p-6 sm:p-8" style={{ background: `linear-gradient(135deg, ${meta.from}cc, ${meta.to}55 60%, transparent)` }}>
        <PageHeader eyebrow="Sport" title={`${meta.emoji} ${sport.name}`} description={`${live.total} live now · ${upcoming.total} upcoming fixtures`} actions={<FavoriteButton kind="sport" id={sport.id} initial={fav} signedIn={Boolean(user)} next={`/sports/${slug}`} label="Favorite sport" />} />
        {comps.length > 0 && <div className="flex flex-wrap gap-2">{comps.slice(0, 12).map((c) => <Link key={c.id} href={`/upcoming?sport=${slug}&competition=${c.id}`} className="chip hover:text-fg">{c.name}</Link>)}</div>}
      </div>
      <Section title="Live now" href={`/live?sport=${slug}`}>
        {live.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{live.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div> : <EmptyState title={`No live ${sport.name.toLowerCase()} streams`} description="Check upcoming fixtures below." />}
      </Section>
      <Section title="Upcoming" href={`/upcoming?sport=${slug}`}>
        {upcoming.items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.items.map((m) => <MatchCard key={m.id} match={m} reminder={{ enabled: Boolean(user), set: reminders.has(m.id) }} />)}</div> : <EmptyState title="No upcoming fixtures" description="Fixtures are imported from the sports-data provider when it is configured." />}
      </Section>
      {finished.items.length > 0 && <Section title="Recent results" href={`/completed?sport=${slug}`}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{finished.items.map((m) => <MatchCard key={m.id} match={m} />)}</div></Section>}
      <Section title="Replays" href={`/videos?sport=${slug}`}>
        {videos.items.length ? <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{videos.items.map((v) => <VideoCard key={v.id} video={v} />)}</div> : <EmptyState title="No replays yet" />}
      </Section>
    </div>
  );
}
