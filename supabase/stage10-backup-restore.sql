-- Stage 10 adds isolated recovery metadata. It does not read, rewrite, or delete
-- existing notes or the live decision policy. Do not populate backups from current
-- rows after an incident; load only a separately verified pre-incident snapshot.
begin;

create table if not exists public.training_test_policy_state (
  id text primary key check (id = 'active'),
  version text not null check (char_length(version) between 1 and 120),
  policy jsonb not null,
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.training_test_policy_state enable row level security;
revoke all privileges on table public.training_test_policy_state from public, anon, authenticated;
grant select, insert, update on table public.training_test_policy_state to service_role;
revoke delete, truncate on table public.training_test_policy_state from service_role;

create table if not exists public.training_test_policy_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null check (action = 'restore_test_policy'),
  before_version text not null,
  after_version text not null,
  before_sha256 text not null check (before_sha256 ~ '^[a-f0-9]{64}$'),
  after_sha256 text not null check (after_sha256 ~ '^[a-f0-9]{64}$'),
  changed_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.training_test_policy_audit enable row level security;
revoke all privileges on table public.training_test_policy_audit from public, anon, authenticated;
grant select, insert on table public.training_test_policy_audit to service_role;
revoke update, delete, truncate on table public.training_test_policy_audit from service_role;

create table if not exists public.training_note_backups (
  note_id uuid not null,
  owner_id uuid not null,
  fixture_key text not null check (fixture_key = 'stage4_b_private_note'),
  backup_version text not null check (backup_version = 'stage4-b-preincident-v1'),
  title text not null check (title = '공개 시험 메모'),
  content text not null check (content = '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit = 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (note_id, owner_id, backup_version)
);
alter table public.training_note_backups enable row level security;
revoke all privileges on table public.training_note_backups from public, anon, authenticated;
grant select, insert on table public.training_note_backups to service_role;
revoke update, delete, truncate on table public.training_note_backups from service_role;

create table if not exists public.training_note_restore_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  note_id uuid not null,
  backup_version text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  action text not null check (action = 'restore_one_private_virtual_note'),
  created_at timestamptz not null default now()
);
alter table public.training_note_restore_audit enable row level security;
revoke all privileges on table public.training_note_restore_audit from public, anon, authenticated;
grant select, insert on table public.training_note_restore_audit to service_role;
revoke update, delete, truncate on table public.training_note_restore_audit from service_role;

-- Post-restore HTTP checks are recorded separately from the restore audit row.
create table if not exists public.training_note_restore_retest_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  note_id uuid not null,
  backup_version text not null check (backup_version = 'stage4-b-preincident-v1'),
  normal_attempted boolean not null,
  normal_status integer check (normal_status between 100 and 599),
  normal_passed boolean not null,
  forbidden_attempted boolean not null,
  forbidden_status integer check (forbidden_status between 100 and 599),
  forbidden_passed boolean not null,
  retest_passed boolean not null,
  created_at timestamptz not null default now(),
  check (not retest_passed or
    (normal_attempted and normal_status = 200 and normal_passed
     and forbidden_attempted and forbidden_status = 404 and forbidden_passed))
);
alter table public.training_note_restore_retest_audit enable row level security;
revoke all privileges on table public.training_note_restore_retest_audit from public, anon, authenticated;
grant select, insert on table public.training_note_restore_retest_audit to service_role;
revoke update, delete, truncate on table public.training_note_restore_retest_audit from service_role;

