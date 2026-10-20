"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleReminderAction } from "@/app/actions/social";
import { BellIcon } from "./icons";

export function ReminderButton({ matchId, initial, enabled }: { matchId: string; initial: boolean; enabled: boolean }) {
  const [set, setSet] = useState(initial);
  const [pending, start] = useTransition();
  if (!enabled) return <Link href={`/login?next=/matches/${matchId}`} className="btn-secondary btn-sm"><BellIcon width={14} height={14} />Remind me</Link>;
  return (
    <button type="button" aria-pressed={set} disabled={pending} className="btn-secondary btn-sm" onClick={() => start(async () => {
      const r = await toggleReminderAction(matchId);
      if (r?.ok) setSet(Boolean(r.data?.active));
    })}>
      <BellIcon width={14} height={14} className={set ? "fill-accent text-accent" : ""} />{set ? "Reminder on" : "Remind me"}
    </button>
  );
}
