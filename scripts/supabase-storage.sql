-- Speakit storage buckets + access policies.
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is idempotent: safe to run multiple times.

-- 1) Public buckets for chat images/GIFs and avatars
insert into storage.buckets (id, name, public)
values ('chat-uploads', 'chat-uploads', true),
       ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2) Anyone can VIEW images (chat embeds + avatars load for everyone)
drop policy if exists "Public read uploads" on storage.objects;
create policy "Public read uploads" on storage.objects
  for select using (bucket_id in ('chat-uploads', 'avatars'));

-- 3) Logged-in users can UPLOAD (app validates type/size before + after upload)
drop policy if exists "Authenticated upload" on storage.objects;
create policy "Authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('chat-uploads', 'avatars'));

-- 4) Users can REPLACE/DELETE their own files (e.g. change avatar)
drop policy if exists "Owner update own files" on storage.objects;
create policy "Owner update own files" on storage.objects
  for update to authenticated
  using (bucket_id in ('chat-uploads', 'avatars') and owner = auth.uid());

drop policy if exists "Owner delete own files" on storage.objects;
create policy "Owner delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('chat-uploads', 'avatars') and owner = auth.uid());
