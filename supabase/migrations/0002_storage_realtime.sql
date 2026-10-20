-- Storage bucket for thumbnails/avatars and realtime publication. Both only exist on Supabase,
-- so each block is guarded to keep the migration runnable on plain Postgres (tests).

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('thumbnails', 'thumbnails', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    -- Objects are namespaced by owner: <user-id>/<random>.<ext>. Users can only write inside their own folder.
    execute $p$ create policy "thumbnails public read" on storage.objects for select using (bucket_id = 'thumbnails') $p$;
    execute $p$ create policy "thumbnails owner insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy "thumbnails owner update" on storage.objects for update to authenticated
      using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy "thumbnails owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'thumbnails' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())) $p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.streams;
  end if;
end $$;
