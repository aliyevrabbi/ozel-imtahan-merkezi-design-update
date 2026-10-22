-- Phase 5: separate admin-only atomic place allocation. This file is versioned but has NOT
-- been applied. Allocation is never called from payment confirmation. Physical places may be
-- reused across different exams; double booking is prevented only within one exam by the
-- existing partial unique index on applications (exam_id, assigned_seat_id).
-- ---------------------------------------------------------------------------

create function private.allocation_result(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'success', p_code = 'allocated',
    'code', p_code,
    'message', case p_code
      when 'allocated' then 'Yer təyin edildi.'
      when 'unauthenticated' then 'Sessiya tapılmadı. Yenidən daxil olun.'
      when 'not_authorized' then 'Bu əməliyyat üçün icazə yoxdur.'
      when 'invalid_request' then 'Müraciət identifikatoru düzgün deyil.'
      when 'not_found' then 'Müraciət tapılmadı.'
      when 'payment_not_verified' then 'Ödəniş təsdiqlənməyib.'
      when 'invalid_status' then 'Bu müraciət üçün yer təyini mümkün deyil.'
      when 'already_assigned' then 'Bu müraciətə artıq yer təyin edilib.'
      when 'no_available_place' then 'Bu imtahan üçün boş yer yoxdur.'
      when 'allocation_conflict' then 'Yer təyini başa çatmadı. Yenidən cəhd edin.'
      else 'Yer təyini həyata keçirilmədi.'
    end
  );
$$;

revoke all on function private.allocation_result(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- allocate_application_place: assign one place atomically.
-- Priority: lower exam_rooms.priority first, then numeric seat number (2 before 10).
-- Seats with a non-numeric seat_number are skipped, so no unguarded cast can raise.
-- ---------------------------------------------------------------------------
create or replace function public.allocate_application_place(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_exam public.exams%rowtype;
  v_building_id uuid;
  v_room_id uuid;
  v_seat_id uuid;
  v_priority integer;
  v_capacity integer;
begin
  if v_actor_id is null then
    return private.allocation_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.allocation_result('not_authorized');
  end if;
  if p_application_id is null then
    return private.allocation_result('invalid_request');
  end if;

  -- Lock order: application first, then exam.
  select * into v_application
    from public.applications as a
   where a.id = p_application_id
   for update;

  if not found then
    return private.allocation_result('not_found');
  end if;

  -- Idempotency: a second call after a successful allocation changes nothing.
  if v_application.assigned_building_id is not null
     or v_application.assigned_room_id is not null
     or v_application.assigned_seat_id is not null then
    return private.allocation_result('already_assigned');
  end if;

  if v_application.payment_status <> 'verified' then
    return private.allocation_result('payment_not_verified');
  end if;

  if v_application.application_status <> 'pending'
     or v_application.ticket_status <> 'not_created' then
    return private.allocation_result('invalid_status');
  end if;

  select * into v_exam
    from public.exams as e
   where e.id = v_application.exam_id
   for update;

  if not found then
    return private.allocation_result('not_found');
  end if;

  -- Exam validity only: the exam must be published or closed (not draft, finished or
  -- archived) and its date must not be in the past. The public application window
  -- (application_open_at / application_deadline) does not apply to allocating an
  -- already verified application.
  if v_exam.status not in ('published', 'closed')
     or v_exam.exam_date < current_date then
    return private.allocation_result('invalid_status');
  end if;

  -- Candidate places: enabled exam-room assignment, active room/building (re-checked here,
  -- since a room may be archived after assignment), active seat, numeric seat number, and no
  -- non-rejected/non-cancelled application for this exam on the seat. Locked rows are skipped.
  select b.id, r.id, s.id, er.priority, r.capacity
    into v_building_id, v_room_id, v_seat_id, v_priority, v_capacity
    from public.exam_rooms as er
    join public.rooms as r on r.id = er.room_id
    join public.buildings as b on b.id = r.building_id
    join public.seats as s on s.room_id = r.id
   where er.exam_id = v_exam.id
     and er.is_enabled
     and er.priority > 0
     and r.is_active
     and r.archived_at is null
     and b.is_active
     and b.archived_at is null
     and s.is_active
     and s.seat_number ~ '^[0-9]{1,9}$'
     and not exists (
       select 1
         from public.applications as taken
        where taken.exam_id = v_exam.id
          and taken.assigned_seat_id = s.id
          and taken.application_status not in ('rejected', 'cancelled')
     )
   order by er.priority, s.seat_number::integer, s.id
   for update of s skip locked
   limit 1;

  if not found then
    return private.allocation_result('no_available_place');
  end if;

  update public.applications as a
     set assigned_building_id = v_building_id,
         assigned_room_id = v_room_id,
         assigned_seat_id = v_seat_id,
         updated_at = now()
   where a.id = v_application.id;

  -- Minimal metadata only: no seat or room identifiers, names, phones, or tokens.
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'application.place_allocated',
    'application',
    v_application.id,
    jsonb_build_object('room_priority', v_priority, 'room_capacity', v_capacity)
  );

  return private.allocation_result('allocated');
exception
  when unique_violation then
    return private.allocation_result('allocation_conflict');
  when others then
    return private.allocation_result('allocation_failed');
end;
$$;

revoke all on function public.allocate_application_place(uuid) from public, anon, authenticated;
grant execute on function public.allocate_application_place(uuid) to authenticated;
