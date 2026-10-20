import type { Metadata } from "next";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { VideoCard } from "@/components/cards";
import { FilterBar } from "@/components/FilterBar";
import { VideoIcon } from "@/components/icons";
import { listSports } from "@/lib/data/sports";
import { listPublicVideos } from "@/lib/data/videos";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Videos", description: "Replays of finished broadcasts." };
export const dynamic = "force-dynamic";

export default async function VideosPage({ searchParams }: { searchParams: SearchParams }) {
  const { get, page } = await readParams(searchParams);
  const sort = get("sort") === "views" ? ("views" as const) : ("newest" as const);
  const since = (["day", "week", "month", "year"] as const).find((s) => s === get("since"));
  const filters = { sport: get("sport"), q: get("q") };
  const [sports, res] = await Promise.all([listSports(), listPublicVideos({ ...filters, sort, since, page })]);
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Replays" title="Videos" description="Public replays of recorded broadcasts. Unlisted and private videos never appear here." />
      <FilterBar action="/videos" sports={sports} values={{ ...filters, sort }} showLanguage={false} sorts={[{ value: "newest", label: "Newest" }, { value: "views", label: "Most viewed" }]} />
      {res.items.length ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{res.items.map((v) => <VideoCard key={v.id} video={v} />)}</div>
      ) : (
        <EmptyState icon={<VideoIcon />} title="No videos found" description="Replays appear after a recorded broadcast finishes processing." />
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/videos" params={{ ...filters, sort: get("sort"), since }} />
    </div>
  );
}
