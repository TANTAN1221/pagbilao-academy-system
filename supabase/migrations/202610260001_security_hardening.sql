-- Security hardening migration.
-- Safe to re-run. Review in a staging project before applying to production.

-- Helper: is the caller a finance/registrar admin?
create or replace function public.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'accounting_admin', 'registrar')
  );
$$;
grant execute on function public.is_school_admin() to authenticated;

-- 1. Prevent role escalation through self-service profile updates.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / SQL editor calls have no auth.uid(); allow them.
  if auth.uid() is null or public.is_school_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Changing role or auth_user_id is not permitted';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

drop policy if exists "admins can delete profiles" on public.profiles;
create policy "admins can delete profiles" on public.profiles
  for delete to authenticated using (public.is_school_admin());

-- 2. Admin-only management of fee, voucher, assessment and installment setup.
drop policy if exists "admins can manage fee structures" on public.fee_structures;
create policy "admins can manage fee structures" on public.fee_structures
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage fee items" on public.fee_structure_items;
create policy "admins can manage fee items" on public.fee_structure_items
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage voucher types" on public.voucher_types;
create policy "admins can manage voucher types" on public.voucher_types
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage student vouchers" on public.student_vouchers;
create policy "admins can manage student vouchers" on public.student_vouchers
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage student assessments" on public.student_assessments;
create policy "admins can manage student assessments" on public.student_assessments
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage installment templates" on public.installment_templates;
create policy "admins can manage installment templates" on public.installment_templates
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "admins can manage student installments" on public.student_installments;
create policy "admins can manage student installments" on public.student_installments
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

-- 3. Students: only admins manage all students; a student may update only their own row.
drop policy if exists "admins can manage students" on public.students;
create policy "admins can manage students" on public.students
  for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists "students can update own student record" on public.students;
create policy "students can update own student record" on public.students
  for update to authenticated
  using (
    auth_user_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    auth_user_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- 4. Payments: non-admins may only insert non-paid (pending) rows.
--    Paid settlement comes from the signed PayMongo webhook (service role) or admins.
drop policy if exists "students can insert own payments" on public.payments;
create policy "students can insert own payments" on public.payments
  for insert to authenticated with check (
    lower(coalesce(status::text, '')) in ('pending', 'created')
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.auth_user_id = auth.uid()
    )
  );

-- 5. Gateway events contain raw provider payloads: enable RLS (policy already exists).
alter table public.payment_gateway_events enable row level security;
