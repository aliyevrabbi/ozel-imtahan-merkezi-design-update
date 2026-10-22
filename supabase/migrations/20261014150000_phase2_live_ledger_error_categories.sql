-- Phase 2 correction for the live request-ledger schema.
-- Replaces only the existing intake RPC; no tables or data are created or altered here.

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
  v_payload_digest bytea;
  v_application_id uuid;
  v_registration_number text;
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

  -- Hash the canonical public payload; raw field values are never stored in the ledger.
  v_payload_digest := pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        v_exam_id,
        pg_catalog.btrim(p_student_name),
        pg_catalog.btrim(p_student_surname),
        pg_catalog.btrim(p_student_father_name),
        pg_catalog.btrim(p_grade),
        nullif(pg_catalog.btrim(p_school), ''),
        nullif(pg_catalog.btrim(p_course_or_tutor), ''),
        pg_catalog.btrim(p_student_phone),
        v_student_phone_normalized,
        nullif(pg_catalog.btrim(p_parent_name), ''),
        pg_catalog.btrim(p_parent_phone),
        v_parent_phone_normalized,
        pg_catalog.btrim(p_city),
        nullif(pg_catalog.btrim(p_public_note), '')
      )::text,
      'UTF8'
    )
  );

  -- Replay the saved acknowledgement for an identical retry before checking the
  -- current exam window; reject reuse of the key for a different payload.
  select r.* into v_existing_record
  from private.application_submission_requests as r
  where r.idempotency_key = v_idempotency_key;

  if found then
    if v_existing_record.payload_digest is distinct from v_payload_digest then
      raise exception using errcode = 'PZ005', message = 'request_conflict';
    end if;
    return query select true, v_existing_record.registration_number;
    return;
  end if;

  select e.grades, e.status, e.exam_date, e.application_open_at, e.application_deadline
    into v_exam_grades, v_exam_status, v_exam_date, v_application_open_at, v_application_deadline
  from public.exams as e
  where e.id = v_exam_id;

  if not found or v_exam_grades is null or pg_catalog.array_position(v_exam_grades, pg_catalog.btrim(p_grade)) is null then
    raise exception using errcode = 'PZ002', message = 'invalid_exam';
  end if;

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

  insert into private.application_submission_requests (
    idempotency_key, payload_digest, application_id, registration_number
  ) values (
    v_idempotency_key, v_payload_digest, v_application_id, v_registration_number
  );

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
       and v_constraint_name = 'application_submission_requests_idempotency_key_unique' then
      raise exception using errcode = 'P0001', message = 'duplicate_request';
    end if;
    raise exception using errcode = 'P0001', message = 'application_submit_failed';
  when others then
    raise exception using errcode = 'P0001', message = 'application_submit_failed';
end;
$$;

commit;
