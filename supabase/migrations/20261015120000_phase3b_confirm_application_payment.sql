-- Phase 3B: guarded payment confirmation. This file is versioned but has NOT been applied.
-- Only active admin/super_admin profiles may move payment_status not_submitted -> verified
-- for an application whose application_status is pending. No ticket, building, room,
-- or seat field is touched, and no direct client UPDATE path is introduced.

create or replace function public.confirm_application_payment(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'code', 'unauthenticated', 'message', 'Sessiya tapılmadı. Yenidən daxil olun.');
  end if;

  -- private.has_any_role requires an active profile whose role is admin or super_admin.
  if not private.has_any_role(array['super_admin', 'admin']::public.app_role[]) then
    return jsonb_build_object('success', false, 'code', 'not_authorized', 'message', 'Bu əməliyyat üçün icazə yoxdur.');
  end if;

  if p_application_id is null then
    return jsonb_build_object('success', false, 'code', 'invalid_request', 'message', 'Müraciət identifikatoru düzgün deyil.');
  end if;

  select *
    into v_application
    from public.applications
   where id = p_application_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'not_found', 'message', 'Müraciət tapılmadı.');
  end if;

  if v_application.payment_status = 'verified' then
    return jsonb_build_object('success', false, 'code', 'already_verified', 'message', 'Bu müraciətin ödənişi artıq təsdiqlənib.');
  end if;

  if v_application.payment_status <> 'not_submitted' or v_application.application_status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invalid_status', 'message', 'Bu müraciət üçün ödəniş təsdiqi mümkün deyil.');
  end if;

  update public.applications
     set payment_status = 'verified',
         updated_at = now()
   where id = p_application_id;

  -- Minimal metadata only: no phone, payment reference, token, or personal data.
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, details)
  values (
    v_actor_id,
    'application.payment_verified',
    'application',
    p_application_id,
    jsonb_build_object('from_payment_status', 'not_submitted', 'to_payment_status', 'verified')
  );

  return jsonb_build_object('success', true, 'code', 'payment_verified', 'message', 'Ödəniş təsdiqləndi.');
end;
$$;

revoke all on function public.confirm_application_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_application_payment(uuid) to authenticated;

-- Defense in depth: clients must never update applications directly. Phase 1 already
-- grants no client UPDATE on applications; this restates it for the payment path.
revoke update on public.applications from public, anon, authenticated;
