"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminSetVideoVisibilityAction, setRoleAction } from "@/app/actions/admin";
import { resolveCopyrightAction, resolveReportAction } from "@/app/actions/moderation";
import type { ActionState } from "@/app/actions/util";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>) => start(async () => {
    const r = await fn();
    setMsg(r?.ok ? null : r?.error ?? "Failed");
    if (r?.ok) router.refresh();
  });
  return { pending, msg, run };
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <span>
      <label className="sr-only" htmlFor={`role-${userId}`}>Role</label>
      <select id={`role-${userId}`} className="input py-1.5 text-xs" defaultValue={role} disabled={pending || disabled} onChange={(e) => { if (window.confirm(`Change role to ${e.target.value}?`)) run(() => setRoleAction(userId, e.target.value)); else e.target.value = role; }}>
        {["viewer", "streamer", "moderator", "admin"].map((r) => <option key={r}>{r}</option>)}
      </select>
      {msg && <span role="alert" className="block text-xs text-red-300">{msg}</span>}
    </span>
  );
}

export function VisibilitySelect({ videoId, value }: { videoId: string; value: string }) {
  const { pending, msg, run } = useRun();
  return (
    <span>
      <label className="sr-only" htmlFor={`vis-${videoId}`}>Visibility</label>
      <select id={`vis-${videoId}`} className="input py-1.5 text-xs" defaultValue={value} disabled={pending} onChange={(e) => run(() => adminSetVideoVisibilityAction(videoId, e.target.value))}>
        {["public", "unlisted", "private"].map((r) => <option key={r}>{r}</option>)}
      </select>
      {msg && <span role="alert" className="block text-xs text-red-300">{msg}</span>}
    </span>
  );
}

export function ResolveReportForm({ id, targetType }: { id: string; targetType: string }) {
  const { pending, msg, run } = useRun();
  const [note, setNote] = useState("");
  const [takedown, setTakedown] = useState(false);
  const [strike, setStrike] = useState(false);
  const canTakedown = targetType !== "profile";
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <label htmlFor={`note-${id}`} className="sr-only">Resolution note</label>
      <input id={`note-${id}`} className="input py-2 text-sm" placeholder="Resolution note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div className="flex flex-wrap gap-4 text-xs">
        {canTakedown && <label className="flex items-center gap-1.5"><input type="checkbox" checked={takedown} onChange={(e) => setTakedown(e.target.checked)} className="accent-primary" />{targetType === "chat_message" ? "Delete message" : "Take down content"}</label>}
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} className="accent-primary" />Strike the owner (3 = suspension)</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => resolveReportAction({ id, status: "actioned", note: note || undefined, takedown, strike }))}>Action taken</button>
        <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => resolveReportAction({ id, status: "dismissed", note: note || undefined }))}>Dismiss</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resolveReportAction({ id, status: "reviewing", note: note || undefined }))}>Mark reviewing</button>
      </div>
      {msg && <p role="alert" className="text-xs text-red-300">{msg}</p>}
    </div>
  );
}

export function ResolveComplaintForm({ id }: { id: string }) {
  const { pending, msg, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <input aria-label="Resolution note" className="input py-2 text-sm" placeholder="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-danger btn-sm" disabled={pending} onClick={() => { if (window.confirm("Uphold: disables the stream / hides the video and strikes the owner. Continue?")) run(() => resolveCopyrightAction({ id, status: "upheld", note: note || undefined })); }}>Uphold & remove</button>
        <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => resolveCopyrightAction({ id, status: "rejected", note: note || undefined }))}>Reject</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resolveCopyrightAction({ id, status: "counter_notice", note: note || undefined }))}>Counter-notice received</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resolveCopyrightAction({ id, status: "reviewing", note: note || undefined }))}>Mark reviewing</button>
      </div>
      {msg && <p role="alert" className="text-xs text-red-300">{msg}</p>}
    </div>
  );
}
