import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function GuidelinesPage() {
  return (
    <Doc title="Community Guidelines" updated="October 2026" intro="Sport is better when everyone can enjoy it. These rules apply to streams, videos, profiles and chat.">
      <h2>Be respectful</h2>
      <ul><li>No harassment, hate speech, threats or targeted abuse — of players, officials, streamers or other viewers.</li><li>No doxxing or sharing private information.</li></ul>
      <h2>Keep it legal</h2>
      <ul><li>Only broadcast what you have the rights to. See the <Link href="/copyright-policy">Copyright Policy</Link>.</li><li>No illegal content, gambling-tout spam or scams.</li></ul>
      <h2>Keep it safe</h2>
      <ul><li>No graphic violence, sexual content or content that endangers minors.</li><li>No self-harm promotion.</li></ul>
      <h2>No spam or manipulation</h2>
      <ul><li>No repeated messages, mass links or fake engagement. Chat enforces a link limit and rate limits automatically.</li></ul>
      <h2>Enforcement</h2>
      <p>Moderators can delete chat messages, mute users, disable streams, hide videos and suspend accounts. Streamers moderate their own chat. Serious or repeated violations lead to suspension. Use <strong>Report</strong> on any content to flag it.</p>
    </Doc>
  );
}
