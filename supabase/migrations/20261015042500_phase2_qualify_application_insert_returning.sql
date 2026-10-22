-- Resolve the confirmed ambiguous registration_number in the applications INSERT.
-- The expected definition is checked before replacing either exact source fragment.

do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_expected_signature oid := pg_catalog.to_regprocedure(
    'public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,text)'
  );
  v_old_insert text := 'insert into public.applications (';
  v_new_insert text := 'insert into public.applications as inserted_application (';
  v_old_returning text := ') returning id, registration_number into v_application_id, v_registration_number;';
  v_new_returning text := ') returning inserted_application.id, inserted_application.registration_number into v_application_id, v_registration_number;';
begin
  if v_expected_signature is null then
    raise exception 'Expected submit_public_application(text x13) function is missing';
  end if;

  select p.oid into v_function_oid
  from pg_catalog.pg_proc as p
  where p.oid = v_expected_signature
    and p.prosecdef
    and p.proconfig @> array['search_path=""'];

  if v_function_oid is null then
    raise exception 'Expected SECURITY DEFINER function with empty search_path was not found';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);

  if pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old_insert, '')) <> pg_catalog.length(v_old_insert)
     or pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old_returning, '')) <> pg_catalog.length(v_old_returning) then
    raise exception 'Expected exactly one unaliased applications INSERT and RETURNING clause';
  end if;

  v_definition := pg_catalog.replace(v_definition, v_old_insert, v_new_insert);
  v_definition := pg_catalog.replace(v_definition, v_old_returning, v_new_returning);
  execute v_definition;
end;
$migration$;
