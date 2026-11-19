const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadWebhookHandler({ env = {}, mockSupabase }) {
  let handler = null;
  let settleSource = read('supabase/functions/_shared/paymongo-settle.ts')
    .replace(/import\s*\{[^}]+\}\s*from\s*["']npm:@supabase\/supabase-js@2["'];?\s*/g, '')
    .replace(/export\s+(?=(?:async\s+)?function|interface|type)/g, '');
  let tsSource = read('supabase/functions/paymongo-webhook/index.ts')
    .replace(/import\s*\{[^}]+\}\s*from\s*["']npm:@supabase\/supabase-js@2["'];?\s*/g, '')
    .replace(/import\s*\{[^}]+\}\s*from\s*["']\.\.\/_shared\/cors\.ts["'];?\s*/g, '')
    .replace(/import\s*\{[^}]+\}\s*from\s*["']\.\.\/_shared\/paymongo-settle\.ts["'];?\s*/g, '');

  const jsSource = stripTypeScriptTypes(`${settleSource}\n${tsSource}`);
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  const context = {
    Deno: {
      env: { get: (k) => env[k] },
      serve: (fn) => { handler = fn; }
    },
    createClient: () => mockSupabase,
    corsHeaders,
    jsonResponse,
    crypto: crypto.webcrypto,
    TextEncoder,
    Response,
    Request,
    Uint8Array,
    console
  };

  vm.createContext(context);
  vm.runInContext(jsSource, context);
  assert.equal(typeof handler, 'function', 'Deno.serve handler should be registered');
  return handler;
}

function signPaymongoPayload(secret, timestamp, rawBody, mode = 'live') {
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return mode === 'live'
    ? `t=${timestamp},te=,li=${sig}`
    : `t=${timestamp},te=${sig},li=`;
}

function createWebhookMockDb({ students = [], payments = [], failSchoolYearInsert = false } = {}) {
  const db = {
    students: [...students],
    payments: [...payments],
    student_registration_requests: [],
    payment_gateway_events: []
  };
  const seenFilters = [];

  const client = {
    _db: db,
    _seenFilters: seenFilters,
    from: (table) => {
      const filters = [];
      const builder = {
        select: () => builder,
        eq: (col, val) => { filters.push((r) => r[col] === val); return builder; },
        ilike: (col, val) => { filters.push((r) => String(r[col] || '').toLowerCase() === String(val || '').toLowerCase()); return builder; },
        or: (expr) => {
          seenFilters.push({ table, expr });
          const clauses = String(expr).split(',').map((c) => {
            const [col, op, ...rest] = c.split('.');
            return { col, op, val: rest.join('.') };
          });
          filters.push((r) => clauses.some((cl) => cl.op === 'eq' && String(r[cl.col] ?? '') === cl.val));
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => {
          const matched = (db[table] || []).filter((r) => filters.every((f) => f(r)));
          return { data: matched[0] || null, error: null };
        },
        insert: (payload) => {
          const items = Array.isArray(payload) ? payload : [payload];
          if (table === 'payments' && failSchoolYearInsert && items.some((i) => 'school_year' in i)) {
            const err = { message: 'column "school_year" of relation "payments" does not exist' };
            return Object.assign(Promise.resolve({ data: null, error: err }), {
              select: () => ({ maybeSingle: async () => ({ data: null, error: err }) })
            });
          }
          const inserted = items.map((item, idx) => ({ id: item.id || `gen-${table}-${idx}`, ...item }));
          db[table].push(...inserted);
          return Object.assign(Promise.resolve({ data: inserted, error: null }), {
            select: () => ({ maybeSingle: async () => ({ data: inserted[0] || null, error: null }) })
          });
        },
        update: (patch) => {
          const updBuilder = {
            eq: async (col, val) => {
              (db[table] || []).forEach((r) => {
                if (r[col] === val) Object.assign(r, patch);
              });
              return { error: null };
            }
          };
          return updBuilder;
        }
      };
      return builder;
    }
  };
  return client;
}

test('paymongo-webhook accepts live-mode signatures (te=,li=...) and settles non-UUID student_number', async () => {
  const secret = 'whsk_test_live_secret_123';
  const mockDb = createWebhookMockDb({
    students: [
      { id: '11111111-1111-4111-8111-111111111111', student_number: 'STU-2026-001', email: 'juan@pagbilao.edu.ph' }
    ]
  });

  const handler = loadWebhookHandler({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      PAYMONGO_WEBHOOK_SECRET_KEY: secret
    },
    mockSupabase: mockDb
  });

  const eventPayload = {
    data: {
      id: 'evt_live_001',
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
          id: 'cs_live_123',
          type: 'checkout_session',
          attributes: {
            status: 'paid',
            metadata: {
              student_id: 'STU-2026-001',
              student_email: 'juan@pagbilao.edu.ph',
              school_year: '2026-2027'
            },
            payments: [
              {
                id: 'pay_live_999',
                attributes: {
                  status: 'paid',
                  amount: 550000,
                  source: { type: 'qrph' }
                }
              }
            ]
          }
        }
      }
    }
  };

  const rawBody = JSON.stringify(eventPayload);
  const sigHeader = signPaymongoPayload(secret, '1731500000', rawBody, 'live');
  const req = new Request('https://example.supabase.co/functions/v1/paymongo-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'paymongo-signature': sigHeader },
    body: rawBody
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.received, true);

  assert.equal(mockDb._db.payments.length, 1);
  assert.equal(mockDb._db.payments[0].student_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(mockDb._db.payments[0].amount, 5500);
  assert.equal(mockDb._db.payments[0].method, 'qrph');
  assert.equal(mockDb._db.payments[0].checkout_session_id, 'cs_live_123');
  assert.equal(mockDb._db.payments[0].status, 'paid');

  // Must not cast non-UUID student_number against UUID id column
  const invalidUuidOr = mockDb._seenFilters.find((f) => f.table === 'students' && f.expr.includes('id.eq.STU-2026-001'));
  assert.equal(invalidUuidOr, undefined);
});

test('paymongo-webhook accepts test-mode signatures and falls back if school_year column is absent', async () => {
  const secret = 'whsk_test_secret_456';
  const mockDb = createWebhookMockDb({
    students: [
      { id: '22222222-2222-4222-8222-222222222222', student_number: 'STU-2026-002', email: 'ana@pagbilao.edu.ph' }
    ],
    failSchoolYearInsert: true
  });

  const handler = loadWebhookHandler({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      PAYMONGO_WEBHOOK_SECRET_KEY: secret
    },
    mockSupabase: mockDb
  });

  const eventPayload = {
    data: {
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
          id: 'cs_test_456',
          type: 'checkout_session',
          attributes: {
            metadata: { student_id: 'STU-2026-002' },
            payments: [{ id: 'pay_test_1', attributes: { status: 'paid', amount: 250000, source: { type: 'gcash' } } }]
          }
        }
      }
    }
  };

  const rawBody = JSON.stringify(eventPayload);
  const sigHeader = signPaymongoPayload(secret, '1731500001', rawBody, 'test');
  const res = await handler(new Request('https://example.supabase.co/functions/v1/paymongo-webhook', {
    method: 'POST',
    headers: { 'paymongo-signature': sigHeader },
    body: rawBody
  }));

  assert.equal(res.status, 200);
  assert.equal(mockDb._db.payments.length, 1);
  assert.equal(mockDb._db.payments[0].amount, 2500);
  assert.equal('school_year' in mockDb._db.payments[0], false);
});

