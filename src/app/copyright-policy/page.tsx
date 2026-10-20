import type { Metadata } from "next";
import { Doc } from "@/components/Doc";
import { ActionForm, Checkbox, SubmitButton, TextArea, TextField } from "@/components/forms";
import { submitCopyrightAction } from "@/app/actions/moderation";

export const metadata: Metadata = { title: "Copyright Policy & complaints" };

export default function CopyrightPage() {
  return (
    <Doc title="Copyright Policy" updated="October 2026" draft intro="ArenaLive respects intellectual property rights and expects its streamers to do the same.">
      <h2>Our approach</h2>
      <ul>
        <li>Streamers must confirm they have the rights to what they broadcast before going live.</li>
        <li>We do not auto-rebroadcast television feeds and a sports-data listing grants no broadcast rights.</li>
        <li>When we receive a valid complaint we review it, and if upheld we disable the stream or hide the video and record a strike against the owner. Three strikes lead to account suspension.</li>
        <li>The owner is notified and may submit a counter-notice, which we record and handle according to applicable law.</li>
      </ul>
      <h2 id="complaint">File a copyright complaint</h2>
      <p>If you are the rights-holder (or authorised to act for them) and believe content on ArenaLive infringes your copyright, complete this form. You do not need an account. Submitting a knowingly false complaint may have legal consequences.</p>
      <div className="not-prose card p-5">
        <ActionForm action={submitCopyrightAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><TextField name="complainant_name" label="Full legal name" required autoComplete="name" /><TextField name="complainant_email" label="Email" type="email" required autoComplete="email" /></div>
          <TextField name="company" label="Company / rights-holder (optional)" />
          <TextArea name="work_description" label="Describe the copyrighted work" rows={4} hint="Identify the work you own and how you hold the rights." />
          <TextArea name="urls" label="URLs of the infringing content on ArenaLive" rows={3} hint="Full URLs, one per line (up to 20), for example https://your-site/watch/…" />
          <Checkbox name="good_faith" label="I have a good-faith belief that the use is not authorised by the copyright owner, its agent or the law." />
          <Checkbox name="accuracy" label="The information in this complaint is accurate, and I am the owner or authorised to act on the owner’s behalf, under penalty of perjury." />
          <TextField name="signature" label="Electronic signature (type your full name)" required />
          <SubmitButton pendingLabel="Submitting…">Submit complaint</SubmitButton>
        </ActionForm>
      </div>
    </Doc>
  );
}
