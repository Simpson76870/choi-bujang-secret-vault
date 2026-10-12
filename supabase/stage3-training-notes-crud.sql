-- Stage 3: server-only CRUD privileges for the existing fictional training notes table.
-- RLS stays enabled. No direct table privileges are granted to anon or authenticated.
-- API handlers must verify Supabase Auth tokens before using this service-role client.
grant select, insert, update, delete on table public.training_notes to service_role;
