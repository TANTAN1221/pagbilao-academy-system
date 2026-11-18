const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function extractFunction(source, name) {
  const offset = source.indexOf(`function ${name}(`);
  assert.ok(offset >= 0, `Function ${name} not found`);
  const start = source.lastIndexOf('\n', offset) + 1;
  const indent = source.slice(start, offset).replace('async ', '');
  const rest = source.slice(start);
  const bodyStart = rest.indexOf('{') + 1;
  const next = new RegExp(`\n${indent}(?:async )?function `).exec(rest.slice(bodyStart));
  const end = next ? bodyStart + next.index : rest.indexOf('</script>');
  return rest.slice(0, end);
}

test('admin dashboard student list exposes History & Fees action and renders payment history + unpaid fees modal', () => {
  const html = read('admin-dashboard.html');
  assert.match(html, /openStudentLedgerModal\(/);

  const modalLabelEl = { textContent: '' };
  const modalTitleEl = { textContent: '' };
  const modalContentEl = { innerHTML: '' };
  let modalOpened = false;

  const context = vm.createContext({
    appData: {
      feeStructures: {
        JHS: [
          { name: 'Tuition Fee', amount: 12000 },
          { name: 'Laboratory Fee', amount: 2000 },
          { name: 'Miscellaneous Fee', amount: 1000 }
        ],
        SHS: []
      },
      vouchers: [{ name: 'ESC Voucher', appliesTo: 'JHS', amount: 9000, active: true }],
      students: [
        {
          id: 'STU-2026-001',
          dbId: '11111111-1111-4111-8111-111111111111',
          name: 'Maria Santos',
          email: 'maria@pagbilao.edu.ph',
          level: 'JHS',
          grade: 'Grade 7',
          section: 'Rose',
          strand: 'N/A',
          voucher: 'ESC Voucher',
          paid: 2000
        }
      ],
      payments: [
        {
          id: 'PAY-1',
          studentId: 'STU-2026-001',
          amount: 2000,
          method: 'qrph',
          referenceNo: 'cs_test_1',
          feeBreakdown: ['Laboratory Fee'],
          status: 'paid',
          paidAt: '2026-11-15T10:00:00.000Z'
        },
        {
          id: 'PAY-OTHER',
          studentId: 'STU-2026-999',
          amount: 5000,
          method: 'Cash',
          referenceNo: 'OR-999',
          status: 'paid',
          paidAt: '2026-11-14T10:00:00.000Z'
        }
      ]
    },
    formModalLabel: modalLabelEl,
    formModalTitle: modalTitleEl,
    formModalContent: modalContentEl,
    openFormModal: () => { modalOpened = true; },
    money: (n) => `₱${Number(n || 0).toLocaleString()}`,
    pill: (text) => `<span>${text}</span>`,
    Date
  });

  [
    'feeTotal',
    'voucherAmount',
    'assessedTotal',
    'balance',
    'classLabel',
    'escapeHtml',
    'getStudentPaymentsInAdmin',
    'getStudentTotalPaidInAdmin',
    'getStudentFeeBreakdownStatus',
    'openStudentLedgerModal'
  ].forEach((fn) => vm.runInContext(extractFunction(html, fn), context));

  const student = context.appData.students[0];
  const payments = context.getStudentPaymentsInAdmin(student);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].referenceNo, 'cs_test_1');

  const fees = context.getStudentFeeBreakdownStatus(student);
  const lab = fees.find((f) => f.name === 'Laboratory Fee');
  const misc = fees.find((f) => f.name === 'Miscellaneous Fee');
  assert.equal(lab.status, 'paid');
  assert.equal(misc.status, 'unpaid');

  context.openStudentLedgerModal('STU-2026-001');
  assert.equal(modalOpened, true);
  assert.match(modalTitleEl.textContent, /Maria Santos/);
  assert.match(modalContentEl.innerHTML, /cs_test_1/);
  assert.match(modalContentEl.innerHTML, /Miscellaneous Fee/);
  assert.doesNotMatch(modalContentEl.innerHTML, /OR-999/);
});

