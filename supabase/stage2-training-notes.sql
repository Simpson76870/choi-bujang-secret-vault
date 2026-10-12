-- Stage 2 schema and fictional training fixtures only.
-- owner_id is a standalone UUID; do not add a foreign key to auth.users.
-- Base64 is only an encoding, not encryption. Never put real data or secrets here.
create table if not exists public.training_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) <= 2000),
  created_at timestamptz not null default now(),
  constraint training_notes_owner_title_key unique (owner_id, title)
);

comment on table public.training_notes is
  'Stage 2 training fixture notes only. owner_id has no auth.users foreign key.';

alter table public.training_notes enable row level security;
revoke all on table public.training_notes from public, anon, authenticated;
grant select on table public.training_notes to service_role;

insert into public.training_notes (owner_id, title, content)
values
  ('00000000-0000-4000-8000-000000000001', '과제', convert_from(decode('7Iuk7Iq17JqpIOqwgOyDgSDqs7zsoJwg6riw66Gd', 'base64'), 'UTF8')),
  ('00000000-0000-4000-8000-000000000001', '포트폴리오', convert_from(decode('7Iuk7Iq17JqpIOqwgOyDgSDtj6ztirjtj7TrpqzsmKQg6riw66Gd', 'base64'), 'UTF8')),
  ('00000000-0000-4000-8000-000000000001', '아침 리추얼', convert_from(decode('7Iuk7Iq17JqpIOqwgOyDgSDrpqzstpTslrwg6riw66Gd', 'base64'), 'UTF8')),
  ('00000000-0000-4000-8000-000000000001', '훈련 행정 자료', convert_from(decode('7Iuk7Iq17JqpIOqwgOyDgSDtlonsoJUg6riw66Gd', 'base64'), 'UTF8'))
on conflict (owner_id, title) do update set content = excluded.content;
