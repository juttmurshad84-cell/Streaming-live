import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-20 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold">We couldn’t find that page</h1>
        <p className="mt-2 text-muted">It may have been removed, made private, or the link is wrong.</p>
        <div className="mt-6 flex justify-center gap-3"><Link href="/" className="btn-primary">Back home</Link><Link href="/live" className="btn-secondary">Live now</Link></div>
      </div>
    </div>
  );
}
