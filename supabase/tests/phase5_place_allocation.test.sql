begin;

select plan(51);

-- Synthetic fixtures only. Run inside a transaction that is rolled back at the end.
insert into auth.users (id, email, aud, role) values
  ('e5000000-0000-4000-8000-000000000001', 'phase5-admin@example.test', 'authenticated', 'authenticated'),
  ('e5000000-0000-4000-8000-000000000002', 'phase5-super@example.test', 'authenticated', 'authenticated'),
  ('e5000000-0000-4000-8000-000000000003', 'phase5-operator@example.test', 'authenticated', 'authenticated'),
  ('e5000000-0000-4000-8000-000000000004', 'phase5-scanner@example.test', 'authenticated', 'authenticated'),
  ('e5000000-0000-4000-8000-000000000005', 'phase5-inactive@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, role, active) values
  ('e5000000-0000-4000-8000-000000000001', 'phase5-admin@example.test', 'admin', true),
  ('e5000000-0000-4000-8000-000000000002', 'phase5-super@example.test', 'super_admin', true),
  ('e5000000-0000-4000-8000-000000000003', 'phase5-operator@example.test', 'operator', true),
  ('e5000000-0000-4000-8000-000000000004', 'phase5-scanner@example.test', 'scanner', true),
  ('e5000000-0000-4000-8000-000000000005', 'phase5-inactive@example.test', 'admin', false);

insert into public.buildings (id, name, address, city, is_active) values
  ('e5100000-0000-4000-8000-000000000001', 'Synthetic Bina A', 'Test küçəsi 1', 'Test şəhəri', true),
  ('e5100000-0000-4000-8000-000000000002', 'Synthetic Bina B', 'Test küçəsi 2', 'Test şəhəri', true),
  ('e5100000-0000-4000-8000-000000000003', 'Synthetic Bina C', 'Test küçəsi 3', 'Test şəhəri', true);

-- Rooms. Building B and some rooms are deactivated/archived AFTER assignment (the Phase 4
-- trigger only guards exam_rooms inserts and updates), which is the real-world sequence.
insert into public.rooms (id, building_id, name, capacity, is_active, archived_at) values
  ('e5200000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001', 'A1', 3, true, null),
  ('e5200000-0000-4000-8000-000000000002', 'e5100000-0000-4000-8000-000000000001', 'A2', 2, true, null),
  ('e5200000-0000-4000-8000-000000000003', 'e5100000-0000-4000-8000-000000000001', 'A3', 2, true, null),
  ('e5200000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-000000000001', 'A4 archived later', 2, true, null),
  ('e5200000-0000-4000-8000-000000000005', 'e5100000-0000-4000-8000-000000000001', 'A5 inactive later', 2, true, null),
  ('e5200000-0000-4000-8000-000000000006', 'e5100000-0000-4000-8000-000000000002', 'B1 building later inactive', 2, true, null);

-- Seats. A1 holds '2', '10' and a non-numeric 'A'. Text order would pick '10' before '2'.
insert into public.seats (id, room_id, seat_number, is_active) values
  ('e5500000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000001', '2', true),
  ('e5500000-0000-4000-8000-000000000002', 'e5200000-0000-4000-8000-000000000001', '10', true),
  ('e5500000-0000-4000-8000-000000000003', 'e5200000-0000-4000-8000-000000000001', 'A', true),
  ('e5500000-0000-4000-8000-000000000004', 'e5200000-0000-4000-8000-000000000002', '1', true),
  ('e5500000-0000-4000-8000-000000000005', 'e5200000-0000-4000-8000-000000000003', '5', true),
  ('e5500000-0000-4000-8000-000000000006', 'e5200000-0000-4000-8000-000000000004', '7', true),
  ('e5500000-0000-4000-8000-000000000007', 'e5200000-0000-4000-8000-000000000005', '8', true),
  ('e5500000-0000-4000-8000-000000000008', 'e5200000-0000-4000-8000-000000000006', '9', true);

-- Exams. E1 is the main exam. E2..E5 each isolate one ineligible room or building.
-- E6 proves physical places may be reused across exams. E7 and E8 cover exam eligibility.
insert into public.exams (
  id, title, category, organizer, grades, subjects, exam_date, start_time,
  end_time, city, status, application_open_at, application_deadline
) values
  ('e5300000-0000-4000-8000-000000000001', 'Synthetic Phase 5 main', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000002', 'Synthetic archived room exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000003', 'Synthetic inactive building exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000004', 'Synthetic inactive room exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000005', 'Synthetic disabled assignment exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000006', 'Synthetic second exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000007', 'Synthetic draft exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'draft', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000008', 'Synthetic past deadline exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '2 days', now() - interval '1 hour');

-- E1 room assignments. A1 priority 1, A2 priority 2, disabled A3 priority 3,
-- A4 archived later priority 4, A5 inactive later priority 5, B1 building inactive later priority 6.
insert into public.exam_rooms (exam_id, room_id, priority, is_enabled) values
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000001', 1, true),
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000002', 2, true),
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000003', 3, false),
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000004', 4, true),
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000005', 5, true),
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000006', 6, true);

-- Isolated exams, each with one room that becomes ineligible after assignment.
insert into public.exam_rooms (exam_id, room_id, priority, is_enabled) values
  ('e5300000-0000-4000-8000-000000000002', 'e5200000-0000-4000-8000-000000000004', 1, true),
  ('e5300000-0000-4000-8000-000000000003', 'e5200000-0000-4000-8000-000000000006', 1, true),
  ('e5300000-0000-4000-8000-000000000004', 'e5200000-0000-4000-8000-000000000005', 1, true),
  ('e5300000-0000-4000-8000-000000000005', 'e5200000-0000-4000-8000-000000000003', 1, false),
  ('e5300000-0000-4000-8000-000000000006', 'e5200000-0000-4000-8000-000000000002', 1, true);

-- Deactivate/archive after assignment, as an admin would later.
update public.rooms set archived_at = now(), is_active = false where id = 'e5200000-0000-4000-8000-000000000004';
update public.rooms set is_active = false where id = 'e5200000-0000-4000-8000-000000000005';
update public.buildings set is_active = false where id = 'e5100000-0000-4000-8000-000000000002';

-- Applications. Each needs a unique registration number and phone.
insert into public.applications (
  id, registration_number, exam_id, student_name, student_surname, grade,
  student_phone, student_phone_normalized, parent_phone, parent_phone_normalized, city,
  application_status, payment_status, ticket_status
) values
  ('e5400000-0000-4000-8000-000000000001', 'OIM-2026-P5-000001', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'One', '9', '+994500000001', '994500000001', '+994500000011', '994500000011', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000002', 'OIM-2026-P5-000002', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Two', '9', '+994500000002', '994500000002', '+994500000012', '994500000012', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000003', 'OIM-2026-P5-000003', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Three', '9', '+994500000003', '994500000003', '+994500000013', '994500000013', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000004', 'OIM-2026-P5-000004', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Four', '9', '+994500000004', '994500000004', '+994500000014', '994500000014', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000005', 'OIM-2026-P5-000005', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Unpaid', '9', '+994500000005', '994500000005', '+994500000015', '994500000015', 'Test şəhəri', 'pending', 'not_submitted', 'not_created'),
  ('e5400000-0000-4000-8000-000000000006', 'OIM-2026-P5-000006', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Rejected', '9', '+994500000006', '994500000006', '+994500000016', '994500000016', 'Test şəhəri', 'rejected', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000007', 'OIM-2026-P5-000007', 'e5300000-0000-4000-8000-000000000001', 'Synthetic', 'Revoked', '9', '+994500000007', '994500000007', '+994500000017', '994500000017', 'Test şəhəri', 'pending', 'verified', 'revoked'),
  ('e5400000-0000-4000-8000-000000000008', 'OIM-2026-P5-000008', 'e5300000-0000-4000-8000-000000000002', 'Synthetic', 'Archived', '9', '+994500000008', '994500000008', '+994500000018', '994500000018', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000009', 'OIM-2026-P5-000009', 'e5300000-0000-4000-8000-000000000003', 'Synthetic', 'Building', '9', '+994500000009', '994500000009', '+994500000019', '994500000019', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000010', 'OIM-2026-P5-000010', 'e5300000-0000-4000-8000-000000000004', 'Synthetic', 'Room', '9', '+994500000010', '994500000010', '+994500000020', '994500000020', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000011', 'OIM-2026-P5-000011', 'e5300000-0000-4000-8000-000000000005', 'Synthetic', 'Disabled', '9', '+994500000021', '994500000021', '+994500000031', '994500000031', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000012', 'OIM-2026-P5-000012', 'e5300000-0000-4000-8000-000000000006', 'Synthetic', 'Second exam', '9', '+994500000022', '994500000022', '+994500000032', '994500000032', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000013', 'OIM-2026-P5-000013', 'e5300000-0000-4000-8000-000000000007', 'Synthetic', 'Draft', '9', '+994500000023', '994500000023', '+994500000033', '994500000033', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000014', 'OIM-2026-P5-000014', 'e5300000-0000-4000-8000-000000000008', 'Synthetic', 'Deadline', '9', '+994500000024', '994500000024', '+994500000034', '994500000034', 'Test şəhəri', 'pending', 'verified', 'not_created');

-- Exam-state fixtures. Each exam gets an enabled room assignment while it is published,
-- then its state is changed by an update, so the exam-room guard is not involved.
insert into public.exams (id, title, category, organizer, grades, subjects, exam_date, start_time, end_time, city, status, application_open_at, application_deadline) values
  ('e5300000-0000-4000-8000-000000000009', 'Synthetic archived exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000010', 'Synthetic finished exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000011', 'Synthetic past date exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days'),
  ('e5300000-0000-4000-8000-000000000012', 'Synthetic closed exam', 'sinaq', 'Synthetic test only', array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published', now() - interval '1 day', now() + interval '30 days');

insert into public.exam_rooms (exam_id, room_id, priority, is_enabled) values
  ('e5300000-0000-4000-8000-000000000008', 'e5200000-0000-4000-8000-000000000002', 1, true),
  ('e5300000-0000-4000-8000-000000000009', 'e5200000-0000-4000-8000-000000000002', 1, true),
  ('e5300000-0000-4000-8000-000000000010', 'e5200000-0000-4000-8000-000000000002', 1, true),
  ('e5300000-0000-4000-8000-000000000011', 'e5200000-0000-4000-8000-000000000002', 1, true),
  ('e5300000-0000-4000-8000-000000000012', 'e5200000-0000-4000-8000-000000000002', 1, true);

update public.exams set status = 'archived' where id = 'e5300000-0000-4000-8000-000000000009';
update public.exams set status = 'finished' where id = 'e5300000-0000-4000-8000-000000000010';
update public.exams set exam_date = current_date - 1 where id = 'e5300000-0000-4000-8000-000000000011';
update public.exams set status = 'closed' where id = 'e5300000-0000-4000-8000-000000000012';

insert into public.applications (id, registration_number, exam_id, student_name, student_surname, grade, student_phone, student_phone_normalized, parent_phone, parent_phone_normalized, city, application_status, payment_status, ticket_status) values
  ('e5400000-0000-4000-8000-000000000015', 'OIM-2026-P5-000015', 'e5300000-0000-4000-8000-000000000009', 'Synthetic', 'Archived', '9', '+994500000025', '994500000025', '+994500000035', '994500000035', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000016', 'OIM-2026-P5-000016', 'e5300000-0000-4000-8000-000000000010', 'Synthetic', 'Finished', '9', '+994500000026', '994500000026', '+994500000036', '994500000036', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000017', 'OIM-2026-P5-000017', 'e5300000-0000-4000-8000-000000000011', 'Synthetic', 'Past', '9', '+994500000027', '994500000027', '+994500000037', '994500000037', 'Test şəhəri', 'pending', 'verified', 'not_created'),
  ('e5400000-0000-4000-8000-000000000018', 'OIM-2026-P5-000018', 'e5300000-0000-4000-8000-000000000012', 'Synthetic', 'Closed', '9', '+994500000028', '994500000028', '+994500000038', '994500000038', 'Test şəhəri', 'pending', 'verified', 'not_created');

-- Runs the RPC as an authenticated user, or with no subject when p_uid is null.
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

-- Grants: the RPC is authenticated-only, and no client table write grants are added.
select ok(not has_function_privilege('anon', 'public.allocate_application_place(uuid)', 'EXECUTE'), 'anon cannot execute allocate_application_place');
select ok(not has_function_privilege('public', 'public.allocate_application_place(uuid)', 'EXECUTE'), 'public cannot execute allocate_application_place');
select ok(has_function_privilege('authenticated', 'public.allocate_application_place(uuid)', 'EXECUTE'), 'authenticated may call allocate_application_place (role checked inside)');
select ok(not has_table_privilege('authenticated', 'public.applications', 'UPDATE') and not has_table_privilege('authenticated', 'public.applications', 'INSERT'), 'no client write grant on applications is added');

-- Authentication and role checks.
select is(pg_temp.call_as(null, $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'unauthenticated', 'unauthenticated caller is rejected');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000003', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'not_authorized', 'operator cannot allocate places');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000004', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'not_authorized', 'scanner cannot allocate places');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000005', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'not_authorized', 'inactive admin profile cannot allocate places');
select ok(exists (select 1 from public.applications where id = 'e5400000-0000-4000-8000-000000000001' and assigned_seat_id is null), 'rejected callers leave the application unassigned');

-- Input validation and not-found.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place(null)$$)->>'code', 'invalid_request', 'null application id is invalid_request');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5499999-0000-4000-8000-000000000999')$$)->>'code', 'not_found', 'unknown application is not_found');

