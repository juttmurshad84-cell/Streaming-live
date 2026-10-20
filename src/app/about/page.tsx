import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "About", description: "What ArenaLive is and how it works." };

export default function AboutPage() {
  return (
    <Doc title="About ArenaLive" intro="ArenaLive is a live sports streaming and replay platform for creators and rights-holders. “ArenaLive” is a temporary working name.">
      <h2>What you can do</h2>
      <ul>
        <li>Watch public live streams and replays, browse fixtures by sport, follow streamers and chat live.</li>
        <li>Broadcast from OBS (RTMPS, recorded automatically if enabled) or from your browser (WebRTC, live only).</li>
        <li>Attach an HLS, DASH or MP4 source you control, or a YouTube video you have rights to.</li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li><strong>Match data is not a broadcast licence.</strong> Fixtures and scores come from a sports-data provider and are shown for information. Having a fixture listed does not mean ArenaLive carries the match.</li>
        <li>We do not rebroadcast TV or pay-per-view feeds, bypass DRM, paywalls or geo-restrictions, or scrape third-party streams.</li>
        <li>We do not show simulated viewers, scores or analytics. Viewer counts are real concurrent viewers measured by our own heartbeat; if a number is unavailable it is hidden.</li>
      </ul>
      <h2>How it works</h2>
      <p>Video is delivered by a managed streaming provider, not by this web app. Replays are stored with the provider and played with short-lived signed URLs, so private videos are not reachable by guessable links. Details are in the <Link href="/help">help centre</Link>.</p>
      <h2>Rights and safety</h2>
      <p>Streamers confirm they hold the rights to what they broadcast. Read our <Link href="/community-guidelines">Community Guidelines</Link> and <Link href="/copyright-policy">Copyright Policy</Link>, or <Link href="/contact">contact us</Link>.</p>
    </Doc>
  );
}
