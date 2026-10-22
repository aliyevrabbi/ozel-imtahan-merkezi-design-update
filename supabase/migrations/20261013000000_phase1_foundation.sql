-- Phase 1 foundation only. This file is versioned but has NOT been applied.
-- No public application insert, payment verification, receipt upload, ticket issuance,
-- attendance write, public ticket lookup, result storage, or allocation operation exists.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('super_admin', 'admin', 'operator', 'scanner');
create type public.application_status as enum ('pending', 'under_review', 'confirmed', 'rejected', 'cancelled', 'attended');
create type public.payment_status as enum ('not_submitted', 'receipt_received', 'verified', 'rejected');
create type public.ticket_status as enum ('not_created', 'active', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'scanner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  organizer text not null,
  grades text[] not null default '{}',
  subjects text[] not null default '{}',
  exam_date date not null,
  start_time time not null,
  end_time time not null,
  city text not null,
  application_open_at timestamptz,
  application_deadline timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'finished', 'archived')),
  price_description text,
  rules jsonb not null default '[]'::jsonb,
  required_documents jsonb not null default '[]'::jsonb,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_valid_time check (end_time > start_time)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete restrict,
  name text not null,
  capacity integer not null check (capacity > 0),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_id_building_unique unique (id, building_id),
  constraint rooms_building_name_unique unique (building_id, name)
);

-- Explicit seat inventory is the capacity-safe representation. A room may keep
-- capacity without pre-created seat rows; later assignment logic must create or
-- consume a valid seat row inside one database transaction.
create table public.seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete restrict,
  seat_number text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint seats_room_number_unique unique (room_id, seat_number),
  constraint seats_id_room_unique unique (id, room_id)
);

