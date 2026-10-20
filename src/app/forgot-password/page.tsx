import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/AuthShell";
import { ActionForm, SubmitButton, TextField } from "@/components/forms";
import { forgotPasswordAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send a reset link." footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
      <ActionForm action={forgotPasswordAction} className="space-y-4">
        <TextField name="email" label="Email" type="email" autoComplete="email" required />
        <SubmitButton pendingLabel="Sending…" className="w-full">Send reset link</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
