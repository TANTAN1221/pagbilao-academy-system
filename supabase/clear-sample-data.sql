-- Clears public app data created while testing the prototype.
-- This does NOT delete Supabase Auth users from Authentication > Users.
-- Run only if you want to start with empty school records.

truncate table
  notifications,
  clearance_certificate_requests,
  clearance_approvals,
  clearance_requests,
  clearance_heads,
  payment_allocations,
  payments,
  payment_gateway_events,
  student_installments,
  student_assessments,
  student_vouchers,
  teacher_assignments,
  student_registration_requests,
  students,
  staff_accounts,
  profiles,
  fee_structure_items,
  fee_structures,
  subjects
restart identity cascade;

-- Keep default setup tables such as sections, departments, voucher_types, and installment_templates.
