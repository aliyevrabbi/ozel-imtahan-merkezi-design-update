-- Phase 2 correction: allowlisted public error categories for the existing intake RPC.
-- This migration only replaces the function body; it creates no tables or other objects.

begin;

create or replace function public.submit_public_application(
  p_idempotency_key text,
  p_exam_id text,
  p_student_name text,
  p_student_surname text,
  p_student_father_name text,
  p_grade text,
  p_school text,
  p_course_or_tutor text,
  p_student_phone text,
  p_parent_name text,
  p_parent_phone text,
  p_city text,
  p_public_note text
)
returns table (
  success boolean,
  registration_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idempotency_key uuid;
  v_exam_id uuid;
  v_exam_grades text[];
  v_exam_status text;
  v_exam_date date;
  v_application_open_at timestamptz;
  v_application_deadline timestamptz;
  v_student_phone_normalized text;
  v_parent_phone_normalized text;
  v_application_id uuid;
  v_registration_number text;
  v_existing_application public.applications%rowtype;
  v_existing_record private.application_submission_requests%rowtype;
  v_constraint_name text;
  v_schema_name text;
  v_table_name text;
begin
  -- One transaction-scoped advisory lock serializes retries of the same request.
  if p_idempotency_key is null or p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'PZ001', message = 'invalid_request';
  end if;
  v_idempotency_key := p_idempotency_key::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_idempotency_key::text, 0));

  if p_exam_id is null or p_exam_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'PZ002', message = 'invalid_exam';
  end if;
  v_exam_id := p_exam_id::uuid;

  if p_student_name is null or pg_catalog.char_length(pg_catalog.btrim(p_student_name)) not between 1 and 100
     or p_student_surname is null or pg_catalog.char_length(pg_catalog.btrim(p_student_surname)) not between 1 and 100
     or p_student_father_name is null or pg_catalog.char_length(pg_catalog.btrim(p_student_father_name)) not between 1 and 100
     or p_grade is null or pg_catalog.char_length(pg_catalog.btrim(p_grade)) not between 1 and 2
     or p_school is null or pg_catalog.char_length(pg_catalog.btrim(p_school)) not between 1 and 160
     or (p_course_or_tutor is not null and pg_catalog.char_length(pg_catalog.btrim(p_course_or_tutor)) > 160)
     or (p_parent_name is not null and pg_catalog.char_length(pg_catalog.btrim(p_parent_name)) > 120)
     or p_city is null or pg_catalog.char_length(pg_catalog.btrim(p_city)) not between 2 and 100
     or (p_public_note is not null and pg_catalog.char_length(pg_catalog.btrim(p_public_note)) > 500) then
    raise exception using errcode = 'PZ003', message = 'invalid_application';
  end if;

  begin
    v_student_phone_normalized := private.normalize_public_phone(p_student_phone);
    v_parent_phone_normalized := private.normalize_public_phone(p_parent_phone);
  exception
    when sqlstate '22023' then
      raise exception using errcode = 'PZ004', message = 'invalid_phone';
  end;

  -- Return the original acknowledgement for an identical retry before checking
  -- the current exam window; reject a reused request key with a different payload.
  select r.* into v_existing_record
  from private.application_submission_requests as r
  where r.idempotency_key = v_idempotency_key;

  if found then
    select a.* into v_existing_application
    from public.applications as a
    where a.id = v_existing_record.application_id;
    if not found then
      raise exception using errcode = 'PZ005', message = 'request_conflict';
    end if;
    if v_existing_application.exam_id is distinct from v_exam_id
       or v_existing_application.student_name is distinct from pg_catalog.btrim(p_student_name)
       or v_existing_application.student_surname is distinct from pg_catalog.btrim(p_student_surname)
       or v_existing_application.student_father_name is distinct from pg_catalog.btrim(p_student_father_name)
       or v_existing_application.grade is distinct from pg_catalog.btrim(p_grade)
       or v_existing_application.school is distinct from nullif(pg_catalog.btrim(p_school), '')
       or v_existing_application.course_or_tutor is distinct from nullif(pg_catalog.btrim(p_course_or_tutor), '')
       or v_existing_application.student_phone is distinct from pg_catalog.btrim(p_student_phone)
       or v_existing_application.student_phone_normalized is distinct from v_student_phone_normalized
       or v_existing_application.parent_name is distinct from nullif(pg_catalog.btrim(p_parent_name), '')
       or v_existing_application.parent_phone is distinct from pg_catalog.btrim(p_parent_phone)
       or v_existing_application.parent_phone_normalized is distinct from v_parent_phone_normalized
       or v_existing_application.city is distinct from pg_catalog.btrim(p_city)
       or v_existing_application.public_note is distinct from nullif(pg_catalog.btrim(p_public_note), '') then
      raise exception using errcode = 'PZ005', message = 'request_conflict';
    end if;
    return query select true, v_existing_application.registration_number;
    return;
  end if;

  select e.grades, e.status, e.exam_date, e.application_open_at, e.application_deadline
    into v_exam_grades, v_exam_status, v_exam_date, v_application_open_at, v_application_deadline
  from public.exams as e
  where e.id = v_exam_id;

  if not found or v_exam_grades is null or pg_catalog.array_position(v_exam_grades, pg_catalog.btrim(p_grade)) is null then
    raise exception using errcode = 'PZ002', message = 'invalid_exam';
  end if;

  -- These are the original published/date/open/deadline eligibility predicates.
  if v_exam_status is distinct from 'published'
     or v_exam_date is null or v_exam_date < current_date
     or (v_application_open_at is not null and v_application_open_at > pg_catalog.statement_timestamp())
     or (v_application_deadline is not null and v_application_deadline < pg_catalog.statement_timestamp()) then
    raise exception using errcode = 'PZ006', message = 'application_closed';
  end if;

  insert into public.applications (
    exam_id, student_name, student_surname, student_father_name, grade,
    school, course_or_tutor, student_phone, student_phone_normalized,
    parent_name, parent_phone, parent_phone_normalized, city, public_note,
    application_status, payment_status, ticket_status,
    assigned_building_id, assigned_room_id, assigned_seat_id
  ) values (
    v_exam_id, pg_catalog.btrim(p_student_name), pg_catalog.btrim(p_student_surname),
    pg_catalog.btrim(p_student_father_name), pg_catalog.btrim(p_grade),
    nullif(pg_catalog.btrim(p_school), ''),
    nullif(pg_catalog.btrim(p_course_or_tutor), ''),
    pg_catalog.btrim(p_student_phone), v_student_phone_normalized,
    nullif(pg_catalog.btrim(p_parent_name), ''),
    pg_catalog.btrim(p_parent_phone), v_parent_phone_normalized,
    pg_catalog.btrim(p_city), nullif(pg_catalog.btrim(p_public_note), ''),
    'pending', 'not_submitted', 'not_created', null, null, null
  ) returning id, registration_number into v_application_id, v_registration_number;

  insert into private.application_submission_requests (idempotency_key, application_id)
    values (v_idempotency_key, v_application_id);

  return query select true, v_registration_number;
exception
  when sqlstate 'PZ001' then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  when sqlstate 'PZ002' then
    raise exception using errcode = 'P0001', message = 'invalid_exam';
  when sqlstate 'PZ003' then
    raise exception using errcode = 'P0001', message = 'invalid_application';
  when sqlstate 'PZ004' then
    raise exception using errcode = 'P0001', message = 'invalid_phone';
  when sqlstate 'PZ005' then
    raise exception using errcode = 'P0001', message = 'request_conflict';
  when sqlstate 'PZ006' then
    raise exception using errcode = 'P0001', message = 'application_closed';
  when unique_violation then
    get stacked diagnostics
      v_constraint_name = constraint_name,
      v_schema_name = schema_name,
      v_table_name = table_name;
    if v_schema_name = 'private'
       and v_table_name = 'application_submission_requests'
       and v_constraint_name = 'application_submission_requests_pkey' then
      raise exception using errcode = 'P0001', message = 'duplicate_request';
    end if;
    raise exception using errcode = 'P0001', message = 'application_submit_failed';
  when others then
    raise exception using errcode = 'P0001', message = 'application_submit_failed';
end;
$$;

commit;
