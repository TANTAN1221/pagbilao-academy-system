-- Payment school-year scoping and allocation hardening migration.
-- Run AFTER schema.sql and prior migrations.
-- Safe to re-run.

-- 1. Ensure school_year column exists on payments
alter table public.payments
  add column if not exists school_year text default '2026-2027';

-- 2. Update accounting_student_balances view to scope payments to the student's active assessment school year
create or replace view public.accounting_student_balances with (security_invoker = true) as
select
  s.id as student_id,
  s.student_number,
  concat(s.first_name, ' ', s.last_name) as student_name,
  s.education_level,
  s.grade_level,
  s.section_name,
  s.strand,
  coalesce(a.gross_amount, 0) as gross_amount,
  coalesce(a.voucher_amount, 0) as voucher_amount,
  coalesce(a.net_amount, 0) as net_amount,
  coalesce(sum(case when p.status = 'paid' then p.amount else 0 end), 0) as total_paid,
  greatest(coalesce(a.net_amount, 0) - coalesce(sum(case when p.status = 'paid' then p.amount else 0 end), 0), 0) as balance
from public.students s
left join public.student_assessments a on a.student_id = s.id and a.school_year = s.school_year
left join public.payments p on p.student_id = s.id and (p.school_year is null or p.school_year = s.school_year)
group by s.id, a.gross_amount, a.voucher_amount, a.net_amount;

-- 3. Update payment installment allocation trigger to respect school_year boundaries and lock rows
create or replace function public.allocate_payment_installments_fn()
returns trigger as $$
declare
  r_inst record;
  v_remaining_amount numeric(12,2) := new.amount;
  v_allocated numeric(12,2);
  v_sy text := coalesce(new.school_year, '2026-2027');
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is null or old.status <> 'paid') then
    for r_inst in 
      select id, due_amount, amount_paid 
      from public.student_installments 
      where student_id = new.student_id 
        and (school_year = v_sy or v_sy is null)
        and status <> 'paid'
      order by due_date asc, created_at asc
      for update
    loop
      exit when v_remaining_amount <= 0;

      v_allocated := least(v_remaining_amount, r_inst.due_amount - r_inst.amount_paid);

      -- Record allocation
      insert into public.payment_allocations (payment_id, student_installment_id, amount_applied)
      values (new.id, r_inst.id, v_allocated);

      -- Update installment totals
      update public.student_installments
      set amount_paid = amount_paid + v_allocated,
          status = case when (amount_paid + v_allocated) >= due_amount then 'paid' else 'partial' end
      where id = r_inst.id;

      v_remaining_amount := v_remaining_amount - v_allocated;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;
