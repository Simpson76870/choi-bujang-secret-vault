-- Stage 4 fixture seeding: fictional notes only.
-- Replace both *_EMAIL_HERE placeholders with the real test-account emails before running.
-- Do not store the replaced email addresses in this repository.
do $$
declare
  a_email text := lower(trim('A_EMAIL_HERE'));
  b_email text := lower(trim('B_EMAIL_HERE'));
  a_id uuid;
  b_id uuid;
begin
  if a_email = 'a_email_here' or b_email = 'b_email_here'
     or position('@' in a_email) = 0 or position('@' in b_email) = 0 then
    raise exception 'Replace A_EMAIL_HERE and B_EMAIL_HERE with the two test account emails first.';
  end if;

  select id into a_id from auth.users where lower(email) = a_email limit 1;
  select id into b_id from auth.users where lower(email) = b_email limit 1;
  if a_id is null or b_id is null then
    raise exception 'Both A and B must exist in auth.users before seeding.';
  end if;
  if a_id = b_id then
    raise exception 'A and B must be two different Auth users.';
  end if;

  update public.training_notes
     set owner_id = a_id
   where title in ('과제', '포트폴리오', '아침 리추얼', '훈련 행정 자료')
     and owner_id in (a_id, '00000000-0000-4000-8000-000000000001'::uuid);

  delete from public.training_notes
   where owner_id = '00000000-0000-4000-8000-000000000002'::uuid
     and title = '공개 시험 메모';

  insert into public.training_notes (owner_id, title, content)
  values (b_id, '공개 시험 메모', '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.')
  on conflict (owner_id, title)
  do update set content = excluded.content;
end
$$;
