-- Clears test payment transactions, allocations, clearance requests, and student test records.
-- Run in Supabase SQL Editor to start with completely empty payment history and student balances.

truncate table
  notifications,
  clearance_certificate_requests,
  clearance_approvals,
  clearance_requests,
  payment_allocations,
  payments,
  payment_gateway_events,
  student_installments,
  student_assessments,
  student_vouchers,
  teacher_assignments,
  student_registration_requests,
  fee_structure_items,
  fee_structures,
  voucher_types,
  installment_templates,
  students
restart identity cascade;

-- Retains default configuration tables (sections, departments, fee structures, voucher types, and staff profiles).
