/** ISO timestamp `hours` before the current server time (used for "recently started" match windows). */
export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
