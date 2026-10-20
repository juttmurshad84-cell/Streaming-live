import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/** Minimal emulation of the Supabase pieces our migrations rely on (auth schema, roles, JWT claims). */
const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = path.resolve(__dirname, "../../supabase");
  const files = fs.readdirSync(path.join(dir, "migrations")).sort();
  for (const f of files) await db.exec(fs.readFileSync(path.join(dir, "migrations", f), "utf8"));
  await db.exec(fs.readFileSync(path.join(dir, "seed.sql"), "utf8"));
  return db;
}

export type Actor = { role: "anon" } | { role: "authenticated"; sub: string } | { role: "service_role" };

/** Run SQL as a given Supabase role inside a rolled-back-on-error transaction. */
export async function run<T = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${actor.role}`);
    const claims = JSON.stringify(
      actor.role === "authenticated" ? { sub: actor.sub, role: "authenticated" } : { role: actor.role },
    );
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

export async function createUser(db: PGlite, email: string, username?: string) {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(username ? { username } : {})],
  );
  return res.rows[0].id;
}

export const as = (sub: string): Actor => ({ role: "authenticated", sub });
export const anon: Actor = { role: "anon" };
export const service: Actor = { role: "service_role" };
