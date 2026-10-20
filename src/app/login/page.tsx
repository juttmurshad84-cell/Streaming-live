import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/blocks";
import { ActionForm, SubmitButton, TextField } from "@/components/forms";
import { signInAction } from "@/app/actions/auth";
import { readParams, type SearchParams } from "@/lib/params";
import { safeNext } from "@/app/actions/util";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { get } = await readParams(searchParams);
  const next = safeNext(get("next"));
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to follow streamers, chat and manage your streams." footer={<>New to ArenaLive? <AuthLink href="/register">Create an account</AuthLink></>}>
      {get("error") && <div className="mb-4"><Notice tone="error">That link is invalid or has expired. Please try again.</Notice></div>}
      <ActionForm action={signInAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <TextField name="email" label="Email" type="email" autoComplete="email" required />
        <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
        <div className="flex justify-end"><Link href="/forgot-password" className="text-xs text-accent hover:underline">Forgot password?</Link></div>
        <SubmitButton pendingLabel="Signing in…" className="w-full">Sign in</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
