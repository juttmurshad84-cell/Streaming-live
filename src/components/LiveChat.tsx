"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ReportButton } from "./ShareReport";

interface Msg { id: string; user_id: string; body: string; created_at: string; name: string }
interface Row { id: string; user_id: string; body: string; created_at: string; deleted_at: string | null }

// The RPC raises user-facing messages (muted, slow mode, rate limit, links, duplicates); show them verbatim.
function friendly(message: string) {
  const m = message.trim();
  return m && m.length < 120 && !/violates|permission denied|jwt|relation/i.test(m) ? m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".") : "Message could not be sent.";
}

export function LiveChat({ streamId, enabled, slowMode, signedIn, userId, canModerate, next }: { streamId: string; enabled: boolean; slowMode: number; signedIn: boolean; userId: string | null; canModerate: boolean; next: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "off">("loading");
  const [sending, setSending] = useState(false);
  const names = useRef(new Map<string, string>());
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const nameFor = useCallback(async (id: string) => {
    const hit = names.current.get(id);
    if (hit) return hit;
    const sb = getBrowserSupabase();
    const { data } = (await sb?.from("profiles").select("display_name").eq("id", id).maybeSingle()) ?? { data: null };
    const n = (data as { display_name?: string } | null)?.display_name ?? "Viewer";
    names.current.set(id, n);
    return n;
  }, []);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !enabled) { setStatus("off"); return; }
    let alive = true;
    (async () => {
      const { data } = await sb.from("chat_messages").select("id, user_id, body, created_at, author:profiles!chat_messages_user_id_fkey(display_name)").eq("stream_id", streamId).is("deleted_at", null).order("created_at", { ascending: false }).limit(60);
      if (!alive) return;
      const rows = ((data ?? []) as unknown as (Row & { author: { display_name: string } | null })[]).reverse();
      for (const r of rows) if (r.author) names.current.set(r.user_id, r.author.display_name);
      setMsgs(rows.map((r) => ({ id: r.id, user_id: r.user_id, body: r.body, created_at: r.created_at, name: r.author?.display_name ?? "Viewer" })));
      setStatus("ready");
    })();
    const ch = sb.channel(`chat:${streamId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${streamId}` }, async (p: { new: Record<string, unknown> }) => {
        const r = p.new as unknown as Row;
        const name = await nameFor(r.user_id);
        if (alive) setMsgs((m) => (m.some((x) => x.id === r.id) ? m : [...m, { id: r.id, user_id: r.user_id, body: r.body, created_at: r.created_at, name }].slice(-200)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `stream_id=eq.${streamId}` }, (p: { new: Record<string, unknown> }) => {
        const r = p.new as unknown as Row;
        if (r.deleted_at && alive) setMsgs((m) => m.filter((x) => x.id !== r.id));
      })
      .subscribe();
    return () => { alive = false; void sb.removeChannel(ch); };
  }, [streamId, enabled, nameFor]);

  useEffect(() => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    setSending(true);
    setError(null);
    const { error: err } = await sb.rpc("post_chat_message", { p_stream: streamId, p_body: body });
    setSending(false);
    if (err) setError(friendly(err.message)); else setText("");
  }

  const moderate = async (kind: "delete" | "mute", m: Msg) => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { error: err } = kind === "delete" ? await sb.rpc("delete_chat_message", { p_message: m.id }) : await sb.rpc("mute_chat_user", { p_stream: streamId, p_user: m.user_id, p_minutes: 10 });
    if (err) setError("Moderation action failed."); else if (kind === "delete") setMsgs((x) => x.filter((y) => y.id !== m.id));
    else setError(`${m.name} muted for 10 minutes.`);
  };

  return (
    <section aria-label="Live chat" className="card flex h-[28rem] flex-col overflow-hidden lg:h-full lg:min-h-[24rem]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Live chat</h2>
        {slowMode > 0 && <span className="chip">Slow mode {slowMode}s</span>}
      </header>
      <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
        {status === "off" && <p className="py-8 text-center text-sm text-muted">{enabled ? "Chat is unavailable (realtime is not configured)." : "Chat is turned off for this stream."}</p>}
        {status === "loading" && <div className="space-y-2"><div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-1/2" /><div className="skeleton h-4 w-2/3" /></div>}
        {status === "ready" && msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet. Say hello!</p>}
        {msgs.map((m) => (
          <div key={m.id} className="group/msg flex items-start gap-1 text-sm leading-snug">
            <p className="min-w-0 flex-1 break-words"><span className="font-semibold text-accent">{m.name}</span> <span className="text-fg/90">{m.body}</span></p>
            {signedIn && m.user_id !== userId && (
              <span className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
                {canModerate && <>
                  <button type="button" className="rounded px-1.5 text-xs text-muted hover:bg-surface hover:text-fg" onClick={() => moderate("delete", m)} aria-label={`Delete message from ${m.name}`}>Delete</button>
                  <button type="button" className="rounded px-1.5 text-xs text-muted hover:bg-surface hover:text-fg" onClick={() => moderate("mute", m)} aria-label={`Mute ${m.name}`}>Mute</button>
                </>}
                {!canModerate && <ReportButton targetType="chat_message" targetId={m.id} signedIn next={next} label="" />}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        {error && <p role="alert" className="mb-2 text-xs text-amber-300">{error}</p>}
        {!enabled ? null : signedIn ? (
          <form onSubmit={send} className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Send a message" aria-label="Chat message" className="input" disabled={status === "off"} />
            <button type="submit" className="btn-primary" disabled={sending || !text.trim() || status === "off"}>Send</button>
          </form>
        ) : (
          <p className="text-center text-sm text-muted"><Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">Sign in</Link> to chat.</p>
        )}
      </div>
    </section>
  );
}
