import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/blocks";
import { ActionForm, SubmitButton, TextField } from "@/components/forms";
import { resetPasswordAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  return (
    <AuthShell title="Choose a new password" footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
      {user ? (
        <ActionForm action={resetPasswordAction} className="space-y-4">
          <TextField name="password" label="New password" type="password" hint="At least 8 characters." autoComplete="new-password" required minLength={8} />
          <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
          <SubmitButton pendingLabel="Updating…" className="w-full">Update password</SubmitButton>
        </ActionForm>
      ) : (
        <Notice tone="warn" title="Reset link required">Open the link from your password-reset email. If it expired, <AuthLink href="/forgot-password">request a new one</AuthLink>.</Notice>
      )}
    </AuthShell>
  );
}
