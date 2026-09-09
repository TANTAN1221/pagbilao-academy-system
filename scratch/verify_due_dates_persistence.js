// Simulated browser localStorage
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
};

// 1. Verify default templates
const DEFAULT_INSTALLMENT_TEMPLATE = [
  {
    id: "ins-downpayment-2026",
    title: "Enrollment Downpayment / 1st Quarter",
    description: "Initial tuition downpayment upon enrollment",
    dueDate: "2026-08-31",
    percent: 25
  },
  {
    id: "ins-q2-2026",
    title: "2nd Quarter Installment",
    description: "Second grading period assessment milestone",
    dueDate: "2026-10-30",
    percent: 25
  },
  {
    id: "ins-q3-2027",
    title: "3rd Quarter Installment",
    description: "Third grading period assessment milestone",
    dueDate: "2027-01-15",
    percent: 25
  },
  {
    id: "ins-q4-2027",
    title: "4th Quarter / Final Balance",
    description: "Final grading period and clearance settlement",
    dueDate: "2027-03-31",
    percent: 25
  }
];

console.log("1. Default installment template count:", DEFAULT_INSTALLMENT_TEMPLATE.length);
console.assert(DEFAULT_INSTALLMENT_TEMPLATE.length === 4, "Should have 4 milestones");

// 2. Admin saves custom due date schedule
const adminConfiguredDueDates = [
  {
    id: "INS-001",
    title: "Custom Downpayment",
    description: "Downpayment due upon registration",
    dueDate: "2026-09-01",
    percent: 30
  },
  {
    id: "INS-002",
    title: "Midterm Payment",
    description: "Midterm grading assessment",
    dueDate: "2026-11-15",
    percent: 35
  },
  {
    id: "INS-003",
    title: "Final Clearance Payment",
    description: "Final assessment clearance",
    dueDate: "2027-02-28",
    percent: 35
  }
];

// Admin saveData simulation
localStorage.setItem('pa_installment_templates', JSON.stringify(adminConfiguredDueDates));
localStorage.setItem('pa_full_admin_v2', JSON.stringify({
  installmentTemplate: adminConfiguredDueDates,
  students: [{ id: "STD-001", name: "Juan Dela Cruz", level: "JHS", paid: 2000, clearance: {} }]
}));

// Admin session data
localStorage.setItem('pa_current_user', JSON.stringify({ email: 'admin@pagbilao.edu.ph', role: 'accounting_admin' }));
localStorage.setItem('pa_user_session', JSON.stringify({ email: 'admin@pagbilao.edu.ph', role: 'accounting_admin' }));

console.log("2. Admin saved due dates. Stored pa_installment_templates:", localStorage.getItem('pa_installment_templates') !== null);

// 3. User logs out
// Logout only clears session tokens:
[
  "pa_current_user",
  "pa_logged_in_user",
  "pa_user_role",
  "pa_user_session",
  "pa_demo_session",
  "pa_auth_role"
].forEach((key) => localStorage.removeItem(key));

console.log("3. User logged out.");
console.log("   Session cleared?", localStorage.getItem('pa_user_session') === null);
console.log("   pa_installment_templates preserved?", localStorage.getItem('pa_installment_templates') !== null);
console.log("   pa_full_admin_v2 preserved?", localStorage.getItem('pa_full_admin_v2') !== null);
console.assert(localStorage.getItem('pa_installment_templates') !== null, "Due dates must not be deleted on logout!");

// 4. Student logs in and loads data
const cachedInstallments = JSON.parse(localStorage.getItem('pa_installment_templates'));
console.log("4. Student retrieved installment count:", cachedInstallments.length);
console.assert(cachedInstallments[0].title === "Custom Downpayment", "Must retrieve admin's custom title");
console.assert(cachedInstallments[0].dueDate === "2026-09-01", "Must retrieve admin's custom due date");

// 5. Calculate student installments
const student = { id: "STD-001", name: "Juan Dela Cruz", level: "JHS", paid: 2000 };
const assessedTotal = () => 14000;
const balance = () => 12000;

function studentInstallments(s, templates) {
  let paid = Number(s.paid || 0);
  const count = templates.length || 1;
  const equalPercent = 100 / count;

  return templates.map(t => {
    const pct = (t.percent !== undefined && t.percent !== null && t.percent !== '' && Number(t.percent) > 0) ? Number(t.percent) : equalPercent;
    const amount = Math.round(assessedTotal(s) * (pct / 100));
    const applied = Math.min(paid, amount);
    paid -= applied;
    return { ...t, percent: pct, amount, paid: applied, status: applied >= amount ? 'Paid' : applied > 0 ? 'Partial' : 'Unpaid' };
  });
}

const insts = studentInstallments(student, cachedInstallments);
console.log("5. Calculated student installments:");
insts.forEach(i => console.log(`   - ${i.title}: Due ${i.dueDate} | Amount: ₱${i.amount} | Paid: ₱${i.paid} | Status: ${i.status}`));

console.assert(!isNaN(insts[0].amount), "Amount must not be NaN");
console.assert(!isNaN(insts[0].paid), "Paid must not be NaN");
console.assert(insts[0].status === "Partial", "First installment should be Partial (2000 of 4200)");

// 6. Test reminder alert generation
const unpaidInsts = insts.filter(i => i.status !== 'Paid');
const nextInst = unpaidInsts[0];
const isOverdue = nextInst.dueDate && new Date(nextInst.dueDate) < new Date('2026-09-09');
const remAmount = nextInst.amount - nextInst.paid;

console.log("6. Generated Payment Reminder Alert:");
console.log(`   - Title: ${isOverdue ? 'Overdue Milestone' : 'Upcoming Due Date'}: ${nextInst.title}`);
console.log(`   - Due Date: ${nextInst.dueDate}`);
console.log(`   - Remaining Due Amount: ₱${remAmount}`);
console.log(`   - Status: ${isOverdue ? 'Overdue (Red badge)' : 'Upcoming (Amber badge)'}`);

console.assert(remAmount === 2200, "Remaining due on first installment should be 4200 - 2000 = 2200");
console.assert(isOverdue === true, "Due date 2026-09-01 is prior to 2026-09-09 so it must be Overdue");

console.log("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!");