create table public.exam_rooms (
  exam_id uuid not null references public.exams (id) on delete restrict,
  room_id uuid not null references public.rooms (id) on delete restrict,
  priority integer not null check (priority > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (exam_id, room_id),
  constraint exam_rooms_priority_unique unique (exam_id, priority)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null unique default (
    'OIM-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  exam_id uuid not null references public.exams (id) on delete restrict,
  student_name text not null,
  student_surname text not null,
  student_father_name text,
  grade text not null,
  school text,
  course_or_tutor text,
  student_phone text not null,
  student_phone_normalized text not null,
  parent_name text,
  parent_phone text not null,
  parent_phone_normalized text not null,
  city text not null,
  public_note text,
  internal_note text,
  application_status public.application_status not null default 'pending',
  payment_status public.payment_status not null default 'not_submitted',
  ticket_status public.ticket_status not null default 'not_created',
  assigned_building_id uuid default null,
  assigned_room_id uuid default null,
  assigned_seat_id uuid default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attended_at timestamptz,
  constraint applications_room_matches_building_fk
    foreign key (assigned_room_id, assigned_building_id)
    references public.rooms (id, building_id) on delete restrict,
  constraint applications_seat_matches_room_fk
    foreign key (assigned_seat_id, assigned_room_id)
    references public.seats (id, room_id) on delete restrict,
  constraint applications_assignment_all_or_none check (
    (assigned_building_id is null and assigned_room_id is null and assigned_seat_id is null)
    or
    (assigned_building_id is not null and assigned_room_id is not null and assigned_seat_id is not null)
  ),
  constraint applications_active_ticket_has_assignment check (
    ticket_status <> 'active'
    or (assigned_building_id is not null and assigned_room_id is not null and assigned_seat_id is not null)
  ),
  constraint applications_id_exam_unique unique (id, exam_id)
);

create index applications_exam_status_idx on public.applications (exam_id, application_status);
create index applications_registration_number_idx on public.applications (registration_number);
create index applications_student_phone_normalized_idx on public.applications (student_phone_normalized);
create index applications_parent_phone_normalized_idx on public.applications (parent_phone_normalized);
create unique index applications_exam_seat_unique_idx
  on public.applications (exam_id, assigned_seat_id)
  where assigned_seat_id is not null and application_status not in ('rejected', 'cancelled');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  version integer not null check (version > 0),
  status public.ticket_status not null check (status in ('active', 'revoked')),
  -- SHA-256 digest only: never put the opaque bearer token itself in this table.
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  pdf_storage_path text default null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  constraint tickets_application_version_unique unique (application_id, version),
  constraint tickets_expiry_after_issue check (expires_at is null or expires_at > issued_at),
  constraint tickets_revocation_consistent check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);
create unique index tickets_one_active_per_application_idx
  on public.tickets (application_id) where status = 'active';

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  exam_id uuid not null,
  foreign key (application_id, exam_id) references public.applications (id, exam_id) on delete restrict,
  operator_profile_id uuid references public.profiles (id) on delete set null,
  outcome text not null check (outcome in ('attended', 'duplicate_scan', 'manual_review')),
  scanned_at timestamptz not null default now(),
  notes text
);
create index attendance_application_scanned_idx on public.attendance (application_id, scanned_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_created_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- Serialize seat-inventory changes by locking the room row, so concurrent
-- inventory edits cannot create more active seats than the room's capacity.
create function private.enforce_room_seat_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_capacity integer;
  active_seats integer;
begin
  if tg_op = 'UPDATE' and new.room_id <> old.room_id then
    raise exception 'Moving a seat between rooms is not supported';
  end if;

  select r.capacity into room_capacity
  from public.rooms as r
  where r.id = new.room_id
  for update;

  if room_capacity is null then
    raise exception 'Room does not exist';
  end if;

  select count(*) into active_seats
  from public.seats as s
  where s.room_id = new.room_id
    and s.is_active
    and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if not new.is_active and exists (
    select 1 from public.applications as a
    where a.assigned_seat_id = new.id
      and a.application_status not in ('rejected', 'cancelled')
  ) then
    raise exception 'An assigned seat cannot be deactivated';
  end if;

  if new.is_active and active_seats >= room_capacity then
    raise exception 'Room seat inventory cannot exceed room capacity';
  end if;
  return new;
end;
$$;

create trigger seats_enforce_room_capacity
before insert or update of room_id, is_active on public.seats
for each row execute function private.enforce_room_seat_capacity();

create function private.prevent_room_capacity_below_seat_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_seats integer;
begin
  if new.capacity < old.capacity then
    perform 1 from public.rooms as r where r.id = old.id for update;
    select count(*) into active_seats
    from public.seats as s
    where s.room_id = old.id and s.is_active;
    if new.capacity < active_seats then
      raise exception 'Room capacity cannot be lower than its active seat inventory';
    end if;
  end if;
  return new;
end;
$$;

create trigger rooms_prevent_capacity_below_inventory
before update of capacity on public.rooms
for each row execute function private.prevent_room_capacity_below_seat_inventory();

create function private.has_any_role(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.active
      and p.role = any (required_roles)
  );
$$;

revoke all on function private.has_any_role(public.app_role[]) from public, anon;
grant execute on function private.has_any_role(public.app_role[]) to authenticated;
revoke all on function private.enforce_room_seat_capacity() from public, anon, authenticated;
revoke all on function private.prevent_room_capacity_below_seat_inventory() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.public_settings enable row level security;
alter table public.exams enable row level security;
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.seats enable row level security;
alter table public.exam_rooms enable row level security;
alter table public.applications enable row level security;
alter table public.tickets enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

-- Authenticated users may read only their own profile. The role-check helper runs
-- as its owner and is not available to anon clients; it avoids exposing other
-- profile rows in order to check a signed-in user's permissions.
create policy profiles_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Client identities cannot create their own profile or self-assign a role. Trusted
-- service/migration tooling creates the first profile and assigns its role.

-- Public settings expose only rows explicitly marked public; staff can read all.
create policy public_settings_select_public_for_anon
  on public.public_settings for select to anon
  using (is_public);
create policy public_settings_select_public_or_admin_for_authenticated
  on public.public_settings for select to authenticated
  using (is_public or private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy public_settings_insert_admin
  on public.public_settings for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy public_settings_update_admin
  on public.public_settings for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy public_settings_delete_admin
  on public.public_settings for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

-- Exam and facility catalogue: only published exams/active public locations are anonymous-readable.
create policy exams_select_published_for_anon
  on public.exams for select to anon
  using (status = 'published');
create policy exams_select_published_or_staff_for_authenticated
  on public.exams for select to authenticated
  using (status = 'published' or private.has_any_role(array['super_admin', 'admin', 'operator', 'scanner']::public.app_role[]));
create policy exams_insert_admin
  on public.exams for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy exams_update_admin
  on public.exams for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy exams_delete_admin
  on public.exams for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

create policy buildings_select_active_for_anon
  on public.buildings for select to anon
  using (is_active and archived_at is null);
create policy buildings_select_active_or_staff_for_authenticated
  on public.buildings for select to authenticated
  using ((is_active and archived_at is null) or private.has_any_role(array['super_admin', 'admin', 'operator', 'scanner']::public.app_role[]));
create policy buildings_insert_admin
  on public.buildings for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy buildings_update_admin
  on public.buildings for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy buildings_delete_admin
  on public.buildings for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

create policy rooms_select_active_for_anon
  on public.rooms for select to anon
  using (is_active and archived_at is null);
create policy rooms_select_active_or_staff_for_authenticated
  on public.rooms for select to authenticated
  using ((is_active and archived_at is null) or private.has_any_role(array['super_admin', 'admin', 'operator', 'scanner']::public.app_role[]));
create policy rooms_insert_admin
  on public.rooms for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy rooms_update_admin
  on public.rooms for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy rooms_delete_admin
  on public.rooms for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

create policy seats_select_staff
  on public.seats for select to authenticated
  using (private.has_any_role(array['super_admin', 'admin', 'operator', 'scanner']::public.app_role[]));
create policy seats_insert_admin
  on public.seats for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy seats_update_admin
  on public.seats for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy seats_delete_admin
  on public.seats for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

create policy exam_rooms_select_public_for_anon
  on public.exam_rooms for select to anon
  using (
    is_enabled and exists (
      select 1 from public.exams as e
      where e.id = exam_rooms.exam_id and e.status = 'published'
    )
  );
create policy exam_rooms_select_public_or_staff_for_authenticated
  on public.exam_rooms for select to authenticated
  using (
    exists (
      select 1 from public.exams as e
      where e.id = exam_rooms.exam_id and e.status = 'published'
    )
    or private.has_any_role(array['super_admin', 'admin', 'operator', 'scanner']::public.app_role[])
  );
create policy exam_rooms_insert_admin
  on public.exam_rooms for insert to authenticated
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy exam_rooms_update_admin
  on public.exam_rooms for update to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy exam_rooms_delete_admin
  on public.exam_rooms for delete to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

-- Sensitive operational data: there is deliberately no anon policy or write policy.
create policy applications_select_admin
  on public.applications for select to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy tickets_select_admin
  on public.tickets for select to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy attendance_select_admin
  on public.attendance for select to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));
create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using (private.has_any_role(array['super_admin', 'admin']::public.app_role[]));

create function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Audit logs are append-only';
end;
$$;
revoke all on function private.prevent_audit_log_mutation() from public, anon, authenticated;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function private.prevent_audit_log_mutation();

-- Explicit grants complement RLS. Revoke access only on objects created here;
-- do not change privileges on unrelated objects already present in public.
revoke all on table
  public.profiles,
  public.public_settings,
  public.exams,
  public.buildings,
  public.rooms,
  public.seats,
  public.exam_rooms,
  public.applications,
  public.tickets,
  public.attendance,
  public.audit_logs
from public, anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;

grant select on public.public_settings, public.exams, public.buildings, public.rooms, public.exam_rooms to anon, authenticated;
grant insert, update, delete on public.public_settings, public.exams, public.buildings, public.rooms, public.seats, public.exam_rooms to authenticated;
grant select on public.profiles, public.seats, public.applications, public.tickets, public.attendance, public.audit_logs to authenticated;

-- Sensitive records intentionally receive no client-side INSERT/UPDATE/DELETE grant.
-- Profiles are created/role-assigned only through trusted Supabase administrative
-- tooling or a later protected server operation. This migration creates no account.

commit;
