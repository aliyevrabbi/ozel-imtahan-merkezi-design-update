-- Phase 6: admin-only exam management through guarded SECURITY DEFINER RPCs.
-- This file is versioned but has NOT been applied. Direct INSERT/UPDATE/DELETE on public.exams
-- is revoked from authenticated clients; all mutations go through the functions below.
-- Applications, payments, rooms, seats, tickets, ledger rows and audit logs are never deleted.
-- ---------------------------------------------------------------------------

create function private.exam_result(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'success', p_code in ('created', 'updated', 'status_changed', 'archived'),
    'code', p_code,
    'message', case p_code
      when 'created' then 'İmtahan yaradıldı.'
      when 'updated' then 'İmtahan yeniləndi.'
      when 'status_changed' then 'İmtahanın statusu dəyişdirildi.'
      when 'archived' then 'İmtahan arxivləşdirildi.'
      when 'unauthenticated' then 'Sessiya tapılmadı. Yenidən daxil olun.'
      when 'not_authorized' then 'Bu əməliyyat üçün icazə yoxdur.'
      when 'invalid_request' then 'Sorğu düzgün deyil.'
      when 'not_found' then 'İmtahan tapılmadı.'
      when 'invalid_title' then 'İmtahanın adı boş ola bilməz.'
      when 'invalid_category' then 'Seçilmiş kateqoriya düzgün deyil.'
      when 'invalid_organizer' then 'Təşkilatçı adı boş ola bilməz.'
      when 'invalid_grades' then 'Sinif siyahısı boş ola bilməz və düzgün olmalıdır.'
      when 'invalid_subjects' then 'Fənn siyahısı boş ola bilməz və düzgün olmalıdır.'
      when 'invalid_city' then 'Şəhər boş ola bilməz.'
      when 'invalid_exam_date' then 'İmtahan tarixi düzgün deyil.'
      when 'invalid_time_range' then 'Başlama vaxtı bitmə vaxtından əvvəl olmalıdır.'
      when 'invalid_application_window' then 'Müraciət müddətinin başlanğıcı sonundan əvvəl olmalıdır.'
      when 'invalid_status_transition' then 'Bu status dəyişikliyi icazəli deyil.'
      when 'exam_locked' then 'Bu imtahan artıq redaktə oluna bilməz.'
      else 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.'
    end
  );
$$;

revoke all on function private.exam_result(text) from public, anon, authenticated;

-- Shared input validation. Returns an error code, or null when the input is valid.
-- p_check_date is true on create, and on update when the exam date changes.
create function private.validate_exam_input(
  p_title text,
  p_category text,
  p_organizer text,
  p_grades text[],
  p_subjects text[],
  p_exam_date date,
  p_start_time time,
  p_end_time time,
  p_city text,
  p_application_open_at timestamptz,
  p_application_deadline timestamptz,
  p_check_date boolean
)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    return 'invalid_title';
  end if;
  if p_category is null or p_category not in ('buraxilis', 'sinaq', 'monitorinq', 'hediyyeli', 'fenn') then
    return 'invalid_category';
  end if;
  if p_organizer is null or char_length(btrim(p_organizer)) not between 1 and 200 then
    return 'invalid_organizer';
  end if;
  if coalesce(cardinality(p_grades), 0) not between 1 and 20
     or exists (
       select 1 from unnest(p_grades) as g
        where g is null or char_length(btrim(g)) not between 1 and 40
     ) then
    return 'invalid_grades';
  end if;
  if coalesce(cardinality(p_subjects), 0) not between 1 and 20
     or exists (
       select 1 from unnest(p_subjects) as s
        where s is null or char_length(btrim(s)) not between 1 and 120
     ) then
    return 'invalid_subjects';
  end if;
  if p_city is null or char_length(btrim(p_city)) not between 1 and 120 then
    return 'invalid_city';
  end if;
  if p_exam_date is null then
    return 'invalid_exam_date';
  end if;
  if p_check_date and p_exam_date < current_date then
    return 'invalid_exam_date';
  end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    return 'invalid_time_range';
  end if;
  if p_application_open_at is not null
     and p_application_deadline is not null
     and p_application_open_at >= p_application_deadline then
    return 'invalid_application_window';
  end if;
  return null;
end;
$$;

revoke all on function private.validate_exam_input(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_exam: always creates a draft. Status is changed only through change_exam_status.
-- ---------------------------------------------------------------------------
create function public.create_exam(
  p_title text,
  p_category text,
  p_organizer text,
  p_grades text[],
  p_subjects text[],
  p_exam_date date,
  p_start_time time,
  p_end_time time,
  p_city text,
  p_application_open_at timestamptz default null,
  p_application_deadline timestamptz default null,
  p_price_description text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_error text;
  v_exam_id uuid;
begin
  if v_actor_id is null then
    return private.exam_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.exam_result('not_authorized');
  end if;
  if (p_price_description is not null and char_length(p_price_description) > 500)
     or (p_description is not null and char_length(p_description) > 4000) then
    return private.exam_result('invalid_request');
  end if;

  v_error := private.validate_exam_input(
    p_title, p_category, p_organizer, p_grades, p_subjects, p_exam_date,
    p_start_time, p_end_time, p_city, p_application_open_at, p_application_deadline, true
  );
  if v_error is not null then
    return private.exam_result(v_error);
  end if;

  insert into public.exams (
    title, category, organizer, grades, subjects, exam_date, start_time, end_time, city,
    application_open_at, application_deadline, status, price_description, description, created_by
  ) values (
    btrim(p_title), p_category, btrim(p_organizer),
    array(select btrim(g) from unnest(p_grades) as g),
    array(select btrim(s) from unnest(p_subjects) as s),
    p_exam_date, p_start_time, p_end_time, btrim(p_city),
    p_application_open_at, p_application_deadline, 'draft', p_price_description, p_description, v_actor_id
  )
  returning id into v_exam_id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (v_actor_id, 'exam.created', 'exam', v_exam_id, jsonb_build_object('to_status', 'draft'));

  return private.exam_result('created');
exception
  when others then
    return private.exam_result('invalid_request');
end;
$$;

-- ---------------------------------------------------------------------------
-- update_exam: edits descriptive and schedule fields. Status is never changed here.
-- Finished and archived exams are locked. Date is re-checked only when it changes.
-- ---------------------------------------------------------------------------
create function public.update_exam(
  p_exam_id uuid,
  p_title text,
  p_category text,
  p_organizer text,
  p_grades text[],
  p_subjects text[],
  p_exam_date date,
  p_start_time time,
  p_end_time time,
  p_city text,
  p_application_open_at timestamptz default null,
  p_application_deadline timestamptz default null,
  p_price_description text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_exam public.exams%rowtype;
  v_error text;
begin
  if v_actor_id is null then
    return private.exam_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.exam_result('not_authorized');
  end if;
  if p_exam_id is null then
    return private.exam_result('invalid_request');
  end if;
  if (p_price_description is not null and char_length(p_price_description) > 500)
     or (p_description is not null and char_length(p_description) > 4000) then
    return private.exam_result('invalid_request');
  end if;

  select * into v_exam from public.exams as e where e.id = p_exam_id for update;
  if not found then
    return private.exam_result('not_found');
  end if;
  if v_exam.status in ('finished', 'archived') then
    return private.exam_result('exam_locked');
  end if;

  v_error := private.validate_exam_input(
    p_title, p_category, p_organizer, p_grades, p_subjects, p_exam_date,
    p_start_time, p_end_time, p_city, p_application_open_at, p_application_deadline,
    p_exam_date is distinct from v_exam.exam_date
  );
  if v_error is not null then
    return private.exam_result(v_error);
  end if;

  update public.exams as e
     set title = btrim(p_title),
         category = p_category,
         organizer = btrim(p_organizer),
         grades = array(select btrim(g) from unnest(p_grades) as g),
         subjects = array(select btrim(s) from unnest(p_subjects) as s),
         exam_date = p_exam_date,
         start_time = p_start_time,
         end_time = p_end_time,
         city = btrim(p_city),
         application_open_at = p_application_open_at,
         application_deadline = p_application_deadline,
         price_description = p_price_description,
         description = p_description,
         updated_at = now()
   where e.id = v_exam.id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (v_actor_id, 'exam.updated', 'exam', v_exam.id, jsonb_build_object('status', v_exam.status));

  return private.exam_result('updated');
exception
  when others then
    return private.exam_result('invalid_request');
end;
$$;

-- ---------------------------------------------------------------------------
-- change_exam_status: only the safe forward transitions below. Archiving uses archive_exam.
--   draft -> published, published -> closed, closed -> finished
-- Publishing additionally requires a non-past exam date.
-- ---------------------------------------------------------------------------
create function public.change_exam_status(p_exam_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_exam public.exams%rowtype;
begin
  if v_actor_id is null then
    return private.exam_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.exam_result('not_authorized');
  end if;
  if p_exam_id is null or p_status is null then
    return private.exam_result('invalid_request');
  end if;

  select * into v_exam from public.exams as e where e.id = p_exam_id for update;
  if not found then
    return private.exam_result('not_found');
  end if;

  if not (
    (v_exam.status = 'draft' and p_status = 'published')
    or (v_exam.status = 'published' and p_status = 'closed')
    or (v_exam.status = 'closed' and p_status = 'finished')
  ) then
    return private.exam_result('invalid_status_transition');
  end if;

  if p_status = 'published' and v_exam.exam_date < current_date then
    return private.exam_result('invalid_exam_date');
  end if;

  update public.exams as e
     set status = p_status, updated_at = now()
   where e.id = v_exam.id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'exam.status_changed',
    'exam',
    v_exam.id,
    jsonb_build_object('from_status', v_exam.status, 'to_status', p_status)
  );

  return private.exam_result('status_changed');
exception
  when others then
    return private.exam_result('invalid_request');
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_exam: soft archive only. Allowed from published, closed and finished.
-- ---------------------------------------------------------------------------
create function public.archive_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_exam public.exams%rowtype;
begin
  if v_actor_id is null then
    return private.exam_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.exam_result('not_authorized');
  end if;
  if p_exam_id is null then
    return private.exam_result('invalid_request');
  end if;

  select * into v_exam from public.exams as e where e.id = p_exam_id for update;
  if not found then
    return private.exam_result('not_found');
  end if;
  if v_exam.status not in ('published', 'closed', 'finished') then
    return private.exam_result('invalid_status_transition');
  end if;

  update public.exams as e
     set status = 'archived', updated_at = now()
   where e.id = v_exam.id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'exam.archived',
    'exam',
    v_exam.id,
    jsonb_build_object('from_status', v_exam.status, 'to_status', 'archived')
  );

  return private.exam_result('archived');
exception
  when others then
    return private.exam_result('invalid_request');
end;
$$;

-- Clients may not write exams directly. Reads remain governed by the existing RLS policies.
revoke insert, update, delete on public.exams from public, anon, authenticated;
grant select on public.exams to anon, authenticated;

revoke all on function public.create_exam(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.update_exam(uuid, text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.change_exam_status(uuid, text) from public, anon;
revoke all on function public.archive_exam(uuid) from public, anon;
grant execute on function public.create_exam(text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.update_exam(uuid, text, text, text, text[], text[], date, time, time, text, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.change_exam_status(uuid, text) to authenticated;
grant execute on function public.archive_exam(uuid) to authenticated;
