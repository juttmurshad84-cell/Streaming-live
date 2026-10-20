import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { EmptyState, Notice, Section } from "@/components/blocks";
import { MatchCard, StreamCard } from "@/components/cards";
import { StatusBadge, TeamLogo } from "@/components/media";
import { ReminderButton } from "@/components/ReminderButton";
import { ShareButton } from "@/components/ShareReport";
import { FavoriteButton } from "@/components/ToggleButtons";
import { getCurrentUser } from "@/lib/auth";
import { getMatch, listMatches, reminderSet } from "@/lib/data/matches";
import { isFavorite } from "@/lib/data/profiles";
import { listPublicStreams } from "@/lib/data/streams";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await getMatch((await params).matchId);
  return m ? { title: m.title, description: `${m.title} — ${m.competition?.name ?? m.sport?.name ?? ""}. Kick-off ${formatDateTime(m.starts_at)} UTC.` } : { title: "Match not found" };
}

export default async function MatchPage({ params }: Props) {
  const { matchId } = await params;
  const match = await getMatch(matchId);
  if (!match) notFound();
  const user = await getCurrentUser();
  const [streams, more, fav] = await Promise.all([
    listPublicStreams({ matchId: match.id, pageSize: 8 }),
    listMatches({ sport: match.sport?.slug, competition: match.competition?.id, status: match.status === "finished" ? "completed" : "upcoming", pageSize: 4 }),
    isFavorite(user?.id ?? null, "match", match.id),
  ]);
  const others = more.items.filter((m) => m.id !== match.id).slice(0, 3);
  const reminders = await reminderSet(user?.id ?? null, [match.id]);
  const hasScore = match.home_score != null && match.away_score != null && match.status !== "scheduled";
  const path = `/matches/${match.id}`;
  return (
    <div className="container-page py-8">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm text-muted">
          <Link href={match.sport ? `/sports/${match.sport.slug}` : "/sports"} className="hover:text-fg">{match.sport?.name}{match.competition && <> · {match.competition.name}</>}</Link>
          <StatusBadge status={match.status} isFixture={match.isFixture} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-8 sm:px-10">
          <div className="flex flex-col items-center gap-3 text-center"><TeamLogo team={match.home_team} size={80} /><h2 className="text-base font-semibold sm:text-xl">{match.home_team?.name ?? "TBC"}</h2></div>
          <div className="text-center">
            {hasScore ? <p className="text-4xl font-extrabold tabular-nums sm:text-6xl">{match.home_score}<span className="mx-2 text-muted">–</span>{match.away_score}</p> : <p className="text-2xl font-bold text-muted">vs</p>}
            {match.status === "live" && match.period && <p className="mt-1 text-sm font-semibold text-live">{match.period}</p>}
            {match.status === "scheduled" && <p className="mt-2 text-sm font-medium"><Countdown to={match.starts_at} /></p>}
          </div>
          <div className="flex flex-col items-center gap-3 text-center"><TeamLogo team={match.away_team} size={80} /><h2 className="text-base font-semibold sm:text-xl">{match.away_team?.name ?? "TBC"}</h2></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
          <div><time dateTime={match.starts_at}>{formatDateTime(match.starts_at)} UTC</time>{match.venue && <> · {match.venue}</>}{match.country && <> · {match.country}</>}</div>
          <div className="flex flex-wrap gap-2">
            {match.status === "scheduled" && <ReminderButton matchId={match.id} initial={reminders.has(match.id)} enabled={Boolean(user)} />}
            <FavoriteButton kind="match" id={match.id} initial={fav} signedIn={Boolean(user)} next={path} />
            <ShareButton title={match.title} path={path} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{match.isFixture ? "Sample fixture — not real match data." : match.data_synced_at ? `Match data from ${match.provider ?? "the sports-data provider"}, last synced ${formatDateTime(match.data_synced_at)} UTC. Scores are not real-time on the free data tier.` : "Match data entered manually."}</p>

      <Section title="Watch" className="pt-6">
        {streams.items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{streams.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div>
        ) : (
          <div className="space-y-3">
            <EmptyState title="No stream linked to this match" description="Streamers with broadcast rights can link their stream to this fixture from their dashboard." />
            <Notice tone="info" title="About coverage">A match appearing in our listings does not mean ArenaLive carries it. We only host streams from owners who confirm they hold the rights.</Notice>
          </div>
        )}
      </Section>
      {others.length > 0 && <Section title={match.status === "finished" ? "More results" : "More fixtures"}><div className="grid gap-4 sm:grid-cols-3">{others.map((m) => <MatchCard key={m.id} match={m} />)}</div></Section>}
    </div>
  );
}
