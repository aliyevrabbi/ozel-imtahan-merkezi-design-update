-- Phase 4: secure facility management. This file is versioned but has NOT been applied.
-- Only active admin/super_admin profiles may mutate buildings, rooms, seat inventory, or
-- exam room assignments. Clients lose direct INSERT/UPDATE/DELETE on the facility tables;
-- read policies are unchanged. Every mutation writes one audit_logs row in the same
-- transaction. Responses carry fixed Azerbaijani messages only.
--
-- Capacity terminology: rooms.capacity is the single place-count source. No exam-level
-- capacity override exists.

-- ---------------------------------------------------------------------------
-- Guard: an exam may only reference a room that is active, not archived, and in an
-- active, not archived building. Disabled rows are not assignments and are not checked.
-- ---------------------------------------------------------------------------
create function private.enforce_exam_room_is_assignable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignable boolean;
begin
  if not new.is_enabled then
    return new;
  end if;

  select (r.is_active and r.archived_at is null and b.is_active and b.archived_at is null)
    into v_assignable
    from public.rooms as r
    join public.buildings as b on b.id = r.building_id
   where r.id = new.room_id;

  if not coalesce(v_assignable, false) then
    raise exception 'Inactive or archived room cannot be assigned to an exam';
  end if;
  return new;
end;
$$;

create trigger exam_rooms_enforce_assignable
before insert or update of room_id, is_enabled on public.exam_rooms
for each row execute function private.enforce_exam_room_is_assignable();

revoke all on function private.enforce_exam_room_is_assignable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (private, not callable by clients).
-- ---------------------------------------------------------------------------

-- Maps a fixed internal code to the fixed Azerbaijani message. Raw SQL text never reaches clients.
create function private.facility_result(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'success', p_code in ('building_saved', 'room_saved', 'places_synced', 'exam_rooms_saved', 'facility_status_changed', 'facility_archived'),
    'code', p_code,
    'message', case p_code
      when 'building_saved' then 'Bina yadda saxlanıldı.'
      when 'room_saved' then 'Otaq yadda saxlanıldı.'
      when 'places_synced' then 'Yer inventarı sinxronlaşdırıldı.'
      when 'exam_rooms_saved' then 'İmtahan otaqları yadda saxlanıldı.'
      when 'facility_status_changed' then 'Status yeniləndi.'
      when 'facility_archived' then 'Məlumat arxivləşdirildi.'
      when 'unauthenticated' then 'Sessiya tapılmadı. Yenidən daxil olun.'
      when 'not_authorized' then 'Bu əməliyyat üçün icazə yoxdur.'
      when 'invalid_request' then 'Göndərilən məlumat düzgün deyil.'
      when 'invalid_name' then 'Ad boş ola bilməz və 120 simvoldan uzun olmamalıdır.'
      when 'invalid_address' then 'Ünvan boş ola bilməz və 240 simvoldan uzun olmamalıdır.'
      when 'invalid_city' then 'Şəhər boş ola bilməz və 120 simvoldan uzun olmamalıdır.'
      when 'invalid_capacity' then 'Otağın yer sayı 1 ilə 1000 arasında tam ədəd olmalıdır.'
      when 'invalid_priority' then 'Prioritet 1 ilə 1000 arasında tam ədəd olmalıdır.'
      when 'duplicate_room' then 'Eyni otaq bir imtahana bir dəfədən çox təyin oluna bilməz.'
      when 'duplicate_priority' then 'Prioritetlər təkrarlana bilməz.'
      when 'duplicate_name' then 'Bu binada eyni adlı otaq artıq var.'
      when 'not_found' then 'Məlumat tapılmadı.'
      when 'archived' then 'Arxivləşdirilmiş məlumatı dəyişmək olmaz.'
      when 'already_archived' then 'Bu məlumat artıq arxivləşdirilib.'
      when 'already_in_state' then 'Vəziyyət artıq bu cürdür.'
      when 'building_unavailable' then 'Bina aktiv deyil və ya arxivləşdirilib.'
      when 'room_unavailable' then 'Otaq aktiv deyil və ya arxivləşdirilib.'
      when 'room_in_use' then 'Otaq aktiv imtahan təyinatında və ya müraciətdədir. Əvvəlcə təyinatı ləğv edin.'
      when 'building_in_use' then 'Binada aktiv otaq təyinatı və ya müraciət var.'
      when 'place_assigned' then 'Təyin olunmuş yer deaktiv edilə bilməz.'
      when 'capacity_below_inventory' then 'Otağın yer sayı aktiv yer sayından az ola bilməz.'
      when 'capacity_full' then 'Otaqda yer sayı limiti dolub.'
      else 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.'
    end
  );
