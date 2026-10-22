-- Phase 2: narrowly scoped public pending-application intake.
-- Apply only after reviewing this migration and confirming the linked target is staging.
-- This RPC never creates tickets, tokens, audit rows, PDFs, or seat/building assignments.

begin;

create table private.application_submission_requests (
  idempotency_key uuid primary key,
  application_id uuid not null unique references public.applications (id) on delete restrict,
  created_at timestamptz not null default now()
);
revoke all on table private.application_submission_requests from public, anon, authenticated;

create function private.normalize_public_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_input text;
  v_digits text;
  v_explicit_international boolean;
begin
  if p_phone is null or pg_catalog.char_length(pg_catalog.btrim(p_phone)) < 7
     or pg_catalog.char_length(pg_catalog.btrim(p_phone)) > 30
     or pg_catalog.btrim(p_phone) !~ '^[+0-9() .-]+$' then
    raise exception using errcode = '22023', message = 'invalid phone';
  end if;

  v_input := pg_catalog.btrim(p_phone);
  if pg_catalog.left(v_input, 1) = '+' and pg_catalog.substring(v_input, 2) ~ '[^0-9() .-]'
     or pg_catalog.strpos(pg_catalog.substring(v_input, 2), '+') > 0 then
    raise exception using errcode = '22023', message = 'invalid phone';
  end if;
  v_digits := pg_catalog.regexp_replace(v_input, '[^0-9]', '', 'g');
  v_explicit_international := pg_catalog.left(v_input, 1) = '+' or pg_catalog.left(v_digits, 2) = '00';

  if pg_catalog.left(v_digits, 2) = '00' and pg_catalog.left(v_input, 1) <> '+' then
    v_digits := pg_catalog.substring(v_digits, 3);
  elsif not v_explicit_international and pg_catalog.length(v_digits) = 10 and pg_catalog.left(v_digits, 1) = '0' then
    v_digits := pg_catalog.substring(v_digits, 2);
  end if;

  if not v_explicit_international and pg_catalog.length(v_digits) = 9 then
    v_digits := '994' || v_digits;
  elsif not v_explicit_international and pg_catalog.left(v_digits, 3) <> '994' then
    raise exception using errcode = '22023', message = 'invalid phone';
  end if;

  if pg_catalog.length(v_digits) < 8 or pg_catalog.length(v_digits) > 15
     or pg_catalog.left(v_digits, 1) = '0'
     or (pg_catalog.left(v_digits, 3) = '994' and pg_catalog.length(v_digits) <> 12) then
    raise exception using errcode = '22023', message = 'invalid phone';
  end if;

  return '+' || v_digits;
end;
$$;
revoke all on function private.normalize_public_phone(text) from public, anon, authenticated;

-- The function accepts only the exact public form fields plus a request idempotency
-- key. Protected status, assignment, ticket, token, audit, and internal-note values
-- are not parameters and cannot be set by callers.
create function public.submit_public_application(
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
  v_student_phone_normalized text;
  v_parent_phone_normalized text;
  v_application_id uuid;
  v_registration_number text;
  v_existing_application public.applications%rowtype;
  v_existing_record private.application_submission_requests%rowtype;
begin
  -- One transaction-scoped advisory lock serializes retries of the same request.
  if p_idempotency_key is null or p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  v_idempotency_key := p_idempotency_key::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_idempotency_key::text, 0));

  if p_exam_id is null or p_exam_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid exam';
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
    raise exception using errcode = '22023', message = 'invalid application';
  end if;

  v_student_phone_normalized := private.normalize_public_phone(p_student_phone);
  v_parent_phone_normalized := private.normalize_public_phone(p_parent_phone);

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
      raise exception using errcode = '22023', message = 'request conflict';
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
      raise exception using errcode = '22023', message = 'request conflict';
    end if;
    return query select true, v_existing_application.registration_number;
    return;
  end if;

  select e.grades into v_exam_grades
  from public.exams as e
  where e.id = v_exam_id
    and e.status = 'published'
    and e.exam_date >= current_date
    and (e.application_open_at is null or e.application_open_at <= pg_catalog.statement_timestamp())
    and (e.application_deadline is null or e.application_deadline >= pg_catalog.statement_timestamp());

  if not found or v_exam_grades is null or pg_catalog.array_position(v_exam_grades, pg_catalog.btrim(p_grade)) is null then
    raise exception using errcode = '22023', message = 'exam unavailable';
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
  when others then
    -- Hide validation, cast, constraint, and database details from public callers.
    raise exception using errcode = 'P0001', message = 'Müraciəti qəbul etmək mümkün olmadı.';
end;
$$;

-- Preserve the Phase 1 boundary: callers still cannot read or write application rows.
revoke select on public.applications from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.applications from public, anon, authenticated;
revoke all on function public.submit_public_application(text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_public_application(text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

commit;
