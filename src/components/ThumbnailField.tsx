"use client";
import { useEffect, useRef, useState } from "react";
import { Thumbnail } from "./media";

/**
 * Upload or URL + focal point. The preview is the exact 16:9 crop the server will produce
 * (the server re-encodes to 1280×720 WebP centred on the focal point).
 */
export function ThumbnailField({ current, sportSlug, focusX = 50, focusY = 50, alt }: { current?: string | null; sportSlug?: string | null; focusX?: number; focusY?: number; alt?: string | null }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [fx, setFx] = useState(focusX);
  const [fy, setFy] = useState(focusY);
  const [remove, setRemove] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const preview = remove ? null : fileUrl ?? (/^https:\/\//i.test(url) ? url : current ?? null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const f = e.target.files?.[0];
    objectUrl.current = f ? URL.createObjectURL(f) : null;
    setFileUrl(objectUrl.current);
    setRemove(false);
  }
  function pick(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setFx(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
    setFy(Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))));
  }
  const nudge = (dx: number, dy: number) => { setFx((v) => Math.min(100, Math.max(0, v + dx))); setFy((v) => Math.min(100, Math.max(0, v + dy))); };

  return (
    <fieldset className="space-y-3">
      <legend className="label">Thumbnail</legend>
      <div className="relative cursor-crosshair overflow-hidden rounded-xl border border-line" onPointerDown={pick} role="group" aria-label="Focal point picker. Click the image to choose the area to keep centred.">
        <Thumbnail src={preview} alt={alt} focusX={fx} focusY={fy} sportSlug={sportSlug} />
        <span className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/.5)]" style={{ left: `${fx}%`, top: `${fy}%` }} aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Focal point: {fx}% / {fy}%</span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(-5, 0)} aria-label="Move focal point left">←</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(5, 0)} aria-label="Move focal point right">→</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(0, -5)} aria-label="Move focal point up">↑</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(0, 5)} aria-label="Move focal point down">↓</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setFx(50); setFy(50); }}>Centre</button>
      </div>
      <input type="hidden" name="thumbnail_focus_x" value={fx} />
      <input type="hidden" name="thumbnail_focus_y" value={fy} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="thumbnail_file" className="label">Upload image</label><input id="thumbnail_file" name="thumbnail_file" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="input py-2 text-xs" /></div>
        <div><label htmlFor="thumbnail_url" className="label">…or image URL</label><input id="thumbnail_url" name="thumbnail_url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="input" /></div>
      </div>
      <p className="hint">PNG, JPEG or WebP, up to 5 MB, at least 320×180. URL images are downloaded by our server, checked and re-hosted — never hot-linked. An uploaded file takes priority over a URL.</p>
      <div><label htmlFor="thumbnail_alt" className="label">Alt text</label><input id="thumbnail_alt" name="thumbnail_alt" defaultValue={alt ?? ""} maxLength={200} className="input" placeholder="Describe the image for screen readers" /></div>
      {current && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_thumbnail" checked={remove} onChange={(e) => setRemove(e.target.checked)} className="accent-primary" />Remove current thumbnail</label>}
    </fieldset>
  );
}
