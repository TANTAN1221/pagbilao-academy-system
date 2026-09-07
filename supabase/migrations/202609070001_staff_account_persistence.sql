-- Apply once before deploying the updated create-school-account function.
-- Only the Edge Function's service role may call this atomic persistence helper.
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

-- Match the section/strand choices offered by the assignment form, including
-- explicit SHS sections and the form's N/A (all sections/strands) choices.
create or replace view public.student_assigned_teacher_clearance_heads with (security_invoker = true) as
select s.id as student_id, s.student_number,
  concat(s.first_name, ' ', s.last_name) as student_name,
  s.education_level, s.grade_level, s.section_name, s.strand,
  p.id as teacher_profile_id, p.full_name as teacher_name,
  ta.id as teacher_assignment_id,
  coalesce(nullif(ta.subject_name, ''), subj.subject_name, 'Assigned Subject') as subject_name,
  ta.school_year
from public.students s
join public.teacher_assignments ta on ta.school_year = s.school_year
  and ta.grade_level = s.grade_level
  and (ta.section_name = 'N/A' or ta.section_name = s.section_name)
  and (s.education_level = 'JHS' or coalesce(nullif(ta.strand, ''), 'N/A') = 'N/A' or ta.strand = s.strand)
left join public.subjects subj on subj.id = ta.subject_id
join public.profiles p on p.id = ta.teacher_profile_id
where p.role = 'teacher_clearance_head' and p.status = 'active';
