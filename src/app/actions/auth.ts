"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env, hasSupabase } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, done, guard, limit, safeNext, str, zodErrors, ActionError, type ActionState } from "./util";

const password = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

async function client() {
  if (!hasSupabase()) throw new ActionError("Authentication is not configured on this server yet.");
  return (await createSupabaseServerClient())!;
}

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await limit("login", 10, 10 * 60_000);
    const p = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Enter your password") }).safeParse({ email: str(fd, "email"), password: fd.get("password") });
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const supabase = await client();
    const { error } = await supabase.auth.signInWithPassword(p.data);
    if (error) return fail(error.message.toLowerCase().includes("confirm") ? "Please verify your email address first. Check your inbox." : "Incorrect email or password.");
    redirect(safeNext(str(fd, "next")));
  });
}

export async function signUpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await limit("signup", 5, 60 * 60_000);
    const p = z.object({
      email: z.string().email("Enter a valid email"),
      password,
      username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/, "3–24 letters, numbers or underscores"),
      display_name: z.string().min(1, "Enter a display name").max(60),
      terms: z.literal("on", { error: "You must accept the Terms and Community Guidelines" }),
    }).safeParse({ email: str(fd, "email"), password: fd.get("password"), username: str(fd, "username"), display_name: str(fd, "display_name"), terms: fd.get("terms") });
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const supabase = await client();
    const { data, error } = await supabase.auth.signUp({ email: p.data.email, password: p.data.password, options: { data: { username: p.data.username.toLowerCase(), display_name: p.data.display_name }, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/dashboard` } });
    if (error) return fail(error.message);
    if (data.session) redirect("/dashboard");
    return done("Account created. Check your email for a verification link to finish signing up.");
  });
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await limit("forgot", 5, 60 * 60_000);
    const p = z.string().email("Enter a valid email").safeParse(str(fd, "email"));
    if (!p.success) return fail("Enter a valid email", { email: "Enter a valid email" });
    const supabase = await client();
    await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
    // Same response whether or not the account exists (no account enumeration).
    return done("If an account exists for that email, a reset link is on its way.");
  });
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const p = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] }).safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
    if (!p.success) return fail("Check the highlighted fields.", zodErrors(p.error));
    const supabase = await client();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return fail("This reset link has expired. Request a new one.");
    const { error } = await supabase.auth.updateUser({ password: p.data.password });
    if (error) return fail(error.message);
    redirect("/dashboard");
  });
}
