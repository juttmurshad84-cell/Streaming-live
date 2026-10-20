import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/blocks";
import { hasRole, requireUser } from "@/lib/auth";
import { StreamerOptIn } from "@/components/StreamerOptIn";

export const metadata: Metadata = { title: "Become a streamer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BecomeStreamerPage() {
  const user = await requireUser("/dashboard/become-streamer");
  if (hasRole(user, "streamer")) redirect("/dashboard");
  return (
    <div className="container-page max-w-2xl py-8">
      <PageHeader title="Become a streamer" />
      <div className="card p-6"><StreamerOptIn /></div>
    </div>
  );
}
