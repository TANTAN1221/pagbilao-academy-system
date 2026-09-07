-- Ensure missing columns exist on staff_accounts
alter table public.staff_accounts
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists scope_type text not null default 'all_students';

-- Ensure unique index exists on teacher_assignments for on conflict in save_school_account_links
create unique index if not exists teacher_assignments_unique_assignment
on public.teacher_assignments(teacher_profile_id, subject_name, grade_level, section_name, strand, school_year);

-- 1. Apply staff account persistence helper function and view
create or replace function public.save_school_account_links(
  p_auth_user_id uuid, p_full_name text, p_email text, p_role public.app_role,
  p_status text, p_school_year text, p_assignments jsonb, p_created_by uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_assignment jsonb;
  v_assignment_id uuid;
  v_keep_ids uuid[] := '{}';
  v_department text;
  v_scope text;
begin
  -- Serialize changes for one identity, including retries.
  perform 1 from auth.users where id = p_auth_user_id for update;
  if not found then raise exception 'Authentication account not found.'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'Invalid account status.'; end if;
  if p_role not in ('teacher_clearance_head','guidance_head','prefect_head',
    'librarian_head','principal','accounting_admin','registrar','super_admin') then
    raise exception 'A staff role is required.';
  end if;

  select id into v_profile_id from profiles where auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    -- Recover an unlinked legacy profile, never take ownership from another user.
    select id into v_profile_id from profiles
      where lower(email) = lower(p_email) and auth_user_id is null for update;
  end if;
  if v_profile_id is null then
    insert into profiles(auth_user_id, full_name, email, role, status, created_by)
    values(p_auth_user_id, p_full_name, p_email, p_role, p_status, p_created_by)
    returning id into v_profile_id;
  else
    update profiles set auth_user_id = p_auth_user_id, full_name = p_full_name,
      email = p_email, role = p_role, status = p_status, updated_at = now()
    where id = v_profile_id;
  end if;

  v_department := case p_role
    when 'teacher_clearance_head' then 'Teacher' when 'guidance_head' then 'Guidance'
    when 'prefect_head' then 'Prefect' when 'librarian_head' then 'Library'
    when 'principal' then 'Principal' when 'accounting_admin' then 'Accounting'
    when 'registrar' then 'Registrar' else 'Administration' end;
  v_scope := case p_role when 'teacher_clearance_head' then 'subject_section_multiple'
    when 'principal' then 'principal_level' when 'accounting_admin' then 'final_accounting'
    when 'registrar' then 'final_accounting' when 'super_admin' then 'system_wide'
    else 'all_students' end;

  update staff_accounts set auth_user_id = p_auth_user_id, profile_id = v_profile_id,
    full_name = p_full_name, email = p_email, role = p_role, department = v_department,
    scope_type = v_scope, status = p_status
  where auth_user_id = p_auth_user_id or profile_id = v_profile_id
    or (auth_user_id is null and lower(email) = lower(p_email));
  if not found then
    insert into staff_accounts(auth_user_id, profile_id, full_name, email, role, department, scope_type, status)
    values(p_auth_user_id, v_profile_id, p_full_name, p_email, p_role, v_department, v_scope, p_status);
  end if;

  -- Keep office/teacher department links consistent with the saved profile.
  update clearance_heads set status = 'inactive' where profile_id = v_profile_id;
  update clearance_heads set status = p_status, scope_type = v_scope, position_title = p_full_name
    where profile_id = v_profile_id and department_id = (select id from departments where name = v_department);
  if not found then
    insert into clearance_heads(profile_id, department_id, position_title, scope_type, status)
    select v_profile_id, id, p_full_name, v_scope, p_status from departments where name = v_department;
  end if;

  -- NULL means a status-only change: do not rewrite assignments.
  if p_assignments is not null then
    if jsonb_typeof(p_assignments) <> 'array' then raise exception 'Assignments must be an array.'; end if;
    if p_role = 'teacher_clearance_head' then
      for v_assignment in select value from jsonb_array_elements(p_assignments) loop
        if coalesce(v_assignment->>'grade_level','') = '' or coalesce(v_assignment->>'subject_name','') = '' then
          raise exception 'Each assignment requires a grade and subject.';
        end if;
        insert into teacher_assignments(teacher_profile_id, subject_name, education_level,
          grade_level, section_name, strand, school_year)
        values(v_profile_id, v_assignment->>'subject_name',
          case when v_assignment->>'grade_level' in ('Grade 11','Grade 12') then 'SHS' else 'JHS' end,
          v_assignment->>'grade_level', coalesce(nullif(v_assignment->>'section_name',''),'N/A'),
          coalesce(nullif(v_assignment->>'strand',''),'N/A'), p_school_year)
        on conflict (teacher_profile_id, subject_name, grade_level, section_name, strand, school_year)
        do update set education_level = excluded.education_level
        returning id into v_assignment_id;
        v_keep_ids := array_append(v_keep_ids, v_assignment_id);
      end loop;
    end if;

    -- Do not silently detach existing approvals when an assignment is removed.
    if exists(select 1 from teacher_assignments ta join clearance_approvals ca
      on ca.teacher_assignment_id = ta.id where ta.teacher_profile_id = v_profile_id
      and ta.school_year = p_school_year and not (ta.id = any(v_keep_ids))) then
      raise exception 'An assignment being removed has clearance records. Keep that assignment to preserve its approvals.';
    end if;
    delete from teacher_assignments where teacher_profile_id = v_profile_id
      and school_year = p_school_year and not (id = any(v_keep_ids));
  end if;
  return v_profile_id;
end;
$$;

revoke all on function public.save_school_account_links(uuid,text,text,public.app_role,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_school_account_links(uuid,text,text,public.app_role,text,text,jsonb,uuid) to service_role;

-- 2. Update student_assigned_teacher_clearance_heads view
create or replace view public.student_assigned_teacher_clearance_heads with (security_invoker = true) as
select
  s.id as student_id,
  s.student_number,
  concat(s.first_name, ' ', s.last_name) as student_name,
  s.education_level,
  s.grade_level,
  s.section_name,
  s.strand,
  p.id as teacher_profile_id,
  p.full_name as teacher_name,
  ta.id as teacher_assignment_id,
  coalesce(nullif(ta.subject_name, ''), subj.subject_name, 'Assigned Subject') as subject_name,
  ta.school_year
from students s
join teacher_assignments ta
  on ta.school_year = s.school_year
 and ta.grade_level = s.grade_level
 and (
      (s.education_level = 'JHS' and (ta.section_name = s.section_name or ta.section_name = 'N/A'))
      or
      (s.education_level = 'SHS'
        and (ta.section_name = s.section_name or ta.section_name = 'N/A')
        and (ta.strand = s.strand or ta.strand = 'N/A'))
 )
left join subjects subj on subj.id = ta.subject_id
join profiles p on p.id = ta.teacher_profile_id
where p.role = 'teacher_clearance_head'
  and p.status = 'active';

-- 3. Link and promote admin users in auth.users into profiles and staff_accounts
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role": "super_admin", "full_name": "Admin Accountant"}'::jsonb
where email = 'admin@pagbilao.edu.ph' or email ilike '%admin%';

insert into public.profiles (auth_user_id, full_name, email, role, status)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', 'Admin Accountant'),
  u.email,
  case
    when u.raw_user_meta_data->>'role' in ('super_admin', 'accounting_admin', 'registrar')
      then (u.raw_user_meta_data->>'role')::public.app_role
    when u.email ilike '%admin%' then 'super_admin'::public.app_role
    when u.email ilike '%accounting%' or u.email ilike '%accountant%' then 'accounting_admin'::public.app_role
    when u.email ilike '%registrar%' then 'registrar'::public.app_role
    else 'student'::public.app_role
  end,
  'active'
from auth.users u
where u.email ilike '%admin%' or u.email ilike '%accounting%' or u.email ilike '%accountant%' or u.email ilike '%registrar%'
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  role = excluded.role,
  status = 'active';

insert into public.staff_accounts (auth_user_id, profile_id, full_name, email, role, department, scope_type, status)
select
  p.auth_user_id,
  p.id,
  p.full_name,
  p.email,
  p.role,
  case
    when p.role in ('accounting_admin', 'super_admin') then 'Accounting'
    when p.role = 'registrar' then 'Registrar'
    else 'Administration'
  end,
  'system_wide',
  'active'
from public.profiles p
where p.role in ('super_admin', 'accounting_admin', 'registrar')
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  profile_id = excluded.profile_id,
  role = excluded.role,
  status = 'active';

-- Also insert profile for any non-admin users (e.g. students) if missing
insert into public.profiles (auth_user_id, full_name, email, role, status)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'role', '')::public.app_role, 'student'::public.app_role),
  'active'
from auth.users u
where not exists (select 1 from public.profiles p where p.email = u.email)
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  status = 'active';

-- 4. Automatically create/sync profiles on any future auth.users creations
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_name text;
begin
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name'),
    split_part(new.email, '@', 1)
  );

  if new.raw_user_meta_data->>'role' is not null and exists (
    select 1 from pg_enum where enumlabel = new.raw_user_meta_data->>'role' and enumtypid = 'public.app_role'::regtype
  ) then
    v_role := (new.raw_user_meta_data->>'role')::public.app_role;
  elsif new.email ilike '%admin%' then
    v_role := 'super_admin'::public.app_role;
  elsif new.email ilike '%accounting%' or new.email ilike '%accountant%' then
    v_role := 'accounting_admin'::public.app_role;
  elsif new.email ilike '%registrar%' then
    v_role := 'registrar'::public.app_role;
  else
    v_role := 'student'::public.app_role;
  end if;

  insert into public.profiles (auth_user_id, full_name, email, role, status)
  values (new.id, v_name, new.email, v_role, 'active')
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    status = 'active';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
