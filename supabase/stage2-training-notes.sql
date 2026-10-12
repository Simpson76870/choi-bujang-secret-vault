-- Stage 2 schema only. Fixture note bodies are inserted into the training
-- project directly and are deliberately not stored in public Git history.
create table if not exists public.training_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) <= 2000),
  created_at timestamptz not null default now(),
  constraint training_notes_owner_title_key unique (owner_id, title)
);

comment on table public.training_notes is
  'Stage 2 training fixture notes only. owner_id is a standalone UUID and intentionally has no foreign key to auth.users.';

alter table public.training_notes enable row level security;

revoke all on table public.training_notes from public, anon, authenticated;
grant select on table public.training_notes to service_role;
