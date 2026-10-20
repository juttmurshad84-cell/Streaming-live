"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Accessible disclosure menu: closes on route change, Escape and outside click. */
export function Dropdown({ trigger, label, children, align = "right", className }: { trigger: React.ReactNode; label: string; children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-full focus-visible:outline-offset-4">{trigger}</button>
      {open && <div role="menu" className={cn("absolute top-full z-50 mt-2 min-w-56 rounded-xl border border-line bg-card p-1.5 shadow-2xl", align === "right" ? "right-0" : "left-0", className)}>{children}</div>}
    </div>
  );
}

export const menuItem = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg/90 hover:bg-surface hover:text-fg";
