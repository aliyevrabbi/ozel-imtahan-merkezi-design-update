begin;

select plan(27);

-- Synthetic fixtures only. Run inside a transaction that is rolled back at the end.
insert into auth.users (id, email, aud, role) values
  ('b0000000-0000-4000-8000-000000000001', 'phase3b-admin@example.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'phase3b-super@example.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000003', 'phase3b-operator@example.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000004', 'phase3b-scanner@example.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000005', 'phase3b-inactive@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, role, active) values
  ('b0000000-0000-4000-8000-000000000001', 'phase3b-admin@example.test', 'admin', true),
  ('b0000000-0000-4000-8000-000000000002', 'phase3b-super@example.test', 'super_admin', true),
  ('b0000000-0000-4000-8000-000000000003', 'phase3b-operator@example.test', 'operator', true),
  ('b0000000-0000-4000-8000-000000000004', 'phase3b-scanner@example.test', 'scanner', true),
  ('b0000000-0000-4000-8000-000000000005', 'phase3b-inactive@example.test', 'admin', false);

insert into public.exams (
  id, title, category, organizer, grades, subjects, exam_date, start_time,
  end_time, city, status, application_open_at, application_deadline
) values (
  'c0000000-0000-4000-8000-000000000001', 'Synthetic Phase 3B exam', 'sinaq', 'Synthetic test only',
  array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published',
  now() - interval '1 day', now() + interval '30 days'
);

insert into public.applications (
  id, registration_number, exam_id, student_name, student_surname, grade, school,
  student_phone, student_phone_normalized, parent_phone, parent_phone_normalized, city,
  application_status, payment_status, ticket_status
) values
  ('d0000000-0000-4000-8000-000000000001', 'OIM-2026-PHASE3B0001', 'c0000000-0000-4000-8000-000000000001', 'Synthetic', 'One', '9', 'Synthetic School', '+994500000001', '994500000001', '+994500000011', '994500000011', 'Test şəhəri', 'pending', 'not_submitted', 'not_created'),
  ('d0000000-0000-4000-8000-000000000002', 'OIM-2026-PHASE3B0002', 'c0000000-0000-4000-8000-000000000001', 'Synthetic', 'Two', '9', 'Synthetic School', '+994500000002', '994500000002', '+994500000012', '994500000012', 'Test şəhəri', 'pending', 'not_submitted', 'not_created'),
  ('d0000000-0000-4000-8000-000000000003', 'OIM-2026-PHASE3B0003', 'c0000000-0000-4000-8000-000000000001', 'Synthetic', 'Three', '9', 'Synthetic School', '+994500000003', '994500000003', '+994500000013', '994500000013', 'Test şəhəri', 'pending', 'not_submitted', 'not_created'),
  ('d0000000-0000-4000-8000-000000000004', 'OIM-2026-PHASE3B0004', 'c0000000-0000-4000-8000-000000000001', 'Synthetic', 'Four', '9', 'Synthetic School', '+994500000004', '994500000004', '+994500000014', '994500000014', 'Test şəhəri', 'under_review', 'not_submitted', 'not_created'),
  ('d0000000-0000-4000-8000-000000000005', 'OIM-2026-PHASE3B0005', 'c0000000-0000-4000-8000-000000000001', 'Synthetic', 'Five', '9', 'Synthetic School', '+994500000005', '994500000005', '+994500000015', '994500000015', 'Test şəhəri', 'pending', 'not_submitted', 'not_created');

-- Runs the RPC as an authenticated user (or anonymously when p_uid is null).
create function pg_temp.confirm_as(p_uid uuid, p_app uuid) returns jsonb
language plpgsql as $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', p_uid)::text, '{}'), true);
  execute 'set local role authenticated';
  select public.confirm_application_payment(p_app) into r;
  execute 'reset role';
  return r;
end;
$$;

