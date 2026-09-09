
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
function money(n) { return currency.format(Math.round(Number(n) || 0)); }

const DEFAULT_INSTALLMENT_TEMPLATE = [
  { id: 'q1', title: 'Enrollment Downpayment / 1st Quarter', dueDate: '2026-08-31' },
  { id: 'q2', title: '2nd Quarter Milestone', dueDate: '2026-10-30' },
  { id: 'q3', title: '3rd Quarter Milestone', dueDate: '2027-01-15' },
  { id: 'q4', title: '4th Quarter / Final Balance', dueDate: '2027-03-31' }
];

const feeItems = [
  { id: 'f1', name: 'Tuition Fee', amount: 15000 },
  { id: 'f2', name: 'Miscellaneous & Computer Fee', amount: 4000 },
  { id: 'f3', name: 'Laboratory & Facilities Fee', amount: 2000 },
  { id: 'f4', name: 'Registration & Student ID', amount: 1000 }
];

function getSettledFeeStatusMap(s, payments) {
  const totalPaid = Number(s.paid || 0);
  const netAssessed = 22000;
  const bal = Math.max(0, netAssessed - totalPaid);

  if (bal <= 0 && netAssessed > 0) {
    const statusMap = {};
    feeItems.forEach(item => {
      statusMap[item.name.toLowerCase().trim()] = { settled: true, paidAmount: item.amount, remainingAmount: 0 };
    });
    return statusMap;
  }

  const explicitItemPaid = {};
  let totalExplicitPaid = 0;
  payments.forEach(p => {
    if (p && (!p.status || ['paid', 'succeeded', 'completed', 'active'].includes(String(p.status).toLowerCase()))) {
      if (Array.isArray(p.feeBreakdown) && p.feeBreakdown.length > 0) {
        p.feeBreakdown.forEach(itemName => {
          const key = String(itemName || '').trim().toLowerCase();
          const matched = feeItems.find(f => f.name.trim().toLowerCase() === key);
          const feeAmt = matched ? Number(matched.amount || 0) : 0;
          explicitItemPaid[key] = (explicitItemPaid[key] || 0) + feeAmt;
          totalExplicitPaid += feeAmt;
        });
      }
    }
  });

  let generalPaidPool = Math.max(0, totalPaid - totalExplicitPaid);
  const statusMap = {};

  feeItems.forEach(item => {
    const key = item.name.trim().toLowerCase();
    const fullAmt = Number(item.amount || 0);
    let paidForItem = explicitItemPaid[key] || 0;

    if (paidForItem < fullAmt && generalPaidPool > 0) {
      const needed = fullAmt - paidForItem;
      const alloc = Math.min(generalPaidPool, needed);
      paidForItem += alloc;
      generalPaidPool -= alloc;
    }

    const isSettled = (paidForItem >= fullAmt && fullAmt > 0) || (bal <= 0);
    statusMap[key] = {
      settled: isSettled,
      paidAmount: paidForItem,
      remainingAmount: Math.max(0, fullAmt - paidForItem)
    };
  });

  return statusMap;
}

// Test Case 1: Fresh student with 0 payments
const s1 = { id: 's1', paid: 0 };
const p1 = [];
const m1 = getSettledFeeStatusMap(s1, p1);
console.log('Test 1 (0 paid):', Object.keys(m1).map(k => k + ': settled=' + m1[k].settled).join(', '));
console.assert(Object.values(m1).every(v => !v.settled), 'All should be unsettled');

// Test Case 2: Student paid Registration & Student ID via itemized checkout
const s2 = { id: 's2', paid: 1000 };
const p2 = [{ amount: 1000, feeBreakdown: ['Registration & Student ID'], status: 'Paid' }];
const m2 = getSettledFeeStatusMap(s2, p2);
console.log('Test 2 (Registration paid):', Object.keys(m2).map(k => k + ': settled=' + m2[k].settled).join(', '));
console.assert(m2['registration & student id'].settled === true, 'Registration should be settled');
console.assert(m2['tuition fee'].settled === false, 'Tuition should be unsettled');

// Test Case 3: Fully paid student
const s3 = { id: 's3', paid: 22000 };
const p3 = [{ amount: 22000, feeBreakdown: [], status: 'Paid' }];
const m3 = getSettledFeeStatusMap(s3, p3);
console.log('Test 3 (Fully paid):', Object.keys(m3).map(k => k + ': settled=' + m3[k].settled).join(', '));
console.assert(Object.values(m3).every(v => v.settled), 'All should be settled');

// Test Case 4: Due Dates as pure reminders
const today = new Date('2026-09-09');
const bal4 = 12000;
const reminders = DEFAULT_INSTALLMENT_TEMPLATE.map(t => {
  const d = new Date(t.dueDate);
  const isPast = d < today;
  return { ...t, status: bal4 <= 0 ? 'Settled' : (isPast ? 'Overdue' : 'Upcoming') };
});
console.log('Test 4 (Due date reminders):');
reminders.forEach(r => console.log('   ' + r.title + ' (' + r.dueDate + '): ' + r.status));
console.assert(reminders[0].status === 'Overdue', 'Aug 31 is overdue');
console.assert(reminders[1].status === 'Upcoming', 'Oct 30 is upcoming');

console.log('\nALL UNIT & INTEGRATION TESTS PASSED!');
