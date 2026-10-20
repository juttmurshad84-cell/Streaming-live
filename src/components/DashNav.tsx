"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function SideNav({ items, title }: { items: { href: string; label: string; exact?: boolean; hidden?: boolean }[]; title: string }) {
  const path = usePathname();
  return (
    <nav aria-label={title} className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
      <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-widest text-muted lg:block">{title}</p>
      {items.filter((i) => !i.hidden).map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary/15 text-accent" : "text-muted hover:bg-card hover:text-fg")}>{i.label}</Link>;
      })}
    </nav>
  );
}
