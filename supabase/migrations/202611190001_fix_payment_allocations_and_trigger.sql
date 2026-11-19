-- Migration: Fix payment_allocations schema and harden installment allocation trigger
-- Date: 2026-11-19
-- Description: Resolves "column student_installment_id of relation payment_allocations does not exist"
--              and adds exception-handling safeguards to allocate_payment_installments_fn().

-- 1. Ensure public.payment_allocations table exists
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  student_installment_id uuid references public.student_installments(id) on delete cascade,
  amount_applied numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- 2. Repair payment_allocations columns if table was created with older or missing column names
do $$
begin
  -- Check if student_installment_id column is missing
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_allocations'
      and column_name = 'student_installment_id'
  ) then
    -- If installment_id exists, rename it
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'payment_allocations'
        and column_name = 'installment_id'
    ) then
      alter table public.payment_allocations rename column installment_id to student_installment_id;
    else
      -- Otherwise add student_installment_id directly
      alter table public.payment_allocations
        add column student_installment_id uuid references public.student_installments(id) on delete cascade;
    end if;
  end if;

  -- Ensure payment_id column exists
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_allocations'
      and column_name = 'payment_id'
  ) then
    alter table public.payment_allocations
      add column payment_id uuid references public.payments(id) on delete cascade;
  end if;

  -- Ensure amount_applied column exists
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_allocations'
      and column_name = 'amount_applied'
  ) then
    alter table public.payment_allocations
      add column amount_applied numeric(12,2) not null default 0;
  end if;

  -- Ensure created_at column exists
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_allocations'
      and column_name = 'created_at'
  ) then
    alter table public.payment_allocations
      add column created_at timestamptz default now();
  end if;
end $$;

-- 3. Harden allocate_payment_installments_fn() with exception handling
--    Ensures that payment recording NEVER fails even if installment allocation encounters an issue.
create or replace function public.allocate_payment_installments_fn()
returns trigger as $$
declare
  r_inst record;
  v_remaining_amount numeric(12,2) := coalesce(new.amount, 0);
  v_allocated numeric(12,2);
  v_sy text := coalesce(new.school_year, '2026-2027');
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is null or old.status <> 'paid') then
    begin
      for r_inst in 
        select id, due_amount, coalesce(amount_paid, 0) as amount_paid 
        from public.student_installments 
        where student_id = new.student_id 
          and (school_year = v_sy or v_sy is null or school_year is null)
          and status <> 'paid'
        order by due_date asc, created_at asc
        for update
      loop
        exit when v_remaining_amount <= 0;

        v_allocated := least(v_remaining_amount, greatest(0, r_inst.due_amount - r_inst.amount_paid));
        if v_allocated <= 0 then
          continue;
        end if;

        -- Record allocation
        insert into public.payment_allocations (payment_id, student_installment_id, amount_applied)
        values (new.id, r_inst.id, v_allocated);

        -- Update installment totals
        update public.student_installments
        set amount_paid = coalesce(amount_paid, 0) + v_allocated,
            status = case when (coalesce(amount_paid, 0) + v_allocated) >= due_amount then 'paid' else 'partial' end
        where id = r_inst.id;

        v_remaining_amount := v_remaining_amount - v_allocated;
      end loop;
    exception when others then
      -- Log warning but do NOT abort the transaction, so the payment itself is safely saved and receipt issued
      raise warning 'allocate_payment_installments_fn failed safely: % (SQLSTATE %)', sqlerrm, sqlstate;
    end;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 4. Re-bind the trigger
drop trigger if exists allocate_payment_installments_trg on public.payments;
create trigger allocate_payment_installments_trg
after insert or update on public.payments
for each row execute function public.allocate_payment_installments_fn();

-- 5. Row Level Security policies for payment_allocations
alter table public.payment_allocations enable row level security;

drop policy if exists "public read allocations" on public.payment_allocations;
drop policy if exists "authenticated can read allocations" on public.payment_allocations;
create policy "public read allocations" on public.payment_allocations
  for select using (true);

drop policy if exists "admins can manage allocations" on public.payment_allocations;
create policy "admins can manage allocations" on public.payment_allocations
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );
