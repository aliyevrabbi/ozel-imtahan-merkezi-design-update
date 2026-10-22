begin;

select plan(31);

-- Synthetic fixtures only. Run inside a transaction that is rolled back at the end.
insert into auth.users (id, email, aud, role) values
  ('e4000000-0000-4000-8000-000000000001', 'phase4-admin@example.test', 'authenticated', 'authenticated'),
  ('e4000000-0000-4000-8000-000000000002', 'phase4-super@example.test', 'authenticated', 'authenticated'),
  ('e4000000-0000-4000-8000-000000000003', 'phase4-operator@example.test', 'authenticated', 'authenticated'),
  ('e4000000-0000-4000-8000-000000000004', 'phase4-scanner@example.test', 'authenticated', 'authenticated'),
  ('e4000000-0000-4000-8000-000000000005', 'phase4-inactive@example.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, role, active) values
  ('e4000000-0000-4000-8000-000000000001', 'phase4-admin@example.test', 'admin', true),
  ('e4000000-0000-4000-8000-000000000002', 'phase4-super@example.test', 'super_admin', true),
  ('e4000000-0000-4000-8000-000000000003', 'phase4-operator@example.test', 'operator', true),
  ('e4000000-0000-4000-8000-000000000004', 'phase4-scanner@example.test', 'scanner', true),
  ('e4000000-0000-4000-8000-000000000005', 'phase4-inactive@example.test', 'admin', false);

insert into public.buildings (id, name, address, city, is_active) values
  ('e4100000-0000-4000-8000-000000000001', 'Synthetic Bina A', 'Test küçəsi 1', 'Test şəhəri', true),
  ('e4100000-0000-4000-8000-000000000002', 'Synthetic Bina B', 'Test küçəsi 2', 'Test şəhəri', false);

insert into public.rooms (id, building_id, name, capacity, is_active, archived_at) values
  ('e4200000-0000-4000-8000-000000000001', 'e4100000-0000-4000-8000-000000000001', 'Otaq 1', 3, true, null),
  ('e4200000-0000-4000-8000-000000000002', 'e4100000-0000-4000-8000-000000000001', 'Otaq 2', 2, true, null),
  ('e4200000-0000-4000-8000-000000000003', 'e4100000-0000-4000-8000-000000000001', 'Otaq 3', 2, false, null),
  ('e4200000-0000-4000-8000-000000000004', 'e4100000-0000-4000-8000-000000000001', 'Otaq 4', 2, false, now()),
  ('e4200000-0000-4000-8000-000000000005', 'e4100000-0000-4000-8000-000000000002', 'Otaq 5', 2, true, null);

insert into public.seats (id, room_id, seat_number, is_active) values
  ('e4500000-0000-4000-8000-000000000001', 'e4200000-0000-4000-8000-000000000001', '1', true);

insert into public.exams (
  id, title, category, organizer, grades, subjects, exam_date, start_time,
  end_time, city, status, application_open_at, application_deadline
) values (
  'e4300000-0000-4000-8000-000000000001', 'Synthetic Phase 4 exam', 'sinaq', 'Synthetic test only',
  array['9'], array['Riyaziyyat'], current_date + 90, '10:00', '12:00', 'Test şəhəri', 'published',
  now() - interval '1 day', now() + interval '30 days'
);

insert into public.applications (
  id, registration_number, exam_id, student_name, student_surname, grade, school,
  student_phone, student_phone_normalized, parent_phone, parent_phone_normalized, city,
  application_status, payment_status, ticket_status,
  assigned_building_id, assigned_room_id, assigned_seat_id
) values (
  'e4400000-0000-4000-8000-000000000001', 'OIM-2026-PHASE4PLACE01', 'e4300000-0000-4000-8000-000000000001',
  'Synthetic', 'Assigned', '9', 'Synthetic School', '+994500000101', '994500000101',
  '+994500000111', '994500000111', 'Test şəhəri', 'pending', 'not_submitted', 'not_created',
  'e4100000-0000-4000-8000-000000000001', 'e4200000-0000-4000-8000-000000000001', 'e4500000-0000-4000-8000-000000000001'
);

-- Runs the RPC as an authenticated user (or with no subject when p_uid is null).
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

-- Grants: RPCs are not executable by anon; authenticated may call them and the role check decides.
select ok(not has_function_privilege('anon', 'public.upsert_building(uuid,text,text,text)', 'EXECUTE'), 'anon cannot execute upsert_building');
select ok(has_function_privilege('authenticated', 'public.upsert_room(uuid,uuid,text,integer)', 'EXECUTE'), 'authenticated may call upsert_room (role checked inside)');

-- Authentication and role checks.
select is(pg_temp.call_as(null, $$public.upsert_building(null, 'Yeni bina', 'Ünvan', 'Şəhər')$$)->>'success', 'false', 'unauthenticated caller is rejected');
select is(pg_temp.call_as(null, $$public.upsert_building(null, 'Yeni bina', 'Ünvan', 'Şəhər')$$)->>'code', 'unauthenticated', 'unauthenticated code is safe');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000003', $$public.upsert_building(null, 'Yeni bina', 'Ünvan', 'Şəhər')$$)->>'code', 'not_authorized', 'operator cannot mutate buildings');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000004', $$public.sync_room_places('e4200000-0000-4000-8000-000000000001')$$)->>'code', 'not_authorized', 'scanner cannot sync room places');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000005', $$public.upsert_building(null, 'Yeni bina', 'Ünvan', 'Şəhər')$$)->>'code', 'not_authorized', 'inactive admin profile cannot mutate');