select ok(not has_function_privilege('anon', 'public.confirm_application_payment(uuid)', 'EXECUTE'), 'anon cannot execute the payment RPC');
select ok(has_function_privilege('authenticated', 'public.confirm_application_payment(uuid)', 'EXECUTE'), 'authenticated can execute the payment RPC');

select is((pg_temp.confirm_as(null, 'd0000000-0000-4000-8000-000000000001'::uuid)->>'success')::boolean, false, 'unauthenticated caller is rejected');
select is(pg_temp.confirm_as(null, 'd0000000-0000-4000-8000-000000000001'::uuid)->>'code', 'unauthenticated', 'unauthenticated rejection code is safe');

select is((pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'::uuid)->>'success')::boolean, true, 'active admin confirms pending payment');
select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'::uuid)->>'code', 'already_verified', 'admin repeat confirmation is rejected safely');
select is((select payment_status::text from public.applications where id = 'd0000000-0000-4000-8000-000000000001'), 'verified', 'admin confirmation sets payment_status verified');
select is((select application_status::text from public.applications where id = 'd0000000-0000-4000-8000-000000000001'), 'pending', 'confirmation preserves application_status pending');

select is((pg_temp.confirm_as('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002'::uuid)->>'success')::boolean, true, 'active super_admin confirms pending payment');

select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005'::uuid)->>'code', 'not_authorized', 'operator is rejected');
select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005'::uuid)->>'code', 'not_authorized', 'scanner is rejected');
select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005'::uuid)->>'code', 'not_authorized', 'inactive admin profile is rejected');
select is((select payment_status::text from public.applications where id = 'd0000000-0000-4000-8000-000000000005'), 'not_submitted', 'rejected callers leave payment unchanged');

select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004'::uuid)->>'code', 'invalid_status', 'under_review application is rejected as invalid status');
select is((select payment_status::text from public.applications where id = 'd0000000-0000-4000-8000-000000000004'), 'not_submitted', 'invalid status leaves payment unchanged');

select is(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000ffff'::uuid)->>'code', 'not_found', 'missing application is rejected');

select is((select count(*)::integer from public.audit_logs where entity_id = 'd0000000-0000-4000-8000-000000000001'), 1, 'exactly one audit row is written for the confirmed application');
select is((select action from public.audit_logs where entity_id = 'd0000000-0000-4000-8000-000000000001'), 'application.payment_verified', 'audit action name is fixed');
select is((select details from public.audit_logs where entity_id = 'd0000000-0000-4000-8000-000000000001'), '{"from_payment_status": "not_submitted", "to_payment_status": "verified"}'::jsonb, 'audit details contain only status transition metadata');
select is((select actor_profile_id from public.audit_logs where entity_id = 'd0000000-0000-4000-8000-000000000001'), 'b0000000-0000-4000-8000-000000000001'::uuid, 'audit row references the acting admin profile');
select is((select count(*)::integer from public.audit_logs), 2, 'rejected and repeated attempts write no audit rows');

select is((select ticket_status::text from public.applications where id = 'd0000000-0000-4000-8000-000000000001'), 'not_created', 'ticket_status remains not_created');
select ok((select assigned_building_id is null and assigned_room_id is null and assigned_seat_id is null from public.applications where id = 'd0000000-0000-4000-8000-000000000001'), 'building, room, and seat remain unassigned');
select is((select count(*)::integer from public.tickets where application_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'no ticket is created');

select ok((select array_agg(k order by k) from jsonb_object_keys(pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003'::uuid)) as k) = array['code', 'message', 'success'], 'result contains only success, code, and message');
select ok(
  (pg_temp.confirm_as('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003'::uuid))::text !~* '(sql|detail|phone|token|OIM-|password|jwt)',
  'result contains no raw database, personal, or token data'
);

set local role authenticated;
select throws_ok(
  $$update public.applications set payment_status = 'verified' where id = 'd0000000-0000-4000-8000-000000000002'$$,
  '42501',
  'permission denied for table applications',
  'direct client update of applications is denied'
);
reset role;

select * from finish();
rollback;
