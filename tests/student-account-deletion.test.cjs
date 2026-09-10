const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const root = require('node:path').resolve(__dirname, '..');
const read = file => fs.readFileSync(require('node:path').join(root, file), 'utf8');

const studentDbId = '33333333-3333-4333-8333-333333333333';
const studentAuthId = '44444444-4444-4444-8444-444444444444';
const studentNumber = 'STU-2026-001';
const studentEmail = 'student.test@pagbilao.edu.ph';

function createMockSupabase(initialDb = {}) {
  const db = {
    students: initialDb.students ? [...initialDb.students] : [],
    student_registration_requests: initialDb.student_registration_requests ? [...initialDb.student_registration_requests] : [],
    profiles: initialDb.profiles ? [...initialDb.profiles] : [],
    student_vouchers: initialDb.student_vouchers ? [...initialDb.student_vouchers] : [],
    student_assessments: initialDb.student_assessments ? [...initialDb.student_assessments] : [],
    student_installments: initialDb.student_installments ? [...initialDb.student_installments] : [],
    payments: initialDb.payments ? [...initialDb.payments] : [],
    payment_allocations: initialDb.payment_allocations ? [...initialDb.payment_allocations] : [],
    clearance_requests: initialDb.clearance_requests ? [...initialDb.clearance_requests] : [],
    clearance_approvals: initialDb.clearance_approvals ? [...initialDb.clearance_approvals] : [],
    clearance_certificate_requests: initialDb.clearance_certificate_requests ? [...initialDb.clearance_certificate_requests] : [],
    fee_structures: initialDb.fee_structures ? [...initialDb.fee_structures] : [],
    fee_structure_items: initialDb.fee_structure_items ? [...initialDb.fee_structure_items] : [],
    voucher_types: initialDb.voucher_types ? [...initialDb.voucher_types] : [],
    installment_templates: initialDb.installment_templates ? [...initialDb.installment_templates] : [],
    staff_accounts: initialDb.staff_accounts ? [...initialDb.staff_accounts] : [],
    teacher_assignments: initialDb.teacher_assignments ? [...initialDb.teacher_assignments] : [],
    departments: initialDb.departments ? [...initialDb.departments] : []
  };

  const createQueryBuilder = (tableName) => {
    let filters = [];
    return {
      select: function () {
        return {
          in: function (col, vals) {
            const table = db[tableName] || [];
            const filtered = table.filter(row => vals.includes(row[col]));
            return Promise.resolve({ data: filtered, error: null });
          },
          then: function (resolve, reject) {
            return Promise.resolve({ data: db[tableName] || [], error: null }).then(resolve, reject);
          }
        };
      },
      delete: function () {
        const deleteHandler = {
          eq: function (col, val) {
            if (db[tableName]) {
              db[tableName] = db[tableName].filter(row => row[col] !== val);
            }
            return deleteHandler;
          },
          in: function (col, vals) {
            if (db[tableName]) {
              db[tableName] = db[tableName].filter(row => !vals.includes(row[col]));
            }
            return deleteHandler;
          },
          then: function (resolve, reject) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
        };
        return deleteHandler;
      }
    };
  };

  return {
    db,
    from: (tableName) => createQueryBuilder(tableName),
    auth: {
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: null })
    }
  };
}

function browser(client, initialStorage = {}) {
  const values = new Map(Object.entries(initialStorage));
  const context = {
    window: { supabase: { createClient: () => client } },
    navigator: {},
    console,
    localStorage: {
      getItem: k => values.get(k) || null,
      setItem: (k, v) => values.set(k, String(v)),
      removeItem: k => values.delete(k)
    }
  };
  vm.createContext(context);
  vm.runInContext(read('js/app-config.js'), context);
  return { context, storage: values };
}

test('all page scripts and shared API parse without syntax errors', () => {
  new vm.Script(read('js/app-config.js'));
  for (const file of ['index.html', 'admin-dashboard.html', 'student-dashboard.html', 'clearance-dashboard.html', 'certificate.html']) {
    for (const match of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: file });
    }
  }
});

test('deleteStudent cleans up localStorage pa_registered_users and pa_full_admin_v2', async () => {
  const initialRegistered = [
    { id: studentNumber, studentId: studentNumber, email: studentEmail, fullName: 'Student Test', role: 'student' },
    { id: 'STAFF-001', email: 'teacher@pagbilao.edu.ph', fullName: 'Teacher One', role: 'teacher_clearance_head' }
  ];
  const initialAdminData = {
    students: [
      { id: studentNumber, name: 'Student Test', email: studentEmail },
      { id: 'STU-2026-999', name: 'Other Student', email: 'other@pagbilao.edu.ph' }
    ]
  };

  const client = createMockSupabase();
  const { context, storage } = browser(client, {
    pa_registered_users: JSON.stringify(initialRegistered),
    pa_full_admin_v2: JSON.stringify(initialAdminData)
  });

  const res = await context.window.paApi.deleteStudent({ id: studentNumber, email: studentEmail });
  assert.equal(res.success, true);

  const updatedReg = JSON.parse(storage.get('pa_registered_users') || '[]');
  assert.equal(updatedReg.length, 1);
  assert.equal(updatedReg[0].email, 'teacher@pagbilao.edu.ph');

  const updatedAdmin = JSON.parse(storage.get('pa_full_admin_v2') || '{}');
  assert.equal(updatedAdmin.students.length, 1);
  assert.equal(updatedAdmin.students[0].id, 'STU-2026-999');
});

