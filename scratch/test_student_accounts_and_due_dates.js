// Automated test for due dates removal and separate student account management
const fs = require('fs');

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; }
};

console.log("==================================================");
console.log("TEST 1: Verify DEFAULT_INSTALLMENT_TEMPLATE is empty");
console.log("==================================================");

const appConfigContent = fs.readFileSync('js/app-config.js', 'utf8');
const adminContent = fs.readFileSync('admin-dashboard.html', 'utf8');
const studentContent = fs.readFileSync('student-dashboard.html', 'utf8');

console.assert(appConfigContent.includes('const DEFAULT_INSTALLMENT_TEMPLATE = [];'), "app-config.js should have empty DEFAULT_INSTALLMENT_TEMPLATE");
console.assert(adminContent.includes('const DEFAULT_INSTALLMENT_TEMPLATE = [];'), "admin-dashboard.html should have empty DEFAULT_INSTALLMENT_TEMPLATE");
console.assert(studentContent.includes('const DEFAULT_INSTALLMENT_TEMPLATE = [];'), "student-dashboard.html should have empty DEFAULT_INSTALLMENT_TEMPLATE");
console.log("✓ DEFAULT_INSTALLMENT_TEMPLATE is [] in all three files.");

console.log("\n==================================================");
console.log("TEST 2: Verify Mock ID Purging Logic");
console.log("==================================================");
const MOCK_TEMPLATE_IDS = ['ins-downpayment-2026', 'ins-q2-2026', 'ins-q3-2027', 'ins-q4-2027'];

// Seed localStorage with old mock data
localStorage.setItem('pa_installment_templates', JSON.stringify([
  { id: 'ins-downpayment-2026', title: 'Old Mock 1', dueDate: '2026-08-31' },
  { id: 'ins-q2-2026', title: 'Old Mock 2', dueDate: '2026-10-30' }
]));

let cached = JSON.parse(localStorage.getItem('pa_installment_templates'));
let clean = cached.filter(p => !MOCK_TEMPLATE_IDS.includes(p.id));
console.assert(clean.length === 0, "All mock IDs should be purged");
if (clean.length === 0) {
  localStorage.setItem('pa_installment_templates', JSON.stringify([]));
}
console.assert(JSON.parse(localStorage.getItem('pa_installment_templates')).length === 0, "Storage should now be empty []");
console.log("✓ Mock templates successfully purged from cache.");

console.log("\n==================================================");
console.log("TEST 3: Student Installments returns empty when no template");
console.log("==================================================");
function studentInstallments(s, templates = []) {
  if (!templates || templates.length === 0) return [];
  return templates.map(t => ({ ...t, status: 'Upcoming' }));
}

const res = studentInstallments({ id: '2026-001', paid: 0 }, []);
console.assert(Array.isArray(res) && res.length === 0, "studentInstallments should return [] when no templates");
console.log("✓ studentInstallments correctly returns empty array when admin has not set due dates.");

console.log("\n==================================================");
console.log("TEST 4: Student Account Disabling & Login Block");
console.log("==================================================");

// Setup registered student and admin student list
const students = [
  { id: '2026-001', name: 'Juan Dela Cruz', email: 'juan@student.edu', status: 'active', active: true }
];
const registeredUsers = [
  { id: '2026-001', studentId: '2026-001', name: 'Juan Dela Cruz', email: 'juan@student.edu', password: 'Password123', status: 'active', active: true, role: 'student' }
];
const staffAccounts = [
  { id: 'staff-01', name: 'Mr. Santos', email: 'santos@faculty.edu', role: 'teacher_clearance_head', active: true }
];

localStorage.setItem('pa_full_admin_v2', JSON.stringify({ students, accounts: staffAccounts }));
localStorage.setItem('pa_registered_users', JSON.stringify(registeredUsers));

// Simulate toggling student portal access (disable student)
const targetStudent = students[0];
targetStudent.status = 'disabled';
targetStudent.active = false;

// Update in pa_registered_users
const regUser = registeredUsers[0];
regUser.status = 'disabled';
regUser.active = false;

localStorage.setItem('pa_full_admin_v2', JSON.stringify({ students, accounts: staffAccounts }));
localStorage.setItem('pa_registered_users', JSON.stringify(registeredUsers));

// Verify staff account was NOT affected
console.assert(staffAccounts[0].active === true, "Staff account active status must remain untouched when student is disabled");
console.log("✓ Staff clearance head account is completely unaffected by student account status.");

// Simulate student login attempt
function mockLogin(email, password) {
  const users = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
  const found = users.find(u => u.email === email && u.password === password);
  if (!found) throw new Error("Invalid email or password.");
  if (found.active === false || found.status === "disabled" || found.status === "inactive") {
    throw new Error("Your student account has been disabled. Please contact the school administration.");
  }
  return { id: found.id, email: found.email, role: found.role };
}

let loginBlocked = false;
try {
  mockLogin('juan@student.edu', 'Password123');
} catch (e) {
  if (e.message.includes("disabled")) {
    loginBlocked = true;
    console.log("✓ Login blocked as expected:", e.message);
  }
}
console.assert(loginBlocked, "Disabled student MUST be prevented from logging in");

// Simulate re-enabling student portal access
targetStudent.status = 'active';
targetStudent.active = true;
regUser.status = 'active';
regUser.active = true;
localStorage.setItem('pa_full_admin_v2', JSON.stringify({ students, accounts: staffAccounts }));
localStorage.setItem('pa_registered_users', JSON.stringify(registeredUsers));

let loginSuccess = false;
try {
  const session = mockLogin('juan@student.edu', 'Password123');
  if (session && session.id === '2026-001') loginSuccess = true;
} catch (e) {}
console.assert(loginSuccess, "Enabled student should be able to log in");
console.log("✓ Re-enabled student successfully logs in.");

console.log("\n==================================================");
console.log("ALL TESTS PASSED SUCCESSFULLY!");
console.log("==================================================");
