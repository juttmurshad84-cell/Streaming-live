import type { Metadata } from "next";
import { ContactLine, Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Doc title="Privacy Policy" updated="October 2026" draft>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> email, username, display name, optional avatar, banner and bio. Passwords are handled by our authentication provider (Supabase Auth) and never stored by us in plain text.</li>
        <li><strong>Activity you create:</strong> streams, videos, chat messages, follows, favorites, match reminders, reports and notifications.</li>
        <li><strong>Viewing sessions:</strong> an anonymous random session key per open watch page, used to count concurrent viewers. It is not linked to your identity and expires within minutes of inactivity.</li>
        <li><strong>Technical data:</strong> IP address and request metadata are processed transiently for rate limiting and abuse prevention and appear in server logs.</li>
        <li><strong>Copyright complaints:</strong> the complainant’s name, email, statements and signature.</li>
      </ul>
      <h2>Stream keys</h2>
      <p>Stream keys are generated and held by our streaming provider. We do not store them in our database; they are fetched on demand and shown only to the stream owner.</p>
      <h2>Who processes data</h2>
      <p>Supabase (database, authentication, storage, realtime), Cloudflare (live video ingest, recording and delivery) and, when enabled, a sports-data provider (no personal data is sent to it). Hosting providers process request data to serve the site.</p>
      <h2>Cookies</h2>
      <p>We use essential cookies for authentication sessions. We do not use advertising cookies. Embedded players (for example YouTube, using the privacy-enhanced domain) may set their own cookies when you play them.</p>
      <h2>Retention</h2>
      <p>Replays are deleted after the retention period configured by the administrator. Chat messages are kept while the stream exists. Deleted accounts have their profile content removed; audit records of moderation actions may be retained for safety.</p>
      <h2>Your rights</h2>
      <p>Depending on where you live you may have rights to access, correct, export or delete your data. You can edit your profile in Settings; for other requests contact us.</p>
      <ContactLine what="Privacy requests:" />
    </Doc>
  );
}
