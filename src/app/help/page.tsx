import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Help centre" };

const Q = ({ q, children }: { q: string; children: React.ReactNode }) => <details className="card group p-4"><summary className="cursor-pointer font-medium text-fg">{q}</summary><div className="mt-3 space-y-2 text-sm">{children}</div></details>;

export default function HelpPage() {
  return (
    <Doc title="Help centre" intro="Answers to common questions for viewers and streamers.">
      <h2>Watching</h2>
      <div className="not-prose space-y-3">
        <Q q="Why does a stream say it is offline or waiting?">The broadcaster has not connected, or the connection dropped. The page re-checks automatically every few seconds. Streams only show LIVE when our streaming provider confirms an encoder is connected.</Q>
        <Q q="The video buffers or fails to play"><p>Check your connection, then use “Check again”. Live streams from OBS use HLS with a few seconds of latency; browser broadcasts use WebRTC with sub-second latency but can’t be rewound.</p></Q>
        <Q q="Why is a match listed but no stream is available?">Fixtures come from a sports-data feed. We only carry streams from owners who confirm they hold the rights, so many matches will have no stream.</Q>
        <Q q="Are viewer counts real?">Yes — concurrent viewers measured while watch pages are open. If the count is unavailable we hide it rather than guess.</Q>
      </div>
      <h2>Streaming</h2>
      <div className="not-prose space-y-3">
        <Q q="How do I stream with OBS?"><ol className="list-decimal space-y-1 pl-5"><li>Enable streaming in <Link href="/settings">Settings</Link> and create a stream choosing “OBS / encoder”.</li><li>Open <Link href="/dashboard/go-live">Go live</Link>, reveal the server and stream key.</li><li>In OBS choose Settings → Stream → Custom, paste both, then Start Streaming. Use H.264 + AAC, 2-second keyframes.</li></ol></Q>
        <Q q="How do I broadcast from my browser?">Create a stream with “Browser camera”, open Go live, allow camera and microphone and press Start. Browser broadcasts are live only — they are never recorded and produce no replay.</Q>
        <Q q="Is my stream key safe?">Stream keys are never stored in our database or shown to anyone but you, and only when you ask to reveal them. If one leaks, regenerate it on Go live — the old key stops working immediately.</Q>
        <Q q="Where is my replay?">OBS broadcasts with recording enabled become replays after the provider finishes processing (usually minutes). A replay is only published once it is verified ready. Check <Link href="/dashboard/videos">My videos</Link>.</Q>
        <Q q="Which external sources can I add?">HTTPS HLS (.m3u8), DASH (.mpd) or MP4 URLs you control, YouTube links you have rights to, and embeds from hosts the administrator approved. DRM-protected, paywalled, geo-restricted or login-gated streams are not supported.</Q>
        <Q q="Thumbnails">Upload a PNG, JPEG or WebP (up to 5 MB, at least 320×180) or paste an image URL. Click the preview to set the focal point; the saved image is a 16:9 crop centred there.</Q>
      </div>
      <h2>Account and safety</h2>
      <div className="not-prose space-y-3">
        <Q q="I was muted or suspended">Chat mutes are set by the streamer or moderators. For suspensions or takedowns, contact support from the <Link href="/contact">contact page</Link> to appeal.</Q>
        <Q q="How do I report something?">Use the Report button on the content, or the <Link href="/copyright-policy#complaint">copyright form</Link> for infringement.</Q>
      </div>
    </Doc>
  );
}
