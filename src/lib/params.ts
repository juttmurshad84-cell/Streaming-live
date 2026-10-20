export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
export async function readParams(sp: SearchParams) {
  const o = await sp;
  const get = (k: string) => first(o[k]);
  return { get, page: Math.max(1, Math.min(1000, Number.parseInt(get("page") ?? "1", 10) || 1)) };
}
