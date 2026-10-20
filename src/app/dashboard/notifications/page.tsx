import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions/social";
import { EmptyState, PageHeader } from "@/components/blocks";
import { ConfirmAction } from "@/components/ConfirmAction";
import { BellIcon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/data/profiles";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div>
      <PageHeader title="Notifications" description="Go-live alerts, match reminders and replay updates." actions={unread > 0 ? <ConfirmAction label="Mark all read" action={markNotificationsReadAction} args={[]} /> : undefined} />
      {items.length === 0 ? <EmptyState icon={<BellIcon />} title="You’re all caught up" description="Follow streamers and set match reminders to get notified." /> : (
        <ul className="card divide-y divide-line">
          {items.map((n) => {
            const body = (<><p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>{n.body && <p className="text-sm text-muted">{n.body}</p>}<p className="mt-0.5 text-xs text-muted">{timeAgo(n.created_at)}</p></>);
            return <li key={n.id} className={cn("flex gap-3 p-4", !n.read_at && "bg-primary/5")}>{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}<div className="min-w-0 flex-1">{n.link && n.link.startsWith("/") ? <Link href={n.link} className="block hover:text-accent">{body}</Link> : body}</div>{!n.read_at && <ConfirmAction label="Read" action={markNotificationsReadAction} args={[[n.id]]} />}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
