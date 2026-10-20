import type { Metadata } from "next";
import { saveCategoryAction, setCompetitionActiveAction } from "@/app/actions/admin";
import { PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ActionForm, Checkbox, SubmitButton, TextField } from "@/components/forms";
import { requireRole } from "@/lib/auth";
import { listAllCompetitions } from "@/lib/data/admin";
import { listSports } from "@/lib/data/sports";
import { sportMeta } from "@/lib/sports-meta";

export const metadata: Metadata = { title: "Admin · Categories" };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireRole("admin", "/admin/categories");
  const [sports, comps] = await Promise.all([listSports({ includeInactive: true }), listAllCompetitions()]);
  return (
    <div className="space-y-10">
      <div>
        <PageHeader title="Sport categories" description="Categories drive navigation and the sports-data mapping. “Provider sport name” maps a category to TheSportsDB’s sport label." />
        <div className="space-y-3">
          {sports.map((s) => (
            <details key={s.id} className="card">
              <summary className="flex cursor-pointer items-center gap-3 p-3"><span aria-hidden>{sportMeta(s.slug).emoji}</span><span className="flex-1 font-medium">{s.name}</span><span className="text-xs text-muted">/{s.slug}</span>{!s.is_active && <span className="chip">hidden</span>}</summary>
              <div className="border-t border-line p-4"><CategoryForm sport={s} /></div>
            </details>
          ))}
          <details className="card"><summary className="cursor-pointer p-3 font-medium text-accent">+ Add category</summary><div className="border-t border-line p-4"><CategoryForm /></div></details>
        </div>
      </div>
      <div>
        <PageHeader title="Competitions" description="Imported from the sports-data provider. Deactivate a competition to hide its fixtures from filters." />
        {comps.length === 0 ? <p className="text-sm text-muted">No competitions yet. They appear after the first sports-data sync.</p> : (
          <div className="card divide-y divide-line text-sm">{comps.map((c) => <div key={c.id} className="flex items-center gap-3 p-3"><span className="flex-1">{c.name} <span className="text-xs text-muted">· {c.sport?.name}</span></span><ConfirmAction label={c.is_active ? "Deactivate" : "Activate"} action={setCompetitionActiveAction} args={[c.id, !c.is_active]} /></div>)}</div>
        )}
      </div>
    </div>
  );
}

function CategoryForm({ sport }: { sport?: { id: string; name: string; slug: string; sort_order: number; is_active: boolean; image_url: string | null; provider_sport_name?: string | null } }) {
  return (
    <ActionForm action={saveCategoryAction} className="grid gap-4 sm:grid-cols-2">
      {sport && <input type="hidden" name="id" value={sport.id} />}
      <TextField name="name" label="Name" defaultValue={sport?.name} required />
      <TextField name="slug" label="Slug" defaultValue={sport?.slug} required hint="Lowercase letters, numbers, dashes." />
      <TextField name="sort_order" label="Sort order" defaultValue={String(sport?.sort_order ?? 100)} />
      <TextField name="provider_sport_name" label="Provider sport name" defaultValue={sport?.provider_sport_name} hint="e.g. Soccer, Basketball, Cricket" />
      <div className="sm:col-span-2"><TextField name="image_url" label="Image URL (optional)" type="url" defaultValue={sport?.image_url} /></div>
      <div className="sm:col-span-2 flex items-center justify-between"><Checkbox name="is_active" label="Active (visible)" defaultChecked={sport?.is_active ?? true} /><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}
