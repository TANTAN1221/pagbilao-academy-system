-- Migration: Allow admin/accounting/registrar clearance override and provide atomic RPC

-- 1. Update enforce_clearance_approval_locks_fn to allow admin & accounting/registrar overrides
create or replace function public.enforce_clearance_approval_locks_fn()
returns trigger as $$
declare
  v_student_id uuid;
  v_balance numeric(12,2);
  v_principal_status clearance_status;
  v_dept_name text;
  v_caller_role text;
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    -- Check caller role from authenticated profile
    if auth.uid() is not null then
      select role into v_caller_role
      from public.profiles
      where auth_user_id = auth.uid();
    end if;

    -- Super Admin can approve any clearance step unconditionally
    if v_caller_role = 'super_admin' then
      return new;
    end if;

    -- If remarks specify admin approval or override, allow it
    if new.remarks ilike '%Approved by Admin%' 
       or new.remarks ilike '%override%' 
       or new.remarks ilike '%Administrative%' then
      return new;
    end if;

    -- Get department name
    select name into v_dept_name from public.departments where id = new.department_id;

    -- Accounting head/admin can approve Accounting clearance directly
    if v_dept_name = 'Accounting' and v_caller_role in ('accounting_admin', 'super_admin') then
      return new;
    end if;

    -- Registrar head/admin can approve Registrar clearance directly
    if v_dept_name = 'Registrar' and v_caller_role in ('registrar', 'super_admin') then
      return new;
    end if;

    -- Principal can approve Principal clearance directly
    if v_dept_name = 'Principal' and v_caller_role in ('principal', 'super_admin') then
      return new;
    end if;

    -- Get student ID
    select student_id into v_student_id from public.clearance_requests where id = new.clearance_request_id;

    -- 1. Principal requires Teachers and other Offices to be approved (for non-admin workflows)
    if v_dept_name = 'Principal' then
      if exists (
        select 1 from public.clearance_approvals ca
        join public.departments d on d.id = ca.department_id
        where ca.clearance_request_id = new.clearance_request_id
          and d.name = 'Teacher'
          and ca.status <> 'approved'
      ) then
        raise exception 'Principal clearance is locked: not all teacher clearances are approved.';
      end if;

      if exists (
        select 1 from public.clearance_approvals ca
        join public.departments d on d.id = ca.department_id
        where ca.clearance_request_id = new.clearance_request_id
          and d.name in ('Guidance', 'Prefect', 'Library')
          and ca.status <> 'approved'
      ) then
        raise exception 'Principal clearance is locked: Guidance, Prefect, or Library clearances are not approved.';
      end if;
    end if;

    -- 2. Accounting/Registrar default sequence check (for automated/non-admin workflows)
    if v_dept_name in ('Accounting', 'Registrar') then
      select status into v_principal_status
      from public.clearance_approvals ca
      join public.departments d on d.id = ca.department_id
      where ca.clearance_request_id = new.clearance_request_id
        and d.name = 'Principal';

      if v_principal_status is null or v_principal_status <> 'approved' then
        raise exception 'Final clearance is locked: Principal has not approved.';
      end if;

      select balance into v_balance from public.accounting_student_balances where student_id = v_student_id;
      if v_balance is null or v_balance > 0 then
        raise exception 'Final clearance is locked: Student has an outstanding balance of ₱%', round(v_balance);
      end if;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create atomic approve_office_clearance RPC function
create or replace function public.approve_office_clearance(
  p_student_id uuid,
  p_department_name text,
  p_status text default 'approved',
  p_remarks text default 'Approved by Admin'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req_id uuid;
  v_dept_id uuid;
  v_profile_id uuid;
  v_approval_id uuid;
  v_order int;
  v_status clearance_status := p_status::clearance_status;
  v_approved_at timestamptz := case when p_status = 'approved' then now() else null end;
begin
  -- Get active clearance request for student
  select id into v_req_id from public.clearance_requests
  where student_id = p_student_id
  order by created_at desc limit 1;

  if v_req_id is null then
    insert into public.clearance_requests (student_id, school_year, status)
    values (p_student_id, '2026-2027', 'pending')
    returning id into v_req_id;
  end if;

  -- Get department
  select id into v_dept_id from public.departments
  where lower(name) = lower(p_department_name) limit 1;

  if v_dept_id is null then
    raise exception 'Department "%" not found.', p_department_name;
  end if;

  -- Get approver profile if available
  if auth.uid() is not null then
    select id into v_profile_id from public.profiles
    where auth_user_id = auth.uid() limit 1;
  end if;

  v_order := case 
    when p_department_name = 'Principal' then 3
    when p_department_name in ('Accounting', 'Registrar') then 4
    else 2
  end;

  select id into v_approval_id from public.clearance_approvals
  where clearance_request_id = v_req_id and department_id = v_dept_id
  limit 1;

  if v_approval_id is not null then
    update public.clearance_approvals set
      status = v_status,
      remarks = coalesce(p_remarks, remarks),
      approver_profile_id = coalesce(v_profile_id, approver_profile_id),
      approved_at = v_approved_at
    where id = v_approval_id;
  else
    insert into public.clearance_approvals (
      clearance_request_id,
      department_id,
      approver_profile_id,
      approval_order,
      status,
      remarks,
      approved_at
    ) values (
      v_req_id,
      v_dept_id,
      v_profile_id,
      v_order,
      v_status,
      p_remarks,
      v_approved_at
    ) returning id into v_approval_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'clearance_request_id', v_req_id,
    'approval_id', v_approval_id,
    'department', p_department_name,
    'status', v_status
  );
end;
$$;

grant execute on function public.approve_office_clearance(uuid, text, text, text) to authenticated, service_role;
