"use client";
import { createContext, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/app/actions/util";

const ErrorsCtx = createContext<Record<string, string>>({});

export function ActionForm({ action, children, className, encType, onDone, id }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode; className?: string; encType?: "multipart/form-data"; onDone?: () => void; id?: string;
}) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok) onDone?.();
    return r;
  }, null);
  return (
    <form id={id} action={formAction} encType={encType} className={className} noValidate>
      <ErrorsCtx.Provider value={state?.fieldErrors ?? {}}>
        {state && !state.ok && state.error && <div role="alert" className="mb-4 rounded-xl border border-live/40 bg-live/10 px-4 py-3 text-sm text-red-200">{state.error}</div>}
        {state?.ok && state.message && <div role="status" className="mb-4 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-green-100">{state.message}</div>}
        {children}
      </ErrorsCtx.Provider>
    </form>
  );
}

export function Field({ name, label, hint, children, required }: { name: string; label: string; hint?: string; children: ReactNode; required?: boolean }) {
  const errors = useContext(ErrorsCtx);
  return (
    <div>
      <label htmlFor={name} className="label">{label}{required && <span className="text-live"> *</span>}</label>
      {children}
      {errors[name] ? <p className="field-error" role="alert">{errors[name]}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function TextField({ name, label, type = "text", defaultValue, placeholder, hint, required, autoComplete, maxLength, minLength }: {
  name: string; label: string; type?: string; defaultValue?: string | null; placeholder?: string; hint?: string; required?: boolean; autoComplete?: string; maxLength?: number; minLength?: number;
}) {
  return <Field name={name} label={label} hint={hint} required={required}><input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} autoComplete={autoComplete} maxLength={maxLength} minLength={minLength} className="input" aria-required={required} /></Field>;
}

export function TextArea({ name, label, defaultValue, rows = 4, hint, maxLength }: { name: string; label: string; defaultValue?: string | null; rows?: number; hint?: string; maxLength?: number }) {
  return <Field name={name} label={label} hint={hint}><textarea id={name} name={name} rows={rows} defaultValue={defaultValue ?? ""} maxLength={maxLength} className="input resize-y" /></Field>;
}

export function SelectField({ name, label, options, defaultValue, hint, required }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string | null; hint?: string; required?: boolean }) {
  return (
    <Field name={name} label={label} hint={hint} required={required}>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className="input" aria-required={required}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Checkbox({ name, label, defaultChecked, description }: { name: string; label: ReactNode; defaultChecked?: boolean; description?: string }) {
  const errors = useContext(ErrorsCtx);
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-surface accent-primary" />
        <span><span className="font-medium">{label}</span>{description && <span className="block text-xs text-muted">{description}</span>}</span>
      </label>
      {errors[name] && <p className="field-error" role="alert">{errors[name]}</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel = "Saving…", className, variant = "primary" }: { children: ReactNode; pendingLabel?: string; className?: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={cn(variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-secondary", className)}>{pending ? pendingLabel : children}</button>;
}
