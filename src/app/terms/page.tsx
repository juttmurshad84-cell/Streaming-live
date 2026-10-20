import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <Doc title="Terms of Service" updated="October 2026" draft>
      <h2>1. Using ArenaLive</h2>
      <p>By creating an account or using the service you agree to these terms, our <Link href="/privacy">Privacy Policy</Link>, <Link href="/community-guidelines">Community Guidelines</Link> and <Link href="/copyright-policy">Copyright Policy</Link>. You must be old enough to form a binding contract where you live, and at least 13 years old.</p>
      <h2>2. Your account</h2>
      <p>You are responsible for activity on your account and for keeping your password and any stream keys secret. Tell us promptly if you suspect misuse.</p>
      <h2>3. Streaming and content</h2>
      <ul>
        <li>You may broadcast or publish only content you own or are licensed to distribute, including all video, audio, music and sports footage.</li>
        <li>You must not rebroadcast television, pay-per-view or subscription feeds without a licence, or circumvent DRM, paywalls, geo-restrictions or other access controls.</li>
        <li>Listing a match from a sports-data feed is not a licence to broadcast it.</li>
        <li>You keep ownership of your content and grant ArenaLive a worldwide, non-exclusive licence to host, record (where you enable it), process and deliver it to the audience you choose, for as long as you keep it on the service.</li>
      </ul>
      <h2>4. Recordings</h2>
      <p>Where recording is enabled, we store replays with our video provider subject to the retention period and quotas set by the administrator. Browser (WebRTC) broadcasts are not recorded.</p>
      <h2>5. Enforcement</h2>
      <p>We may remove content, disable streams, mute or suspend accounts for violations, legal requests or security reasons. Repeated copyright infringement leads to account suspension (three strikes). You can appeal by contacting us.</p>
      <h2>6. Availability and liability</h2>
      <p>The service is provided “as is”. Live streaming depends on third-party networks and providers and may be interrupted. To the extent permitted by law, ArenaLive is not liable for indirect or consequential losses.</p>
      <h2>7. Changes</h2>
      <p>We may update these terms; continued use after changes means you accept them.</p>
      <ContactLine what="Questions about these terms:" />
    </Doc>
  );
}
