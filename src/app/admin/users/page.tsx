import type { Metadata } from "next";
import Link from "next/link";
import { setRecordingApprovalAction, setSuspensionAction } from "@/app/actions/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/blocks";
import { RoleSelect } from "@/components/AdminControls";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FilterBar } from "@/components/FilterBar";
import { Avatar } from "@/components/media";
import { requireRole } from "@/lib/auth";
import { listAdminUsers } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/params";

export const metadata: Metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireRole("admin", "/admin/users");
  const { get, page } = await readParams(searchParams);
  const res = await listAdminUsers({ q: get("q"), role: get("role"), page });
  return (
    <div>
      <PageHeader title="Users" description={`${res.total} accounts. Suspending an account unpublishes its streams and cuts live ingest.`} />
      <FilterBar action="/admin/users" values={{ q: get("q") }} showLanguage={false} />
      {res.items.length === 0 ? <EmptyState title="No users found" /> : (
        <div className="card divide-y divide-line">
          {res.items.map((u) => {
            const suspended = Boolean(u.private?.suspended_at);
            const self = u.id === me.id;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <Avatar src={u.avatar_url} name={u.display_name} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/streamer/${u.username}`} className="block truncate font-medium hover:text-accent">{u.display_name} <span className="text-muted">@{u.username}</span></Link>
                  <p className="text-xs text-muted">Joined {formatDate(u.created_at)} · {u.follower_count} followers · {u.private?.strikes ?? 0} strikes{suspended && <span className="text-red-300"> · suspended{u.private?.suspended_reason ? `: ${u.private.suspended_reason}` : ""}</span>}</p>
                </div>
                <RoleSelect userId={u.id} role={u.role ?? "viewer"} disabled={self} />
                {u.role === "streamer" && <ConfirmAction label={u.private?.recording_approved ? "Revoke recording" : "Approve recording"} variant="ghost" action={setRecordingApprovalAction} args={[u.id, !u.private?.recording_approved]} />}
                {!self && (suspended ? <ConfirmAction label="Restore" action={setSuspensionAction} args={[u.id, false]} /> : <ConfirmAction label="Suspend" variant="danger" confirm={`Suspend @${u.username}?`} action={setSuspensionAction} args={[u.id, true, "Suspended by administrator"]} />)}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={res.pageSize} basePath="/admin/users" params={{ q: get("q") }} />
    </div>
  );
}