-- Eligibility: payment and application state.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000005')$$)->>'code', 'payment_not_verified', 'unverified payment is payment_not_verified');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000006')$$)->>'code', 'invalid_status', 'rejected application is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000007')$$)->>'code', 'invalid_status', 'application with a revoked ticket is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000013')$$)->>'code', 'invalid_status', 'draft exam application is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000014')$$)->>'code', 'allocated', 'application deadline passed still allows allocation of a verified application');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000015')$$)->>'code', 'invalid_status', 'archived exam is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000016')$$)->>'code', 'invalid_status', 'finished exam is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000017')$$)->>'code', 'invalid_status', 'exam date in the past is invalid_status');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000018')$$)->>'code', 'allocated', 'closed exam still allows allocation of a verified application');

-- Admin allocates the first place: priority 1 room A1, numeric seat 2 (not text-ordered 10).
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'allocated', 'active admin allocates a place');
select is((select assigned_seat_id from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'e5500000-0000-4000-8000-000000000001'::uuid, 'seat 2 is chosen before seat 10 (numeric ordering)');
select is((select assigned_room_id from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'e5200000-0000-4000-8000-000000000001'::uuid, 'lowest room priority is used first');

-- Super admin allocates the next place: priority 1 room A1, seat 10.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000002', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000002')$$)->>'code', 'allocated', 'super_admin allocates a place');
select is((select assigned_seat_id from public.applications where id = 'e5400000-0000-4000-8000-000000000002'), 'e5500000-0000-4000-8000-000000000002'::uuid, 'seat 10 follows seat 2 in the same room');

