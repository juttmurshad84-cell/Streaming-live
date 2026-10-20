import type { Metadata } from "next";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { MatchCard } from "@/components/cards";
import { FilterBar } from "@/components/FilterBar";
import { CalendarIcon } from "@/components/icons";
import { listMatches } from "@/lib/data/matches";
import { listSports } from "@/lib/data/sports";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Results", description: "Completed matches. Scores come from the sports-data provider and are shown as published (never estimated)." };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { get, page } = await readParams(searchParams);
  const filters = { sport: get("sport"), language: get("language"), q: get("q"), competition: get("competition") };
  const [sports, res] = await Promise.all([listSports(), listMatches({ status: "completed",  ...filters, page })]);
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Fixtures" title="Results" description="Completed matches. Scores come from the sports-data provider and are shown as published (never estimated)." />
      <FilterBar action="/completed" sports={sports} values={filters} showLanguage={false} />
      {res.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.items.map((m) => <MatchCard key={m.id} match={m}  />)}</div>
      ) : (
        <EmptyState icon={<CalendarIcon />} title="No matches found" description="Try different filters. Match data appears after the sports-data sync has run." />
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/completed" params={filters} />
    </div>
  );
}
