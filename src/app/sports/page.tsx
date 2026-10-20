import type { Metadata } from "next";
import { PageHeader } from "@/components/blocks";
import { SportCard } from "@/components/cards";
import { listSportsWithCounts } from "@/lib/data/sports";

export const metadata: Metadata = { title: "Sports", description: "Browse live streams, fixtures and replays by sport." };
export const dynamic = "force-dynamic";

export default async function SportsPage() {
  const sports = await listSportsWithCounts();
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Browse" title="Sports" description="Counts include live streams and fixtures from the sports-data feed." />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{sports.map((s) => <SportCard key={s.id} sport={s} />)}</div>
    </div>
  );
}
