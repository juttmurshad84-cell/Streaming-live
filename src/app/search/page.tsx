import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Section } from "@/components/blocks";
import { MatchCard, StreamCard, StreamerCard, VideoCard } from "@/components/cards";
import { SearchIcon } from "@/components/icons";
import { TeamLogo } from "@/components/media";
import { listMatches } from "@/lib/data/matches";
import { searchTeams } from "@/lib/data/matches";
import { searchProfiles } from "@/lib/data/profiles";
import { listSports } from "@/lib/data/sports";
import { listPublicStreams } from "@/lib/data/streams";
import { listPublicVideos } from "@/lib/data/videos";
import { readParams, type SearchParams } from "@/lib/params";
import { sportMeta } from "@/lib/sports-meta";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { get } = await readParams(searchParams);
  const q = (get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) {
    return (
      <div className="container-page py-8">
        <PageHeader title="Search" description="Find streams, videos, matches, teams, sports and streamers." />
        <form action="/search" role="search" className="max-w-xl"><label htmlFor="q" className="sr-only">Search</label><input id="q" name="q" type="search" defaultValue={q} placeholder="Try “cricket” or a team name" className="input" autoFocus /></form>
        {q.length === 1 && <p className="mt-3 text-sm text-muted">Enter at least 2 characters.</p>}
      </div>
    );
  }
  const [sports, streams, videos, matches, teams, people] = await Promise.all([
    listSports(), listPublicStreams({ q, pageSize: 8, sort: "recent" }), listPublicVideos({ q, pageSize: 8 }), listMatches({ q, pageSize: 6, sort: "start_desc" }), searchTeams(q, 8), searchProfiles(q, 6),
  ]);
  const sportHits = sports.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  const total = streams.total + videos.total + matches.total + teams.length + people.length + sportHits.length;
  return (
    <div className="container-page py-8">
      <PageHeader title={`Results for “${q}”`} description={`${total} result${total === 1 ? "" : "s"}`} />
      <form action="/search" role="search" className="mb-4 max-w-xl"><label htmlFor="q" className="sr-only">Search</label><input id="q" name="q" type="search" defaultValue={q} className="input" /></form>
      {total === 0 && <EmptyState icon={<SearchIcon />} title="Nothing found" description="Check the spelling or try a broader term. Private and unlisted content is never searchable." />}
      {sportHits.length > 0 && <Section title="Sports"><div className="flex flex-wrap gap-2">{sportHits.map((s) => <Link key={s.id} href={`/sports/${s.slug}`} className="btn-secondary">{sportMeta(s.slug).emoji} {s.name}</Link>)}</div></Section>}
      {streams.items.length > 0 && <Section title="Streams"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{streams.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div></Section>}
      {matches.items.length > 0 && <Section title="Matches"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matches.items.map((m) => <MatchCard key={m.id} match={m} />)}</div></Section>}
      {teams.length > 0 && <Section title="Teams"><div className="flex flex-wrap gap-2">{teams.map((t) => <Link key={t.id} href={`/upcoming?q=${encodeURIComponent(t.name)}`} className="btn-secondary"><TeamLogo team={t} size={20} />{t.name}</Link>)}</div></Section>}
      {videos.items.length > 0 && <Section title="Videos"><div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{videos.items.map((v) => <VideoCard key={v.id} video={v} />)}</div></Section>}
      {people.length > 0 && <Section title="Streamers"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{people.map((p) => <StreamerCard key={p.id} streamer={{ ...p, follower_count: p.follower_count ?? 0, isLive: false, sports: [] }} />)}</div></Section>}
    </div>
  );
}
