const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { stripTypeScriptTypes } = require('node:module');

const root = require('node:path').resolve(__dirname, '..');
const read = file => fs.readFileSync(require('node:path').join(root, file), 'utf8');
const profileId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const teacher = { id: profileId, auth_user_id: userId, full_name: 'Teacher', email: 'teacher@example.test', role: 'teacher_clearance_head', status: 'active' };

function browser(client) {
  const values = new Map();
  const context = {
    window: { supabase: { createClient: () => client } }, navigator: {}, console,
    localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
  };
  vm.createContext(context);
  vm.runInContext(read('js/app-config.js'), context);
  return context;
}

function loadFunction(file, name, context) {
  const source = read(file);
  const offset = source.indexOf('function ' + name + '(');
  assert.ok(offset >= 0);
  // All selected functions end at the next same-level function declaration.
  const start = source.lastIndexOf('\n', offset) + 1;
  const indent = source.slice(start, offset).replace('async ', '');
  const rest = source.slice(start);
  const next = new RegExp('\n' + indent + '(?:async )?function ').exec(rest.slice(rest.indexOf('{') + 1));
  const end = next ? rest.indexOf('{') + 1 + next.index : rest.indexOf('</script>');
  vm.runInContext(rest.slice(0, end), context);
}

test('all page scripts and shared API parse', () => {
  new vm.Script(read('js/app-config.js'));
  for (const file of ['index.html', 'admin-dashboard.html', 'student-dashboard.html', 'clearance-dashboard.html', 'certificate.html']) {
    for (const match of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: file });
    }
  }
});

test('failed staff creation never falls back to signUp or a local success', async () => {
  let signups = 0;
  const context = browser({
    functions: { invoke: async () => ({ error: { message: 'Function failed', context: { json: async () => ({ error: 'Assignment save failed' }) } } }) },
    auth: { signUp: async () => { signups++; } }
  });
  await assert.rejects(context.window.paApi.createSchoolAccount({}), /Assignment save failed/);
  assert.equal(signups, 0);
});

test('partial success without permanent IDs is rejected', async () => {
  const context = browser({ functions: { invoke: async () => ({ data: { success: true } }) } });
  await assert.rejects(context.window.paApi.createSchoolAccount({}), /not saved completely/);
});

test('fresh browser reload reconstructs teacher identity and assignments from database', async () => {
  const rows = {
    profiles: [teacher], staff_accounts: [{ profile_id: profileId, department: 'Teacher' }],
    teacher_assignments: [
      { id: 'assignment-1', teacher_profile_id: profileId, grade_level: 'Grade 7', section_name: 'Cattleya', strand: 'N/A', subject_name: 'English', school_year: '2026-2027' },
      { id: 'old-assignment', teacher_profile_id: profileId, grade_level: 'Grade 8', school_year: '2025-2026' }
    ]
  };
  const context = browser({ from: table => ({ select: async () => ({ data: rows[table] || [] }) }) });
  const state = await context.window.paApi.fetchDatabaseState();
  assert.equal(state.accounts[0].id, profileId);
  assert.equal(state.accounts[0].authUserId, userId);
  assert.equal(state.accounts[0].assignments.length, 1);
  assert.equal(state.accounts[0].assignments[0].subject, 'English');
  assert.equal(state.accounts[0].assignments[0].id, 'assignment-1');
});

test('all dashboard account merges prefer persisted identity and assignment removals', () => {
  for (const file of ['admin-dashboard.html', 'student-dashboard.html', 'clearance-dashboard.html']) {
    const context = vm.createContext({});
    loadFunction(file, 'mergeAccountsState', context);
    const merged = context.mergeAccountsState(
      [{ id: 'ACC-local', email: teacher.email, assignments: [{ subject: 'Old' }], active: true }],
      [{ id: profileId, email: teacher.email, assignments: [], active: false }]
    );
    assert.equal(merged[0].id, profileId, file);
    assert.equal(merged[0].assignments.length, 0, file);
    assert.equal(merged[0].active, false, file);
  }
});

test('admin saves use permanent identity; status-only changes omit assignments', async () => {
  const payloads = [];
  const context = vm.createContext({ window: { paApi: { createSchoolAccount: async payload => { payloads.push(payload); return {}; } } }, appData: { settings: { schoolYear: '2026-2027' } } });
  loadFunction('admin-dashboard.html', 'syncAccountToSupabase', context);
  await context.syncAccountToSupabase({ id: profileId, name: 'Teacher', email: teacher.email, role: teacher.role, assignments: [{ grade: 'Grade 7', section: 'Cattleya', subject: 'English' }] });
  assert.equal(payloads[0].action, 'update');
  assert.equal(payloads[0].profile_id, profileId);
  assert.equal(payloads[0].assignments[0].subject_name, 'English');
  await context.syncAccountToSupabase({ id: profileId, role: teacher.role, active: false }, undefined, true);
  assert.equal(payloads[1].active, false);
  assert.equal('assignments' in payloads[1], false);
});