-- Third place: room A1 has no valid numeric seat left ('A' is skipped), so priority 2 room A2 is used.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000003')$$)->>'code', 'allocated', 'third application is allocated to the next priority room');
select is((select assigned_seat_id from public.applications where id = 'e5400000-0000-4000-8000-000000000003'), 'e5500000-0000-4000-8000-000000000004'::uuid, 'room priority 2 seat 1 is used after priority 1 is full');

-- Exam E1 is now full: disabled A3, archived A4, inactive A5, inactive building B1 all unusable.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000004')$$)->>'code', 'no_available_place', 'no valid place left returns no_available_place');
select ok((select assigned_seat_id is null from public.applications where id = 'e5400000-0000-4000-8000-000000000004'), 'no_available_place leaves the application unassigned');

-- Facility safety in isolated exams.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000008')$$)->>'code', 'no_available_place', 'archived room is not used');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000009')$$)->>'code', 'no_available_place', 'room in an inactive building is not used');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000010')$$)->>'code', 'no_available_place', 'inactive room is not used');
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000011')$$)->>'code', 'no_available_place', 'disabled exam-room assignment is not used');

-- Same physical place in a different exam is allowed (exams occur at different times).
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000012')$$)->>'code', 'allocated', 'same physical place may be used by a different exam');
select is((select assigned_seat_id from public.applications where id = 'e5400000-0000-4000-8000-000000000012'), 'e5500000-0000-4000-8000-000000000004'::uuid, 'the reused place is seat 1 in room A2');

