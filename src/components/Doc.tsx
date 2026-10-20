import { Notice } from "./blocks";

export function Doc({ title, updated, intro, children, draft }: { title: string; updated?: string; intro?: string; children: React.ReactNode; draft?: boolean }) {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {updated && <p className="mt-1 text-xs text-muted">Last updated {updated}</p>}
      {intro && <p className="mt-4 text-lg text-muted">{intro}</p>}
      {draft && <div className="mt-6"><Notice tone="warn" title="Template notice">This document is a working draft for the temporary ArenaLive brand. It is not legal advice — have it reviewed by qualified counsel and adapt it to your jurisdiction before launch.</Notice></div>}
      <div className="prose-doc mt-8">{children}</div>
    </div>
  );
}

export const contactEmail = () => process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;
export function ContactLine({ what }: { what: string }) {
  const e = contactEmail();
  return e ? <p>{what} <a href={`mailto:${e}`}>{e}</a>.</p> : <p><em>{what} (the operator has not configured a contact address yet — set <code>NEXT_PUBLIC_CONTACT_EMAIL</code>).</em></p>;
}
