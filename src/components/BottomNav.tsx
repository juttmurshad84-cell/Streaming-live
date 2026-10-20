"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CalendarIcon, HomeIcon, LiveIcon, TrophyIcon, VideoIcon } from "./icons";

const ITEMS = [
  { href: "/", label: "Home", Icon: HomeIcon }, { href: "/live", label: "Live", Icon: LiveIcon }, { href: "/sports", label: "Sports", Icon: TrophyIcon },
  { href: "/upcoming", label: "Upcoming", Icon: CalendarIcon }, { href: "/videos", label: "Videos", Icon: VideoIcon },
];

/** Mobile tab bar (hidden ≥ lg where the top nav is shown). */
export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/watch/") || path.startsWith("/admin")) return null;
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-accent" : "text-muted")}>
                <Icon width={20} height={20} />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