$$;

-- True when an enabled exam assignment or a live application references any room in the building.
create function private.building_has_assignments(p_building_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1
        from public.rooms as r
        join public.exam_rooms as er on er.room_id = r.id
       where r.building_id = p_building_id
         and er.is_enabled
    )
    or exists (
      select 1
        from public.applications as a
       where a.assigned_building_id = p_building_id
         and a.application_status not in ('rejected', 'cancelled')
    );
$$;

-- True when an enabled exam assignment or a live application references the room.
create function private.room_has_assignments(p_room_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.exam_rooms as er
       where er.room_id = p_room_id and er.is_enabled
    )
    or exists (
      select 1 from public.applications as a
       where a.assigned_room_id = p_room_id
         and a.application_status not in ('rejected', 'cancelled')
    );
$$;

revoke all on function private.facility_result(text) from public, anon, authenticated;
revoke all on function private.building_has_assignments(uuid) from public, anon, authenticated;
revoke all on function private.room_has_assignments(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- upsert_building: create or update a building. Never hard-deletes and never changes
-- is_active or archived_at.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_building(
  p_building_id uuid,
  p_name text,
  p_address text,
  p_city text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_building public.buildings%rowtype;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return private.facility_result('invalid_name');
  end if;
  if char_length(v_address) not between 1 and 240 then
    return private.facility_result('invalid_address');
  end if;
  if char_length(v_city) not between 1 and 120 then
    return private.facility_result('invalid_city');
  end if;

  if p_building_id is null then
    insert into public.buildings (name, address, city)
    values (v_name, v_address, v_city)
    returning * into v_building;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (v_actor_id, 'building.created', 'building', v_building.id, '{}'::jsonb);
  else
    select * into v_building
      from public.buildings
     where id = p_building_id
     for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    if v_building.archived_at is not null then
      return private.facility_result('archived');
    end if;

    update public.buildings
       set name = v_name,
           address = v_address,
           city = v_city,
           updated_at = now()
     where id = p_building_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (v_actor_id, 'building.updated', 'building', p_building_id, '{}'::jsonb);
  end if;

  return private.facility_result('building_saved');
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_room: create or update a room. rooms.capacity is the place count.
-- Capacity may not drop below the active place inventory. Never hard-deletes.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_room(
  p_room_id uuid,
  p_building_id uuid,
  p_name text,
  p_capacity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_room public.rooms%rowtype;
  v_building public.buildings%rowtype;
  v_active_places integer;
  v_building_changed boolean := false;
  v_name_changed boolean := false;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if p_building_id is null then
    return private.facility_result('invalid_request');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return private.facility_result('invalid_name');
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 1000 then
    return private.facility_result('invalid_capacity');
  end if;

  select * into v_building from public.buildings where id = p_building_id;
  if not found then
    return private.facility_result('building_unavailable');
  end if;

  if p_room_id is null then
    if not (v_building.is_active and v_building.archived_at is null) then
      return private.facility_result('building_unavailable');
    end if;
    if exists (
      select 1 from public.rooms as r
       where r.building_id = p_building_id and r.name = v_name
    ) then
      return private.facility_result('duplicate_name');
    end if;

    insert into public.rooms (building_id, name, capacity)
    values (p_building_id, v_name, p_capacity)
    returning * into v_room;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (v_actor_id, 'room.created', 'room', v_room.id, jsonb_build_object('to_capacity', p_capacity));

    return private.facility_result('room_saved');
  end if;

  select * into v_room
    from public.rooms
   where id = p_room_id
   for update;
  if not found then
    return private.facility_result('not_found');
  end if;
  if v_room.archived_at is not null then
    return private.facility_result('archived');
  end if;

  if v_room.building_id <> p_building_id then
    v_building_changed := true;
    if not (v_building.is_active and v_building.archived_at is null) then
      return private.facility_result('building_unavailable');
    end if;
    if private.room_has_assignments(p_room_id) then
      return private.facility_result('room_in_use');
    end if;
  end if;
  v_name_changed := v_room.name <> v_name;

  if exists (
    select 1 from public.rooms as r
     where r.building_id = p_building_id
       and r.name = v_name
       and r.id <> p_room_id
  ) then
    return private.facility_result('duplicate_name');
  end if;

  if p_capacity < v_room.capacity then
    select count(*)::integer into v_active_places
      from public.seats as s
     where s.room_id = p_room_id and s.is_active;
    if p_capacity < v_active_places then
      return private.facility_result('capacity_below_inventory');
    end if;
  end if;

  update public.rooms
     set building_id = p_building_id,
         name = v_name,
         capacity = p_capacity,
         updated_at = now()
   where id = p_room_id;

  if v_name_changed or v_building_changed then
    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (v_actor_id, 'room.updated', 'room', p_room_id, '{}'::jsonb);
  end if;

  if p_capacity <> v_room.capacity then
    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      'room.capacity_changed',
      'room',
      p_room_id,
      jsonb_build_object('from_capacity', v_room.capacity, 'to_capacity', p_capacity)
    );
  end if;

  return private.facility_result('room_saved');
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_room_places: make the room's active seat inventory equal rooms.capacity.
-- Creates or reactivates seats when short; deactivates unassigned seats when over.
-- Assigned seats are never deactivated. Returns counts only.
-- ---------------------------------------------------------------------------
create or replace function public.sync_room_places(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_active_before integer;
  v_active_after integer;
  v_assigned_active integer;
  v_seat record;
  v_created integer := 0;
  v_activated integer := 0;
  v_deactivated integer := 0;
  v_needed integer;
  v_candidate integer := 0;
  v_result jsonb;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if p_room_id is null then
    return private.facility_result('invalid_request');
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return private.facility_result('not_found');
  end if;
  if v_room.archived_at is not null then
    return private.facility_result('archived');
  end if;

  select count(*)::integer into v_active_before
    from public.seats as s where s.room_id = p_room_id and s.is_active;

  select count(*)::integer into v_assigned_active
    from public.seats as s
   where s.room_id = p_room_id
     and s.is_active
     and exists (
       select 1 from public.applications as a
        where a.assigned_seat_id = s.id
          and a.application_status not in ('rejected', 'cancelled')
     );

  if v_assigned_active > v_room.capacity then
    return private.facility_result('place_assigned');
  end if;

  if v_active_before < v_room.capacity then
    v_needed := v_room.capacity - v_active_before;

    for v_seat in
      select s.id from public.seats as s
       where s.room_id = p_room_id and not s.is_active
       order by s.created_at, s.id
       limit v_needed
    loop
      update public.seats set is_active = true where id = v_seat.id;
      v_activated := v_activated + 1;
    end loop;

    v_needed := v_needed - v_activated;
    while v_created < v_needed loop
      v_candidate := v_candidate + 1;
      if not exists (
        select 1 from public.seats as s
         where s.room_id = p_room_id and s.seat_number = v_candidate::text
      ) then
        insert into public.seats (room_id, seat_number, is_active)
        values (p_room_id, v_candidate::text, true);
        v_created := v_created + 1;
      end if;
    end loop;
  elsif v_active_before > v_room.capacity then
    for v_seat in
      select s.id from public.seats as s
       where s.room_id = p_room_id
         and s.is_active
         and not exists (
           select 1 from public.applications as a
            where a.assigned_seat_id = s.id
              and a.application_status not in ('rejected', 'cancelled')
         )
       order by s.created_at desc, s.id desc
       limit v_active_before - v_room.capacity
    loop
      update public.seats set is_active = false where id = v_seat.id;
      v_deactivated := v_deactivated + 1;
    end loop;
  end if;

  select count(*)::integer into v_active_after
    from public.seats as s where s.room_id = p_room_id and s.is_active;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'seat.inventory_synced',
    'seat',
    p_room_id,
    jsonb_build_object(
      'capacity', v_room.capacity,
      'active_before', v_active_before,
      'active_after', v_active_after,
      'created', v_created,
      'activated', v_activated,
      'deactivated', v_deactivated
    )
  );

  v_result := private.facility_result('places_synced');
  return v_result || jsonb_build_object(
    'active_count', v_active_after,
    'created_count', v_created,
    'activated_count', v_activated,
    'deactivated_count', v_deactivated
  );
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- replace_exam_rooms: transactional replacement of one exam's room assignments.
-- Input is parallel arrays: room ids and their priorities. No student allocation.
-- ---------------------------------------------------------------------------
create or replace function public.replace_exam_rooms(
  p_exam_id uuid,
  p_room_ids uuid[],
  p_priorities integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_room_ids uuid[] := coalesce(p_room_ids, '{}'::uuid[]);
  v_priorities integer[] := coalesce(p_priorities, '{}'::integer[]);
  v_count integer;
  v_distinct_rooms integer;
  v_distinct_priorities integer;
  v_row record;
  v_idx integer;
  v_room uuid;
  v_prio integer;
  v_prev integer;
  v_shift constant integer := 100000;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if p_exam_id is null then
    return private.facility_result('invalid_request');
  end if;

  v_count := cardinality(v_room_ids);
  if v_count > 200 or cardinality(v_priorities) <> v_count then
    return private.facility_result('invalid_request');
  end if;
  if exists (select 1 from unnest(v_room_ids) as x where x is null)
     or exists (select 1 from unnest(v_priorities) as x where x is null) then
    return private.facility_result('invalid_request');
  end if;
  if exists (select 1 from unnest(v_priorities) as x where x < 1 or x > 1000) then
    return private.facility_result('invalid_priority');
  end if;

  select count(distinct x)::integer into v_distinct_rooms from unnest(v_room_ids) as x;
  if v_distinct_rooms <> v_count then
    return private.facility_result('duplicate_room');
  end if;
  select count(distinct x)::integer into v_distinct_priorities from unnest(v_priorities) as x;
  if v_distinct_priorities <> v_count then
    return private.facility_result('duplicate_priority');
  end if;

  perform 1 from public.exams where id = p_exam_id for update;
  if not found then
    return private.facility_result('not_found');
  end if;

  -- Every requested room must be active, not archived, and in an active, not archived building.
  if exists (
    select 1
      from unnest(v_room_ids) as requested(room_id)
      left join public.rooms as r on r.id = requested.room_id
      left join public.buildings as b on b.id = r.building_id
     where r.id is null
        or b.id is null
        or not (r.is_active and r.archived_at is null and b.is_active and b.archived_at is null)
  ) then
    return private.facility_result('room_unavailable');
  end if;

  -- Removing an assignment that live applications for this exam still use is refused.
  if exists (
    select 1
      from public.exam_rooms as er
      join public.applications as a
        on a.exam_id = er.exam_id and a.assigned_room_id = er.room_id
     where er.exam_id = p_exam_id
       and not (er.room_id = any (v_room_ids))
       and a.application_status not in ('rejected', 'cancelled')
  ) then
    return private.facility_result('room_in_use');
  end if;

  for v_row in
    select er.room_id, er.priority
      from public.exam_rooms as er
     where er.exam_id = p_exam_id
       and not (er.room_id = any (v_room_ids))
  loop
    delete from public.exam_rooms
     where exam_id = p_exam_id and room_id = v_row.room_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      'exam_room.removed',
      'exam_room',
      v_row.room_id,
      jsonb_build_object('exam_id', p_exam_id, 'priority', v_row.priority)
    );
  end loop;

  -- Move kept priorities out of the 1..1000 band so the unique (exam_id, priority)
  -- constraint is never violated mid-statement. Every kept row is reset below.
  update public.exam_rooms
     set priority = priority + v_shift
   where exam_id = p_exam_id;

  for v_idx in 1..v_count loop
    v_room := v_room_ids[v_idx];
    v_prio := v_priorities[v_idx];

    select er.priority - v_shift into v_prev
      from public.exam_rooms as er
     where er.exam_id = p_exam_id and er.room_id = v_room;

    if not found then
      insert into public.exam_rooms (exam_id, room_id, priority, is_enabled)
      values (p_exam_id, v_room, v_prio, true);

      insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
      values (
        v_actor_id,
        'exam_room.assigned',
        'exam_room',
        v_room,
        jsonb_build_object('exam_id', p_exam_id, 'priority', v_prio)
      );
    else
      update public.exam_rooms
         set priority = v_prio,
             is_enabled = true
       where exam_id = p_exam_id and room_id = v_room;

      if v_prev <> v_prio then
        insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
        values (
          v_actor_id,
          'exam_room.priority_changed',
          'exam_room',
          v_room,
          jsonb_build_object('exam_id', p_exam_id, 'from_priority', v_prev, 'to_priority', v_prio)
        );
      end if;
    end if;
  end loop;

  return private.facility_result('exam_rooms_saved');
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- set_facility_active: activate or deactivate a building, room, or place (seat).
-- Deactivation is refused while live assignments exist. Nothing is hard-deleted.
-- ---------------------------------------------------------------------------
create or replace function public.set_facility_active(
  p_facility_type text,
  p_facility_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_building public.buildings%rowtype;
  v_room public.rooms%rowtype;
  v_seat public.seats%rowtype;
  v_active_before integer;
  v_active_after integer;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if p_facility_id is null or p_is_active is null
     or p_facility_type not in ('building', 'room', 'place') then
    return private.facility_result('invalid_request');
  end if;

  if p_facility_type = 'building' then
    select * into v_building from public.buildings where id = p_facility_id for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    if v_building.archived_at is not null then
      return private.facility_result('archived');
    end if;
    if v_building.is_active = p_is_active then
      return private.facility_result('already_in_state');
    end if;
    if not p_is_active and private.building_has_assignments(p_facility_id) then
      return private.facility_result('building_in_use');
    end if;

    update public.buildings set is_active = p_is_active, updated_at = now() where id = p_facility_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      case when p_is_active then 'building.updated' else 'building.deactivated' end,
      'building',
      p_facility_id,
      jsonb_build_object(
        'active_before', case when v_building.is_active then 1 else 0 end,
        'active_after', case when p_is_active then 1 else 0 end
      )
    );

  elsif p_facility_type = 'room' then
    select * into v_room from public.rooms where id = p_facility_id for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    if v_room.archived_at is not null then
      return private.facility_result('archived');
    end if;
    if v_room.is_active = p_is_active then
      return private.facility_result('already_in_state');
    end if;
    if not p_is_active then
      if private.room_has_assignments(p_facility_id) then
        return private.facility_result('room_in_use');
      end if;
    elsif not exists (
      select 1 from public.buildings as b
       where b.id = v_room.building_id and b.is_active and b.archived_at is null
    ) then
      return private.facility_result('building_unavailable');
    end if;

    update public.rooms set is_active = p_is_active, updated_at = now() where id = p_facility_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      case when p_is_active then 'room.updated' else 'room.deactivated' end,
      'room',
      p_facility_id,
      jsonb_build_object(
        'active_before', case when v_room.is_active then 1 else 0 end,
        'active_after', case when p_is_active then 1 else 0 end
      )
    );

  else
    select * into v_seat from public.seats where id = p_facility_id for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    -- Lock the parent room so capacity checks cannot race with other inventory changes.
    select * into v_room from public.rooms where id = v_seat.room_id for update;
    if v_seat.is_active = p_is_active then
      return private.facility_result('already_in_state');
    end if;

    if not p_is_active then
      if exists (
        select 1 from public.applications as a
         where a.assigned_seat_id = p_facility_id
           and a.application_status not in ('rejected', 'cancelled')
      ) then
        return private.facility_result('place_assigned');
      end if;
    else
      if not (v_room.is_active and v_room.archived_at is null) then
        return private.facility_result('room_unavailable');
      end if;
      if (
        select count(*) from public.seats as s
         where s.room_id = v_seat.room_id and s.is_active
      ) >= v_room.capacity then
        return private.facility_result('capacity_full');
      end if;
    end if;

    update public.seats set is_active = p_is_active where id = p_facility_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      'seat.inventory_synced',
      'seat',
      p_facility_id,
      jsonb_build_object(
        'active_before', case when v_seat.is_active then 1 else 0 end,
        'active_after', case when p_is_active then 1 else 0 end
      )
    );
  end if;

  return private.facility_result('facility_status_changed');
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_facility: archive a building or room. Archive sets archived_at and is_active=false.
-- Archive is one-way and never hard-deletes.
-- ---------------------------------------------------------------------------
create or replace function public.archive_facility(
  p_facility_type text,
  p_facility_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_building public.buildings%rowtype;
  v_room public.rooms%rowtype;
begin
  if v_actor_id is null then
    return private.facility_result('unauthenticated');
  end if;
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return private.facility_result('not_authorized');
  end if;
  if p_facility_id is null or p_facility_type not in ('building', 'room') then
    return private.facility_result('invalid_request');
  end if;

  if p_facility_type = 'building' then
    select * into v_building from public.buildings where id = p_facility_id for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    if v_building.archived_at is not null then
      return private.facility_result('already_archived');
    end if;
    if private.building_has_assignments(p_facility_id) then
      return private.facility_result('building_in_use');
    end if;

    update public.buildings
       set is_active = false, archived_at = now(), updated_at = now()
     where id = p_facility_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      'building.archived',
      'building',
      p_facility_id,
      jsonb_build_object(
        'active_before', case when v_building.is_active then 1 else 0 end,
        'active_after', 0
      )
    );
  else
    select * into v_room from public.rooms where id = p_facility_id for update;
    if not found then
      return private.facility_result('not_found');
    end if;
    if v_room.archived_at is not null then
      return private.facility_result('already_archived');
    end if;
    if private.room_has_assignments(p_facility_id) then
      return private.facility_result('room_in_use');
    end if;

    update public.rooms
       set is_active = false, archived_at = now(), updated_at = now()
     where id = p_facility_id;

    insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
    values (
      v_actor_id,
      'room.archived',
      'room',
      p_facility_id,
      jsonb_build_object(
        'active_before', case when v_room.is_active then 1 else 0 end,
        'active_after', 0
      )
    );
  end if;

  return private.facility_result('facility_archived');
exception when others then
  return private.facility_result('unavailable');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs are callable by authenticated users only; the role check inside each RPC
-- decides admin/super_admin access. Direct client writes to facility tables are removed.
-- ---------------------------------------------------------------------------
revoke all on function public.upsert_building(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.upsert_room(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.sync_room_places(uuid) from public, anon, authenticated;
revoke all on function public.replace_exam_rooms(uuid, uuid[], integer[]) from public, anon, authenticated;
revoke all on function public.set_facility_active(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.archive_facility(text, uuid) from public, anon, authenticated;

grant execute on function public.upsert_building(uuid, text, text, text) to authenticated;
grant execute on function public.upsert_room(uuid, uuid, text, integer) to authenticated;
grant execute on function public.sync_room_places(uuid) to authenticated;
grant execute on function public.replace_exam_rooms(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.set_facility_active(text, uuid, boolean) to authenticated;
grant execute on function public.archive_facility(text, uuid) to authenticated;

revoke insert, update, delete on public.buildings from public, anon, authenticated;
revoke insert, update, delete on public.rooms from public, anon, authenticated;
revoke insert, update, delete on public.seats from public, anon, authenticated;
revoke insert, update, delete on public.exam_rooms from public, anon, authenticated;
