-- Stage 8: separate fictional training announcements from private training notes.
-- Existing public.training_notes and its data are not altered.
create table if not exists public.training_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  instructor_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null check (char_length(content) <= 3000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.training_announcements enable row level security;
revoke all privileges on table public.training_announcements from public, anon, authenticated;
grant select, insert, update, delete on table public.training_announcements to service_role;
