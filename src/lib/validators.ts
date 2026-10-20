import { z } from "zod";

export const visibilitySchema = z.enum(["public", "unlisted", "private"]);
const uuid = z.string().uuid();
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const streamFormSchema = z.object({
  title: z.string().trim().min(3, "At least 3 characters").max(120, "At most 120 characters"),
  description: z.preprocess(emptyToNull, z.string().max(5000, "At most 5000 characters").nullable()),
  sport_id: uuid.or(z.string().min(1, "Choose a sport").pipe(uuid)),
  language: z.preprocess(emptyToNull, z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, "Use a language code like en").nullable()),
  visibility: visibilitySchema,
  match_id: z.preprocess(emptyToNull, uuid.nullable()),
  scheduled_start: z.preprocess(emptyToNull, z.string().datetime({ offset: true, local: true }).nullable()),
  thumbnail_alt: z.preprocess(emptyToNull, z.string().max(200, "At most 200 characters").nullable()),
  thumbnail_focus_x: z.coerce.number().min(0).max(100).default(50),
  thumbnail_focus_y: z.coerce.number().min(0).max(100).default(50),
  chat_enabled: z.boolean(),
  chat_slow_mode_seconds: z.coerce.number().int().min(0).max(300).default(0),
  recording_enabled: z.boolean(),
});

export const sourceKindSchema = z.enum(["platform_webrtc", "platform_rtmps", "external"]);

export const videoFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120),
  description: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  visibility: visibilitySchema,
  thumbnail_alt: z.preprocess(emptyToNull, z.string().max(200).nullable()),
  thumbnail_focus_x: z.coerce.number().min(0).max(100).default(50),
  thumbnail_focus_y: z.coerce.number().min(0).max(100).default(50),
});

export const reportSchema = z.object({
  target_type: z.enum(["stream", "video", "profile", "chat_message"]),
  target_id: uuid,
  reason: z.enum(["spam", "abuse", "copyright", "illegal", "violence", "other"]),
  details: z.preprocess(emptyToNull, z.string().max(2000).nullable()),
});

export const copyrightSchema = z.object({
  complainant_name: z.string().trim().min(2, "Enter your full legal name").max(120),
  complainant_email: z.string().email("Enter a valid email"),
  company: z.preprocess(emptyToNull, z.string().max(160).nullable()),
  work_description: z.string().trim().min(20, "Describe the copyrighted work (at least 20 characters)").max(3000),
  urls: z.string().trim().min(1, "List at least one URL").transform((s) => s.split(/\s+/).filter(Boolean)).pipe(z.array(z.string().url("Each entry must be a full URL")).min(1).max(20)),
  good_faith: z.literal("on", { error: "You must confirm this statement" }),
  accuracy: z.literal("on", { error: "You must confirm this statement" }),
  signature: z.string().trim().min(2, "Type your full name as an electronic signature").max(120),
});