test('paymongo-webhook rejects invalid signature with 401', async () => {
  const handler = loadWebhookHandler({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      PAYMONGO_WEBHOOK_SECRET_KEY: 'whsk_real'
    },
    mockSupabase: createWebhookMockDb()
  });

  const res = await handler(new Request('https://example.supabase.co/functions/v1/paymongo-webhook', {
    method: 'POST',
    headers: { 'paymongo-signature': 't=1731500000,te=,li=deadbeef' },
    body: '{}'
  }));

  assert.equal(res.status, 401);
});

test('createCheckout surfaces detailed Edge Function / PayMongo errors and recordPayment handles missing school_year', async () => {
  const mockDb = createWebhookMockDb({
    students: [
      { id: '33333333-3333-4333-8333-333333333333', student_number: 'STU-2026-003', email: 'leo@pagbilao.edu.ph' }
    ],
    failSchoolYearInsert: true
  });

  const mockClient = {
    ...mockDb,
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: async () => ({
              error: 'PayMongo checkout creation failed',
              details: { errors: [{ detail: 'Payment method qrph is not enabled.' }] }
            })
          }
        }
      })
    }
  };

  const values = new Map();
  const context = {
    window: { supabase: { createClient: () => mockClient }, location: { origin: 'https://school.test', pathname: '/student-dashboard.html' } },
    navigator: {},
    console,
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) }
  };
  vm.createContext(context);
  vm.runInContext(read('js/app-config.js'), context);

  await assert.rejects(
    context.window.paApi.createCheckout({ amount: 10000 }),
    /Payment method qrph is not enabled\./
  );

  const rec = await context.window.paApi.recordPayment({
    studentId: 'STU-2026-003',
    amount: 1500,
    method: 'Cash',
    referenceNo: 'OR-1001'
  });
  assert.ok(rec);
  assert.equal(rec.amount, 1500);
});

