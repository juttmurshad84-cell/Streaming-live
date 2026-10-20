export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 0) return "in the future";
  if (diff < 60) return "just now";
  const units: [number, string][] = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [secs, name] of units) {
    if (diff >= secs) {
      const v = Math.floor(diff / secs);
      return `${v} ${name}${v > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

/** Always format in an explicit time zone so server and client render the same string. */
export function formatDateTime(iso: string | null | undefined, timeZone = "UTC"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso)) + (timeZone === "UTC" ? " UTC" : "");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
}

export function liveDuration(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return "";
  return formatDuration((now - new Date(startedAt).getTime()) / 1000);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export const LANGUAGES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", ar: "Arabic",
  hi: "Hindi", ur: "Urdu", bn: "Bengali", it: "Italian", tr: "Turkish", ru: "Russian", ja: "Japanese", zh: "Chinese",
};
export const languageName = (code: string | null | undefined) => (code ? LANGUAGES[code.split("-")[0]] ?? code : "");
