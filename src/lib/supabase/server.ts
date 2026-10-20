import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, hasServiceRole, hasSupabase } from "@/lib/env";

/** Cookie-bound client: acts as the signed-in user, so Postgres RLS applies. */
export async function createSupabaseServerClient() {
  if (!hasSupabase()) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES RLS — only for webhooks, cron, provider sync and
 * operations that were already authorised in code. Never import from client code.
 */
export function createSupabaseAdminClient() {
  if (!hasServiceRole()) return null;
  return createClient(env.supabaseUrl!, env.supabaseServiceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
