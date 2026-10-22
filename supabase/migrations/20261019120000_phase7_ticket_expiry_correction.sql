-- Phase 7 correction: ticket link expiry.
-- Replaces the two Phase 7 functions so that every issued ticket gets an expires_at (end of the
-- 30th calendar day after the exam date, Asia/Baku local time), and the public lookup accepts only
-- a non-null, future expiry. Signatures, return shapes, SECURITY DEFINER, search_path, token hashing,
-- fixed response codes and grants are unchanged. No tables, columns, data or grants are modified.
-- ---------------------------------------------------------------------------

create or replace function public.issue_application_ticket(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_exam_status text;
  v_exam_date date;
  v_expires_at timestamptz;
  v_token text;
  v_version integer;
begin
  if v_actor_id is null then
    return private.ticket_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.ticket_result('not_authorized');
  end if;
  if p_application_id is null then
    return private.ticket_result('invalid_request');
  end if;

  -- Lock order matches allocate_application_place: application first, then exam.
  select * into v_application
    from public.applications as a
   where a.id = p_application_id
   for update;

  if not found then
    return private.ticket_result('not_found');
  end if;

  -- Idempotency: an existing active ticket is reported, never duplicated or changed.
  if v_application.ticket_status = 'active' or exists (
    select 1 from public.tickets as t
     where t.application_id = v_application.id and t.status = 'active'
  ) then
    return private.ticket_result('already_issued');
  end if;

  if v_application.application_status <> 'pending'
     or v_application.ticket_status <> 'not_created' then
    return private.ticket_result('invalid_status');
  end if;

  if v_application.payment_status <> 'verified' then
    return private.ticket_result('payment_not_verified');
  end if;

  if v_application.assigned_building_id is null
     or v_application.assigned_room_id is null
     or v_application.assigned_seat_id is null then
    return private.ticket_result('place_not_assigned');
  end if;

  select e.status, e.exam_date into v_exam_status, v_exam_date
    from public.exams as e
   where e.id = v_application.exam_id
   for update;

  if v_exam_status is null then
    return private.ticket_result('not_found');
  end if;
  if v_exam_status in ('archived', 'finished') then
    return private.ticket_result('invalid_status');
  end if;

  -- Link expiry: the end of the 30th calendar day after the exam date, Asia/Baku local time.
  v_expires_at := ((v_exam_date + 30)::timestamp + interval '1 day' - interval '1 second')
                  at time zone 'Asia/Baku';

  -- 32 random bytes, URL-safe base64 without padding (43 characters). Not derived from any
  -- application, student, phone or exam data.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');

  select coalesce(max(t.version), 0) + 1 into v_version
    from public.tickets as t
   where t.application_id = v_application.id;

  insert into public.tickets (application_id, version, status, token_hash, expires_at, created_by)
  values (
    v_application.id,
    v_version,
    'active',
    pg_catalog.sha256(convert_to(v_token, 'UTF8')),
    v_expires_at,
    v_actor_id
  );

  update public.applications as a
     set ticket_status = 'active', updated_at = now()
   where a.id = v_application.id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'application.ticket_issued',
    'application',
    v_application.id,
    jsonb_build_object('ticket_version', v_version, 'ticket_status', 'active')
  );

  return private.ticket_result('issued')
    || jsonb_build_object('ticket_link', '/ticket/' || v_token);
exception
  when others then
    return private.ticket_result('issue_failed');
end;
$$;

create or replace function public.get_ticket_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return private.ticket_lookup_result('invalid_link');
  end if;

  select a.registration_number,
         e.title as exam_title,
         e.exam_date,
         e.start_time,
         e.end_time,
         b.name as building_name,
         r.name as room_name,
         s.seat_number
    into v_row
    from public.tickets as t
    join public.applications as a on a.id = t.application_id
    join public.exams as e on e.id = a.exam_id
    join public.buildings as b on b.id = a.assigned_building_id
    join public.rooms as r on r.id = a.assigned_room_id
    join public.seats as s on s.id = a.assigned_seat_id
   where t.token_hash = pg_catalog.sha256(convert_to(p_token, 'UTF8'))
     and t.status = 'active'
     and t.revoked_at is null
     and t.expires_at is not null
     and t.expires_at > statement_timestamp()
     and a.ticket_status = 'active'
     and e.status <> 'archived';

  if not found then
    return private.ticket_lookup_result('invalid_link');
  end if;

  return private.ticket_lookup_result('found') || jsonb_build_object(
    'ticket', jsonb_build_object(
      'registration_number', v_row.registration_number,
      'exam_title', v_row.exam_title,
      'exam_date', v_row.exam_date,
      'start_time', v_row.start_time,
      'end_time', v_row.end_time,
      'building_name', v_row.building_name,
      'room_name', v_row.room_name,
      'seat_number', v_row.seat_number
    )
  );
exception
  when others then
    return private.ticket_lookup_result('invalid_link');
end;
$$;
