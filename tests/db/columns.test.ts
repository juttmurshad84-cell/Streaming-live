import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./harness";

/**
 * The Supabase client is untyped in this project, so a misspelt column or foreign-key name would only fail at
 * runtime. This test statically extracts table/column/constraint names used in src/ and verifies each against
 * the real migrated schema. It is a heuristic (not a full parser) but catches typos in the common patterns.
 */
let db: PGlite;
const schema: Record<string, Set<string>> = {};
const fks = new Set<string>();
const rpcs = new Map<string, string[]>();

beforeAll(async () => {
  db = await createDb();
  const cols = await db.query<{ table_name: string; column_name: string }>("select table_name, column_name from information_schema.columns where table_schema='public'");
  for (const c of cols.rows) (schema[c.table_name] ??= new Set()).add(c.column_name);
  const f = await db.query<{ conname: string }>("select conname from pg_constraint where contype='f'");
  for (const r of f.rows) fks.add(r.conname);
  const fn = await db.query<{ proname: string; args: string | null }>("select p.proname, (select string_agg(a, ',') from unnest(p.proargnames) a) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  for (const r of fn.rows) rpcs.set(r.proname, (r.args ?? "").split(",").filter(Boolean));
}, 60_000);
afterAll(async () => { await db?.close(); });

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(path.resolve(__dirname, "../../src"));

/** Top-level keys of a `{ ... }` literal starting at index i (which points at "{"). */
function objectKeys(src: string, i: number): string[] {
  const keys: string[] = [];
  let depth = 0, token = "";
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{" || ch === "(" || ch === "[") { depth++; if (depth === 1) { token = ""; continue; } }
    else if (ch === "}" || ch === ")" || ch === "]") { depth--; if (depth === 0) break; }
    if (depth === 1) {
      if (ch === ",") { push(); token = ""; } else token += ch;
    }
  }
  push();
  function push() {
    const t = token.trim();
    const m = t.match(/^(?:\.\.\.|["']?([a-z_][a-z0-9_]*)["']?\s*(?::|$))/i);
    if (m && m[1]) keys.push(m[1]);
    else if (/^\[/.test(t) || t.startsWith("...")) return; // computed / spread
  }
  return keys;
}

describe("Supabase column / constraint / rpc references match the schema", () => {
  it("has no unknown references", () => {
  const problems: string[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(path.resolve(__dirname, "../.."), file);
    // FK hints used in embeds
    for (const m of src.matchAll(/!([a-z_]+_fkey)/g)) if (!fks.has(m[1])) problems.push(`${rel}: unknown FK ${m[1]}`);
    // rpc names + param names
    for (const m of src.matchAll(/\.rpc\(\s*"([a-z_]+)"\s*(?:,\s*\{([^}]*)\})?/g)) {
      if (!rpcs.has(m[1])) { problems.push(`${rel}: unknown rpc ${m[1]}`); continue; }
      const given = (m[2] ?? "").split(",").map((s) => s.trim().split(":")[0].trim()).filter((s) => /^p_/.test(s));
      for (const g of given) if (!rpcs.get(m[1])!.includes(g)) problems.push(`${rel}: rpc ${m[1]} has no param ${g}`);
    }
    // table chains
    for (const m of src.matchAll(/\.from\("([a-z_]+)"\)/g)) {
      const table = m[1];
      if (src.slice(Math.max(0, m.index! - 10), m.index!).endsWith("storage")) continue; // storage bucket, not a table
      const known = schema[table];
      if (!known) { problems.push(`${rel}: unknown table ${table}`); continue; }
      const semi = src.indexOf(";", m.index!);
      const nextFrom = src.indexOf(".from(", m.index! + 6);
      const stops = [semi, nextFrom].filter((n) => n !== -1);
      const chain = src.slice(m.index!, Math.min(...stops, m.index! + 1500));
      for (const w of chain.matchAll(/\.(insert|update|upsert)\(\s*(?:\[\s*)?\{/g)) {
        const at = chain.indexOf("{", w.index!);
        for (const k of objectKeys(chain, at)) if (!known.has(k)) problems.push(`${rel}: ${table}.${w[1]} unknown column ${k}`);
      }
      for (const w of chain.matchAll(/\.(eq|neq|in|is|gte|lte|gt|lt|ilike|not)\("([a-z_]+)"/g)) if (!known.has(w[2]) && !w[2].includes(".")) problems.push(`${rel}: ${table}.${w[1]} unknown column ${w[2]}`);
      for (const w of chain.matchAll(/\.order\("([a-z_]+)"/g)) if (!known.has(w[1])) problems.push(`${rel}: ${table}.order unknown column ${w[1]}`);
      const sel = chain.match(/\.select\(\s*(?:"([^"]*)"|`([^`]*)`)/);
      if (sel && !(sel[2] ?? "").includes("${")) {
        const text = sel[1] ?? sel[2] ?? "";
        let depth = 0, cur = "";
        const parts: string[] = [];
        for (const ch of text) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
        parts.push(cur);
        for (const p of parts.map((s) => s.trim())) if (/^[a-z_][a-z0-9_]*$/.test(p) && !known.has(p)) problems.push(`${rel}: ${table}.select unknown column ${p}`);
      }
    }
  }
  expect(problems).toEqual([]);
  });
});
