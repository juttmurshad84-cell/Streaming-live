import { SideNav } from "@/components/DashNav";
import { hasRole, requireRole } from "@/lib/auth";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("moderator", "/admin");
  const admin = hasRole(user, "admin");
  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SideNav title={admin ? "Admin" : "Moderation"} items={[
          { href: "/admin", label: "Overview", exact: true },
          { href: "/admin/reports", label: "Reports & copyright" },
          { href: "/admin/streams", label: "Streams" },
          { href: "/admin/videos", label: "Videos" },
          { href: "/admin/users", label: "Users", hidden: !admin },
          { href: "/admin/categories", label: "Categories", hidden: !admin },
          { href: "/admin/integrations", label: "Integrations", hidden: !admin },
        ]} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
