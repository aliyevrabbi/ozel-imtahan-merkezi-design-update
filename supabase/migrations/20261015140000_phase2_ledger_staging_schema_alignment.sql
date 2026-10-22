-- Align private.application_submission_requests with the verified staging schema.
-- Staging is authoritative: id is the primary key, idempotency_key/application_id/
-- registration_number are unique, payload_digest is a 32-byte bytea, the application
-- foreign key restricts deletes, and the table stays private with RLS enabled and no
-- anon/authenticated/client privileges. Each step is guarded so a rerun is a no-op.
-- No ledger rows are deleted, and rows are not backfilled with invented values.

-- 1. Columns: add missing ones, then give every row a generated id.
alter table private.application_submission_requests
  add column if not exists id uuid;
alter table private.application_submission_requests
  alter column id set default gen_random_uuid();
update private.application_submission_requests
  set id = gen_random_uuid()
  where id is null;
alter table private.application_submission_requests
  alter column id set not null;

alter table private.application_submission_requests
  add column if not exists payload_digest bytea;
alter table private.application_submission_requests
  add column if not exists registration_number text;

-- 2. Stop rather than invent values for rows that cannot satisfy the new NOT NULL rules.
do $migration$
declare
  v_missing_count bigint;
begin
  select count(*) into v_missing_count
  from private.application_submission_requests as r
  where r.payload_digest is null or r.registration_number is null;

  if v_missing_count > 0 then
    raise exception 'application_submission_requests has % row(s) without payload_digest or registration_number; backfill them with a reviewed plan before this migration',
      v_missing_count
      using errcode = 'P0001';
  end if;
end;
$migration$;

alter table private.application_submission_requests
  alter column payload_digest set not null;
alter table private.application_submission_requests
  alter column registration_number set not null;

-- 2b. Column order: staging orders the columns id, idempotency_key, payload_digest,
-- application_id, registration_number, created_at. ALTER TABLE appends columns, so a table
-- built by the earlier chain is rebuilt once in staging's order. Rows are copied, and the
-- copied count must equal the original count before the old table is dropped. The rebuild
-- is skipped when the order already matches, so a rerun is a no-op.
do $migration$
declare
  v_order text[];
  v_source_count bigint;
  v_copied_count bigint;
begin
  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_order
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'private.application_submission_requests'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_order is distinct from array[
    'id', 'idempotency_key', 'payload_digest', 'application_id', 'registration_number', 'created_at'
  ]::text[] then
    -- Snapshot the rows first so the final table is created under its real name; NOT NULL
    -- constraint names are derived from the table name at creation time.
    select count(*) into v_source_count from private.application_submission_requests;

    create temporary table application_submission_requests_snapshot as
      select r.id, r.idempotency_key, r.payload_digest, r.application_id, r.registration_number, r.created_at
      from private.application_submission_requests as r;

    select count(*) into v_copied_count from application_submission_requests_snapshot;
    if v_copied_count is distinct from v_source_count then
      raise exception 'application_submission_requests snapshot copied % of % row(s); aborting',
        v_copied_count, v_source_count
        using errcode = 'P0001';
    end if;

    drop table private.application_submission_requests;

    create table private.application_submission_requests (
      id uuid not null default gen_random_uuid(),
      idempotency_key uuid not null,
      payload_digest bytea not null,
      application_id uuid not null,
      registration_number text not null,
      created_at timestamptz not null default now()
    );

    insert into private.application_submission_requests (
      id, idempotency_key, payload_digest, application_id, registration_number, created_at
    )
    select s.id, s.idempotency_key, s.payload_digest, s.application_id, s.registration_number, s.created_at
    from application_submission_requests_snapshot as s;

    select count(*) into v_copied_count from private.application_submission_requests;
    if v_copied_count is distinct from v_source_count then
      raise exception 'application_submission_requests rebuild restored % of % row(s); aborting',
        v_copied_count, v_source_count
        using errcode = 'P0001';
    end if;

    drop table application_submission_requests_snapshot;
  end if;
end;
$migration$;

-- 3. Constraints: move the primary key to id and align every constraint name.
do $migration$
declare
  v_table constant regclass := 'private.application_submission_requests'::regclass;
  v_id_attnum smallint;
  v_pk_name text;
begin
  select a.attnum into v_id_attnum
  from pg_catalog.pg_attribute as a
  where a.attrelid = v_table and a.attname = 'id' and not a.attisdropped;

  -- Drop any primary key that is not exactly (id), e.g. the original (idempotency_key).
  for v_pk_name in
    select c.conname
    from pg_catalog.pg_constraint as c
    where c.conrelid = v_table
      and c.contype = 'p'
      and c.conkey is distinct from array[v_id_attnum]::smallint[]
  loop
    execute pg_catalog.format('alter table %s drop constraint %I', v_table, v_pk_name);
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.contype = 'p'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_pkey primary key (id);
  end if;

  -- Rename the auto-named application_id unique and foreign key to the staging names.
  if exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_id_key'
  ) and not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_id_unique'
  ) then
    alter table private.application_submission_requests
      rename constraint application_submission_requests_application_id_key
      to application_submission_requests_application_id_unique;
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_id_fkey'
  ) and not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_fk'
  ) then
    alter table private.application_submission_requests
      rename constraint application_submission_requests_application_id_fkey
      to application_submission_requests_application_fk;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_idempotency_key_unique'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_idempotency_key_unique unique (idempotency_key);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_id_unique'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_application_id_unique unique (application_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_registration_number_unique'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_registration_number_unique unique (registration_number);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_payload_digest_sha256'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_payload_digest_sha256
      check (octet_length(payload_digest) = 32);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = v_table and c.conname = 'application_submission_requests_application_fk'
  ) then
    alter table private.application_submission_requests
      add constraint application_submission_requests_application_fk
      foreign key (application_id) references public.applications (id) on delete restrict;
  end if;
end;
$migration$;

-- 4. Privacy posture: RLS on, no policies, and no client or anon privileges.
alter table private.application_submission_requests enable row level security;
revoke all on table private.application_submission_requests
  from public, anon, authenticated, service_role;