test('student-dashboard caps payable checkout amount to net remaining balance and renders real payment status', () => {
  const html = read('student-dashboard.html');
  assert.match(html, /getPayableSelection\(/);
  assert.match(html, /Math\.min\(rawTotal,\s*bal\)/);
  assert.match(html, /statusBadge\(String\(p\.status \|\| 'paid'\)\.toLowerCase\(\)\)/);
  assert.doesNotMatch(html, /statusBadge\('paid'\)/);
  assert.match(html, /tryShowPendingPayMongoReceipt\(/);
  assert.match(html, /verifyCheckoutSession\(/);
});

test('createCheckout persists checkout_session_id and verifyCheckoutSession invokes verify action', async () => {
  const calls = [];
  const mockClient = {
    functions: {
      invoke: async (fn, opts) => {
        calls.push({ fn, body: opts.body });
        if (opts.body.action === 'verify') {
          return { data: { verified: true, paid: true, checkout_session_id: opts.body.checkout_session_id, amount: 1500 }, error: null };
        }
        return { data: { checkout_session_id: 'cs_test_saved_1', checkout_url: 'https://checkout.paymongo.test/cs_test_saved_1' }, error: null };
      }
    }
  };

  const values = new Map([['pa_pending_payment', JSON.stringify({ amount: 1500, feeBreakdown: ['Tuition Fee'] })]]);
  const context = {
    window: {
      supabase: { createClient: () => mockClient },
      location: { origin: 'https://school.test', pathname: '/student-dashboard.html', href: '' }
    },
    navigator: {},
    console,
    sessionStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) },
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) }
  };
  vm.createContext(context);
  vm.runInContext(read('js/app-config.js'), context);

  await context.window.paApi.createCheckout({ amount: 150000 });
  const pending = JSON.parse(values.get('pa_pending_payment'));
  assert.equal(pending.checkout_session_id, 'cs_test_saved_1');
  assert.equal(context.window.location.href, 'https://checkout.paymongo.test/cs_test_saved_1');

  const verified = await context.window.paApi.verifyCheckoutSession('cs_test_saved_1');
  assert.equal(verified.paid, true);
  assert.equal(calls[1].body.action, 'verify');
});

test('payment_allocations schema migration exists and guards against missing student_installment_id', () => {
  const mig = read('supabase/migrations/202611190001_fix_payment_allocations_and_trigger.sql');
  assert.match(mig, /alter table public\.payment_allocations/i);
  assert.match(mig, /student_installment_id/);
  assert.match(mig, /allocate_payment_installments_fn/);
  assert.match(mig, /exception\s+when\s+others\s+then/i);

  const schema = read('supabase/schema.sql');
  assert.match(schema, /student_installment_id uuid references student_installments/);
  assert.match(schema, /exception\s+when\s+others\s+then/i);
});


