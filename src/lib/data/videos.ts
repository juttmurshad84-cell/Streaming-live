import "server-only";
import { canViewVideo, type Viewer } from "@/lib/access";
import { fxVideos } from "@/lib/fixtures";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Page, Recording, Video } from "@/lib/types";
import { clampPage, fixtureMode, likePattern, pageOf, PAGE_SIZE, readDb, slicePage, VIDEO_SELECT } from "./helpers";
import { getSportBySlug } from "./sports";

export interface VideoFilters {
  sport?: string;
  q?: string;
  sort?: "newest" | "views";
  since?: "day" | "week" | "month" | "year";
  ownerId?: string;
  excludeId?: string;
  page?: number;
  pageSize?: number;
}
const SINCE_MS = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 };

/** Discovery: PUBLIC + ready + published only. */
export async function listPublicVideos(f: VideoFilters = {}): Promise<Page<Video>> {
  const page = clampPage(f.page);
  const pageSize = f.pageSize ?? PAGE_SIZE;
  const sinceIso = f.since ? new Date(Date.now() - SINCE_MS[f.since]).toISOString() : null;

  if (fixtureMode()) {
    let rows = fxVideos.slice();
    if (f.sport) rows = rows.filter((v) => v.sport?.slug === f.sport);
    if (f.q) rows = rows.filter((v) => v.title.toLowerCase().includes(f.q!.toLowerCase()));
    if (f.ownerId) rows = rows.filter((v) => v.owner_id === f.ownerId);
    if (f.excludeId) rows = rows.filter((v) => v.id !== f.excludeId);
    if (sinceIso) rows = rows.filter((v) => (v.published_at ?? "") >= sinceIso);
    rows.sort((a, b) => (f.sort === "views" ? b.view_count - a.view_count : (b.published_at ?? "").localeCompare(a.published_at ?? "")));
    return slicePage(rows, page, pageSize);
  }

  const db = (await readDb())!;
  let q = db.from("videos").select(VIDEO_SELECT, { count: "exact" }).eq("visibility", "public").eq("processing_status", "ready").not("published_at", "is", null);
  if (f.sport) {
    const s = await getSportBySlug(f.sport);
    if (!s) return pageOf([], 0, page, pageSize);
    q = q.eq("sport_id", s.id);
  }
  if (f.q) q = q.ilike("title", likePattern(f.q));
  if (f.ownerId) q = q.eq("owner_id", f.ownerId);
  if (f.excludeId) q = q.neq("id", f.excludeId);
  if (sinceIso) q = q.gte("published_at", sinceIso);
  q = f.sort === "views" ? q.order("view_count", { ascending: false }).order("published_at", { ascending: false }) : q.order("published_at", { ascending: false });
  const { data, count, error } = await q.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return pageOf((data ?? []) as unknown as Video[], count ?? 0, page, pageSize);
}

export async function getVideoForViewer(id: string, viewer: Viewer): Promise<Video | null> {
  if (fixtureMode()) return fxVideos.find((v) => v.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createSupabaseAdminClient() ?? (await readDb())!;
  const { data } = await db.from("videos").select(VIDEO_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const v = data as unknown as Video;
  return canViewVideo(v, viewer) ? v : null;
}

export async function listOwnerVideos(ownerId: string): Promise<Video[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data, error } = await db.from("videos").select(VIDEO_SELECT).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Video[];
}

export async function listOwnerRecordings(ownerId: string): Promise<(Recording & { stream: { id: string; title: string } | null })[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data, error } = await db.from("stream_recordings").select("id, stream_id, provider_recording_id, status, started_at, ended_at, duration_seconds, processing_status, error, created_at, stream:streams(id,title)").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as (Recording & { stream: { id: string; title: string } | null })[];
}

export async function listAdminVideos(opts: { q?: string; status?: string; page?: number }): Promise<Page<Video>> {
  const page = clampPage(opts.page);
  if (fixtureMode()) return slicePage(fxVideos, page);
  const db = (await readDb())!;
  let q = db.from("videos").select(VIDEO_SELECT, { count: "exact" });
  if (opts.status) q = q.eq("processing_status", opts.status);
  if (opts.q) q = q.ilike("title", likePattern(opts.q));
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  return pageOf((data ?? []) as unknown as Video[], count ?? 0, page, 20);
}

export async function listOwnerStreamRecordings(streamId: string): Promise<Recording[]> {
  if (fixtureMode()) return [];
  const db = (await readDb())!;
  const { data } = await db.from("stream_recordings").select("id, stream_id, provider_recording_id, status, started_at, ended_at, duration_seconds, processing_status, error, created_at").eq("stream_id", streamId).order("created_at", { ascending: false });
  return (data ?? []) as Recording[];
}
