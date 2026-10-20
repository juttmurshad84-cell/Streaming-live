import { describe, expect, it } from "vitest";
import { canViewStream, canViewVideo, GUEST, isDiscoverable, type Viewer } from "@/lib/access";

const owner: Viewer = { id: "owner", staff: false };
const other: Viewer = { id: "other", staff: false };
const staff: Viewer = { id: "mod", staff: true };

const stream = (o: Partial<Parameters<typeof canViewStream>[0]> = {}) => ({ owner_id: "owner", visibility: "public" as const, status: "live" as const, is_published: true, ...o });
const video = (o: Partial<Parameters<typeof canViewVideo>[0]> = {}) => ({ owner_id: "owner", visibility: "public" as const, processing_status: "ready" as const, published_at: "2026-01-01T00:00:00Z", ...o });

describe("canViewStream", () => {
  it("lets anyone open public and unlisted published streams", () => {
    expect(canViewStream(stream(), GUEST)).toBe(true);
    expect(canViewStream(stream({ visibility: "unlisted" }), GUEST)).toBe(true);
  });
  it("hides private streams from everyone but the owner and staff", () => {
    const s = stream({ visibility: "private" });
    expect(canViewStream(s, GUEST)).toBe(false);
    expect(canViewStream(s, other)).toBe(false);
    expect(canViewStream(s, owner)).toBe(true);
    expect(canViewStream(s, staff)).toBe(true);
  });
  it("hides drafts/unpublished and disabled streams from the public, but not owner/staff", () => {
    expect(canViewStream(stream({ is_published: false }), other)).toBe(false);
    expect(canViewStream(stream({ status: "disabled" }), other)).toBe(false);
    expect(canViewStream(stream({ status: "disabled" }), owner)).toBe(true);
    expect(canViewStream(stream({ status: "disabled" }), staff)).toBe(true);
  });
  it("a guest never matches an owner id", () => {
    expect(canViewStream(stream({ owner_id: "", visibility: "private" }), GUEST)).toBe(false);
  });
});

describe("canViewVideo", () => {
  it("only shows ready, published public/unlisted videos to others", () => {
    expect(canViewVideo(video(), GUEST)).toBe(true);
    expect(canViewVideo(video({ visibility: "unlisted" }), other)).toBe(true);
    expect(canViewVideo(video({ visibility: "private" }), other)).toBe(false);
    expect(canViewVideo(video({ processing_status: "processing" }), other)).toBe(false);
    expect(canViewVideo(video({ published_at: null }), other)).toBe(false);
  });
  it("owner and staff can always open it (e.g. to see processing state)", () => {
    const v = video({ visibility: "private", processing_status: "processing", published_at: null });
    expect(canViewVideo(v, owner)).toBe(true);
    expect(canViewVideo(v, staff)).toBe(true);
  });
});

describe("isDiscoverable", () => {
  it("only public content is listed", () => {
    expect(isDiscoverable("public")).toBe(true);
    expect(isDiscoverable("unlisted")).toBe(false);
    expect(isDiscoverable("private")).toBe(false);
  });
});
