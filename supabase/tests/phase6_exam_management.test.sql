begin;

select plan(86);

-- Synthetic fixtures only. Run inside a transaction that is rolled back at the end.
insert into auth.users (id, email, aud, role) values
  ('e6000000-0000-4000-8000-000000000001', 'phase6-admin@example.test', 'authenticated', 'authenticated'),
  ('e6000000-0000-4000-8000-000000000002', 'phase6-super@example.test', 'authenticated', 'authenticated'),
  ('e6000000-0000-4000-8000-000000000003', 'phase6-operator@example.test', 'authenticated', 'authenticated'),
  ('e6000000-0000-4000-8000-000000000004', 'phase6-scanner@example.test', 'authenticated', 'authenticated'),
  ('e6000000-0000-4000-8000-000000000005', 'phase6-inactive@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, role, active) values
  ('e6000000-0000-4000-8000-000000000001', 'phase6-admin@example.test', 'admin', true),
  ('e6000000-0000-4000-8000-000000000002', 'phase6-super@example.test', 'super_admin', true),
  ('e6000000-0000-4000-8000-000000000003', 'phase6-operator@example.test', 'operator', true),
  ('e6000000-0000-4000-8000-000000000004', 'phase6-scanner@example.test', 'scanner', true),
  ('e6000000-0000-4000-8000-000000000005', 'phase6-inactive@example.test', 'admin', false);

-- Fixtures inserted directly as the test owner, one per starting status.
insert into public.exams (id, title, category, organizer, grades, subjects, exam_date, start_time, end_time, city, status, application_open_at, application_deadline) values
  ('e6300000-0000-4000-8000-000000000001', 'P6 draft future', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'draft', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000002', 'P6 draft past', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date - 1, '10:00', '12:00', 'Test şəhəri', 'draft', now() - interval '5 days', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000003', 'P6 published A', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000004', 'P6 published B', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000005', 'P6 closed A', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'closed', now() - interval '5 days', now() - interval '1 day'),
  ('e6300000-0000-4000-8000-000000000006', 'P6 finished A', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date - 5, '10:00', '12:00', 'Test şəhəri', 'finished', now() - interval '30 days', now() - interval '10 days'),
  ('e6300000-0000-4000-8000-000000000007', 'P6 archived A', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'archived', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000008', 'P6 published C', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000009', 'P6 closed B', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'closed', now() - interval '5 days', now() - interval '1 day'),
  ('e6300000-0000-4000-8000-000000000010', 'P6 finished B', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date - 5, '10:00', '12:00', 'Test şəhəri', 'finished', now() - interval '30 days', now() - interval '10 days'),
  ('e6300000-0000-4000-8000-000000000011', 'P6 draft C', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'draft', now() - interval '1 day', now() + interval '20 days'),
  ('e6300000-0000-4000-8000-000000000012', 'P6 published D', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '20 days');

-- Runs an RPC as an authenticated user (or with no subject when p_uid is null) and returns its jsonb.
create function pg_temp.call_as(p_uid uuid, p_call text) returns jsonb
language plpgsql as $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', p_uid)::text, '{}'), true);
  execute 'set local role authenticated';
  execute 'select ' || p_call into r;
  execute 'reset role';
  return r;
end;
$$;

create function pg_temp.code_as(p_uid uuid, p_call text) returns text
language sql as $$
  select (pg_temp.call_as(p_uid, p_call)) ->> 'code';
$$;

-- Attempts a direct table write as an authenticated user and reports whether it was allowed.
create function pg_temp.direct_write_as(p_uid uuid, p_sql text) returns text
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    execute 'reset role';
    return 'allowed';
  exception when insufficient_privilege then
    execute 'reset role';
    return 'denied';
  end;
end;
$$;

create function pg_temp.audit_count(p_action text, p_exam uuid) returns integer
language sql as $$
  select count(*)::integer from public.audit_logs where action = p_action and entity_id = p_exam;
$$;

-- Canonical valid argument list for create_exam; individual tests override one field at a time.
-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.create_exam(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), 'anon cannot execute create_exam');
select ok(not has_function_privilege('anon', 'public.update_exam(uuid, text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), 'anon cannot execute update_exam');
select ok(not has_function_privilege('anon', 'public.change_exam_status(uuid, text)', 'EXECUTE'), 'anon cannot execute change_exam_status');
select ok(not has_function_privilege('anon', 'public.archive_exam(uuid)', 'EXECUTE'), 'anon cannot execute archive_exam');
select ok(not has_function_privilege('public', 'public.create_exam(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), 'public cannot execute create_exam');
select ok(not has_function_privilege('public', 'public.change_exam_status(uuid, text)', 'EXECUTE'), 'public cannot execute change_exam_status');
select ok(has_function_privilege('authenticated', 'public.create_exam(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text)', 'EXECUTE'), 'authenticated may call create_exam (role checked inside)');
select ok(has_function_privilege('authenticated', 'public.archive_exam(uuid)', 'EXECUTE'), 'authenticated may call archive_exam (role checked inside)');
select ok(not has_function_privilege('authenticated', 'private.exam_result(text)', 'EXECUTE'), 'authenticated cannot call the private result helper');
select ok(not has_table_privilege('anon', 'public.exams', 'INSERT') and not has_table_privilege('anon', 'public.exams', 'UPDATE') and not has_table_privilege('anon', 'public.exams', 'DELETE'), 'anon has no write grant on exams');
select ok(not has_table_privilege('authenticated', 'public.exams', 'INSERT') and not has_table_privilege('authenticated', 'public.exams', 'UPDATE') and not has_table_privilege('authenticated', 'public.exams', 'DELETE'), 'authenticated has no direct write grant on exams');
select is(pg_temp.direct_write_as('e6000000-0000-4000-8000-000000000001', $q$insert into public.exams (title, category, organizer, grades, subjects, exam_date, start_time, end_time, city) values ('P6 direct', 'sinaq', 'x', array['9'], array['x'], current_date, '10:00', '12:00', 'x')$q$), 'denied', 'admin cannot insert exams directly');
select is(pg_temp.direct_write_as('e6000000-0000-4000-8000-000000000001', $q$update public.exams set title = 'P6 direct edit' where id = 'e6300000-0000-4000-8000-000000000003'$q$), 'denied', 'admin cannot update exams directly');
select is(pg_temp.direct_write_as('e6000000-0000-4000-8000-000000000001', $q$delete from public.exams where id = 'e6300000-0000-4000-8000-000000000003'$q$), 'denied', 'admin cannot delete exams directly');
select is((select title from public.exams where id = 'e6300000-0000-4000-8000-000000000003'), 'P6 published A', 'direct update attempts leave the exam unchanged');

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
select is(pg_temp.code_as(null, $q$public.archive_exam('e6300000-0000-4000-8000-000000000003')$q$), 'unauthenticated', 'no subject is rejected as unauthenticated');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000003', $q$public.archive_exam('e6300000-0000-4000-8000-000000000003')$q$), 'not_authorized', 'operator cannot archive');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000004', $q$public.archive_exam('e6300000-0000-4000-8000-000000000003')$q$), 'not_authorized', 'scanner cannot archive');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000005', $q$public.archive_exam('e6300000-0000-4000-8000-000000000003')$q$), 'not_authorized', 'inactive admin cannot archive');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000003'), 'published', 'rejected archive attempts leave status unchanged');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000003', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000004', 'closed')$q$), 'not_authorized', 'operator cannot change exam status');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000004'), 'published', 'rejected status change leaves exam unchanged');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000004', $q$public.create_exam('P6 scanner', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'not_authorized', 'scanner cannot create exams');

