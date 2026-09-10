const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const root = require('node:path').resolve(__dirname, '..');
const read = file => fs.readFileSync(require('node:path').join(root, file), 'utf8');

function createMockSupabase(initialDb = {}) {
  const db = {
    fee_structures: initialDb.fee_structures ? [...initialDb.fee_structures] : [
      { id: 'fs-jhs-1', name: 'JHS Standard Fee Structure', education_level: 'JHS', school_year: '2026-2027', active: true },
      { id: 'fs-shs-1', name: 'SHS Standard Fee Structure', education_level: 'SHS', school_year: '2026-2027', active: true }
    ],
    fee_structure_items: initialDb.fee_structure_items ? [...initialDb.fee_structure_items] : [],
    voucher_types: initialDb.voucher_types ? [...initialDb.voucher_types] : [],
    installment_templates: initialDb.installment_templates ? [...initialDb.installment_templates] : [],
    profiles: initialDb.profiles ? [...initialDb.profiles] : [],
    staff_accounts: initialDb.staff_accounts ? [...initialDb.staff_accounts] : [],
    teacher_assignments: initialDb.teacher_assignments ? [...initialDb.teacher_assignments] : [],
    students: initialDb.students ? [...initialDb.students] : [],
    student_vouchers: initialDb.student_vouchers ? [...initialDb.student_vouchers] : [],
    payments: initialDb.payments ? [...initialDb.payments] : [],
    clearance_requests: initialDb.clearance_requests ? [...initialDb.clearance_requests] : [],
    clearance_approvals: initialDb.clearance_approvals ? [...initialDb.clearance_approvals] : [],
    clearance_certificate_requests: initialDb.clearance_certificate_requests ? [...initialDb.clearance_certificate_requests] : [],
    departments: initialDb.departments ? [...initialDb.departments] : [],
    student_registration_requests: initialDb.student_registration_requests ? [...initialDb.student_registration_requests] : []
  };

  return {
    _db: db,
    from: (table) => {
      let rows = db[table] || [];
      let filters = [];
      const builder = {
        select: (cols) => builder,
        eq: (col, val) => {
          filters.push(row => row[col] === val);
          return builder;
        },
        neq: (col, val) => {
          filters.push(row => row[col] !== val);
          return builder;
        },
        or: (condStr) => {
          return builder;
        },
        delete: () => {
          const toDelete = rows.filter(r => filters.every(f => f(r)));
          db[table] = db[table].filter(r => !toDelete.includes(r));
          return Promise.resolve({ error: null, data: toDelete });
        },
        insert: (data) => {
          const items = Array.isArray(data) ? data : [data];
          const inserted = items.map((item, idx) => ({ id: item.id || `gen-id-${Date.now()}-${idx}`, ...item }));
          db[table].push(...inserted);
          return Object.assign(Promise.resolve({ error: null, data: inserted }), {
            select: () => Object.assign(Promise.resolve({ error: null, data: inserted }), {
              maybeSingle: () => Promise.resolve({ error: null, data: inserted[0] || null })
            })
          });
        },
        then: (resolve, reject) => {
          let result = rows;
          if (filters.length > 0) {
            result = result.filter(r => filters.every(f => f(r)));
          }
          return resolve({ data: result, error: null });
        }
      };
      return builder;
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-auth-id', email: 'admin@pagbilao.edu.ph', user_metadata: { role: 'accounting_admin', full_name: 'Admin User' } } } }),
      signOut: async () => ({ error: null })
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
  return { context, values };
}

test('fee structures persist in localStorage and sync to Supabase across logout and re-login', async () => {
  const mockClient = createMockSupabase();
  const { context, values } = browser(mockClient);

  // 1. Initial database state should be empty fee structures
  const initialState = await context.window.paApi.fetchDatabaseState();
  assert.equal(initialState.feeStructures.JHS.length, 0);
  assert.equal(initialState.feeStructures.SHS.length, 0);

  // 2. Admin adds fee items
  const addedJHSFees = [
    { id: 'fee-jhs-tuition', name: 'Tuition Fee', amount: 15000, required: true },
    { id: 'fee-jhs-lab', name: 'Computer Laboratory Fee', amount: 2500, required: true }
  ];
  const addedSHSFees = [
    { id: 'fee-shs-tuition', name: 'Senior High Tuition Fee', amount: 18000, required: true }
  ];

  // Store in client appData / cache
  values.set('pa_app_fees_v2', JSON.stringify({ JHS: addedJHSFees, SHS: addedSHSFees }));
  values.set('pa_full_admin_v2', JSON.stringify({
    feeStructures: { JHS: addedJHSFees, SHS: addedSHSFees },
    students: [],
    vouchers: [],
    installmentTemplate: []
  }));

  // Sync to database
  const fsRows = mockClient._db.fee_structures;
  const jhsFs = fsRows.find(f => f.education_level === 'JHS');
  const shsFs = fsRows.find(f => f.education_level === 'SHS');

  mockClient._db.fee_structure_items.push(
    { id: 'fsi-1', fee_structure_id: jhsFs.id, fee_name: 'Tuition Fee', amount: 15000, required: true },
    { id: 'fsi-2', fee_structure_id: jhsFs.id, fee_name: 'Computer Laboratory Fee', amount: 2500, required: true },
    { id: 'fsi-3', fee_structure_id: shsFs.id, fee_name: 'Senior High Tuition Fee', amount: 18000, required: true }
  );

  // 3. Admin logs out
  await context.window.paApi.logout();

  // Verify that pa_app_fees_v2 and pa_full_admin_v2 were NOT deleted on logout
  assert.ok(values.has('pa_app_fees_v2'), 'pa_app_fees_v2 must survive logout');
  assert.ok(values.has('pa_full_admin_v2'), 'pa_full_admin_v2 must survive logout');

  // 4. Admin logs back in (fresh browser context with persisted storage)
  const reLogin = browser(mockClient, Object.fromEntries(values));
  const reloadedState = await reLogin.context.window.paApi.fetchDatabaseState();

  // 5. Verify fees are fully intact and structured correctly
  assert.equal(reloadedState.feeStructures.JHS.length, 2);
  assert.equal(reloadedState.feeStructures.JHS[0].name, 'Tuition Fee');
  assert.equal(reloadedState.feeStructures.JHS[0].amount, 15000);
  assert.equal(reloadedState.feeStructures.JHS[1].name, 'Computer Laboratory Fee');
  assert.equal(reloadedState.feeStructures.JHS[1].amount, 2500);

  assert.equal(reloadedState.feeStructures.SHS.length, 1);
  assert.equal(reloadedState.feeStructures.SHS[0].name, 'Senior High Tuition Fee');
  assert.equal(reloadedState.feeStructures.SHS[0].amount, 18000);
});

test('fee structures are restored from localStorage cache if database query returns empty', async () => {
  // Database with no fee structure items
  const emptyDbClient = createMockSupabase();
  const cachedFees = {
    JHS: [{ id: 'f-1', name: 'JHS Standard Tuition', amount: 14000, required: true }],
    SHS: [{ id: 'f-2', name: 'SHS Standard Tuition', amount: 17500, required: true }]
  };

  const { context } = browser(emptyDbClient, {
    pa_app_fees_v2: JSON.stringify(cachedFees)
  });

  const state = await context.window.paApi.fetchDatabaseState();
  assert.equal(state.feeStructures.JHS.length, 1);
  assert.equal(state.feeStructures.JHS[0].name, 'JHS Standard Tuition');
  assert.equal(state.feeStructures.JHS[0].amount, 14000);

  assert.equal(state.feeStructures.SHS.length, 1);
  assert.equal(state.feeStructures.SHS[0].name, 'SHS Standard Tuition');
  assert.equal(state.feeStructures.SHS[0].amount, 17500);
});
