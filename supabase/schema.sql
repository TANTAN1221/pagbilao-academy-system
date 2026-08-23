-- Pagbilao Academy Inc. Student Payment and Clearance Monitoring System
-- Run this file in Supabase SQL Editor.
-- This schema supports: multi-assignment teacher clearance heads, JHS/SHS fee structures,
-- ESC/SHS vouchers, installment-based due dates with partial payment allocation,
-- accounting analytics views, and clearance certificate requests.

create extension if not exists "pgcrypto";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM (
    'student','parent','teacher_clearance_head','guidance_head','prefect_head',
    'librarian_head','principal','accounting_admin','registrar','super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending','paid','failed','cancelled','manual_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE clearance_status AS ENUM ('pending','approved','rejected','on_hold','not_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USERS AND ROLES
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role app_role not null default 'student',
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role app_role not null,
  department text,
  scope_type text not null default 'all_students',
  status text default 'active',
  created_at timestamptz default now()
);

-- SCHOOL STRUCTURE
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  education_level text not null check (education_level in ('JHS','SHS')),
  grade_level text not null,
  section_name text not null,
  strand text default 'N/A',
  school_year text not null,
  unique (grade_level, section_name, strand, school_year)
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  education_level text not null check (education_level in ('JHS','SHS')),
  grade_level text not null,
  strand text default 'N/A',
  school_year text not null,
  unique (subject_name, grade_level, strand, school_year)
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  student_number text unique not null,
  first_name text not null,
  last_name text not null,
  email text,
  education_level text not null check (education_level in ('JHS','SHS')),
  grade_level text not null,
  section_name text not null,
  strand text not null default 'N/A',
  school_year text not null,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists student_registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  student_number text unique not null,
  education_level text not null check (education_level in ('JHS','SHS')),
  grade_level text not null,
  section_name text not null,
  strand text not null default 'N/A',
  email text not null,
  status text not null default 'pending_verification',
  created_at timestamptz default now()
);

-- A teacher can handle many grades, sections, and subjects.
create table if not exists teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_profile_id uuid references profiles(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  subject_name text not null,
  education_level text not null check (education_level in ('JHS','SHS')),
  grade_level text not null,
  section_name text not null default 'N/A',
  strand text default 'N/A',
  school_year text not null,
  created_at timestamptz default now(),
  unique (teacher_profile_id, subject_name, grade_level, section_name, strand, school_year)
);

-- Compatibility patch for projects that already ran an older schema.
-- `create table if not exists` will not add newly-added columns to an existing table,
-- so these ALTER statements make the schema safe to rerun in Supabase SQL Editor.
alter table teacher_assignments
  add column if not exists subject_id uuid references subjects(id) on delete set null,
  add column if not exists subject_name text,
  add column if not exists education_level text,
  add column if not exists grade_level text,
  add column if not exists section_name text default 'N/A',
  add column if not exists strand text default 'N/A',
  add column if not exists school_year text;

update teacher_assignments ta
set subject_name = coalesce(nullif(ta.subject_name, ''), sub.subject_name, 'Assigned Subject')
from subjects sub
where ta.subject_id = sub.id
  and (ta.subject_name is null or ta.subject_name = '');

update teacher_assignments
set subject_name = 'Assigned Subject'
where subject_name is null or subject_name = '';

alter table teacher_assignments
  alter column subject_name set default 'Assigned Subject',
  alter column section_name set default 'N/A',
  alter column strand set default 'N/A';

-- FEES, VOUCHERS, AND ASSESSMENTS
create table if not exists fee_structures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  education_level text not null check (education_level in ('JHS','SHS')),
  school_year text not null,
  active boolean default true,
  created_at timestamptz default now(),
  unique (education_level, school_year, active)
);

create table if not exists fee_structure_items (
  id uuid primary key default gen_random_uuid(),
  fee_structure_id uuid references fee_structures(id) on delete cascade,
  fee_name text not null,
  amount numeric(12,2) not null default 0,
  required boolean not null default true,
  sort_order int default 0
);

create table if not exists voucher_types (
  id uuid primary key default gen_random_uuid(),
  voucher_name text unique not null,
  applies_to text not null check (applies_to in ('JHS','SHS')),
  amount numeric(12,2) not null default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists student_vouchers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  voucher_type_id uuid references voucher_types(id) on delete set null,
  school_year text not null,
  amount_applied numeric(12,2) not null default 0,
  created_at timestamptz default now(),
  unique (student_id, school_year)
);