-- Admin and super_admin are allowed.
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.upsert_building(null, 'Admin bina', 'Ünvan', 'Şəhər')$$)->>'success', 'true', 'active admin creates a building');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000002', $$public.upsert_building('e4100000-0000-4000-8000-000000000001', 'Synthetic Bina A2', 'Test küçəsi 1', 'Test şəhəri')$$)->>'success', 'true', 'super_admin updates a building');

-- Input validation: non-empty names and positive integer place counts.
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.upsert_building(null, '   ', 'Ünvan', 'Şəhər')$$)->>'code', 'invalid_name', 'empty building name is rejected');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.upsert_room(null, 'e4100000-0000-4000-8000-000000000001', 'Sıfır', 0)$$)->>'code', 'invalid_capacity', 'zero room capacity is rejected');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.upsert_room(null, 'e4100000-0000-4000-8000-000000000001', 'Çox', 1001)$$)->>'code', 'invalid_capacity', 'room capacity above the safety ceiling is rejected');

-- Place inventory: sync creates seats up to capacity; capacity cannot drop below active inventory.
select is((pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.sync_room_places('e4200000-0000-4000-8000-000000000001')$$)->>'active_count')::integer, 3, 'sync raises active places to rooms.capacity');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.upsert_room('e4200000-0000-4000-8000-000000000001', 'e4100000-0000-4000-8000-000000000001', 'Otaq 1', 2)$$)->>'code', 'capacity_below_inventory', 'capacity cannot drop below active place inventory');

-- Assigned places and buildings with live assignments cannot be deactivated.
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.set_facility_active('place', 'e4500000-0000-4000-8000-000000000001', false)$$)->>'code', 'place_assigned', 'assigned place cannot be deactivated');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.set_facility_active('building', 'e4100000-0000-4000-8000-000000000001', false)$$)->>'code', 'building_in_use', 'building with assignments cannot be deactivated');

-- Exam room assignment: duplicates, priority, and room availability.
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000001']::uuid[], array[1,2])$$)->>'code', 'duplicate_room', 'duplicate room assignment is rejected');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000002']::uuid[], array[1,1])$$)->>'code', 'duplicate_priority', 'duplicate priority is rejected');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000003']::uuid[], array[1])$$)->>'code', 'room_unavailable', 'inactive room cannot be assigned');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000004']::uuid[], array[1])$$)->>'code', 'room_unavailable', 'archived room cannot be assigned');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000005']::uuid[], array[1])$$)->>'code', 'room_unavailable', 'room in an inactive building cannot be assigned');
select is(pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000002']::uuid[], array[1,2])$$)->>'code', 'exam_rooms_saved', 'valid room assignment with priority is saved');

-- The database guard blocks direct inserts of unassignable rooms, even outside the RPC.
select throws_ok(
  $$insert into public.exam_rooms (exam_id, room_id, priority, is_enabled) values ('e4300000-0000-4000-8000-000000000001', 'e4200000-0000-4000-8000-000000000004', 9, true)$$,
  'Inactive or archived room cannot be assigned to an exam',
  'exam_rooms guard rejects an archived room'
);

-- Audit rows: written by the same transaction, attributed to the resolved actor only.
select ok(exists (select 1 from public.audit_logs where action = 'building.created' and actor_profile_id = 'e4000000-0000-4000-8000-000000000001'), 'building.created audit row is written for the admin actor');
select ok(exists (select 1 from public.audit_logs where action = 'exam_room.assigned' and entity_type = 'exam_room' and entity_id = 'e4200000-0000-4000-8000-000000000002' and details->>'exam_id' = 'e4300000-0000-4000-8000-000000000001'), 'exam_room.assigned audit row carries only the exam id and priority');

-- No raw SQL error, SQLSTATE, or identifiers leak through the response.
select ok(
  pg_temp.call_as('e4000000-0000-4000-8000-000000000001', $$public.replace_exam_rooms('e4300000-0000-4000-8000-000000000001', array['e4200000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000001']::uuid[], array[1,2])$$)::text !~* '(sqlstate|violates|relation|constraint|public\.|e4200000)',
  'failure responses contain no raw error text or identifiers'
);

-- Direct client writes are revoked; read grants stay intact.
select ok(not has_table_privilege('authenticated', 'public.buildings', 'INSERT') and not has_table_privilege('authenticated', 'public.buildings', 'UPDATE') and not has_table_privilege('authenticated', 'public.buildings', 'DELETE'), 'authenticated has no direct write grants on buildings');
select ok(not has_table_privilege('authenticated', 'public.rooms', 'INSERT') and not has_table_privilege('authenticated', 'public.rooms', 'UPDATE') and not has_table_privilege('authenticated', 'public.rooms', 'DELETE'), 'authenticated has no direct write grants on rooms');
select ok(not has_table_privilege('authenticated', 'public.seats', 'INSERT') and not has_table_privilege('authenticated', 'public.seats', 'UPDATE') and not has_table_privilege('authenticated', 'public.seats', 'DELETE'), 'authenticated has no direct write grants on seats');
select ok(not has_table_privilege('authenticated', 'public.exam_rooms', 'INSERT') and not has_table_privilege('authenticated', 'public.exam_rooms', 'UPDATE') and not has_table_privilege('authenticated', 'public.exam_rooms', 'DELETE'), 'authenticated has no direct write grants on exam_rooms');
select ok(has_table_privilege('authenticated', 'public.rooms', 'SELECT') and has_table_privilege('authenticated', 'public.exam_rooms', 'SELECT'), 'read access to facility tables is retained');

select * from finish();
rollback;
