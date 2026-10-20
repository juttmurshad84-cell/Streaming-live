"use client";
import { updateVideoAction, deleteVideoAction } from "@/app/actions/videos";
import type { Video } from "@/lib/types";
import { ConfirmAction } from "./ConfirmAction";
import { ActionForm, SelectField, SubmitButton, TextArea, TextField } from "./forms";
import { ThumbnailField } from "./ThumbnailField";

export function VideoEditor({ video }: { video: Video }) {
  return (
    <div className="space-y-4 border-t border-line p-4">
      <ActionForm action={updateVideoAction} encType="multipart/form-data" className="space-y-4">
        <input type="hidden" name="id" value={video.id} />
        <TextField name="title" label="Title" defaultValue={video.title} required maxLength={120} />
        <TextArea name="description" label="Description" defaultValue={video.description} rows={3} maxLength={5000} />
        <SelectField name="visibility" label="Visibility" defaultValue={video.visibility} hint="Private videos are only playable by you (and moderators). Playback uses short-lived signed URLs." options={[{ value: "public", label: "Public — listed and searchable" }, { value: "unlisted", label: "Unlisted — anyone with the link" }, { value: "private", label: "Private — only me" }]} />
        <ThumbnailField current={video.thumbnail_url} sportSlug={video.sport?.slug} focusX={video.thumbnail_focus_x} focusY={video.thumbnail_focus_y} alt={video.thumbnail_alt} />
        <SubmitButton>Save video</SubmitButton>
      </ActionForm>
      <ConfirmAction label="Delete video" variant="danger" small={false} confirm="Delete this video permanently? This removes the recording from storage." action={deleteVideoAction} args={[video.id]} />
    </div>
  );
}
