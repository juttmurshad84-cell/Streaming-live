"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { toggleFavoriteAction, toggleFollowAction } from "@/app/actions/social";
import type { ActionState } from "@/app/actions/util";
import { CheckIcon, HeartIcon, PlusIcon } from "./icons";

function useToggle(initial: boolean, run: () => Promise<ActionState>) {
  const [active, setActive] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => start(async () => {
    setMsg(null);
    const prev = active;
    setActive(!prev); // optimistic
    const r = await run();
    if (!r?.ok) { setActive(prev); setMsg(r?.error ?? "Something went wrong"); }
    else setActive(Boolean(r.data?.active));
  });
  return { active, toggle, pending, msg };
}

const signIn = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export function FollowButton({ streamerId, initial, signedIn, isSelf, next, compact }: { streamerId: string; initial: boolean; signedIn: boolean; isSelf?: boolean; next: string; compact?: boolean }) {
  const t = useToggle(initial, () => toggleFollowAction(streamerId));
  if (isSelf) return null;
  if (!signedIn) return <Link href={signIn(next)} className={cn("btn-primary", compact && "btn-sm")}><PlusIcon width={16} height={16} />Follow</Link>;
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={t.toggle} disabled={t.pending} aria-pressed={t.active} className={cn(t.active ? "btn-secondary" : "btn-primary", compact && "btn-sm")}>
        {t.active ? <><CheckIcon width={16} height={16} />Following</> : <><PlusIcon width={16} height={16} />Follow</>}
      </button>
      {t.msg && <span role="alert" className="mt-1 text-xs text-red-400">{t.msg}</span>}
    </span>
  );
}

export function FavoriteButton({ kind, id, initial, signedIn, next, label = "Favorite" }: { kind: "stream" | "video" | "team" | "sport" | "match"; id: string; initial: boolean; signedIn: boolean; next: string; label?: string }) {
  const t = useToggle(initial, () => toggleFavoriteAction(kind, id));
  if (!signedIn) return <Link href={signIn(next)} className="btn-secondary"><HeartIcon width={16} height={16} />{label}</Link>;
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={t.toggle} disabled={t.pending} aria-pressed={t.active} className="btn-secondary">
        <HeartIcon width={16} height={16} className={t.active ? "fill-live text-live" : ""} />{t.active ? "Saved" : label}
      </button>
      {t.msg && <span role="alert" className="mt-1 text-xs text-red-400">{t.msg}</span>}
    </span>
  );
}
