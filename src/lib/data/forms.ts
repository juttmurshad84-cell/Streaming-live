import "server-only";
import { hasServiceRole, hasCloudflare } from "@/lib/env";
import { recordingAllowedFor } from "@/lib/recording";
import { listSports } from "./sports";
import { listMatches } from "./matches";

/** Everything the stream form needs, for new and edit pages. */
export async function streamFormData(ownerId: string) {
  const [sports, matches, rec] = await Promise.all([
    listSports(),
    listMatches({ status: "upcoming", from: new Date(Date.now() - 6 * 3600_000).toISOString(), pageSize: 100 }),
    hasServiceRole() ? recordingAllowedFor(ownerId) : Promise.resolve({ allowed: false, reason: "Recording requires the database service role to be configured." }),
  ]);
  return {
    sports,
    matches: matches.items.map((m) => ({ id: m.id, title: m.title, sport_slug: m.sport?.slug ?? null, starts_at: m.starts_at })),
    platformReady: hasCloudflare() && hasServiceRole(),
    recordingAllowed: rec.allowed && hasCloudflare(),
    recordingNote: rec.reason,
  };
}