-- ---------------------------------------------------------------------------
-- Create
-- ---------------------------------------------------------------------------
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000003', $q$public.create_exam('P6 operator', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'not_authorized', 'operator create is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('   ', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_title', 'blank title is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 bad category', 'unknown', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_category', 'unknown category is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 no org', 'sinaq', '  ', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_organizer', 'blank organizer is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 no grades', 'sinaq', 'Org', array[]::text[], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_grades', 'empty grades are rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 blank subject', 'sinaq', 'Org', array['9'], array[' '], current_date + 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_subjects', 'blank subject entry is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 no city', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', '', null, null, null, null)$q$), 'invalid_city', 'blank city is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 past date', 'sinaq', 'Org', array['9'], array['x'], current_date - 1, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_exam_date', 'past exam date is rejected on create');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 bad times', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '12:00', '10:00', 'Bakı', null, null, null, null)$q$), 'invalid_time_range', 'start after end is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('P6 bad window', 'sinaq', 'Org', array['9'], array['x'], current_date + 5, '10:00', '12:00', 'Bakı', now() + interval '2 days', now() + interval '1 day', null, null)$q$), 'invalid_application_window', 'opening after deadline is rejected');
select is((select count(*)::integer from public.exams where title like 'P6 %' and title in ('P6 operator', 'P6 scanner', '   ', 'P6 bad category', 'P6 no org', 'P6 no grades', 'P6 blank subject', 'P6 no city', 'P6 past date', 'P6 bad times', 'P6 bad window')), 0, 'no invalid create leaves a row behind');

