import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <Doc title="Contact us" intro="The right channel gets you a faster answer.">
      <h2>General support and appeals</h2>
      <ContactLine what="Email us at" />
      <h2>Report content</h2>
      <p>Use the <strong>Report</strong> button on any stream, video, profile or chat message. Reports go straight to our moderators.</p>
      <h2>Copyright and takedown</h2>
      <p>Rights-holders should use the <Link href="/copyright-policy#complaint">copyright complaint form</Link>. It does not require an account.</p>
      <h2>Security issues</h2>
      <ContactLine what="Report a vulnerability privately to" />
    </Doc>
  );
}
