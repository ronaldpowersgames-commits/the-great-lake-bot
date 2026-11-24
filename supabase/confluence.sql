-- Run in the Lake's Supabase SQL editor. Only the server service role can access these rows.
create table if not exists public.lake_confluence (
  owner uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  id text not null,
  version uuid not null,
  sealed text not null,
  created_at timestamptz not null default now(),
  primary key (owner, bucket, id)
);

alter table public.lake_confluence enable row level security;
revoke all on table public.lake_confluence from public, anon, authenticated;
grant select, insert, update, delete on table public.lake_confluence to service_role;
create index if not exists lake_confluence_created_at on public.lake_confluence (owner, bucket, created_at desc);
