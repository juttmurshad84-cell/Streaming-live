import type { Metadata } from "next";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { StreamCard } from "@/components/cards";
import { FilterBar } from "@/components/FilterBar";
import { LiveIcon } from "@/components/icons";
import { listSports } from "@/lib/data/sports";
import { listPublicStreams } from "@/lib/data/streams";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Live now", description: "Every public live sports stream happening right now." };
export const dynamic = "force-dynamic";

export default async function LivePage({ searchParams }: { searchParams: SearchParams }) {
  const { get, page } = await readParams(searchParams);
  const filters = { sport: get("sport"), language: get("language"), q: get("q"), sort: get("sort") === "recent" ? ("recent" as const) : ("viewers" as const) };
  const [sports, res] = await Promise.all([listSports(), listPublicStreams({ status: "live", ...filters, page })]);
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Live" title="Live now" description="Public streams that are broadcasting right now. Viewer counts are real concurrent viewers measured by ArenaLive." />
      <FilterBar action="/live" sports={sports} values={{ q: filters.q, sport: filters.sport, language: filters.language, sort: filters.sort }} sorts={[{ value: "viewers", label: "Most watched" }, { value: "recent", label: "Recently started" }]} />
      {res.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{res.items.map((s) => <StreamCard key={s.id} stream={s} />)}</div>
      ) : (
        <EmptyState icon={<LiveIcon />} title="No live streams match" description="Try clearing the filters, or check upcoming matches." />
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/live" params={{ ...filters, sort: get("sort") }} />
    </div>
  );
}
