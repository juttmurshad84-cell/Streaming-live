"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { submitReportAction } from "@/app/actions/moderation";
import { ActionForm, SubmitButton } from "./forms";
import { CheckIcon, FlagIcon, ShareIcon } from "./icons";

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled */ }
  };
  return <button type="button" onClick={share} className="btn-secondary">{copied ? <><CheckIcon width={16} height={16} />Link copied</> : <><ShareIcon width={16} height={16} />Share</>}</button>;
}

export function ReportButton({ targetType, targetId, signedIn, next, label = "Report" }: { targetType: "stream" | "video" | "profile" | "chat_message"; targetId: string; signedIn: boolean; next: string; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  if (!signedIn) return <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-ghost"><FlagIcon width={16} height={16} />{label}</Link>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost"><FlagIcon width={16} height={16} />{label}</button>
      <dialog ref={ref} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) setOpen(false); }} className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-card p-0 text-fg backdrop:bg-black/70">
        <div className="p-5">
          <h2 className="text-lg font-semibold">Report {targetType.replace("_", " ")}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Reports are reviewed by our moderation team. For copyright, use the <Link href="/copyright-policy" className="text-accent hover:underline">copyright complaint form</Link>.</p>
          <ActionForm action={submitReportAction} className="space-y-4">
            <input type="hidden" name="target_type" value={targetType} />
            <input type="hidden" name="target_id" value={targetId} />
            <div>
              <label htmlFor="reason" className="label">Reason</label>
              <select id="reason" name="reason" className="input" defaultValue="" required>
                <option value="" disabled>Select a reason…</option>
                <option value="spam">Spam or scam</option><option value="abuse">Harassment or hate</option><option value="violence">Violence or dangerous content</option>
                <option value="illegal">Illegal content</option><option value="copyright">Copyright concern</option><option value="other">Something else</option>
              </select>
            </div>
            <div>
              <label htmlFor="details" className="label">Details <span className="text-muted">(optional)</span></label>
              <textarea id="details" name="details" rows={3} maxLength={2000} className="input" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
              <SubmitButton pendingLabel="Sending…">Send report</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
