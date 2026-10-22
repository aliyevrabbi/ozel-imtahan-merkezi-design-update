begin;

select plan(43);

insert into public.exams (
  id, title, category, organizer, grades, subjects, exam_date, start_time,
  end_time, city, status, application_open_at, application_deadline
) values
  ('11111111-1111-4111-8111-111111111111', 'Synthetic Phase 2 test exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('22222222-2222-4222-8222-222222222222', 'Synthetic unpublished test exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'draft', now() - interval '1 day', now() + interval '30 days'),
  ('33333333-3333-4333-8333-333333333333', 'Synthetic closed test exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '30 days', now() - interval '1 day');

create temporary table phase2_test_result (
  success boolean,
  registration_number text
) on commit drop;

insert into phase2_test_result
select * from public.submit_public_application(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
  'Synthetic', 'Student', 'Test Father', '9', 'Synthetic School', null,
  '+994 50 123 45 67', null, '0507654321', 'Test şəhəri', null
);
select is((select success from phase2_test_result), true, 'valid public request succeeds');
select ok((select count(*) = 2 from jsonb_object_keys(to_jsonb((select r from phase2_test_result as r)))), 'public result has exactly two fields');
select ok(not (to_jsonb((select phase2_test_result from phase2_test_result)) ? 'application_id'), 'public result does not contain application_id');
select ok(not (to_jsonb((select phase2_test_result from phase2_test_result)) ?| array[
  'id', 'application_id', 'exam_id', 'student_name', 'student_surname',
  'student_father_name', 'grade', 'school', 'course_or_tutor', 'student_phone',
  'student_phone_normalized', 'parent_name', 'parent_phone', 'parent_phone_normalized',
  'city', 'public_note', 'internal_note', 'application_status', 'payment_status',
  'ticket_status', 'ticket_id', 'token', 'token_hash', 'pdf_storage_path',
  'assigned_building_id', 'assigned_room_id', 'assigned_seat_id', 'created_at',
  'updated_at', 'attended_at'
]), 'public result omits private, payment, ticket, token, PDF, and assignment fields');
select matches((select registration_number from phase2_test_result), '^OIM-[0-9]{4}-[A-F0-9]{12}$', 'database generates authoritative registration number');
select is((select count(*)::integer from public.applications a where a.registration_number = (select registration_number from phase2_test_result)), 1, 'valid request creates one row');
select is((select application_status::text from public.applications a where a.registration_number = (select registration_number from phase2_test_result)), 'pending', 'application begins pending');
select is((select payment_status::text from public.applications a where a.registration_number = (select registration_number from phase2_test_result)), 'not_submitted', 'payment begins not_submitted');
select is((select ticket_status::text from public.applications a where a.registration_number = (select registration_number from phase2_test_result)), 'not_created', 'ticket begins not_created');
select ok((select assigned_building_id is null and assigned_room_id is null and assigned_seat_id is null from public.applications a where a.registration_number = (select registration_number from phase2_test_result)), 'all assignment fields remain null');
select is((select count(*)::integer from public.tickets t join public.applications a on a.id = t.application_id where a.registration_number = (select registration_number from phase2_test_result)), 0, 'no ticket is created');
update public.exams
set application_deadline = now() - interval '1 minute'
where id = '11111111-1111-4111-8111-111111111111';

create temporary table phase2_retry_result (success boolean, registration_number text) on commit drop;
insert into phase2_retry_result
select * from public.submit_public_application(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
  'Synthetic', 'Student', 'Test Father', '9', 'Synthetic School', null,
  '+994 50 123 45 67', null, '0507654321', 'Test şəhəri', null
);
select is((select success from phase2_retry_result), true, 'identical retry succeeds');
select is((select registration_number from phase2_retry_result), (select registration_number from phase2_test_result), 'same request key replays the original acknowledgement after the exam window closes');
select is((select count(*)::integer from public.applications), 1, 'idempotent retry creates no duplicate');
select throws_ok(
  $$select * from public.submit_public_application('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Changed', 'Student', 'Test Father', '9', 'Synthetic School', null, '+994 50 123 45 67', null, '0507654321', 'Test şəhəri', null)$$,
  'P0001', 'request_conflict', 'same idempotency key cannot be reused with a different payload'
);
select throws_ok(
  $$select * from public.submit_public_application('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Synthetic', 'Student', 'Father', '9', 'School', null, '+994501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'application_closed', 'unpublished exam is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'Synthetic', 'Student', 'Father', '9', 'School', null, '+994501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'application_closed', 'closed application window is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'Synthetic', 'Student', 'Father', '9', 'School', null, 'not-a-phone', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'invalid_phone', 'malformed phone is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('12121212-1212-4212-8212-121212121212', '11111111-1111-4111-8111-111111111111', 'Synthetic', 'Student', 'Father', '9', 'School', null, '0+501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'invalid_phone', 'a plus sign after the first phone character is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('not-a-uuid', '11111111-1111-4111-8111-111111111111', 'Synthetic', 'Student', 'Father', '9', 'School', null, '+994501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'invalid_request', 'malformed idempotency key is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '', 'Student', 'Father', '9', 'School', null, '+994501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'invalid_application', 'invalid required text is rejected with a safe category'
);
select throws_ok(
  $$select * from public.submit_public_application('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Synthetic', 'Student', 'Father', '9', 'School', null, '+994501234567', null, '+994507654321', 'Test şəhəri', null)$$,
  'P0001', 'invalid_exam', 'unknown exam is rejected with a safe category'
);
select ok(not has_table_privilege('anon', 'public.applications', 'SELECT'), 'anon has no application SELECT grant');
select ok(not has_table_privilege('anon', 'public.applications', 'INSERT'), 'anon has no application INSERT grant');
select ok(not has_table_privilege('anon', 'public.applications', 'UPDATE'), 'anon has no application UPDATE grant');
select ok(not has_table_privilege('anon', 'public.applications', 'DELETE'), 'anon has no application DELETE grant');
select ok(not exists (
  select 1 from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'applications'
    and 'anon' = any(roles) and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
), 'no anonymous application policy exists');
select ok(exists (
  select 1
  from pg_catalog.pg_constraint c
  where c.conrelid = 'private.application_submission_requests'::regclass
    and c.conname = 'application_submission_requests_idempotency_key_unique'
    and c.contype = 'u'
    and c.conkey = array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid = c.conrelid and a.attname = 'idempotency_key')]::smallint[]
), 'live ledger idempotency key has the expected unique constraint');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosecdef
    and p.proconfig @> array['search_path=""']::text[]
    and p.prosrc like '%schema_name%'
    and p.prosrc like '%table_name%'
    and p.prosrc like '%application_submission_requests_idempotency_key_unique%'
    and p.prosrc like '%payload_digest%'
    and p.prosrc like '%registration_number%'
    and p.prosrc like '%duplicate_request%'
    and p.prosrc like '%application_insert_failed%'
    and p.prosrc like '%application_not_null_failed%'
    and p.prosrc like '%application_foreign_key_failed%'
    and p.prosrc like '%application_unique_failed%'
    and p.prosrc like '%application_check_failed%'
    and p.prosrc like '%application_data_format_failed%'
    and p.prosrc like '%application_permission_failed%'
    and p.prosrc like '%application_dependency_failed%'
    and p.prosrc like '%registration_generation_failed%'
    and p.prosrc like '%ledger_insert_failed%'
    and p.prosrc like '%helper_function_failed%'
    and p.prosrc like '%unexpected_database_error%'
    and (select count(*) from pg_catalog.regexp_matches(p.prosrc, 'raise[[:space:]]+log', 'g')) = 1
    and (select count(*) from pg_catalog.regexp_matches(p.prosrc, 'raise exception using errcode', 'g'))
      = (select count(*) from pg_catalog.regexp_matches(p.prosrc, 'message[[:space:]]*=[[:space:]]*''([^'']+)''', 'g'))
    and not exists (
      select 1
      from pg_catalog.regexp_matches(p.prosrc, 'message[[:space:]]*=[[:space:]]*''([^'']+)''', 'g') as captured(parts)
      where parts[1] <> all (array[
        'invalid_request', 'invalid_exam', 'invalid_application', 'invalid_phone',
        'application_closed', 'request_conflict', 'duplicate_request',
        'application_insert_failed', 'application_not_null_failed',
        'application_foreign_key_failed', 'application_unique_failed', 'application_check_failed',
        'application_data_format_failed', 'application_permission_failed', 'application_dependency_failed',
        'registration_generation_failed', 'ledger_insert_failed', 'helper_function_failed',
        'unexpected_database_error'
      ]::text[])
    )
    and p.pronargs = 13
    and (select pg_catalog.bool_and(input.argument_type = 'text'::regtype::oid)
      from pg_catalog.unnest(p.proargtypes::oid[]) as input(argument_type))
    and p.proargnames[1:13] = array[
      'p_idempotency_key', 'p_exam_id', 'p_student_name', 'p_student_surname',
      'p_student_father_name', 'p_grade', 'p_school', 'p_course_or_tutor',
      'p_student_phone', 'p_parent_name', 'p_parent_phone', 'p_city', 'p_public_note'
    ]::text[]
    and p.proallargtypes[14:15] = array['boolean'::regtype::oid, 'text'::regtype::oid]::oid[]
    and p.proargmodes[14:15] = array['t', 't']::"char"[]
    and p.proargnames[14:15] = array['success', 'registration_number']::text[]
), 'corrected RPC retains definer/search_path safety, signature, return fields, and fixed error categories');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%message = ''application_insert_failed''%'
    and p.prosrc like '%message = ''application_not_null_failed''%'
    and p.prosrc like '%message = ''application_foreign_key_failed''%'
    and p.prosrc like '%message = ''application_unique_failed''%'
    and p.prosrc like '%message = ''application_check_failed''%'
    and p.prosrc like '%message = ''application_data_format_failed''%'
    and p.prosrc like '%message = ''application_permission_failed''%'
    and p.prosrc like '%message = ''application_dependency_failed''%'
    and p.prosrc like '%message = ''registration_generation_failed''%'
    and p.prosrc like '%message = ''ledger_insert_failed''%'
    and p.prosrc like '%message = ''helper_function_failed''%'
    and p.prosrc like '%message = ''unexpected_database_error''%'
    and p.prosrc like '%get stacked diagnostics v_application_sqlstate = returned_sqlstate%'
    and p.prosrc like '%v_application_sqlstate like ''22%%''%'
    and p.prosrc like '%v_application_sqlstate in (''42883'', ''42704'')%'
    and p.prosrc not like '%sqlstate = v_application_sqlstate%'
    and p.prosrc not like '%errcode = v_application_sqlstate%'
    and p.prosrc not like '%message = v_application_sqlstate%'
    and p.prosrc not like '%sqlerrm%'
    and p.prosrc not like '%detail =%'
    and p.prosrc not like '%hint =%'
    and p.prosrc not like '%query =%'
    and (select count(*) from pg_catalog.regexp_matches(p.prosrc, 'raise[[:space:]]+log', 'g')) = 1
), 'diagnostic messages are fixed allowlisted categories with no raw error detail');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.proargnames[14:15] = array['success', 'registration_number']::text[]
    and p.proallargtypes[14:15] = array['boolean'::regtype::oid, 'text'::regtype::oid]::oid[]
    and p.prosrc like '%insert into public.applications%'
    and p.prosrc like '%insert into private.application_submission_requests%'
    and p.prosrc like '%idempotency_key, payload_digest, application_id, registration_number%'
), 'diagnostic RPC preserves return shape and live ledger insert columns');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%message = ''invalid_request''%'
    and p.prosrc like '%message = ''invalid_exam''%'
    and p.prosrc like '%message = ''invalid_application''%'
    and p.prosrc like '%message = ''invalid_phone''%'
    and p.prosrc like '%message = ''application_closed''%'
    and p.prosrc like '%message = ''request_conflict''%'
    and p.prosrc like '%message = ''duplicate_request''%'
), 'diagnostic RPC retains all existing safe validation and replay categories');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%when sqlstate ''PZ007''%'
    and p.prosrc like '%when sqlstate ''PZ008''%'
    and p.prosrc like '%when sqlstate ''PZ009''%'
    and p.prosrc like '%when sqlstate ''PZ010''%'
), 'outer handler preserves all fixed diagnostic categories instead of collapsing them');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%v_payload_digest := pg_catalog.sha256%'
    and p.prosrc like '%v_idempotency_key, v_payload_digest, v_application_id, v_registration_number%'
    and p.prosrc like '%v_registration_number :=%'
    and p.prosrc like '%pg_catalog.gen_random_uuid()%'
    and p.prosrc like '%registration_number%'
), 'diagnostic RPC preserves SHA-256 payload digest and registration-number ledger behavior');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%v_registration_number :=%'
    and p.prosrc like '%when others then%message = ''registration_generation_failed''%'
    and p.prosrc like '%get stacked diagnostics v_application_sqlstate = returned_sqlstate%'
    and p.prosrc like '%v_application_sqlstate = ''23502''%message = ''application_not_null_failed''%'
    and p.prosrc like '%v_application_sqlstate = ''23503''%message = ''application_foreign_key_failed''%'
    and p.prosrc like '%v_application_sqlstate = ''23505''%message = ''application_unique_failed''%'
    and p.prosrc like '%v_application_sqlstate = ''23514''%message = ''application_check_failed''%'
    and p.prosrc like '%v_application_sqlstate like ''22%%''%message = ''application_data_format_failed''%'
    and p.prosrc like '%v_application_sqlstate = ''42501''%message = ''application_permission_failed''%'
    and p.prosrc like '%v_application_sqlstate in (''42883'', ''42704'')%message = ''application_dependency_failed''%'
    and p.prosrc like '%message = ''application_insert_failed''%'
    and pg_catalog.strpos(p.prosrc, 'insert into public.applications')
      < pg_catalog.strpos(p.prosrc, 'get stacked diagnostics v_application_sqlstate = returned_sqlstate')
    and pg_catalog.strpos(p.prosrc, 'get stacked diagnostics v_application_sqlstate = returned_sqlstate')
      < pg_catalog.strpos(p.prosrc, 'insert into private.application_submission_requests')
    and p.prosrc like '%insert into public.applications%'
    and p.prosrc like '%insert into private.application_submission_requests%'
), 'registration generation and actual application INSERT use separate fixed diagnostic stages');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and p.prosrc like '%when sqlstate ''PZ011''%'
    and p.prosrc like '%when sqlstate ''PZ013''%'
    and p.prosrc like '%when sqlstate ''PZ014''%'
    and p.prosrc like '%when sqlstate ''PZ015''%'
    and p.prosrc like '%when sqlstate ''PZ016''%'
    and p.prosrc like '%when sqlstate ''PZ017''%'
    and p.prosrc like '%when sqlstate ''PZ018''%'
    and p.prosrc like '%when sqlstate ''PZ019''%'
    and p.prosrc like '%when sqlstate ''PZ020''%'
), 'outer handler preserves new registration and application INSERT stages');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and pg_catalog.strpos(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      $insert$insert into public.applications as inserted_application ( registration_number, exam_id, student_name, student_surname, student_father_name, grade, school, course_or_tutor, student_phone, student_phone_normalized, parent_name, parent_phone, parent_phone_normalized, city, public_note, application_status, payment_status, ticket_status, assigned_building_id, assigned_room_id, assigned_seat_id ) values ( v_registration_number, v_exam_id, pg_catalog.btrim(p_student_name), pg_catalog.btrim(p_student_surname), pg_catalog.btrim(p_student_father_name), pg_catalog.btrim(p_grade), nullif(pg_catalog.btrim(p_school), ''), nullif(pg_catalog.btrim(p_course_or_tutor), ''), pg_catalog.btrim(p_student_phone), v_student_phone_normalized, nullif(pg_catalog.btrim(p_parent_name), ''), pg_catalog.btrim(p_parent_phone), v_parent_phone_normalized, pg_catalog.btrim(p_city), nullif(pg_catalog.btrim(p_public_note), ''), 'pending', 'not_submitted', 'not_created', null, null, null ) returning inserted_application.id, inserted_application.registration_number into v_application_id, v_registration_number;$insert$
    ) > 0
), 'diagnostic function preserves the exact application INSERT columns, expressions, initial values, and returning assignments');
select is((
  with source as (
    select (pg_catalog.regexp_match(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'insert into public[.]applications(?:[[:space:]]+as[[:space:]]+inserted_application)?[[:space:]]*[(]([^)]*)[)][[:space:]]*values[[:space:]]*[(](.*)[)][[:space:]]*returning[[:space:]]+inserted_application[.]id,[[:space:]]+inserted_application[.]registration_number[[:space:]]+into[[:space:]]+v_application_id,[[:space:]]+v_registration_number;'
    ))[1] as columns
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_public_application'
  )
  select 1 + pg_catalog.length(columns) - pg_catalog.length(pg_catalog.replace(columns, ',', ''))
  from source
), 21, 'corrected applications INSERT has exactly 21 target columns');
select is((
  with recursive source as (
    select (pg_catalog.regexp_match(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'insert into public[.]applications(?:[[:space:]]+as[[:space:]]+inserted_application)?[[:space:]]*[(][^)]*[)][[:space:]]*values[[:space:]]*[(](.*)[)][[:space:]]*returning[[:space:]]+inserted_application[.]id,[[:space:]]+inserted_application[.]registration_number[[:space:]]+into[[:space:]]+v_application_id,[[:space:]]+v_registration_number;'
    ))[1] as expressions
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_public_application'
  ), value_chars(char_index, paren_depth) as (
    select 1, 0 from source where pg_catalog.length(expressions) > 0
    union all
    select value_chars.char_index + 1,
      value_chars.paren_depth + case pg_catalog.substr(source.expressions, value_chars.char_index, 1)
        when '(' then 1 when ')' then -1 else 0 end
    from value_chars cross join source
    where value_chars.char_index < pg_catalog.length(source.expressions)
  )
  select 1 + count(*) filter (
    where pg_catalog.substr(source.expressions, value_chars.char_index, 1) = ','
      and value_chars.paren_depth = 0
  )
  from value_chars cross join source
), 21::bigint, 'corrected applications INSERT has exactly 21 top-level value expressions');
select ok((
  with source as (
    select (pg_catalog.regexp_match(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'insert into public[.]applications(?:[[:space:]]+as[[:space:]]+inserted_application)?[[:space:]]*[(][^)]*[)][[:space:]]*values[[:space:]]*[(](.*)[)][[:space:]]*returning[[:space:]]+inserted_application[.]id,[[:space:]]+inserted_application[.]registration_number[[:space:]]+into[[:space:]]+v_application_id,[[:space:]]+v_registration_number;'
    ))[1] as expressions
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_public_application'
  )
  select (pg_catalog.strpos(expressions, 'pg_catalog.btrim(p_student_father_name), pg_catalog.btrim(p_student_father_name)') = 0
      and (pg_catalog.length(expressions) - pg_catalog.length(pg_catalog.replace(expressions, 'pg_catalog.btrim(p_student_father_name)', ''))) / pg_catalog.length('pg_catalog.btrim(p_student_father_name)') = 1
      and (select pg_catalog.bool_and(
        (pg_catalog.length(source.expressions) - pg_catalog.length(pg_catalog.replace(source.expressions, term, ''))) / pg_catalog.length(term) = 1
      ) from unnest(array[
        'pg_catalog.btrim(p_student_name)', 'pg_catalog.btrim(p_student_surname)',
        'pg_catalog.btrim(p_grade)', 'pg_catalog.btrim(p_school)',
        'pg_catalog.btrim(p_course_or_tutor)', 'pg_catalog.btrim(p_student_phone)',
        'pg_catalog.btrim(p_parent_name)', 'pg_catalog.btrim(p_parent_phone)',
        'pg_catalog.btrim(p_city)', 'pg_catalog.btrim(p_public_note)'
      ]::text[]) as inputs(term)))
  from source
), 'no duplicated father-name value; each student-supplied text expression occurs exactly once in the INSERT');

