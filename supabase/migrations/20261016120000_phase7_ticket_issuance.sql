-- Phase 7: secure ticket issuance and opaque ticket-link lookup.
-- This file is versioned but has NOT been applied. Only the SHA-256 digest of the bearer token is
-- stored (tickets.token_hash). The plaintext token is returned once, by issue_application_ticket,
-- and is never written to a table, the audit log, or any later response.
-- Requires the pgcrypto function extensions.gen_random_bytes (Supabase installs it in "extensions").
-- ---------------------------------------------------------------------------

create function private.ticket_result(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'success', p_code = 'issued',
    'code', p_code,
    'message', case p_code
      when 'issued' then 'Bilet yaradıldı.'
      when 'unauthenticated' then 'Sessiya tapılmadı. Yenidən daxil olun.'
      when 'not_authorized' then 'Bu əməliyyat üçün icazə yoxdur.'
      when 'invalid_request' then 'Müraciət identifikatoru düzgün deyil.'
      when 'not_found' then 'Müraciət tapılmadı.'
      when 'already_issued' then 'Bu müraciət üçün aktiv bilet artıq mövcuddur.'
      when 'payment_not_verified' then 'Ödəniş təsdiqlənməyib.'
      when 'place_not_assigned' then 'Bilet yaratmaq üçün əvvəlcə yer təyin edilməlidir.'
      when 'invalid_status' then 'Bu müraciət üçün bilet yaratmaq mümkün deyil.'
      else 'Bilet yaradılmadı.'
    end
  );
$$;

revoke all on function private.ticket_result(text) from public, anon, authenticated;

create function private.ticket_lookup_result(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'success', p_code = 'found',
    'code', p_code,
    'message', case p_code
      when 'found' then 'Bilet tapıldı.'
      else 'Bilet linki etibarsızdır.'
    end
  );
$$;

revoke all on function private.ticket_lookup_result(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- issue_application_ticket: admin-only, atomic, idempotent.
-- Eligibility: pending application, verified payment, ticket_status not_created, all three
-- place fields assigned, exam not archived or finished, and no active ticket.
-- ---------------------------------------------------------------------------
create function public.issue_application_ticket(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_exam_status text;
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

  select e.status into v_exam_status
    from public.exams as e
   where e.id = v_application.exam_id
   for update;

  if v_exam_status is null then
    return private.ticket_result('not_found');
  end if;
  if v_exam_status in ('archived', 'finished') then
    return private.ticket_result('invalid_status');
  end if;

  -- 32 random bytes, URL-safe base64 without padding (43 characters). Not derived from any
  -- application, student, phone or exam data.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');

  select coalesce(max(t.version), 0) + 1 into v_version
    from public.tickets as t
   where t.application_id = v_application.id;

  insert into public.tickets (application_id, version, status, token_hash, created_by)
  values (
    v_application.id,
    v_version,
    'active',
    pg_catalog.sha256(convert_to(v_token, 'UTF8')),
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

-- ---------------------------------------------------------------------------
-- get_ticket_by_token: public, read-only, minimum display data.
-- Hashes the supplied opaque token and returns one active, non-revoked, non-expired ticket.
-- Student name, phone, payment, ledger, audit data and internal IDs are never returned.
-- ---------------------------------------------------------------------------
create function public.get_ticket_by_token(p_token text)
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
     and (t.expires_at is null or t.expires_at > now())
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

revoke all on function public.issue_application_ticket(uuid) from public, anon;
grant execute on function public.issue_application_ticket(uuid) to authenticated;

revoke all on function public.get_ticket_by_token(text) from public;
grant execute on function public.get_ticket_by_token(text) to anon, authenticated;

-- Tickets stay closed to direct client access. Admins read them only through the existing RLS
-- policy; anonymous visitors reach ticket data solely through get_ticket_by_token.
revoke all on public.tickets from anon;
