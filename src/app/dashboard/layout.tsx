import { SideNav } from "@/components/DashNav";
import { hasRole, requireUser } from "@/lib/auth";
import { Notice } from "@/components/blocks";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  const streamer = hasRole(user, "streamer");
  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SideNav title="Dashboard" items={[
          { href: "/dashboard", label: "Overview", exact: true },
          { href: "/dashboard/streams", label: "My streams", hidden: !streamer },
          { href: "/dashboard/go-live", label: "Go live", hidden: !streamer },
          { href: "/dashboard/videos", label: "My videos", hidden: !streamer },
          { href: "/dashboard/following", label: "Following" },
          { href: "/dashboard/favorites", label: "Favorites" },
          { href: "/dashboard/notifications", label: "Notifications" },
        ]} />
      </aside>
      <div className="min-w-0">
        {user.suspended && <div className="mb-4"><Notice tone="error" title="Your account is suspended">You can sign in and view content, but streaming, chat and uploads are disabled. Contact support to appeal.</Notice></div>}
        {children}
      </div>
    </div>
  );
}