test('deleteStudent cleans up all associated database tables in Supabase', async () => {
  const initialDb = {
    students: [
      { id: studentDbId, auth_user_id: studentAuthId, student_number: studentNumber, email: studentEmail, first_name: 'Student', last_name: 'Test' },
      { id: '99999999-9999-9999-9999-999999999999', student_number: 'STU-KEEP', email: 'keep@pagbilao.edu.ph', first_name: 'Keep', last_name: 'Me' }
    ],
    student_registration_requests: [
      { id: '55555555-5555-5555-5555-555555555555', auth_user_id: studentAuthId, student_number: studentNumber, email: studentEmail }
    ],
    profiles: [
      { id: '66666666-6666-6666-6666-666666666666', auth_user_id: studentAuthId, email: studentEmail, role: 'student' },
      { id: '77777777-7777-7777-7777-777777777777', email: 'admin@pagbilao.edu.ph', role: 'super_admin' }
    ],
    student_vouchers: [
      { id: 'v-1', student_id: studentDbId, school_year: '2026-2027' }
    ],
    clearance_requests: [
      { id: 'cr-1', student_id: studentDbId, school_year: '2026-2027' }
    ],
    clearance_approvals: [
      { id: 'ca-1', clearance_request_id: 'cr-1', status: 'pending' }
    ],
    clearance_certificate_requests: [
      { id: 'cert-1', student_id: studentDbId, status: 'pending' }
    ],
    payments: [
      { id: 'pay-1', student_id: studentDbId, amount: 5000 }
    ],
    student_installments: [
      { id: 'inst-1', student_id: studentDbId, due_amount: 5000 }
    ]
  };

  const client = createMockSupabase(initialDb);
  const { context } = browser(client);

  await context.window.paApi.deleteStudent({ id: studentNumber, email: studentEmail });

  // Verify all records for the deleted student are removed from all DB tables
  assert.equal(client.db.students.length, 1);
  assert.equal(client.db.students[0].student_number, 'STU-KEEP');

  assert.equal(client.db.student_registration_requests.length, 0);
  assert.equal(client.db.student_vouchers.length, 0);
  assert.equal(client.db.clearance_requests.length, 0);
  assert.equal(client.db.clearance_approvals.length, 0);
  assert.equal(client.db.clearance_certificate_requests.length, 0);
  assert.equal(client.db.payments.length, 0);
  assert.equal(client.db.student_installments.length, 0);

  // Student profile is deleted, admin profile remains intact
  assert.equal(client.db.profiles.length, 1);
  assert.equal(client.db.profiles[0].role, 'super_admin');
});

test('deleted student does not reappear in fetchDatabaseState after admin logout and re-login', async () => {
  const initialDb = {
    students: [
      { id: studentDbId, auth_user_id: studentAuthId, student_number: studentNumber, email: studentEmail, first_name: 'Student', last_name: 'Test', school_year: '2026-2027' }
    ],
    student_registration_requests: [
      { id: '55555555-5555-5555-5555-555555555555', auth_user_id: studentAuthId, student_number: studentNumber, email: studentEmail, school_year: '2026-2027' }
    ],
    profiles: [
      { id: '66666666-6666-6666-6666-666666666666', auth_user_id: studentAuthId, email: studentEmail, role: 'student' }
    ]
  };

  const client = createMockSupabase(initialDb);
  const { context } = browser(client, {
    pa_registered_users: JSON.stringify([{ id: studentNumber, studentId: studentNumber, email: studentEmail, role: 'student' }])
  });

  // Verify student was initially present
  const initialState = await context.window.paApi.fetchDatabaseState();
  assert.equal(initialState.students.length, 1);
  assert.equal(initialState.students[0].student_number, studentNumber);

  // Admin deletes student
  await context.window.paApi.deleteStudent({ id: studentNumber, email: studentEmail });

  // Admin logs out and re-logs in (re-fetching dynamic database state)
  const newState = await context.window.paApi.fetchDatabaseState();
  assert.equal(newState.students.length, 0, 'Deleted student must not reappear after re-fetching database state');
});
