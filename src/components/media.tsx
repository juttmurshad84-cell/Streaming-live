import Image from "next/image";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { sportMeta } from "@/lib/sports-meta";

function optimizable(src: string) {
  try {
    const h = new URL(src).hostname;
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
    return h === sb || h.endsWith(".cloudflarestream.com") || h === "r2.thesportsdb.com" || h === "www.thesportsdb.com" || h === "i.ytimg.com";
  } catch {
    return false;
  }
}

/** 16:9 thumbnail with focal-point positioning, lazy loading and a generated sport-themed fallback (no stock imagery). */
export function Thumbnail({ src, alt, focusX = 50, focusY = 50, sportSlug, priority, sizes = "(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw", className, children }: {
  src?: string | null; alt?: string | null; focusX?: number; focusY?: number; sportSlug?: string | null; priority?: boolean; sizes?: string; className?: string; children?: React.ReactNode;
}) {
  const meta = sportMeta(sportSlug);
  const pos = { objectPosition: `${focusX}% ${focusY}%` };
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-surface", className)}>
      {src ? (
        optimizable(src) ? (
          <Image src={src} alt={alt ?? ""} fill sizes={sizes} priority={priority} style={pos} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? ""} loading={priority ? "eager" : "lazy"} decoding="async" style={pos} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        )
      ) : (
        <div role="img" aria-label={alt || "Thumbnail placeholder"} className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(115deg, rgb(255 255 255 / .08) 0 2px, transparent 2px 22px)" }} />
          <span className="relative text-5xl drop-shadow-lg sm:text-6xl" aria-hidden>{meta.emoji}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      {children}
    </div>
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-[11px] font-bold tracking-wide text-white shadow", className)}>
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />LIVE
    </span>
  );
}

export function StatusBadge({ status, isFixture, className }: { status: string; isFixture?: boolean; className?: string }) {
  if (isFixture) return <span className={cn("rounded-md bg-amber-500/90 px-2 py-0.5 text-[11px] font-bold tracking-wide text-black", className)} title="Development fixture: sample data, not a real broadcast">SAMPLE</span>;
  if (status === "live") return <LiveBadge className={className} />;
  const map: Record<string, [string, string]> = {
    scheduled: ["UPCOMING", "bg-primary/90 text-white"], finished: ["FINISHED", "bg-slate-600/90 text-white"], ended: ["ENDED", "bg-slate-600/90 text-white"],
    postponed: ["POSTPONED", "bg-amber-500/90 text-black"], cancelled: ["CANCELLED", "bg-slate-700 text-slate-200"], draft: ["DRAFT", "bg-slate-600/90 text-white"], disabled: ["DISABLED", "bg-live/80 text-white"],
  };
  const [label, cls] = map[status] ?? [status.toUpperCase(), "bg-slate-600 text-white"];
  return <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide", cls, className)}>{label}</span>;
}

export function Avatar({ src, name, size = 32, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return <span aria-hidden style={style} className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-bold text-white", className)}>{initials(name)}</span>;
}

export function TeamLogo({ team, size = 28 }: { team: { name: string; short_name?: string | null; logo_url?: string | null } | null | undefined; size?: number }) {
  if (!team) return <span style={{ width: size, height: size }} className="shrink-0 rounded-full bg-surface" aria-hidden />;
  if (team.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={team.logo_url} alt="" width={size} height={size} loading="lazy" className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  return <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.34 }} className="grid shrink-0 place-items-center rounded-full border border-line bg-surface font-bold text-muted">{(team.short_name ?? initials(team.name)).slice(0, 3)}</span>;
}

export function SportEmoji({ slug, className }: { slug?: string | null; className?: string }) {
  return <span aria-hidden className={className}>{sportMeta(slug).emoji}</span>;
}
