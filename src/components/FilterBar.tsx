import { LANGUAGES } from "@/lib/format";
import type { Sport } from "@/lib/types";

/** GET-form filters: shareable URLs, works without JavaScript. */
export function FilterBar({ action, sports, values, sorts, showLanguage = true, showSearch = true }: {
  action: string; sports?: Sport[]; values: Record<string, string | undefined>; sorts?: { value: string; label: string }[]; showLanguage?: boolean; showSearch?: boolean;
}) {
  return (
    <form action={action} className="card mb-6 flex flex-wrap items-end gap-3 p-3 sm:p-4">
      {showSearch && (
        <div className="min-w-48 flex-1">
          <label htmlFor="f-q" className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input id="f-q" name="q" defaultValue={values.q} placeholder="Title, team…" className="input py-2" />
        </div>
      )}
      {sports && (
        <div>
          <label htmlFor="f-sport" className="mb-1 block text-xs font-medium text-muted">Sport</label>
          <select id="f-sport" name="sport" defaultValue={values.sport ?? ""} className="input py-2"><option value="">All sports</option>{sports.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</select>
        </div>
      )}
      {showLanguage && (
        <div>
          <label htmlFor="f-lang" className="mb-1 block text-xs font-medium text-muted">Language</label>
          <select id="f-lang" name="language" defaultValue={values.language ?? ""} className="input py-2"><option value="">Any</option>{Object.entries(LANGUAGES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </div>
      )}
      {sorts && (
        <div>
          <label htmlFor="f-sort" className="mb-1 block text-xs font-medium text-muted">Sort</label>
          <select id="f-sort" name="sort" defaultValue={values.sort ?? sorts[0].value} className="input py-2">{sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </div>
      )}
      <button type="submit" className="btn-primary">Apply</button>
      <a href={action} className="btn-ghost">Reset</a>
    </form>
  );
}
