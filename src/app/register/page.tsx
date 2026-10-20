import type { Metadata } from "next";
import Link from "next/link";
import { AuthLink, AuthShell } from "@/components/AuthShell";
import { ActionForm, Checkbox, SubmitButton, TextField } from "@/components/forms";
import { signUpAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" subtitle="Free to join. You can enable streaming later from your dashboard." footer={<>Already have an account? <AuthLink href="/login">Sign in</AuthLink></>}>
      <ActionForm action={signUpAction} className="space-y-4">
        <TextField name="display_name" label="Display name" autoComplete="nickname" required maxLength={60} />
        <TextField name="username" label="Username" hint="3–24 letters, numbers or underscores. Used in your channel URL." autoComplete="username" required maxLength={24} />
        <TextField name="email" label="Email" type="email" autoComplete="email" required />
        <TextField name="password" label="Password" type="password" hint="At least 8 characters." autoComplete="new-password" required minLength={8} />
        <Checkbox name="terms" label={<>I agree to the <Link href="/terms" className="text-accent hover:underline" target="_blank">Terms</Link>, <Link href="/privacy" className="text-accent hover:underline" target="_blank">Privacy Policy</Link> and <Link href="/community-guidelines" className="text-accent hover:underline" target="_blank">Community Guidelines</Link></>} />
        <SubmitButton pendingLabel="Creating account…" className="w-full">Create account</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
