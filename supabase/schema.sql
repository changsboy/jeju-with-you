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
revoke all on table public.trip_state from public, anon, authenticated;
grant all on table public.trip_state to service_role;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('trip-private','trip-private',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Re-running setup must never leave an existing bucket public.
update storage.buckets set public = false where id = 'trip-private';

-- Serialized, server-only login throttling. IPs are HMAC-hashed by the function.
create table if not exists public.login_attempts (
 key text primary key,
 window_start timestamptz not null,
 attempts integer not null
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
create or replace function public.allow_login_attempt(client_key text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare count_now integer;
begin
 delete from public.login_attempts where window_start < now() - interval '1 day';
 insert into public.login_attempts as a (key, window_start, attempts)
 values (client_key, now(), 1)
 on conflict (key) do update set
  attempts = case when a.window_start < now() - interval '15 minutes' then 1 else a.attempts + 1 end,
  window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end
 returning attempts into count_now;
 return count_now <= 10;
end;
$$;
revoke all on function public.allow_login_attempt(text) from public, anon, authenticated;
grant execute on function public.allow_login_attempt(text) to service_role;

-- Deny direct access even if another bucket uses broad permissive policies.
drop policy if exists trip_private_server_only on storage.objects;
create policy trip_private_server_only on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'trip-private')
with check (bucket_id <> 'trip-private');
