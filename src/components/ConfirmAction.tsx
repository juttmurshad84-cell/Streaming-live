"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionState } from "@/app/actions/util";
import { cn } from "@/lib/cn";

/** Button that runs a server action (optionally after a confirm()), shows the outcome inline and refreshes the page. */
export function ConfirmAction({ label, pendingLabel, confirm: confirmText, action, args = [], redirectTo, variant = "secondary", small = true, className }: {
  label: string; pendingLabel?: string; confirm?: string; action: (...args: never[]) => Promise<ActionState>; args?: unknown[]; redirectTo?: string; variant?: "primary" | "secondary" | "danger" | "ghost"; small?: boolean; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" disabled={pending} className={cn(`btn-${variant}`, small && "btn-sm", className)} onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const r = await (action as (...a: unknown[]) => Promise<ActionState>)(...args);
          setMsg(r?.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r?.error ?? "Failed" });
          if (r?.ok) { if (redirectTo) router.push(redirectTo); else router.refresh(); }
        });
      }}>{pending ? pendingLabel ?? "Working…" : label}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={cn("mt-1 max-w-xs text-xs", msg.ok ? "text-green-300" : "text-red-300")}>{msg.text}</span>}
    </span>
  );
}