select ok((
  select array_agg(c.column_name::text order by c.ordinal_position) = array[
      'id', 'idempotency_key', 'payload_digest', 'application_id', 'registration_number', 'created_at'
    ]::text[]
    and bool_and(c.is_nullable = 'NO')
    and bool_and(case
      when c.column_name in ('id', 'created_at') then c.column_default is not null
      else c.column_default is null
    end)
    and bool_and(case
      when c.column_name = 'payload_digest' then c.udt_name = 'bytea'
      when c.column_name in ('id', 'idempotency_key', 'application_id') then c.udt_name = 'uuid'
      when c.column_name = 'registration_number' then c.udt_name = 'text'
      when c.column_name = 'created_at' then c.udt_name = 'timestamptz'
      else false
    end)
  from information_schema.columns c
  where c.table_schema = 'private' and c.table_name = 'application_submission_requests'
), 'live ledger retains all six expected required columns, types, and defaults');

select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and pg_catalog.strpos(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'exception when others then get stacked diagnostics v_application_sqlstate = returned_sqlstate; raise log ''submit_public_application application_insert sqlstate=%'', v_application_sqlstate; if v_application_sqlstate = ''23502'' then'
    ) > 0
    and (select count(*) from pg_catalog.regexp_matches(p.prosrc, 'raise[[:space:]]+log', 'g')) = 1
), 'INSERT handler captures SQLSTATE then emits exactly one fixed log line before classification');
select ok(exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_application'
    and (pg_catalog.regexp_match(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'raise log ([^;]+);'
    ))[1] = '''submit_public_application application_insert sqlstate=%'', v_application_sqlstate'
    and (pg_catalog.regexp_match(
      pg_catalog.regexp_replace(pg_catalog.lower(p.prosrc), '[[:space:]]+', ' ', 'g'),
      'raise log ([^;]+);'
    ))[1] !~ '(sqlerrm|detail|hint|query|payload|uuid|phone|personal)'
), 'server log expression contains only fixed labels and the captured SQLSTATE');

select * from finish();
rollback;
