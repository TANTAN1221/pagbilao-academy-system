
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
function money(n) { return currency.format(Math.round(Number(n) || 0)); }

const s = {
  id: 'STD-1001',
  name: 'Juan Dela Cruz',
  level: 'JHS',
  paid: 2000,
  voucher: 'ESC Voucher'
};

const appData = {
  feeStructures: {
    JHS: [
      { id: 'f1', name: 'Tuition Fee', amount: 15000 },
      { id: 'f2', name: 'Miscellaneous & Computer Fee', amount: 4000 },
      { id: 'f3', name: 'Laboratory & Facilities Fee', amount: 2000 },
      { id: 'f4', name: 'Registration & Student ID', amount: 1000 }
    ]
  },
  payments: []
};

function getFeeItemsForStudent(student) {
  return appData.feeStructures[student.level];
}

function getStudentTotalPaid(student) {
  return Number(student.paid || 0);
}

function voucherAmount(student) {
  return 8000;
}

function feeTotal(level) {
  return 22000;
}

function assessedTotal(student) {
  return feeTotal(student.level) - voucherAmount(student);
}

function balance(student) {
  return Math.max(0, assessedTotal(student) - getStudentTotalPaid(student));
}

function getStudentPayments(student) {
  return [];
}

function getSettledFeeStatusMap(student) {
  const feeItems = getFeeItemsForStudent(student);
  const totalPaid = getStudentTotalPaid(student);
  const netAssessed = assessedTotal(student);
  const bal = balance(student);
  const studentPayments = getStudentPayments(student);
  const statusMap = {};

  if (bal <= 0 && netAssessed > 0) {
    feeItems.forEach(item => {
      statusMap[item.name.toLowerCase().trim()] = { settled: true, paidAmount: Number(item.amount || 0), remainingAmount: 0 };
    });
    return statusMap;
  }

  let generalPaidPool = totalPaid;
  feeItems.forEach(item => {
    const key = item.name.trim().toLowerCase();
    const fullAmt = Number(item.amount || 0);
    let paidForItem = 0;
    if (generalPaidPool > 0) {
      const needed = fullAmt;
      const alloc = Math.min(generalPaidPool, needed);
      paidForItem += alloc;
      generalPaidPool -= alloc;
    }
    statusMap[key] = { settled: (paidForItem >= fullAmt && fullAmt > 0) || (bal <= 0), paidAmount: paidForItem };
  });
  return statusMap;
}

function renderOverviewFeeBreakdown(student) {
  const feeItems = getFeeItemsForStudent(student);
  const grossSum = feeItems.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const voucherAmt = voucherAmount(student);
  const discountAmt = 0;
  const totalDeductions = voucherAmt + discountAmt;
  const netAssessed = assessedTotal(student);
  const paidAmt = getStudentTotalPaid(student);
  const netBal = balance(student);

  const settledMap = getSettledFeeStatusMap(student);

  let rowsHtml = feeItems.map((item, idx) => {
    const itemAmt = Number(item.amount || 0);
    const itemNet = grossSum > 0 ? Math.max(0, itemAmt - Math.round((itemAmt / grossSum) * totalDeductions)) : itemAmt;
    const key = item.name.toLowerCase().trim();
    const isSettled = settledMap[key]?.settled || (netBal <= 0);

    return <tr><td></td><td></td><td></td></tr>;
  }).join('');

  return rowsHtml;
}

const html = renderOverviewFeeBreakdown(s);
console.log('Successfully rendered fee breakdown rows:');
console.log(html);