select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.create_exam('  P6 created  ', 'sinaq', ' Org ', array['9', '10'], array['Riyaziyyat'], current_date + 5, '10:00', '12:00', ' Bakı ', now() - interval '1 day', now() + interval '4 days', 'Pulsuz', 'Qısa təsvir')$q$), 'created', 'admin creates an exam');
select is((select status from public.exams where title = 'P6 created'), 'draft', 'new exam starts as draft');
select is((select created_by from public.exams where title = 'P6 created'), 'e6000000-0000-4000-8000-000000000001'::uuid, 'created exam records the acting admin');
select is((select title || '|' || organizer || '|' || city from public.exams where title = 'P6 created'), 'P6 created|Org|Bakı', 'created exam trims text fields');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000002', $q$public.create_exam('P6 super', 'buraxilis', 'Org', array['11'], array['Fizika'], current_date + 9, '09:00', '11:00', 'Bakı', null, null, null, null)$q$), 'created', 'super_admin creates an exam');
select is((select count(*)::integer from public.audit_logs where action = 'exam.created' and actor_profile_id = 'e6000000-0000-4000-8000-000000000001' and entity_type = 'exam'), 1, 'create writes exactly one exam.created audit row for the admin');
select is((select details from public.audit_logs where action = 'exam.created' and actor_profile_id = 'e6000000-0000-4000-8000-000000000001' and entity_type = 'exam' limit 1), '{"to_status": "draft"}'::jsonb, 'exam.created details hold only the safe status');

-- ---------------------------------------------------------------------------
-- Update
-- ---------------------------------------------------------------------------
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000003', 'P6 published A edited', 'sinaq', 'Org', array['9','10'], array['Riyaziyyat'], current_date + 30, '10:00', '12:00', 'Test şəhəri', now() - interval '1 day', now() + interval '20 days', 'Pulsuz', null)$q$), 'updated', 'admin updates a published exam');
select is((select title from public.exams where id = 'e6300000-0000-4000-8000-000000000003'), 'P6 published A edited', 'update changes the title');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000003'), 'published', 'update does not change status');
select is(pg_temp.audit_count('exam.updated', 'e6300000-0000-4000-8000-000000000003'), 1, 'update writes one exam.updated audit row');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000003', '', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_title', 'update rejects blank title');
select is((select title from public.exams where id = 'e6300000-0000-4000-8000-000000000003'), 'P6 published A edited', 'rejected update leaves title unchanged');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000003', 'P6 bad time', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '12:00', '10:00', 'Bakı', null, null, null, null)$q$), 'invalid_time_range', 'update rejects start after end');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000001', 'P6 draft moved', 'sinaq', 'Org', array['9'], array['x'], current_date - 2, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_exam_date', 'update rejects moving the date into the past');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000006', 'P6 finished edit', 'sinaq', 'Org', array['9'], array['x'], current_date - 5, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'exam_locked', 'finished exam cannot be edited');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-000000000007', 'P6 archived edit', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'exam_locked', 'archived exam cannot be edited');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam('e6300000-0000-4000-8000-0000000000ff', 'P6 missing', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'not_found', 'update of an unknown exam returns not_found');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000003', $q$public.update_exam('e6300000-0000-4000-8000-000000000003', 'P6 operator edit', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'not_authorized', 'operator cannot update exams');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.update_exam(null, 'P6 null id', 'sinaq', 'Org', array['9'], array['x'], current_date + 30, '10:00', '12:00', 'Bakı', null, null, null, null)$q$), 'invalid_request', 'null exam id is an invalid request');

