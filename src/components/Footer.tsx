import Link from "next/link";
import { Logo } from "./Navbar";

const COLS = [
  { title: "Watch", links: [["Live now", "/live"], ["Sports", "/sports"], ["Upcoming", "/upcoming"], ["Results", "/completed"], ["Videos", "/videos"]] },
  { title: "Create", links: [["Dashboard", "/dashboard"], ["Go live", "/dashboard/go-live"], ["Your streams", "/dashboard/streams"], ["Your videos", "/dashboard/videos"]] },
  { title: "Support", links: [["Help centre", "/help"], ["Contact", "/contact"], ["About", "/about"], ["Copyright complaints", "/copyright-policy#complaint"]] },
  { title: "Legal", links: [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Community Guidelines", "/community-guidelines"], ["Copyright Policy", "/copyright-policy"]] },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface/60 pb-24 lg:pb-0">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Live sports streams and replays from creators and rights-holders. ArenaLive is a temporary working name.</p>
          <p className="max-w-xs text-xs text-muted/80">Match data does not imply broadcast rights. Streams are provided by their owners, who confirm they hold the rights to broadcast.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg/80">{c.title}</h2>
            <ul className="space-y-2">{c.links.map(([l, h]) => <li key={h}><Link href={h} className="text-sm text-muted hover:text-fg">{l}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line"><div className="container-page flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:justify-between"><span>© {new Date().getUTCFullYear()} ArenaLive. All rights reserved.</span><span>Sports data: TheSportsDB (when enabled). All times shown in UTC.</span></div></div>
    </footer>
  );
}