-- Idempotency: a second call returns already_assigned and changes nothing.
select is(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)->>'code', 'already_assigned', 'retry returns already_assigned');
select is((select assigned_seat_id from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'e5500000-0000-4000-8000-000000000001'::uuid, 'retry does not change the assigned seat');

-- Successful allocation keeps payment, application, and ticket state.
select is((select payment_status::text from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'verified', 'payment_status remains verified');
select is((select application_status::text from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'pending', 'application_status remains pending');
select is((select ticket_status::text from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'not_created', 'ticket_status remains not_created');
select ok((select assigned_building_id is not null and assigned_room_id is not null from public.applications where id = 'e5400000-0000-4000-8000-000000000001'), 'building and room are set together with the seat');

-- Audit: exactly one append-only row per successful allocation, with minimal metadata.
select is((select count(*)::integer from public.audit_logs where action = 'application.place_allocated' and entity_id = 'e5400000-0000-4000-8000-000000000001'), 1, 'exactly one audit row after success and retry');
select is((select actor_profile_id from public.audit_logs where action = 'application.place_allocated' and entity_id = 'e5400000-0000-4000-8000-000000000001'), 'e5000000-0000-4000-8000-000000000001'::uuid, 'audit actor is the admin');
select is((select entity_type from public.audit_logs where action = 'application.place_allocated' and entity_id = 'e5400000-0000-4000-8000-000000000001'), 'application', 'audit entity type is application');
select is((select count(*)::integer from jsonb_object_keys((select details from public.audit_logs where action = 'application.place_allocated' and entity_id = 'e5400000-0000-4000-8000-000000000001'))), 2, 'audit details contain only two numeric keys');
select ok((select (details->>'room_priority')::integer = 1 and (details->>'room_capacity')::integer = 3 from public.audit_logs where action = 'application.place_allocated' and entity_id = 'e5400000-0000-4000-8000-000000000001'), 'audit details record room priority and capacity');

-- Same-exam double booking: the existing partial unique index is the backstop.
select throws_ok(
  $$update public.applications set assigned_building_id = 'e5100000-0000-4000-8000-000000000001', assigned_room_id = 'e5200000-0000-4000-8000-000000000001', assigned_seat_id = 'e5500000-0000-4000-8000-000000000001' where id = 'e5400000-0000-4000-8000-000000000004'$$,
  '23505',
  'duplicate key value violates unique constraint "applications_exam_seat_unique_idx"',
  'same-exam double booking is blocked by the unique index'
);

-- Failure and success responses carry only fixed fields, with no raw SQL text or identifiers.
select ok(
  (pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)::text) !~* '(sqlstate|sqlerrm|violates|constraint|relation|public\.|e5500000|e5200000)',
  'already_assigned response leaks no raw error text or identifiers'
);
select ok(
  (pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000004')$$)::text) !~* '(sqlstate|sqlerrm|violates|constraint|relation|public\.|e5500000|e5200000)',
  'no_available_place response leaks no raw error text or identifiers'
);
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.call_as('e5000000-0000-4000-8000-000000000001', $$public.allocate_application_place('e5400000-0000-4000-8000-000000000001')$$)) as k), array['code', 'message', 'success']::text[], 'response has only success, code, and message keys');

-- No cross-exam conflict rule: the only index on assigned_seat_id is the same-exam one.
select is((select count(*)::integer from pg_indexes where schemaname = 'public' and tablename = 'applications' and indexdef ilike '%assigned_seat_id%' and indexname <> 'applications_exam_seat_unique_idx'), 0, 'no cross-exam seat conflict index is introduced');

select * from finish();
rollback;
