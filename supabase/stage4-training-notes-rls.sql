-- Stage 4: row-level security for the fictional training_notes table only.
-- The API also checks ownership because its server-only secret key bypasses RLS.
alter table public.training_notes enable row level security;

revoke all on table public.training_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.training_notes to authenticated;

drop policy if exists training_notes_select_own on public.training_notes;
create policy training_notes_select_own
  on public.training_notes
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists training_notes_insert_own on public.training_notes;
create policy training_notes_insert_own
  on public.training_notes
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists training_notes_update_own on public.training_notes;
create policy training_notes_update_own
  on public.training_notes
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists training_notes_delete_own on public.training_notes;
create policy training_notes_delete_own
  on public.training_notes
  for delete
  to authenticated
  using (auth.uid() = owner_id);
