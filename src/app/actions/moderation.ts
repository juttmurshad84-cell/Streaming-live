"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { copyrightSchema, reportSchema } from "@/lib/validators";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { actionUser, ActionError, done, fail, guard, limitUser, str, zodErrors, type ActionState } from "./util";

export async function submitReportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser();
    await limitUser("report", user.id, 10, 60 * 60_000);
    const p = reportSchema.safeParse({ target_type: str(fd, "target_type"), target_id: str(fd, "target_id"), reason: str(fd, "reason"), details: str(fd, "details") });
    if (!p.success) return fail("Choose a reason for your report.", zodErrors(p.error));
    const db = await createSupabaseServerClient();
    if (!db) throw new ActionError("The database is not configured.");
    const { error } = await db.from("reports").insert({ ...p.data, reporter_id: user.id });
    if (error?.code === "23505") return done("You already have an open report for this. Our team is reviewing it.");
    if (error) return fail("Could not submit your report.");
    return done("Thanks — your report was sent to our moderation team.");
  });
}

/** Public copyright complaint (no account required). Stored with the service role after validation + rate limiting. */
export async function submitCopyrightAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const ip = clientIp(await headers());
    if (!rateLimit(`copyright:${ip}`, 3, 60 * 60_000).ok) throw new ActionError("Too many submissions from your network. Please try again later.");
    const p = copyrightSchema.safeParse({
      complainant_name: str(fd, "complainant_name"), complainant_email: str(fd, "complainant_email"), company: str(fd, "company"), work_description: str(fd, "work_description"),
      urls: str(fd, "urls"), good_faith: fd.get("good_faith"), accuracy: fd.get("accuracy"), signature: str(fd, "signature"),
    });
    if (!p.success) return fail("Please complete every required field.", zodErrors(p.error));
    const admin = createSupabaseAdminClient();
    if (!admin) throw new ActionError("Complaints cannot be stored right now. Please email the address on the Copyright Policy page.");
    const v = p.data;
    // Try to link complaint URLs to our content to speed up review.
    const ids = v.urls.map((u) => u.match(/\/(watch|videos)\/([0-9a-f-]{36})/i)).filter(Boolean) as RegExpMatchArray[];
    const streamId = ids.find((m) => m[1] === "watch")?.[2] ?? null;
    const videoId = ids.find((m) => m[1] === "videos")?.[2] ?? null;
    const { error } = await admin.from("copyright_complaints").insert({
      complainant_name: v.complainant_name, complainant_email: v.complainant_email, company: v.company, work_description: v.work_description, infringing_urls: v.urls,
      good_faith_statement: true, accuracy_statement: true, signature: v.signature, stream_id: streamId, video_id: videoId,
    });
    if (error) return fail("We could not record your complaint. Please try again or email us directly.");
    return done("Your complaint was received. Our team reviews complaints promptly and will contact you at the email provided.");
  });
}

const resolution = z.object({ id: z.string().uuid(), status: z.enum(["reviewing", "actioned", "dismissed"]), note: z.string().max(1000).optional(), takedown: z.boolean().optional(), strike: z.boolean().optional() });

