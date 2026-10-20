import Link from "next/link";
import { Notice } from "./blocks";
import { hasSupabase } from "@/lib/env";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[70vh] place-items-center py-10">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          {!hasSupabase() && <div className="mt-4"><Notice tone="warn" title="Authentication is not configured">Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable accounts. See docs/SETUP.md.</Notice></div>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-4 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  );
}
export const AuthLink = ({ href, children }: { href: string; children: React.ReactNode }) => <Link href={href} className="text-accent hover:underline">{children}</Link>;
