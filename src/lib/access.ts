import type { Stream, Video, Visibility } from "./types";

export interface Viewer {
  id: string | null;
  staff: boolean;
}
export const GUEST: Viewer = { id: null, staff: false };

/** Single source of truth for who may open a watch page. RLS enforces the same rules for listings. */
export function canViewStream(s: Pick<Stream, "owner_id" | "visibility" | "status" | "is_published">, v: Viewer): boolean {
  if (v.staff || (v.id && v.id === s.owner_id)) return true;
  if (s.status === "disabled" || !s.is_published) return false;
  return s.visibility === "public" || s.visibility === "unlisted";
}

export function canViewVideo(
  video: Pick<Video, "owner_id" | "visibility" | "processing_status" | "published_at">,
  v: Viewer,
): boolean {
  if (v.staff || (v.id && v.id === video.owner_id)) return true;
  if (video.processing_status !== "ready" || !video.published_at) return false;
  return video.visibility === "public" || video.visibility === "unlisted";
}

/** Only `public` content is discoverable (lists, search, recommendations). */
export const isDiscoverable = (visibility: Visibility) => visibility === "public";
