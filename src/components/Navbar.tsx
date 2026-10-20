import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { unreadCount } from "@/lib/data/profiles";
import { Avatar } from "./media";
import { Dropdown, menuItem } from "./Dropdown";
import { BellIcon, CameraIcon, MenuIcon, SearchIcon, ShieldIcon } from "./icons";

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/sports", label: "Sports" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/videos", label: "Videos" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`} aria-label="ArenaLive home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/30">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 12a7 7 0 0 1 14 0" /><path d="M8.5 12a3.5 3.5 0 0 1 7 0" /><circle cx="12" cy="12.5" r="1" fill="currentColor" /></svg>
      </span>
      <span className="text-lg">Arena<span className="text-accent">Live</span></span>
    </Link>
  );
}

export async function Navbar() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const streamer = hasRole(user, "streamer");
  const staff = hasRole(user, "moderator");
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-3 lg:gap-6">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-fg">{n.label}</Link>)}
        </nav>
        <form action="/search" role="search" className="ml-auto hidden max-w-sm flex-1 md:block">
          <label htmlFor="nav-search" className="sr-only">Search</label>
          <div className="relative">
            <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input id="nav-search" name="q" type="search" placeholder="Search streams, teams, sports…" className="input rounded-full py-2 pl-9" autoComplete="off" />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Link href="/search" className="btn-ghost p-2 md:hidden" aria-label="Search"><SearchIcon /></Link>
          {user ? (
            <>
              {streamer && <Link href="/dashboard/go-live" className="btn-primary btn-sm hidden sm:inline-flex"><CameraIcon width={16} height={16} />Go live</Link>}
              <Link href="/dashboard/notifications" className="btn-ghost relative p-2" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                <BellIcon />
                {unread > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <Dropdown label="Account menu" trigger={<Avatar src={user.profile.avatar_url} name={user.profile.display_name} size={34} />}>
                <div className="border-b border-line px-3 py-2"><p className="truncate text-sm font-semibold">{user.profile.display_name}</p><p className="truncate text-xs text-muted">@{user.profile.username}</p></div>
                <Link role="menuitem" href="/dashboard" className={menuItem}>Dashboard</Link>
                <Link role="menuitem" href={`/streamer/${user.profile.username}`} className={menuItem}>My channel</Link>
                <Link role="menuitem" href="/dashboard/following" className={menuItem}>Following</Link>
                <Link role="menuitem" href="/dashboard/favorites" className={menuItem}>Favorites</Link>
                <Link role="menuitem" href="/settings" className={menuItem}>Settings</Link>
                {staff && <Link role="menuitem" href="/admin" className={menuItem}><ShieldIcon width={16} height={16} />Admin</Link>}
                <form action={signOutAction}><button role="menuitem" type="submit" className={`${menuItem} text-red-300`}>Sign out</button></form>
              </Dropdown>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">Sign in</Link>
              <Link href="/register" className="btn-primary btn-sm">Sign up</Link>
            </>
          )}
          <Dropdown label="Open menu" trigger={<span className="btn-ghost block p-2 lg:hidden"><MenuIcon /></span>} className="lg:hidden">
            {NAV.map((n) => <Link role="menuitem" key={n.href} href={n.href} className={menuItem}>{n.label}</Link>)}
            <Link role="menuitem" href="/completed" className={menuItem}>Results</Link>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
