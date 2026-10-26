-- Clearance & certificate authorization migration.
-- Run AFTER schema.sql and earlier migrations (including 202610260001_security_hardening.sql).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles
  where auth_user_id = auth.uid()
    and coalesce(status, 'active') = 'active'
  limit 1;
$$;

-- Which office department a clearance-head role is responsible for.
create or replace function public.department_for_role(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'guidance_head'  then 'Guidance'
    when 'prefect_head'   then 'Prefect'
    when 'librarian_head' then 'Library'
    when 'principal'      then 'Principal'
    when 'accounting_admin' then 'Accounting'
    when 'registrar'      then 'Registrar'
    else null
  end;
$$;

-- May the caller act on a given approval row (department / teacher assignment)?
create or replace function public.can_act_on_clearance_approval(
  p_department_id uuid,
  p_teacher_assignment_id uuid
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.current_app_role();
  v_profile uuid := public.current_profile_id();
  v_dept text;
begin
  if v_role is null then return false; end if;
  if v_role in ('super_admin', 'accounting_admin', 'registrar') then return true; end if;

  if p_teacher_assignment_id is not null then
    return exists (
      select 1 from public.teacher_assignments ta
      where ta.id = p_teacher_assignment_id and ta.teacher_profile_id = v_profile
    );
  end if;

  select name into v_dept from public.departments where id = p_department_id;
  if v_dept is null then return false; end if;

  if public.department_for_role(v_role) = v_dept then return true; end if;

  -- Explicit clearance-head assignment for this department.
  return exists (
    select 1 from public.clearance_heads ch
    where ch.profile_id = v_profile and ch.department_id = p_department_id
      and coalesce(ch.status, 'active') = 'active'
  );
end;
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.can_act_on_clearance_approval(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clearance approvals: scope writes to the responsible approver
-- ---------------------------------------------------------------------------
drop policy if exists "authorized staff can manage clearance approvals" on public.clearance_approvals;
drop policy if exists "approvers can update own clearance approvals" on public.clearance_approvals;
drop policy if exists "approvers can insert own clearance approvals" on public.clearance_approvals;
drop policy if exists "admins can delete clearance approvals" on public.clearance_approvals;

create policy "approvers can update own clearance approvals" on public.clearance_approvals
  for update to authenticated
  using (public.can_act_on_clearance_approval(department_id, teacher_assignment_id))
  with check (public.can_act_on_clearance_approval(department_id, teacher_assignment_id));

create policy "approvers can insert own clearance approvals" on public.clearance_approvals
  for insert to authenticated
  with check (public.can_act_on_clearance_approval(department_id, teacher_assignment_id));

create policy "admins can delete clearance approvals" on public.clearance_approvals
  for delete to authenticated using (public.is_school_admin());

-- ---------------------------------------------------------------------------
-- Workflow locks: enforced on INSERT and UPDATE, no free-text "override" bypass
-- ---------------------------------------------------------------------------
create or replace function public.enforce_clearance_approval_locks_fn()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid;
  v_balance numeric(12,2);
  v_principal_status clearance_status;
  v_dept_name text;
  v_role text;
  v_was_approved boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was_approved := (old.status = 'approved');
  end if;

  if new.status <> 'approved' or v_was_approved then
    return new;
  end if;

  -- Service-role / SQL editor (no JWT) and authenticated school admins may override.
  if auth.uid() is null then return new; end if;
  v_role := public.current_app_role();
  if v_role in ('super_admin', 'accounting_admin', 'registrar') then
    return new;
  end if;

  select name into v_dept_name from public.departments where id = new.department_id;
  select student_id into v_student_id from public.clearance_requests where id = new.clearance_request_id;

  if v_dept_name = 'Principal' then
    if exists (
      select 1 from public.clearance_approvals ca
      left join public.departments d on d.id = ca.department_id
      where ca.clearance_request_id = new.clearance_request_id
        and (ca.teacher_assignment_id is not null or d.name in ('Teacher', 'Guidance', 'Prefect', 'Library'))
        and ca.status <> 'approved'
    ) then
      raise exception 'Principal clearance is locked: teacher and office (Guidance, Prefect, Library) approvals are not complete.';
    end if;
  end if;

  if v_dept_name in ('Accounting', 'Registrar') then
    select ca.status into v_principal_status
    from public.clearance_approvals ca
    join public.departments d on d.id = ca.department_id
    where ca.clearance_request_id = new.clearance_request_id and d.name = 'Principal'
    limit 1;

    if v_principal_status is distinct from 'approved' then
      raise exception 'Final clearance is locked: Principal has not approved.';
    end if;

    select balance into v_balance from public.accounting_student_balances where student_id = v_student_id;
    if coalesce(v_balance, 0) > 0 then
      raise exception 'Final clearance is locked: student has an outstanding balance of PHP %', round(v_balance);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_clearance_approval_locks_trg on public.clearance_approvals;
create trigger enforce_clearance_approval_locks_trg
  before insert or update on public.clearance_approvals
  for each row execute function public.enforce_clearance_approval_locks_fn();

-- ---------------------------------------------------------------------------
-- approve_office_clearance RPC: add caller authorization; fix missing column
-- (clearance_requests has submitted_at, not created_at).
-- ---------------------------------------------------------------------------
create or replace function public.approve_office_clearance(
  p_student_id uuid,
  p_department_name text,
  p_status text default 'approved',
  p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req_id uuid;
  v_dept_id uuid;
  v_profile_id uuid := public.current_profile_id();
  v_approval_id uuid;
  v_order int;
  v_status clearance_status := p_status::clearance_status;
  v_approved_at timestamptz := case when p_status = 'approved' then now() else null end;
begin
  select id into v_dept_id from public.departments
  where lower(name) = lower(p_department_name) limit 1;
  if v_dept_id is null then
    raise exception 'Department "%" not found.', p_department_name;
  end if;

  if not public.can_act_on_clearance_approval(v_dept_id, null) then
    raise exception 'Not authorized to update % clearance.', p_department_name using errcode = '42501';
  end if;

  select id into v_req_id from public.clearance_requests
  where student_id = p_student_id
  order by submitted_at desc nulls last
  limit 1;

  if v_req_id is null then
    insert into public.clearance_requests (student_id, school_year, status)
    values (p_student_id, '2026-2027', 'pending')
    returning id into v_req_id;
  end if;

  v_order := case
    when p_department_name = 'Principal' then 3
    when p_department_name in ('Accounting', 'Registrar') then 4
    else 2
  end;

  select id into v_approval_id from public.clearance_approvals
  where clearance_request_id = v_req_id and department_id = v_dept_id
  limit 1;

  -- The lock trigger still runs for these writes.
  if v_approval_id is not null then
    update public.clearance_approvals set
      status = v_status,
      remarks = coalesce(p_remarks, remarks),
      approver_profile_id = coalesce(v_profile_id, approver_profile_id),
      approved_at = v_approved_at
    where id = v_approval_id;
  else
    insert into public.clearance_approvals (
      clearance_request_id, department_id, approver_profile_id,
      approval_order, status, remarks, approved_at
    ) values (
      v_req_id, v_dept_id, v_profile_id, v_order, v_status, p_remarks, v_approved_at
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

revoke execute on function public.approve_office_clearance(uuid, text, text, text) from public, anon;
grant execute on function public.approve_office_clearance(uuid, text, text, text) to authenticated, service_role;

-- One clearance request per student per school year (only if data allows).
do $$
begin
  if not exists (
    select 1 from public.clearance_requests
    group by student_id, school_year having count(*) > 1
  ) then
    create unique index if not exists clearance_requests_student_year_uniq
      on public.clearance_requests(student_id, school_year);
  else
    raise notice 'Duplicate clearance_requests exist; unique (student_id, school_year) index not created. Clean them up and re-run.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Certificates: issued only by the server after an eligibility check
-- ---------------------------------------------------------------------------
create or replace function public.clearance_is_complete(p_clearance_request_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_student uuid;
  v_balance numeric(12,2);
begin
  select student_id into v_student from public.clearance_requests where id = p_clearance_request_id;
  if v_student is null then return false; end if;

  -- Every required office must have an approved row.
  if exists (
    select 1 from public.departments d
    where d.name in ('Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar')
      and not exists (
        select 1 from public.clearance_approvals ca
        where ca.clearance_request_id = p_clearance_request_id
          and ca.department_id = d.id and ca.status = 'approved'
      )
  ) then
    return false;
  end if;

  -- No outstanding (non-approved) teacher or other approvals.
  if exists (
    select 1 from public.clearance_approvals ca
    where ca.clearance_request_id = p_clearance_request_id
      and ca.status not in ('approved', 'not_required')
  ) then
    return false;
  end if;

  select balance into v_balance from public.accounting_student_balances where student_id = v_student;
  return coalesce(v_balance, 0) <= 0;
end;
$$;
grant execute on function public.clearance_is_complete(uuid) to authenticated;

create or replace function public.issue_clearance_certificate_fn()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Keep student/request linkage consistent.
  if new.clearance_request_id is not null then
    select student_id into new.student_id from public.clearance_requests where id = new.clearance_request_id;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved' then
    new.certificate_number := old.certificate_number;  -- immutable once issued
    return new;
  end if;

  if public.clearance_is_complete(new.clearance_request_id) then
    new.status := 'approved';
    new.approved_at := coalesce(new.approved_at, now());
    new.certificate_number := coalesce(
      new.certificate_number,
      'PAC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    );
  else
    if new.status = 'approved' then
      raise exception 'Certificate cannot be issued: clearance is not complete or a balance remains.';
    end if;
    new.status := 'pending';
    new.certificate_number := null;
  end if;
  return new;
end;
$$;

drop trigger if exists issue_clearance_certificate_trg on public.clearance_certificate_requests;
create trigger issue_clearance_certificate_trg
  before insert or update on public.clearance_certificate_requests
  for each row execute function public.issue_clearance_certificate_fn();

drop policy if exists "students can manage own certificate requests" on public.clearance_certificate_requests;
drop policy if exists "students can read own certificate requests" on public.clearance_certificate_requests;
drop policy if exists "students can request own certificate" on public.clearance_certificate_requests;

create policy "students can read own certificate requests" on public.clearance_certificate_requests
  for select to authenticated using (
    exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
  );

-- Students may only create a request; the trigger decides whether it is issued.
create policy "students can request own certificate" on public.clearance_certificate_requests
  for insert to authenticated with check (
    exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
  );

drop policy if exists "staff can read certificate requests" on public.clearance_certificate_requests;
create policy "staff can read certificate requests" on public.clearance_certificate_requests
  for select to authenticated using (public.current_app_role() is not null and public.current_app_role() <> 'student');

-- Public verification by opaque certificate number (minimal disclosure).
create or replace function public.verify_clearance_certificate(p_certificate_number text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'valid', true,
      'certificate_number', c.certificate_number,
      'student_name', trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')),
      'school_year', cr.school_year,
      'issued_at', c.approved_at
    )
    from public.clearance_certificate_requests c
    join public.students s on s.id = c.student_id
    left join public.clearance_requests cr on cr.id = c.clearance_request_id
    where c.certificate_number = upper(trim(p_certificate_number))
      and c.status = 'approved'
    limit 1
  ), jsonb_build_object('valid', false));
$$;
grant execute on function public.verify_clearance_certificate(text) to anon, authenticated;
