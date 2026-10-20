import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Section } from "@/components/blocks";
import { Thumbnail } from "@/components/media";
import { requireUser } from "@/lib/auth";
import { listFavorites } from "@/lib/data/profiles";
import { sportMeta } from "@/lib/sports-meta";

export const metadata: Metadata = { title: "Favorites", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await requireUser("/dashboard/favorites");
  const f = await listFavorites(user.id);
  const total = f.streams.length + f.videos.length + f.teams.length + f.sports.length + f.matches.length;
  return (
    <div>
      <PageHeader title="Favorites" description="Items you’ve saved. Use the Favorite button on any stream, video, match or sport." />
      {total === 0 && <EmptyState title="Nothing saved yet" description="Tap Favorite on streams, videos, matches or sports to keep them here." action={<Link href="/sports" className="btn-primary btn-sm">Browse sports</Link>} />}
      {f.sports.length > 0 && <Section title="Sports" className="py-3"><div className="flex flex-wrap gap-2">{f.sports.map((s) => <Link key={s.id} href={`/sports/${s.slug}`} className="btn-secondary">{sportMeta(s.slug).emoji} {s.name}</Link>)}</div></Section>}
      {f.streams.length > 0 && <Section title="Streams" className="py-3"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{f.streams.map((s) => <Link key={s.id} href={`/watch/${s.id}`} className="group card overflow-hidden"><Thumbnail src={s.thumbnail_url} alt={s.title} sportSlug={s.sport?.slug} /><p className="line-clamp-2 p-3 text-sm font-medium">{s.title}</p></Link>)}</div></Section>}
      {f.videos.length > 0 && <Section title="Videos" className="py-3"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{f.videos.map((v) => <Link key={v.id} href={`/videos/${v.id}`} className="group card overflow-hidden"><Thumbnail src={v.thumbnail_url} alt={v.title} sportSlug={v.sport?.slug} /><p className="line-clamp-2 p-3 text-sm font-medium">{v.title}</p></Link>)}</div></Section>}
      {f.matches.length > 0 && <Section title="Matches" className="py-3"><ul className="card divide-y divide-line">{f.matches.map((m) => <li key={m.id}><Link href={`/matches/${m.id}`} className="block p-3 text-sm hover:bg-card-hover">{m.title}</Link></li>)}</ul></Section>}
      {f.teams.length > 0 && <Section title="Teams" className="py-3"><div className="flex flex-wrap gap-2">{f.teams.map((t) => <Link key={t.id} href={`/upcoming?q=${encodeURIComponent(t.name)}`} className="btn-secondary">{t.name}</Link>)}</div></Section>}
    </div>
  );
}