create or replace function public.restore_stage10_test_policy(
  p_expected_current_sha256 text,
  p_backup_version text,
  p_backup_policy jsonb,
  p_backup_policy_sha256 text,
  p_source_commit text,
  p_actor_id uuid,
  p_changed_items text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.training_test_policy_state%rowtype;
  restored_version text;
begin
  if p_actor_id is null
    or p_backup_version <> 'stage9-safe-policy-v1'
    or p_source_commit <> 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269'
    or p_backup_policy_sha256 !~ '^[a-f0-9]{64}$'
    or p_expected_current_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'RESTORE_ARGUMENT_INVALID';
  end if;

  select * into current_row
    from public.training_test_policy_state
    where id = 'active'
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEST_POLICY_STATE_UNAVAILABLE';
  end if;
  if current_row.policy_sha256 <> p_expected_current_sha256 then
    raise exception using errcode = '40001', message = 'POLICY_STATE_CHANGED';
  end if;

  restored_version := p_backup_version;
  update public.training_test_policy_state
     set version = restored_version,
         policy = p_backup_policy,
         policy_sha256 = p_backup_policy_sha256,
         updated_at = now()
   where id = 'active';

  insert into public.training_test_policy_audit (
    actor_id, action, before_version, after_version,
    before_sha256, after_sha256, changed_items
  ) values (
    p_actor_id, 'restore_test_policy', current_row.version, restored_version,
    current_row.policy_sha256, p_backup_policy_sha256,
    coalesce(to_jsonb(p_changed_items), '[]'::jsonb)
  );

  return jsonb_build_object(
    'version', restored_version,
    'policySha256', p_backup_policy_sha256,
    'auditRecorded', true
  );
end;
$$;
revoke all on function public.restore_stage10_test_policy(text, text, jsonb, text, text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.restore_stage10_test_policy(text, text, jsonb, text, text, uuid, text[]) to service_role;

create or replace function public.restore_stage10_training_note(
  p_note_id uuid,
  p_owner_id uuid,
  p_actor_id uuid,
  p_backup_version text,
  p_title text,
  p_content text,
  p_content_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  backup_row public.training_note_backups%rowtype;
  current_owner uuid;
  action_name text;
begin
  if p_note_id is null or p_owner_id is null or p_actor_id is distinct from p_owner_id
    or p_backup_version <> 'stage4-b-preincident-v1'
    or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'RESTORE_OWNER_OR_ARGUMENT_INVALID';
  end if;

  select * into backup_row
    from public.training_note_backups
   where note_id = p_note_id
     and owner_id = p_owner_id
     and fixture_key = 'stage4_b_private_note'
     and backup_version = p_backup_version
     and verified_at is not null
   for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'VERIFIED_BACKUP_UNAVAILABLE';
  end if;
  if backup_row.title is distinct from p_title
    or backup_row.content is distinct from p_content
    or backup_row.content_sha256 is distinct from p_content_sha256 then
    raise exception using errcode = '22000', message = 'VERIFIED_BACKUP_INVALID';
  end if;

  select owner_id into current_owner
    from public.training_notes
   where id = p_note_id
   for update;
  if found and current_owner is distinct from p_owner_id then
    raise exception using errcode = '42501', message = 'NOTE_OWNER_MISMATCH';
  end if;

  if current_owner is null then
    insert into public.training_notes (id, owner_id, title, content)
    values (p_note_id, p_owner_id, p_title, p_content);
    action_name := 'insert';
  else
    update public.training_notes
       set title = p_title, content = p_content
     where id = p_note_id and owner_id = p_owner_id;
    action_name := 'update';
  end if;

  insert into public.training_note_restore_audit (
    actor_id, note_id, backup_version, content_sha256, action
  ) values (
    p_actor_id, p_note_id, p_backup_version, p_content_sha256,
    'restore_one_private_virtual_note'
  );

  return jsonb_build_object(
    'noteId', p_note_id,
    'ownerId', p_owner_id,
    'contentSha256', p_content_sha256,
    'backupVersion', p_backup_version,
    'operation', action_name
  );
end;
$$;
revoke all on function public.restore_stage10_training_note(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.restore_stage10_training_note(uuid, uuid, uuid, text, text, text, text) to service_role;

-- Seed only the fixed, source-controlled Stage 4 B fixture. Never copy the live row
-- into this table: the constants below are the expected pre-incident baseline.
insert into public.training_note_backups (
  note_id, owner_id, fixture_key, backup_version, title, content,
  content_sha256, manifest_sha256, source_commit, verified_at
) values (
  '571efc48-7428-4740-b787-1ad8422acd37',
  '00000000-0000-4000-8000-000000000002',
  'stage4_b_private_note',
  'stage4-b-preincident-v1',
  '공개 시험 메모',
  '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.',
  '7ca435652f577612f8ef4c1f99a6cbebe1f8fb9806d4c0cfb03873c346033bfe',
  '649a6ccaa2d953bb74885c9aac70a75a27406ac6776a575329d857ab3ea6997d',
  'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269',
  now()
) on conflict (note_id, owner_id, backup_version) do nothing;

do $stage10_backup_check$
begin
  if not exists (
    select 1 from public.training_note_backups
     where note_id = '571efc48-7428-4740-b787-1ad8422acd37'::uuid
       and owner_id = '00000000-0000-4000-8000-000000000002'::uuid
       and fixture_key = 'stage4_b_private_note'
       and backup_version = 'stage4-b-preincident-v1'
       and title = '공개 시험 메모'
       and content = '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.'
       and content_sha256 = '7ca435652f577612f8ef4c1f99a6cbebe1f8fb9806d4c0cfb03873c346033bfe'
       and manifest_sha256 = '649a6ccaa2d953bb74885c9aac70a75a27406ac6776a575329d857ab3ea6997d'
       and source_commit = 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269'
       and verified_at is not null
  ) then
    raise exception 'STAGE10_VERIFIED_B_FIXTURE_BACKUP_INVALID';
  end if;
end;
$stage10_backup_check$;

commit;