async function edge(options = {}) {
  const calls = { created: 0, deleted: [], rpc: [] };
  let handler;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'caller' } } }),
      admin: {
        listUsers: async () => ({ data: { users: options.existingUser ? [{ id: userId, email: teacher.email }] : [] } }),
        createUser: async () => { calls.created++; return { data: { user: { id: userId } } }; },
        deleteUser: async id => { calls.deleted.push(id); return {}; }
      }
    },
    from() {
      let selected, filter;
      const query = {
        select(value) { selected = value; return query; },
        eq(key, value) { filter = [key, value]; return query; },
        async maybeSingle() {
          if (filter[1] === 'caller') return { data: { role: options.callerRole || 'super_admin', status: 'active' } };
          return { data: options.linked ? { id: profileId } : null };
        },
        async single() { assert.equal(selected, 'id,auth_user_id,email'); return { data: teacher }; }
      };
      return query;
    },
    async rpc(name, payload) {
      assert.equal(name, 'save_school_account_links'); calls.rpc.push(payload);
      return options.rpcError ? { error: { message: 'Database transaction rejected', code: options.transportError ? '' : 'P0001' } } : { data: profileId };
    }
  };
  const source = read('supabase/functions/create-school-account/index.ts').replace(/^import .*;\r?\n/gm, '');
  const context = vm.createContext({
    createClient: () => client, corsHeaders: {},
    jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    Deno: { env: { get: () => 'configured' }, serve: fn => { handler = fn; } },
    crypto: require('node:crypto').webcrypto, Response, console
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  const body = { full_name: 'Teacher', email: teacher.email, role: teacher.role, school_year: '2026-2027', assignments: [{ grade_level: 'Grade 7', section_name: 'Cattleya', subject_name: 'English' }], ...options.body };
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify(body) }));
  return { calls, status: response.status, body: await response.json() };
}

test('server creates Auth identity then saves all links once', async () => {
  const result = await edge();
  assert.equal(result.status, 200);
  assert.equal(result.calls.created, 1);
  assert.equal(result.calls.rpc.length, 1);
  assert.equal(result.calls.rpc[0].p_auth_user_id, userId);
  assert.equal(result.body.profile_id, profileId);
  assert.ok(result.body.temporary_password);
});

test('server recovers an Auth-only account without resetting its password', async () => {
  const result = await edge({ existingUser: true });
  assert.equal(result.status, 200);
  assert.equal(result.calls.created, 0);
  assert.equal(result.body.recovered, true);
  assert.equal(result.body.temporary_password, undefined);
  assert.equal(result.calls.rpc[0].p_auth_user_id, userId);
});

test('duplicate create cannot overwrite a linked account', async () => {
  const result = await edge({ existingUser: true, linked: true });
  assert.equal(result.status, 409);
  assert.equal(result.calls.rpc.length, 0);
});

test('failed transaction cleans up only a newly created Auth account', async () => {
  const newlyCreated = await edge({ rpcError: true });
  assert.equal(newlyCreated.status, 500);
  assert.deepEqual(newlyCreated.calls.deleted, [userId]);
  const existing = await edge({ existingUser: true, rpcError: true });
  assert.equal(existing.status, 500);
  assert.equal(existing.calls.deleted.length, 0);
});

test('editing or deactivating uses the existing identity', async () => {
  const result = await edge({ body: { action: 'update', profile_id: profileId, active: false, assignments: undefined } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.created, 0);
  assert.equal(result.calls.rpc[0].p_status, 'inactive');
  assert.equal(result.calls.rpc[0].p_assignments, null);
});

test('ambiguous network failure never deletes an account that may have committed', async () => {
  const result = await edge({ rpcError: true, transportError: true });
  assert.equal(result.status, 500);
  assert.equal(result.calls.deleted.length, 0);
});

test('unauthorized callers cannot create or modify accounts', async () => {
  for (const options of [{ unauthorized: true }, { callerRole: 'teacher_clearance_head' }]) {
    const result = await edge(options);
    assert.ok([401, 403].includes(result.status));
    assert.equal(result.calls.created, 0);
    assert.equal(result.calls.rpc.length, 0);
  }
});

test('updateOfficeClearance updates or inserts approval without ReferenceError', async () => {
  const updates = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: (table) => ({
      select: () => ({
        or: () => ({ maybeSingle: async () => ({ data: { id: 'stu-1' } }) }),
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'clearance_requests') return { data: { id: 'req-1' } };
            if (table === 'departments') return { data: { id: 'dept-1' } };
            if (table === 'profiles') return { data: { id: profileId } };
            if (table === 'clearance_approvals') return { data: { id: 'app-1' } };
            return { data: null };
          },
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'app-1' } })
          })
        })
      }),
      update: (payload) => ({
        eq: (col, id) => ({
          select: () => ({
            single: async () => { updates.push({ payload, id }); return { data: { id, ...payload } }; }
          })
        })
      })
    })
  };
  const context = browser(client);
  const res = await context.window.paApi.updateOfficeClearance('2026-0001', 'Guidance', 'approved', 'Clear');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'app-1');
  assert.equal(updates[0].payload.status, 'approved');
});
