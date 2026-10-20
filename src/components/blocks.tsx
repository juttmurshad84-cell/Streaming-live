import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronRight } from "@/components/icons";
import { fixtureMode } from "@/lib/data/helpers";

export function Section({ title, href, hrefLabel = "View all", children, className, id }: { title: string; href?: string; hrefLabel?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("py-8", className)} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id={id ? `${id}-h` : undefined} className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {href && <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">{hrefLabel}<ChevronRight width={16} height={16} /></Link>}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full bg-surface text-muted">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function SkeletonGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton aspect-video w-full" />
          <div className="skeleton h-4 w-4/5" />
          <div className="skeleton h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, total, pageSize, basePath, params }: { page: number; total: number; pageSize: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const window = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && <Link href={href(page - 1)} className="btn-secondary btn-sm" rel="prev">Previous</Link>}
      {window.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && p - window[i - 1] > 1 && <span className="text-muted">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn("btn btn-sm min-w-9", p === page ? "bg-primary text-white" : "border border-line bg-surface hover:bg-card-hover")}>{p}</Link>
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)} className="btn-secondary btn-sm" rel="next">Next</Link>}
    </nav>
  );
}

/** Shown on every page while the app runs without a database. Prevents sample data being mistaken for real data. */
export function FixtureNotice() {
  if (!fixtureMode()) return null;
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
      <strong>Development fixtures:</strong> no database is configured, so the streams, matches and videos shown are <em>sample data</em> — not real broadcasts, scores or viewers. See <code className="rounded bg-black/30 px-1">docs/SETUP.md</code>.
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: string; children: React.ReactNode }) {
  const tones = { info: "border-accent/30 bg-accent/10 text-sky-100", warn: "border-amber-500/30 bg-amber-500/10 text-amber-100", error: "border-live/40 bg-live/10 text-red-100", ok: "border-ok/30 bg-ok/10 text-green-100" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="opacity-90">{children}</div>
    </div>
  );
}