-- ---------------------------------------------------------------------------
-- Status transitions
-- ---------------------------------------------------------------------------
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000001', 'published')$q$), 'status_changed', 'draft to published is allowed');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000001'), 'published', 'draft exam is published');
select is(pg_temp.audit_count('exam.status_changed', 'e6300000-0000-4000-8000-000000000001'), 1, 'publish writes one exam.status_changed audit row');
select is((select details from public.audit_logs where action = 'exam.status_changed' and entity_id = 'e6300000-0000-4000-8000-000000000001'), '{"from_status": "draft", "to_status": "published"}'::jsonb, 'status audit details hold only safe statuses');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000003', 'closed')$q$), 'status_changed', 'published to closed is allowed');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000005', 'finished')$q$), 'status_changed', 'closed to finished is allowed');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000002', 'published')$q$), 'invalid_exam_date', 'publishing a past-dated draft is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000011', 'closed')$q$), 'invalid_status_transition', 'draft to closed is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000004', 'draft')$q$), 'invalid_status_transition', 'published back to draft is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000009', 'published')$q$), 'invalid_status_transition', 'closed back to published is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000010', 'published')$q$), 'invalid_status_transition', 'finished back to published is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000007', 'published')$q$), 'invalid_status_transition', 'archived exam cannot be republished');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000008', 'archived')$q$), 'invalid_status_transition', 'status change cannot archive (archive_exam is the only route)');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000008', 'bogus')$q$), 'invalid_status_transition', 'unknown status is rejected');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-0000000000ff', 'closed')$q$), 'not_found', 'status change on an unknown exam returns not_found');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000011'), 'draft', 'rejected transitions leave status unchanged');

-- ---------------------------------------------------------------------------
-- Archive
-- ---------------------------------------------------------------------------
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-000000000008')$q$), 'archived', 'admin archives a published exam');
select is((select status from public.exams where id = 'e6300000-0000-4000-8000-000000000008'), 'archived', 'archived exam keeps its row with status archived');
select is(pg_temp.audit_count('exam.archived', 'e6300000-0000-4000-8000-000000000008'), 1, 'archive writes one exam.archived audit row');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000002', $q$public.archive_exam('e6300000-0000-4000-8000-000000000009')$q$), 'archived', 'super_admin archives a closed exam');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-000000000010')$q$), 'archived', 'admin archives a finished exam');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-000000000011')$q$), 'invalid_status_transition', 'draft exam cannot be archived');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-000000000008')$q$), 'invalid_status_transition', 'repeat archive is rejected (duplicate action prevention)');
select is(pg_temp.audit_count('exam.archived', 'e6300000-0000-4000-8000-000000000008'), 1, 'rejected repeat archive writes no extra audit row');
select is(pg_temp.code_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-0000000000ff')$q$), 'not_found', 'archive of an unknown exam returns not_found');
select is((select count(*)::integer from public.exams where id = 'e6300000-0000-4000-8000-000000000008'), 1, 'archive never hard-deletes the exam row');

-- ---------------------------------------------------------------------------
-- Response and audit safety
-- ---------------------------------------------------------------------------
select is((select jsonb_object_keys(pg_temp.call_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-000000000011')$q$)) order by 1 limit 1), 'code', 'failure payload includes the code key');
select ok(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.call_as('e6000000-0000-4000-8000-000000000001', $q$public.archive_exam('e6300000-0000-4000-8000-0000000000ff')$q$)) as k) = array['code', 'message', 'success'],
  'every response has exactly success, code and message'
);
select ok(
  not (pg_temp.call_as('e6000000-0000-4000-8000-000000000001', $q$public.change_exam_status('e6300000-0000-4000-8000-000000000011', 'closed')$q$) ->> 'message' ~* '(violates|sqlstate|constraint|relation|column|syntax|pg_)'),
  'failure messages do not leak raw database errors'
);
select ok(
  not exists (
    select 1 from public.audit_logs
     where action like 'exam.%'
       and details::text ~* '(title|organizer|city|description|phone|token|@)'
  ),
  'exam audit details contain no titles, contact or personal data'
);
select is((select count(*)::integer from public.audit_logs where action like 'exam.%' and entity_type <> 'exam'), 0, 'exam audit rows always use entity_type exam');
select is((select count(*)::integer from public.audit_logs where action like 'exam.%' and actor_profile_id is null), 0, 'exam audit rows always record the acting profile');

select * from finish();

rollback;
