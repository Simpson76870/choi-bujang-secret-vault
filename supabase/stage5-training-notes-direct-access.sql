-- 5단계: training_notes의 직접 Data API 권한만 회수합니다.
-- 다른 테이블, 함수, Storage bucket 또는 Auth 설정에는 영향을 주지 않습니다.
-- 이 파일은 제안 SQL입니다. 저장소 커밋 시 DB에 자동 적용되지 않습니다.
--
-- 사용 순서:
-- 1) Supabase SQL Editor에서 아래의 "사전 권한 조회" SELECT만 선택해 실행하고 결과를 보관합니다.
-- 2) 결과를 검토한 뒤 REVOKE 블록만 따로 선택해 실행합니다.
-- 3) 아래의 "사후 유효 권한 확인" SELECT를 실행합니다.
-- 4) anon/authenticated의 SELECT·INSERT·UPDATE·DELETE가 모두 false인지 확인합니다.
--    PUBLIC은 0-grantee ACL 조회에 남아 있으면 안 됩니다.
--
-- 사전 권한 조회: training_notes ACL에 PUBLIC / anon / authenticated가 직접 가진 권한.
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(relation.relacl, acldefault('r', relation.relowner))
) AS acl
WHERE namespace.nspname = 'public'
  AND relation.relname = 'training_notes'
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
  )
ORDER BY grantee, acl.privilege_type;

-- 권한 회수: 학습 메모 테이블 한 개만 변경합니다.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.training_notes FROM PUBLIC, anon, authenticated;
COMMIT;

-- 사후 유효 권한 확인: 결과의 allowed 값이 모두 false여야 합니다.
-- has_table_privilege는 역할에 직접 부여된 권한뿐 아니라 PUBLIC 등을 통한 유효 권한도 반영합니다.
SELECT
  roles.role_name,
  privileges.privilege,
  has_table_privilege(
    roles.role_name,
    'public.training_notes',
    privileges.privilege
  ) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege)
ORDER BY roles.role_name, privileges.privilege;

-- PUBLIC의 직접 ACL이 남아 있지 않은지도 다시 확인합니다.
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(relation.relacl, acldefault('r', relation.relowner))
) AS acl
WHERE namespace.nspname = 'public'
  AND relation.relname = 'training_notes'
  AND (
    acl.grantee = 0
    OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
  )
ORDER BY grantee, acl.privilege_type;