/** Staff: resolve a report, optionally taking down the target and striking its owner (all audited). */
export async function resolveReportAction(input: z.input<typeof resolution>): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("moderator");
    const p = resolution.safeParse(input);
    if (!p.success) return fail("Invalid request.");
    const db = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    if (!db || !admin) throw new ActionError("The database is not configured.");
    const { data: r } = await db.from("reports").select("id, target_type, target_id, reason").eq("id", p.data.id).maybeSingle();
    if (!r) return fail("Report not found.");
    let ownerId: string | null = null;
    if (p.data.takedown || p.data.strike) {
      if (r.target_type === "stream") {
        const { data: s } = await admin.from("streams").select("owner_id, provider_stream_id, source_type, status").eq("id", r.target_id).maybeSingle();
        ownerId = s?.owner_id ?? null;
        if (p.data.takedown && s) {
          await admin.from("streams").update({ status: "disabled", is_published: false }).eq("id", r.target_id);
          if (s.provider_stream_id && s.source_type.startsWith("platform")) await import("@/lib/providers/cloudflare").then((m) => m.updateLiveInput(s.provider_stream_id!, { enabled: false })).catch(() => undefined);
        }
      } else if (r.target_type === "video") {
        const { data: v } = await admin.from("videos").select("owner_id").eq("id", r.target_id).maybeSingle();
        ownerId = v?.owner_id ?? null;
        if (p.data.takedown) await admin.from("videos").update({ visibility: "private" }).eq("id", r.target_id);
      } else if (r.target_type === "profile") ownerId = r.target_id;
      else if (r.target_type === "chat_message") {
        const { data: m } = await admin.from("chat_messages").select("user_id").eq("id", r.target_id).maybeSingle();
        ownerId = m?.user_id ?? null;
        if (p.data.takedown) await db.rpc("delete_chat_message", { p_message: r.target_id, p_reason: `report ${r.id}` });
      }
      if (p.data.strike && ownerId) await db.rpc("add_strike", { p_user: ownerId, p_reason: `Report ${r.id}: ${r.reason}` });
    }
    const { error } = await db.from("reports").update({ status: p.data.status, resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note: p.data.note ?? null }).eq("id", p.data.id);
    if (error) return fail("Could not update the report.");
    await db.rpc("log_moderation_action", { p_action: `report_${p.data.status}`, p_target_type: r.target_type, p_target_id: r.target_id, p_reason: p.data.note ?? null, p_metadata: { report_id: r.id, takedown: !!p.data.takedown, strike: !!p.data.strike } });
    revalidatePath("/admin/reports");
    return done("Report updated.");
  });
}

const copyrightResolution = z.object({ id: z.string().uuid(), status: z.enum(["reviewing", "upheld", "rejected", "counter_notice"]), note: z.string().max(1000).optional() });

/** Staff: copyright takedown workflow. `upheld` removes the content and records a strike against the owner. */
export async function resolveCopyrightAction(input: z.input<typeof copyrightResolution>): Promise<ActionState> {
  return guard(async () => {
    const user = await actionUser("moderator");
    const p = copyrightResolution.safeParse(input);
    if (!p.success) return fail("Invalid request.");
    const db = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    if (!db || !admin) throw new ActionError("The database is not configured.");
    const { data: c } = await db.from("copyright_complaints").select("id, stream_id, video_id").eq("id", p.data.id).maybeSingle();
    if (!c) return fail("Complaint not found.");
    if (p.data.status === "upheld") {
      let owner: string | null = null;
      if (c.stream_id) {
        const { data: s } = await admin.from("streams").select("owner_id, provider_stream_id, source_type").eq("id", c.stream_id).maybeSingle();
        owner = s?.owner_id ?? null;
        if (s) {
          await admin.from("streams").update({ status: "disabled", is_published: false }).eq("id", c.stream_id);
          if (s.provider_stream_id && s.source_type.startsWith("platform")) await import("@/lib/providers/cloudflare").then((m) => m.updateLiveInput(s.provider_stream_id!, { enabled: false })).catch(() => undefined);
        }
      }
      if (c.video_id) {
        const { data: v } = await admin.from("videos").select("owner_id, provider_asset_id").eq("id", c.video_id).maybeSingle();
        owner = owner ?? v?.owner_id ?? null;
        if (v) await admin.from("videos").update({ visibility: "private" }).eq("id", c.video_id); // retained (private) for counter-notice handling
      }
      if (owner) {
        await db.rpc("add_strike", { p_user: owner, p_reason: `Copyright complaint ${c.id} upheld` });
        await admin.from("notifications").insert({ user_id: owner, type: "moderation", title: "Content removed after a copyright complaint", body: "A copyright complaint against your content was upheld. Repeated infringement leads to account suspension.", link: "/copyright-policy" });
      }
    }
    const { error } = await db.from("copyright_complaints").update({ status: p.data.status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), resolution_note: p.data.note ?? null }).eq("id", p.data.id);
    if (error) return fail("Could not update the complaint.");
    await db.rpc("log_moderation_action", { p_action: `copyright_${p.data.status}`, p_target_type: "copyright_complaint", p_target_id: c.id, p_reason: p.data.note ?? null });
    revalidatePath("/admin/reports");
    return done("Complaint updated.");
  });
}

