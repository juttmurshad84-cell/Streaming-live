/** Static presentation metadata for the sport categories (icons + gradients, no remote imagery). */
export const SPORT_META: Record<string, { emoji: string; from: string; to: string }> = {
  cricket: { emoji: "🏏", from: "#14532d", to: "#16a34a" },
  football: { emoji: "⚽", from: "#064e3b", to: "#10b981" },
  basketball: { emoji: "🏀", from: "#7c2d12", to: "#f97316" },
  tennis: { emoji: "🎾", from: "#365314", to: "#a3e635" },
  volleyball: { emoji: "🏐", from: "#78350f", to: "#fbbf24" },
  hockey: { emoji: "🏒", from: "#0c4a6e", to: "#38bdf8" },
  rugby: { emoji: "🏉", from: "#4c1d95", to: "#8b5cf6" },
  baseball: { emoji: "⚾", from: "#7f1d1d", to: "#ef4444" },
  badminton: { emoji: "🏸", from: "#134e4a", to: "#2dd4bf" },
  esports: { emoji: "🎮", from: "#312e81", to: "#6366f1" },
  other: { emoji: "🏅", from: "#1e293b", to: "#475569" },
};
export const sportMeta = (slug: string | undefined | null) =>
  SPORT_META[slug ?? "other"] ?? SPORT_META.other;
