import type { Metadata } from "next";
import Link from "next/link";
import { updateEmailAction, updateNotificationPrefsAction, updateProfileAction } from "@/app/actions/profile";
import { PageHeader } from "@/components/blocks";
import { StreamerOptIn } from "@/components/StreamerOptIn";
import { ActionForm, Checkbox, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Avatar } from "@/components/media";
import { requireUser, hasRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const p = user.profile;
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title="Settings" description="Manage your profile, notifications and account." />
      <div className="space-y-6">
        <section className="card p-5 sm:p-6" aria-labelledby="s-profile">
          <h2 id="s-profile" className="mb-4 text-lg font-semibold">Profile</h2>
          <ActionForm action={updateProfileAction} encType="multipart/form-data" className="space-y-4">
            <div className="flex items-center gap-4"><Avatar src={p.avatar_url} name={p.display_name} size={64} /><div className="flex-1"><label htmlFor="avatar" className="label">Avatar</label><input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="input py-2 text-xs" /></div></div>
            <div><label htmlFor="banner" className="label">Channel banner</label><input id="banner" name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="input py-2 text-xs" /><p className="hint">PNG, JPEG or WebP up to 5 MB. Images are re-encoded and stripped of metadata.</p></div>
            <TextField name="display_name" label="Display name" defaultValue={p.display_name} required maxLength={60} />
            <div><span className="label">Username</span><p className="text-sm text-muted">@{p.username} <span className="text-xs">(cannot be changed)</span></p></div>
            <TextArea name="bio" label="Bio" defaultValue={p.bio} rows={3} maxLength={500} />
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="s-notif">
          <h2 id="s-notif" className="mb-4 text-lg font-semibold">Notifications</h2>
          <ActionForm action={updateNotificationPrefsAction} className="space-y-4">
            <Checkbox name="live_started" label="Streamers I follow go live" defaultChecked={user.notificationPrefs.live_started} />
            <Checkbox name="match_reminders" label="Reminders before matches I’ve saved" defaultChecked={user.notificationPrefs.match_reminders} />
            <Checkbox name="recording_ready" label="My replay is ready" defaultChecked={user.notificationPrefs.recording_ready} />
            <p className="text-xs text-muted">Notifications appear in-app. Email delivery is not enabled.</p>
            <SubmitButton>Save preferences</SubmitButton>
          </ActionForm>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="s-account">
          <h2 id="s-account" className="mb-4 text-lg font-semibold">Account</h2>
          <ActionForm action={updateEmailAction} className="space-y-4">
            <TextField name="email" label="Email" type="email" defaultValue={user.email} autoComplete="email" hint="Changing your email requires confirming from both addresses." />
            <SubmitButton variant="secondary">Update email</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-sm text-muted"><Link href="/forgot-password" className="text-accent hover:underline">Change your password</Link> via an emailed link.</p>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="s-stream">
          <h2 id="s-stream" className="mb-2 text-lg font-semibold">Streaming</h2>
          {hasRole(user, "streamer") ? (
            <p className="text-sm text-muted">Streaming is enabled. Go to your <Link href="/dashboard" className="text-accent hover:underline">dashboard</Link>.</p>
          ) : (
            <StreamerOptIn />
          )}
        </section>
      </div>
    </div>
  );
}