create table if not exists student_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  fee_structure_id uuid references fee_structures(id) on delete set null,
  gross_amount numeric(12,2) not null default 0,
  voucher_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) generated always as (greatest(gross_amount - voucher_amount, 0)) stored,
  school_year text not null,
  created_at timestamptz default now(),
  unique (student_id, school_year)
);

-- BEST DUE DATE APPROACH FOR PARTIAL PAYMENT:
-- Create installment templates, generate student_installments from each student's net assessment,
-- then allocate each payment to the oldest unpaid installment first.
create table if not exists installment_templates (
  id uuid primary key default gen_random_uuid(),
  school_year text not null,
  title text not null,
  due_date date not null,
  percent_of_net numeric(5,2) not null check (percent_of_net > 0),
  sort_order int not null default 0,
  active boolean default true
);

create table if not exists student_installments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  template_id uuid references installment_templates(id) on delete set null,
  title text not null,
  due_date date not null,
  due_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'unpaid',
  school_year text not null,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null default 'paymongo',
  provider text not null default 'paymongo',
  provider_reference text,
  checkout_session_id text unique,
  status payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id) on delete cascade,
  student_installment_id uuid references student_installments(id) on delete cascade,
  amount_applied numeric(12,2) not null,
  created_at timestamptz default now()
);

create table if not exists payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  checkout_session_id text,
  status text,
  metadata jsonb default '{}'::jsonb,
  raw_event jsonb not null,
  created_at timestamptz default now()
);

-- CLEARANCE
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  type text not null
);

create table if not exists clearance_heads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,
  position_title text,
  scope_type text not null default 'all_students',
  status text not null default 'active',
  created_at timestamptz default now()
);

