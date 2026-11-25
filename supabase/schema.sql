-- Run this in your Supabase project's SQL Editor.
-- Do not publish your Supabase service_role key.
create table if not exists public.trip_state (
 id integer primary key default 1 check (id = 1),
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
insert into public.trip_state (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;
-- Keep inaccessible to anonymous API clients; only Netlify Functions with service_role can read/write.
alter table public.trip_state enable row level security;
revoke all on table public.trip_state from anon, authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('trip-private','trip-private',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Re-running setup must never leave an existing bucket public.
update storage.buckets set public = false where id = 'trip-private';
