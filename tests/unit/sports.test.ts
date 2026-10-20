import { describe, expect, it } from "vitest";
import { fetchEventsByDay, mapStatus, normalizeEvent, RateLimitedError } from "@/lib/sports/thesportsdb";

const NOW = new Date("2026-10-20T20:00:00Z");

describe("mapStatus", () => {
  it.each([
    ["Match Finished", true, "finished"], ["FT", true, "finished"], ["AET", true, "finished"], ["1H", true, "live"], ["HT", true, "live"], ["Q3", true, "live"],
    ["Not Started", false, "scheduled"], ["NS", false, "scheduled"], ["Postponed", false, "postponed"], ["Canceled", false, "cancelled"],
  ])("%s -> %s", (raw, score, expected) => {
    expect(mapStatus(raw as string, score as boolean, new Date("2026-10-20T19:00:00Z"), NOW)).toBe(expected);
  });
  it("never infers LIVE from the clock alone", () => {
    expect(mapStatus("", false, new Date("2026-10-20T19:30:00Z"), NOW)).toBe("scheduled");
  });
});

describe("normalizeEvent", () => {
  it("normalises provider data, treating timestamps as UTC", () => {
    const m = normalizeEvent({ idEvent: "1", strEvent: "A vs B", idLeague: "9", strLeague: "Prem", idHomeTeam: "h", strHomeTeam: "A", idAwayTeam: "a", strAwayTeam: "B", intHomeScore: "2", intAwayScore: "1", strTimestamp: "2026-10-20T15:00:00", strStatus: "Match Finished" }, NOW)!;
    expect(m).toMatchObject({ externalId: "1", status: "finished", homeScore: 2, awayScore: 1, startsAt: "2026-10-20T15:00:00.000Z", league: { name: "Prem" }, home: { name: "A" } });
  });
  it("rejects rows without id, title or time", () => {
    expect(normalizeEvent({ idEvent: "" } as never)).toBeNull();
    expect(normalizeEvent({ idEvent: "1", strEvent: "x" })).toBeNull();
    expect(normalizeEvent({ idEvent: "1", strTimestamp: "bad" , strEvent: "x"})).toBeNull();
  });
  it("keeps null scores null", () => {
    expect(normalizeEvent({ idEvent: "2", strEvent: "A vs B", strTimestamp: "2026-10-21T15:00:00", intHomeScore: null }, NOW)).toMatchObject({ homeScore: null, awayScore: null, status: "scheduled" });
  });
});

describe("fetchEventsByDay", () => {
  const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  it("retries on 5xx with backoff and then succeeds", async () => {
    let calls = 0;
    const f = (async () => (++calls < 3 ? ok({}, 503) : ok({ events: [{ idEvent: "1" }] }))) as unknown as typeof fetch;
    const out = await fetchEventsByDay("k", "2026-10-20", "Soccer", f, async () => undefined);
    expect(out).toHaveLength(1);
    expect(calls).toBe(3);
  });
  it("surfaces 429 as a rate-limit error without retrying", async () => {
    let calls = 0;
    const f = (async () => (calls++, ok({}, 429, { "retry-after": "30" }))) as unknown as typeof fetch;
    await expect(fetchEventsByDay("k", "d", "Soccer", f, async () => undefined)).rejects.toMatchObject({ retryAfterSeconds: 30 });
    expect(calls).toBe(1);
    await expect(fetchEventsByDay("k", "d", "Soccer", (async () => ok({}, 429)) as unknown as typeof fetch, async () => undefined)).rejects.toBeInstanceOf(RateLimitedError);
  });
  it("does not retry 4xx and treats null events as empty", async () => {
    let calls = 0;
    await expect(fetchEventsByDay("k", "d", "S", (async () => (calls++, ok({}, 404))) as unknown as typeof fetch, async () => undefined)).rejects.toThrow(/404/);
    expect(calls).toBe(1);
    expect(await fetchEventsByDay("k", "d", "S", (async () => ok({ events: null })) as unknown as typeof fetch)).toEqual([]);
  });
});