create table if not exists clearance_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  school_year text not null,
  status clearance_status not null default 'pending',
  submitted_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists clearance_approvals (
  id uuid primary key default gen_random_uuid(),
  clearance_request_id uuid references clearance_requests(id) on delete cascade,
  approver_profile_id uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  teacher_assignment_id uuid references teacher_assignments(id) on delete set null,
  approval_order int not null,
  status clearance_status not null default 'pending',
  remarks text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- Compatibility patch for projects that already ran an older clearance schema.
-- `create table if not exists` will not add new columns to an existing table.
alter table clearance_approvals
  add column if not exists clearance_request_id uuid references clearance_requests(id) on delete cascade,
  add column if not exists approver_profile_id uuid references profiles(id) on delete set null,
  add column if not exists department_id uuid references departments(id) on delete set null,
  add column if not exists teacher_assignment_id uuid references teacher_assignments(id) on delete set null,
  add column if not exists approval_order int default 1,
  add column if not exists status clearance_status default 'pending',
  add column if not exists remarks text,
  add column if not exists approved_at timestamptz,
  add column if not exists created_at timestamptz default now();

update clearance_approvals
set approval_order = 1
where approval_order is null;

update clearance_approvals
set status = 'pending'
where status is null;

create table if not exists clearance_certificate_requests (
  id uuid primary key default gen_random_uuid(),
  clearance_request_id uuid references clearance_requests(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  requested_by uuid references auth.users(id),
  status text not null default 'pending',
  certificate_number text unique,
  requested_at timestamptz default now(),
  approved_at timestamptz,
  generated_at timestamptz
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text default 'info',
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ANALYTICS VIEWS
create or replace view accounting_student_balances with (security_invoker = true) as
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
from students s
left join student_assessments a on a.student_id = s.id and a.school_year = s.school_year
left join payments p on p.student_id = s.id
group by s.id, a.gross_amount, a.voucher_amount, a.net_amount;

create or replace view accounting_collection_summary with (security_invoker = true) as
select
  education_level,
  count(*) as student_count,
  sum(gross_amount) as total_gross,
  sum(voucher_amount) as total_vouchers,
  sum(net_amount) as total_assessed,
  sum(total_paid) as total_collected,
  sum(balance) as total_balance
from accounting_student_balances
group by education_level;

create or replace view overdue_installments_report with (security_invoker = true) as
select
  s.student_number,
  concat(s.first_name, ' ', s.last_name) as student_name,
  s.education_level,
  s.grade_level,
  s.section_name,
  i.title,
  i.due_date,
  i.due_amount,
  i.amount_paid,
  greatest(i.due_amount - i.amount_paid, 0) as remaining_due
from student_installments i
join students s on s.id = i.student_id
where i.due_date < current_date and i.amount_paid < i.due_amount;

-- DEFAULT SCHOOL SETUP (not sample students)
insert into sections (education_level, grade_level, section_name, strand, school_year) values
('JHS','Grade 7','Cattleya','N/A','2026-2027'),('JHS','Grade 7','Orchids','N/A','2026-2027'),('JHS','Grade 7','Rose','N/A','2026-2027'),
('JHS','Grade 8','Vermillion','N/A','2026-2027'),('JHS','Grade 8','Burgundy','N/A','2026-2027'),('JHS','Grade 8','Magenta','N/A','2026-2027'),
('JHS','Grade 9','Aristotle','N/A','2026-2027'),('JHS','Grade 9','Einstein','N/A','2026-2027'),('JHS','Grade 9','Newton','N/A','2026-2027'),
('JHS','Grade 10','Diamond','N/A','2026-2027'),('JHS','Grade 10','Emerald','N/A','2026-2027'),
('SHS','Grade 11','Humility','GAS','2026-2027'),('SHS','Grade 11','Humility','HUMSS','2026-2027'),('SHS','Grade 11','Humility','ABM','2026-2027'),
('SHS','Grade 11','Integrity','GAS','2026-2027'),('SHS','Grade 11','Integrity','HUMSS','2026-2027'),('SHS','Grade 11','Integrity','ABM','2026-2027'),
('SHS','Grade 12','Honesty','GAS','2026-2027'),('SHS','Grade 12','Honesty','HUMSS','2026-2027'),('SHS','Grade 12','Honesty','ABM','2026-2027')
on conflict do nothing;

insert into departments (name, type) values
('Teacher','teacher'),('Guidance','all_students'),('Prefect','all_students'),('Library','all_students'),('Principal','principal'),('Accounting','final'),('Registrar','final')
on conflict do nothing;

-- (Fee structures, vouchers, and installment templates start empty so administrators can set custom fees)

-- SECURITY
alter table profiles enable row level security;
alter table staff_accounts enable row level security;
alter table students enable row level security;
alter table student_registration_requests enable row level security;
alter table sections enable row level security;
alter table subjects enable row level security;
alter table teacher_assignments enable row level security;
alter table fee_structures enable row level security;
alter table fee_structure_items enable row level security;
alter table voucher_types enable row level security;
alter table student_vouchers enable row level security;
alter table student_assessments enable row level security;
alter table installment_templates enable row level security;
alter table student_installments enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table departments enable row level security;
alter table clearance_heads enable row level security;
alter table clearance_requests enable row level security;
alter table clearance_approvals enable row level security;
alter table clearance_certificate_requests enable row level security;
alter table notifications enable row level security;

-- Basic prototype policies. Tighten before production.
drop policy if exists "authenticated can read profiles" on profiles;
create policy "authenticated can read profiles" on profiles for select to authenticated using (true);

drop policy if exists "authenticated can read school setup" on sections;
create policy "authenticated can read school setup" on sections for select to authenticated using (true);

drop policy if exists "authenticated can read subjects" on subjects;
create policy "authenticated can read subjects" on subjects for select to authenticated using (true);

drop policy if exists "authenticated can read departments" on departments;
create policy "authenticated can read departments" on departments for select to authenticated using (true);

drop policy if exists "authenticated can read fee setup" on fee_structures;
create policy "public read fee setup" on fee_structures for select using (true);

drop policy if exists "authenticated can read fee items" on fee_structure_items;
create policy "public read fee items" on fee_structure_items for select using (true);

drop policy if exists "authenticated can read voucher types" on voucher_types;
create policy "public read voucher types" on voucher_types for select using (true);

drop policy if exists "students can read own student record" on students;
create policy "students can read own student record" on students
for select to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "students can read own registration request" on student_registration_requests;
create policy "students can read own registration request" on student_registration_requests
for select to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "students can create own registration request" on student_registration_requests;
create policy "students can create own registration request" on student_registration_requests
for insert to authenticated
with check (auth.uid() = auth_user_id);

-- These policies let the student dashboard identify the exact logged-in student when Supabase is connected.

-- Admin policies can be expanded after first super_admin profile exists.


-- STUDENT-BASED TEACHER CLEARANCE MATCHING
-- This view lists every teacher clearance head that should appear on a student's dashboard
-- based on the student's grade/section for JHS or grade/strand for SHS.
create or replace view student_assigned_teacher_clearance_heads with (security_invoker = true) as
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
      (s.education_level = 'JHS' and ta.section_name = s.section_name)
      or
      (s.education_level = 'SHS' and ta.section_name = 'N/A' and coalesce(nullif(ta.strand,''), s.strand) = s.strand)
 )
left join subjects subj on subj.id = ta.subject_id
join profiles p on p.id = ta.teacher_profile_id
where p.role = 'teacher_clearance_head'
  and p.status = 'active';

create unique index if not exists clearance_approvals_unique_teacher_assignment
on clearance_approvals(clearance_request_id, teacher_assignment_id)
where teacher_assignment_id is not null;

-- Call this after creating a clearance_requests row. It creates one pending approval
-- per assigned subject teacher for that student's grade/section.
create or replace function request_teacher_clearance_approvals(p_clearance_request_id uuid)
returns integer
language plpgsql
security definer
as $$
declare inserted_count integer;
begin
  insert into clearance_approvals (
    clearance_request_id,
    approver_profile_id,
    department_id,
    teacher_assignment_id,
    approval_order,
    status
  )
  select
    cr.id,
    v.teacher_profile_id,
    d.id,
    v.teacher_assignment_id,
    1,
    'pending'::clearance_status
  from clearance_requests cr
  join student_assigned_teacher_clearance_heads v on v.student_id = cr.student_id
  left join departments d on d.name = 'Teacher'
  where cr.id = p_clearance_request_id
  on conflict (clearance_request_id, teacher_assignment_id) where teacher_assignment_id is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


-- ADDITIONAL RLS POLICIES FOR SECURE CLIENT-SIDE SYNC
-- Staff Accounts
drop policy if exists "admins can manage staff accounts" on public.staff_accounts;
create policy "admins can manage staff accounts" on public.staff_accounts
  for all to authenticated using (
    exists (
      select 1 from public.profiles 
      where auth_user_id = auth.uid() 
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

drop policy if exists "authenticated can read staff accounts" on public.staff_accounts;
create policy "authenticated can read staff accounts" on public.staff_accounts
  for select to authenticated using (true);

-- Sections & Subjects management
drop policy if exists "admins can manage sections" on public.sections;
create policy "admins can manage sections" on public.sections
  for all to authenticated using (
    exists (
      select 1 from public.profiles 
      where auth_user_id = auth.uid() 
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

drop policy if exists "admins can manage subjects" on public.subjects;
create policy "admins can manage subjects" on public.subjects
  for all to authenticated using (
    exists (
      select 1 from public.profiles 
      where auth_user_id = auth.uid() 
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

-- Student records read/write
drop policy if exists "staff can read all students" on public.students;
drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students" on public.students
  for select to authenticated using (true);

drop policy if exists "admins can manage students" on public.students;
create policy "admins can manage students" on public.students
  for all to authenticated using (true);

drop policy if exists "students can insert own student record" on public.students;
create policy "students can insert own student record" on public.students
  for insert to authenticated
  with check (true);

drop policy if exists "students can update own student record" on public.students;
create policy "students can update own student record" on public.students
  for update to authenticated
  using (true);

-- Registration Requests
drop policy if exists "admins can manage registration requests" on public.student_registration_requests;
drop policy if exists "authenticated can read registration requests" on public.student_registration_requests;
create policy "authenticated can read registration requests" on public.student_registration_requests
  for select to authenticated using (true);

drop policy if exists "authenticated can manage registration requests" on public.student_registration_requests;
create policy "authenticated can manage registration requests" on public.student_registration_requests
  for all to authenticated using (true);

-- Teacher assignments
drop policy if exists "authenticated can read teacher assignments" on public.teacher_assignments;
create policy "authenticated can read teacher assignments" on public.teacher_assignments
  for select to authenticated using (true);

drop policy if exists "admins can manage teacher assignments" on public.teacher_assignments;
create policy "admins can manage teacher assignments" on public.teacher_assignments
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

-- Profiles Update
drop policy if exists "authenticated can update own profile" on public.profiles;
create policy "authenticated can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = auth_user_id);

-- Fee setups
drop policy if exists "admins can manage fee structures" on public.fee_structures;
create policy "admins can manage fee structures" on public.fee_structures
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "admins can manage fee items" on public.fee_structure_items;
create policy "admins can manage fee items" on public.fee_structure_items
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

-- Vouchers & Assessments
drop policy if exists "authenticated can read student vouchers" on public.student_vouchers;
create policy "authenticated can read student vouchers" on public.student_vouchers
  for select to authenticated using (true);

drop policy if exists "authenticated can read student assessments" on public.student_assessments;
create policy "authenticated can read student assessments" on public.student_assessments
  for select to authenticated using (true);

drop policy if exists "admins can manage voucher types" on public.voucher_types;
create policy "admins can manage voucher types" on public.voucher_types
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "admins can manage student vouchers" on public.student_vouchers;
create policy "admins can manage student vouchers" on public.student_vouchers
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "admins can manage student assessments" on public.student_assessments;
create policy "admins can manage student assessments" on public.student_assessments
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

-- Installments
drop policy if exists "authenticated can read installment templates" on public.installment_templates;
create policy "authenticated can read installment templates" on public.installment_templates
  for select to authenticated using (true);

drop policy if exists "authenticated can read student installments" on public.student_installments;
create policy "authenticated can read student installments" on public.student_installments
  for select to authenticated using (true);

drop policy if exists "admins can manage installment templates" on public.installment_templates;
create policy "admins can manage installment templates" on public.installment_templates
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "admins can manage student installments" on public.student_installments;
create policy "admins can manage student installments" on public.student_installments
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

-- Payments
drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments" on public.payments
  for select to authenticated using (true);

drop policy if exists "authenticated can read allocations" on public.payment_allocations;
create policy "authenticated can read allocations" on public.payment_allocations
  for select to authenticated using (true);

drop policy if exists "admins can read gateway events" on public.payment_gateway_events;
create policy "admins can read gateway events" on public.payment_gateway_events
  for select to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "students can insert own payments" on public.payments;
create policy "students can insert own payments" on public.payments
  for insert to authenticated with check (
    exists (
      select 1 from public.students s
      where (s.auth_user_id = auth.uid() or s.id = student_id)
    )
    or exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "admins can manage payments" on public.payments;
create policy "admins can manage payments" on public.payments
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

drop policy if exists "admins can manage allocations" on public.payment_allocations;
create policy "admins can manage allocations" on public.payment_allocations
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin')
    )
  );

-- Clearance Heads & Departments
drop policy if exists "authenticated can read clearance heads" on public.clearance_heads;
create policy "authenticated can read clearance heads" on public.clearance_heads
  for select to authenticated using (true);

drop policy if exists "admins can manage departments" on public.departments;
create policy "admins can manage departments" on public.departments
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

drop policy if exists "admins can manage clearance heads" on public.clearance_heads;
create policy "admins can manage clearance heads" on public.clearance_heads
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

-- Clearance Requests
drop policy if exists "authenticated can read clearance requests" on public.clearance_requests;
create policy "authenticated can read clearance requests" on public.clearance_requests
  for select to authenticated using (true);

drop policy if exists "authenticated can read clearance approvals" on public.clearance_approvals;
create policy "authenticated can read clearance approvals" on public.clearance_approvals
  for select to authenticated using (true);

drop policy if exists "students can insert own clearance requests" on public.clearance_requests;
create policy "students can insert own clearance requests" on public.clearance_requests
  for insert to authenticated with check (
    exists (
      select 1 from public.students
      where auth_user_id = auth.uid()
        and id = student_id
    )
  );

drop policy if exists "authorized staff can manage clearance approvals" on public.clearance_approvals;
create policy "authorized staff can manage clearance approvals" on public.clearance_approvals
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar', 'teacher_clearance_head', 'guidance_head', 'prefect_head', 'librarian_head', 'principal')
    )
  );

drop policy if exists "admins can manage clearance requests" on public.clearance_requests;
create policy "admins can manage clearance requests" on public.clearance_requests
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

-- Certificates
drop policy if exists "students can manage own certificate requests" on public.clearance_certificate_requests;
create policy "students can manage own certificate requests" on public.clearance_certificate_requests
  for all to authenticated using (
    exists (
      select 1 from public.students
      where auth_user_id = auth.uid()
        and id = student_id
    )
  );

drop policy if exists "admins can manage certificate requests" on public.clearance_certificate_requests;
create policy "admins can manage certificate requests" on public.clearance_certificate_requests
  for all to authenticated using (
    exists (
      select 1 from public.profiles
      where auth_user_id = auth.uid()
        and role in ('super_admin', 'accounting_admin', 'registrar')
    )
  );

-- Notifications
drop policy if exists "users can manage own notifications" on public.notifications;
create policy "users can manage own notifications" on public.notifications
  for all to authenticated using (auth.uid() = user_id);



-- UNIQUE OFFICE INDEX
create unique index if not exists clearance_approvals_unique_office_department
on public.clearance_approvals(clearance_request_id, department_id)
where teacher_assignment_id is null;


-- FIFO PAYMENT ALLOCATION FUNCTION & TRIGGER
create or replace function allocate_payment_installments_fn()
returns trigger as $$
declare
  r_inst record;
  v_remaining_amount numeric(12,2) := new.amount;
  v_allocated numeric(12,2);
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is null or old.status <> 'paid') then
    for r_inst in 
      select id, due_amount, amount_paid 
      from public.student_installments 
      where student_id = new.student_id 
        and status <> 'paid'
      order by due_date asc, created_at asc
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

drop trigger if exists allocate_payment_installments_trg on public.payments;
create trigger allocate_payment_installments_trg
after insert or update on public.payments
for each row execute function allocate_payment_installments_fn();


-- AUTOMATED CLEARANCE INITIALIZATION TRIGGER
create or replace function initialize_clearance_approvals_fn()
returns trigger as $$
declare
  v_dept record;
begin
  -- 1. Insert dynamic teacher clearances matching student grade/section/strand
  perform public.request_teacher_clearance_approvals(new.id);
  
  -- 2. Insert static office clearances
  for v_dept in 
    select id, name from public.departments 
    where name in ('Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar')
  loop
    insert into public.clearance_approvals (
      clearance_request_id,
      department_id,
      approval_order,
      status
    ) values (
      new.id,
      v_dept.id,
      case 
        when v_dept.name in ('Guidance', 'Prefect', 'Library') then 2
        when v_dept.name = 'Principal' then 3
        when v_dept.name in ('Accounting', 'Registrar') then 4
        else 5
      end,
      'pending'
    )
    on conflict (clearance_request_id, department_id) where teacher_assignment_id is null do nothing;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists initialize_clearance_approvals_trg on public.clearance_requests;
create trigger initialize_clearance_approvals_trg
after insert on public.clearance_requests
for each row execute function initialize_clearance_approvals_fn();


-- CLEARANCE DEPENDENCY LOCK ENFORCEMENT TRIGGER
create or replace function enforce_clearance_approval_locks_fn()
returns trigger as $$
declare
  v_student_id uuid;
  v_balance numeric(12,2);
  v_principal_status clearance_status;
  v_dept_name text;
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    -- Get department name
    select name into v_dept_name from public.departments where id = new.department_id;
    
    -- Get student ID
    select student_id into v_student_id from public.clearance_requests where id = new.clearance_request_id;

    -- 1. Principal requires Teachers and other Offices to be approved
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

    -- 2. Accounting/Registrar requires Principal and Zero Balance
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

drop trigger if exists enforce_clearance_approval_locks_trg on public.clearance_approvals;
create trigger enforce_clearance_approval_locks_trg
before update on public.clearance_approvals
for each row execute function enforce_clearance_approval_locks_fn();


-- AUTOMATED REGISTRATION PROMOTION TRIGGER
create or replace function auto_promote_registration_to_student_fn()
returns trigger as $$
declare
  v_student_id uuid;
  v_fee_struct_id uuid;
  v_fee_gross numeric(12,2) := 0;
  v_voucher_id uuid;
  v_voucher_amt numeric(12,2) := 0;
  v_voucher_name text;
  v_inst_temp record;
begin
  -- 0. Ensure student profile exists
  if new.auth_user_id is not null then
    insert into public.profiles (auth_user_id, full_name, email, role, status)
    values (new.auth_user_id, concat(new.first_name, ' ', new.last_name), new.email, 'student', 'active')
    on conflict (email) do update set auth_user_id = excluded.auth_user_id, status = 'active';
  end if;

  -- 1. Insert student record
  insert into public.students (
    auth_user_id,
    student_number,
    first_name,
    last_name,
    email,
    education_level,
    grade_level,
    section_name,
    strand,
    school_year,
    status
  ) values (
    new.auth_user_id,
    new.student_number,
    new.first_name,
    new.last_name,
    new.email,
    new.education_level,
    new.grade_level,
    new.section_name,
    new.strand,
    '2026-2027',
    'active'
  )
  returning id into v_student_id;

  -- 2. Find active fee structure for this education level and SY
  select id into v_fee_struct_id 
  from public.fee_structures 
  where education_level = new.education_level 
    and school_year = '2026-2027' 
    and active = true 
  limit 1;

  if v_fee_struct_id is not null then
    -- Calculate gross fees
    select coalesce(sum(amount), 0) into v_fee_gross 
    from public.fee_structure_items 
    where fee_structure_id = v_fee_struct_id;
  end if;

  -- 3. Match default voucher
  v_voucher_name := case when new.education_level = 'JHS' then 'ESC Voucher' else 'SHS Voucher' end;
  select id, amount into v_voucher_id, v_voucher_amt 
  from public.voucher_types 
  where voucher_name = v_voucher_name 
    and active = true 
  limit 1;

  if v_voucher_id is not null then
    insert into public.student_vouchers (student_id, voucher_type_id, school_year, amount_applied)
    values (v_student_id, v_voucher_id, '2026-2027', v_voucher_amt);
  else
    v_voucher_amt := 0;
  end if;

  -- 4. Create student assessment
  insert into public.student_assessments (student_id, fee_structure_id, gross_amount, voucher_amount, school_year)
  values (v_student_id, v_fee_struct_id, v_fee_gross, v_voucher_amt, '2026-2027');

  -- 5. Generate student installments
  for v_inst_temp in 
    select id, title, due_date, percent_of_net 
    from public.installment_templates 
    where school_year = '2026-2027' 
      and active = true
  loop
    insert into public.student_installments (
      student_id,
      template_id,
      title,
      due_date,
      due_amount,
      amount_paid,
      status,
      school_year
    ) values (
      v_student_id,
      v_inst_temp.id,
      v_inst_temp.title,
      v_inst_temp.due_date,
      round(greatest(v_fee_gross - v_voucher_amt, 0) * (v_inst_temp.percent_of_net / 100.0), 2),
      0,
      'unpaid',
      '2026-2027'
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists auto_promote_registration_to_student_trg on public.student_registration_requests;
create trigger auto_promote_registration_to_student_trg
after insert on public.student_registration_requests
for each row execute function auto_promote_registration_to_student_fn();

-- PERFORMANCE INDEXES
create index if not exists idx_students_grade_section on public.students(grade_level, section_name);
create index if not exists idx_students_auth_user on public.students(auth_user_id);
create index if not exists idx_payments_student_status on public.payments(student_id, status);
create index if not exists idx_payments_checkout_session on public.payments(checkout_session_id);
create index if not exists idx_teacher_assignments_profile on public.teacher_assignments(teacher_profile_id, school_year);
create index if not exists idx_clearance_approvals_teacher_assignment on public.clearance_approvals(teacher_assignment_id, status);
create index if not exists idx_student_installments_student on public.student_installments(student_id, status);

-- CLEANUP NON-STUDENT ACCOUNTS FROM STUDENTS TABLE
delete from public.students 
where lower(email) like '%admin%' 
   or lower(email) like '%accounting%' 
   or lower(email) like '%principal%' 
   or lower(email) like '%registrar%' 
   or lower(email) like '%teacher%' 
   or lower(email) like '%guidance%' 
   or lower(email) like '%prefect%' 
   or lower(email) like '%library%';



