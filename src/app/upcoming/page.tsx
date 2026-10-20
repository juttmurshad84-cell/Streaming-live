import type { Metadata } from "next";
import { hoursAgoIso } from "@/lib/time";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { MatchCard } from "@/components/cards";
import { FilterBar } from "@/components/FilterBar";
import { CalendarIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { listMatches, reminderSet } from "@/lib/data/matches";
import { listSports } from "@/lib/data/sports";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Upcoming matches", description: "Fixtures from the sports-data feed and events scheduled by streamers. Times are UTC. A fixture appearing here does not mean it will be streamed on ArenaLive." };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { get, page } = await readParams(searchParams);
  const filters = { sport: get("sport"), language: get("language"), q: get("q"), competition: get("competition") };
  const [user, sports, res] = await Promise.all([getCurrentUser(), listSports(), listMatches({ status: "upcoming", from: hoursAgoIso(3), ...filters, page })]);
  const reminders = await reminderSet(user?.id ?? null, res.items.map((m) => m.id));
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Fixtures" title="Upcoming matches" description="Fixtures from the sports-data feed and events scheduled by streamers. Times are UTC. A fixture appearing here does not mean it will be streamed on ArenaLive." />
      <FilterBar action="/upcoming" sports={sports} values={filters} showLanguage={false} />
      {res.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.items.map((m) => <MatchCard key={m.id} match={m} reminder={{ enabled: Boolean(user), set: reminders.has(m.id) }} />)}</div>
      ) : (
        <EmptyState icon={<CalendarIcon />} title="No matches found" description="Try different filters. Match data appears after the sports-data sync has run." />
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/upcoming" params={filters} />
    </div>
  );
}
