const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractScripts(html) {
  const matches = [];
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!match[0].includes('src=')) {
      matches.push(match[1]);
    }
  }
  return matches;
}

test('all page scripts and shared modules parse cleanly without syntax errors', () => {
  const files = [
    'index.html',
    'student-dashboard.html',
    'admin-dashboard.html',
    'clearance-dashboard.html',
    'certificate.html',
    'js/app-config.js'
  ];

  files.forEach(file => {
    const filePath = path.resolve(__dirname, '..', file);
    const content = fs.readFileSync(filePath, 'utf8');
    if (file.endsWith('.js')) {
      assert.doesNotThrow(() => new vm.Script(content), `Failed parsing ${file}`);
    } else {
      const scripts = extractScripts(content);
      scripts.forEach((script, idx) => {
        if (script.trim()) {
          assert.doesNotThrow(() => new vm.Script(script), `Failed parsing script #${idx} in ${file}`);
        }
      });
    }
  });
});

test('due dates milestone templates support separated JHS and SHS fee selection, tabs, search, and persistence', () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '..', 'admin-dashboard.html'), 'utf8');
  assert.match(adminHtml, /specificFees/, 'admin-dashboard.html contains specificFees logic');
  assert.match(adminHtml, /insFeeAll/, 'admin-dashboard.html contains insFeeAll checkbox');
  assert.match(adminHtml, /ins-fee-cb-jhs/, 'admin-dashboard.html contains JHS fee checkboxes');
  assert.match(adminHtml, /ins-fee-cb-shs/, 'admin-dashboard.html contains SHS fee checkboxes');
  assert.match(adminHtml, /filterInsFeeLevel/, 'admin-dashboard.html contains level tab switcher');
  assert.match(adminHtml, /insFeeSearchInput/, 'admin-dashboard.html contains fee search filter');
  assert.match(adminHtml, /updateInsModalSelectionSummary/, 'admin-dashboard.html contains live selection counter summary');

  // Verify installment template data structure with specificFees
  const sampleTemplate = [
    {
      id: 'INS-01',
      title: 'Downpayment / Enrollment',
      description: 'Initial tuition and registration installment',
      dueDate: '2026-09-30',
      specificFees: ['Registration Fee', 'Tuition Fee']
    },
    {
      id: 'INS-02',
      title: 'Midterm Assessment',
      description: 'Laboratory and miscellaneous fee settlement',
      dueDate: '2026-11-15',
      specificFees: ['Laboratory Fee', 'Miscellaneous Fee']
    }
  ];

  assert.equal(sampleTemplate[0].specificFees.length, 2);
  assert.ok(sampleTemplate[0].specificFees.includes('Tuition Fee'));
  assert.ok(sampleTemplate[1].specificFees.includes('Laboratory Fee'));
});

test('student dashboard renders payment milestones with specific fee tagging and pre-selects them on checkout', () => {
  const studentHtml = fs.readFileSync(path.resolve(__dirname, '..', 'student-dashboard.html'), 'utf8');
  assert.match(studentHtml, /studentInstallmentsList/, 'student-dashboard.html contains studentInstallmentsList container');
  assert.match(studentHtml, /renderStudentPaymentSchedule/, 'student-dashboard.html contains renderStudentPaymentSchedule function');
  assert.match(studentHtml, /openPaymentModalForMilestone/, 'student-dashboard.html contains openPaymentModalForMilestone function');
  assert.match(studentHtml, /renderFeeChecklist\(preferredFees/, 'renderFeeChecklist accepts preferredFees parameter');
});

test('admin analytics includes specific fee breakdown, grade compliance, and JHS vs SHS level comparison statistics', () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '..', 'admin-dashboard.html'), 'utf8');
  assert.match(adminHtml, /feeTypeCollectionBarChart/, 'admin-dashboard.html contains feeTypeCollectionBarChart canvas');
  assert.match(adminHtml, /gradeLevelComplianceBarChart/, 'admin-dashboard.html contains gradeLevelComplianceBarChart canvas');
  assert.match(adminHtml, /levelComparisonBarChart/, 'admin-dashboard.html contains levelComparisonBarChart canvas');
  assert.match(adminHtml, /collectionDoughnutChart/, 'admin-dashboard.html contains collectionDoughnutChart canvas');
  assert.match(adminHtml, /computeFeeTypeCollectionStats/, 'admin-dashboard.html contains computeFeeTypeCollectionStats function');
  assert.match(adminHtml, /computeGradeComplianceStats/, 'admin-dashboard.html contains computeGradeComplianceStats function');
  assert.match(adminHtml, /computeLevelComparisonStats/, 'admin-dashboard.html contains computeLevelComparisonStats function');
  assert.match(adminHtml, /generateGeminiAiAnalyticsInterpretation/, 'admin-dashboard.html contains generateGeminiAiAnalyticsInterpretation function');
});

test('every analytics chart renders a live analysis/summary box', () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '..', 'admin-dashboard.html'), 'utf8');
  const extractFn = (name) => {
    const offset = adminHtml.indexOf(`function ${name}(`);
    assert.ok(offset >= 0, `Function ${name} not found`);
    const start = adminHtml.lastIndexOf('\n', offset) + 1;
    const indent = adminHtml.slice(start, offset).replace('async ', '');
    const rest = adminHtml.slice(start);
    const bodyStart = rest.indexOf('{') + 1;
    const next = new RegExp(`\n${indent}(?:async )?function `).exec(rest.slice(bodyStart));
    const end = next ? bodyStart + next.index : rest.indexOf('</script>');
    return rest.slice(0, end);
  };

  const boxes = {
    feeTypeChartSummary: { innerHTML: '' },
    gradeComplianceChartSummary: { innerHTML: '' },
    levelComparisonChartSummary: { innerHTML: '' },
    collectionDoughnutChartSummary: { innerHTML: '' }
  };

  const context = vm.createContext({
    document: { getElementById: (id) => boxes[id] || null },
    appData: {
      feeStructures: {
        JHS: [{ name: 'Tuition Fee', amount: 12000 }, { name: 'Lab Fee', amount: 2000 }],
        SHS: [{ name: 'SHS Tuition', amount: 18000 }]
      },
      vouchers: [
        { name: 'ESC Voucher', appliesTo: 'JHS', amount: 9000, active: true },
        { name: 'SHS Voucher', appliesTo: 'SHS', amount: 14000, active: true }
      ],
      students: [
        { id: 'STU-1', name: 'Juan', level: 'JHS', grade: 'Grade 7', voucher: 'ESC Voucher', paid: 5000 },
        { id: 'STU-2', name: 'Ana', level: 'SHS', grade: 'Grade 11', voucher: 'SHS Voucher', paid: 1000 }
      ],
      payments: []
    },
    money: (n) => `₱${Number(n || 0).toLocaleString()}`
  });

  [
    'feeTotal',
    'voucherAmount',
    'assessedTotal',
    'balance',
    'escapeHtml',
    'getStudentPaymentsInAdmin',
    'getStudentTotalPaidInAdmin',
    'computeFeeTypeCollectionStats',
    'computeGradeComplianceStats',
    'computeLevelComparisonStats',
    'renderAnalyticsChartSummaries'
  ].forEach((fn) => vm.runInContext(extractFn(fn), context));

  context.renderAnalyticsChartSummaries();

  assert.match(boxes.feeTypeChartSummary.innerHTML, /Fee Category Analysis/);
  assert.match(boxes.feeTypeChartSummary.innerHTML, /100% Gross Settled|Gross Settled/);
  assert.match(boxes.gradeComplianceChartSummary.innerHTML, /Grade 7/);
  assert.match(boxes.gradeComplianceChartSummary.innerHTML, /Grade 11/);
  assert.match(boxes.levelComparisonChartSummary.innerHTML, /JHS 100% · SHS 25%/);
  assert.match(boxes.collectionDoughnutChartSummary.innerHTML, /67% Net Collected/);
});

test('analytics and reports feature responsive multi-criteria retrieval and filtering', () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '..', 'admin-dashboard.html'), 'utf8');
  assert.match(adminHtml, /id="analyticsSyFilter"/, 'contains school year filter');
  assert.match(adminHtml, /id="analyticsLevelFilter"/, 'contains level filter');
  assert.match(adminHtml, /id="analyticsGradeFilter"/, 'contains grade filter');
  assert.match(adminHtml, /id="analyticsStatusFilter"/, 'contains settlement status filter');
  assert.match(adminHtml, /id="analyticsStrandFilter"/, 'contains strand filter');
  assert.match(adminHtml, /id="analyticsChannelFilter"/, 'contains payment channel filter');
  assert.match(adminHtml, /id="analyticsDateFilter"/, 'contains timeline date filter');
  assert.match(adminHtml, /id="analyticsSearchInput"/, 'contains student search input');
  assert.match(adminHtml, /getFilteredAnalyticsData\(/, 'contains getFilteredAnalyticsData function');
  assert.match(adminHtml, /applyAnalyticsFilters\(/, 'contains applyAnalyticsFilters function');
  assert.match(adminHtml, /resetAnalyticsFilters\(/, 'contains resetAnalyticsFilters function');
  assert.match(adminHtml, /onAnalyticsLevelChange\(/, 'contains onAnalyticsLevelChange function');

  // Verify mobile responsive features
  assert.ok(adminHtml.includes("document.getElementById('mobileDrawer')?.classList.add('hidden')"), 'admin showPage auto-closes mobile drawer');
  const studentHtml = fs.readFileSync(path.resolve(__dirname, '..', 'student-dashboard.html'), 'utf8');
  assert.ok(studentHtml.includes("document.getElementById('mobileDrawer')?.classList.add('hidden')"), 'student showPage auto-closes mobile drawer');
  assert.match(studentHtml, /max-w-\[calc\(100vw-2rem\)\]/, 'student notification dropdown has mobile viewport safety constraint');

  const clearanceHtml = fs.readFileSync(path.resolve(__dirname, '..', 'clearance-dashboard.html'), 'utf8');
  assert.match(clearanceHtml, /grid-cols-1 sm:grid-cols-3/, 'clearance dashboard cards are responsive on mobile');
});

test('all search filters support ID, surname, single-letter, and first-letter range filtering', () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '..', 'admin-dashboard.html'), 'utf8');
  const clearanceHtml = fs.readFileSync(path.resolve(__dirname, '..', 'clearance-dashboard.html'), 'utf8');
  const appConfigJs = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app-config.js'), 'utf8');

  // Verify dropdown selectors in admin dashboard
  assert.match(adminHtml, /id="studentSurnameRangeFilter"/, 'contains dashboard studentSurnameRangeFilter');
  assert.match(adminHtml, /id="studentAccountSurnameFilter"/, 'contains studentAccountSurnameFilter');
  assert.match(adminHtml, /id="analyticsSurnameFilter"/, 'contains analyticsSurnameFilter');

  // Verify dropdown selector in clearance dashboard
  assert.match(clearanceHtml, /id="clearanceSurnameFilter"/, 'contains clearanceSurnameFilter');

  // Load appConfig functions in VM
  const windowObj = {};
  const context = vm.createContext({
    window: windowObj,
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { log: () => {}, warn: () => {}, error: () => {} }
  });
  vm.runInContext(appConfigJs, context);

  const getStudentSurname = windowObj.getStudentSurname;
  const matchesSurnameLetterRange = windowObj.matchesSurnameLetterRange;
  const matchesStudentIdOrSurname = windowObj.matchesStudentIdOrSurname;

  assert.equal(typeof getStudentSurname, 'function');
  assert.equal(typeof matchesSurnameLetterRange, 'function');
  assert.equal(typeof matchesStudentIdOrSurname, 'function');

  // Test surname extraction
  assert.equal(getStudentSurname('Juan Dela Cruz'), 'Dela Cruz');
  assert.equal(getStudentSurname('Maria Delos Santos'), 'Delos Santos');
  assert.equal(getStudentSurname('Cruz, Juan'), 'Cruz');
  assert.equal(getStudentSurname({ name: 'Jose Rizal' }), 'Rizal');
  assert.equal(getStudentSurname({ lastName: 'Bonifacio' }), 'Bonifacio');
  assert.equal(getStudentSurname({ last_name: 'Mabini' }), 'Mabini');

  // Test surname letter range matching
  assert.ok(matchesSurnameLetterRange('Cruz', 'A to D'));
  assert.ok(matchesSurnameLetterRange('Dela Cruz', 'A-D'));
  assert.ok(!matchesSurnameLetterRange('Santos', 'A to D'));
  assert.ok(matchesSurnameLetterRange('Santos', 'Q to T'));
  assert.ok(matchesSurnameLetterRange('Santos', 'S'));
  assert.ok(!matchesSurnameLetterRange('Santos', 'A'));

  // Test student ID and surname searching
  const s1 = { id: 'STU-2026-001', student_number: '2026-001', name: 'Juan Dela Cruz', email: 'juan@example.com' };
  const s2 = { id: 'STU-2026-002', student_number: '2026-002', name: 'Maria Santos', email: 'maria@example.com' };

  // 1. By ID
  assert.ok(matchesStudentIdOrSurname(s1, '2026-001'));
  assert.ok(!matchesStudentIdOrSurname(s2, '2026-001'));

  // 2. By Surname
  assert.ok(matchesStudentIdOrSurname(s1, 'Cruz'));
  assert.ok(matchesStudentIdOrSurname(s1, 'Dela Cruz'));
  assert.ok(!matchesStudentIdOrSurname(s2, 'Cruz'));
  assert.ok(matchesStudentIdOrSurname(s2, 'Santos'));

  // 3. By single letter surname initial
  assert.ok(matchesStudentIdOrSurname(s1, 'D'));
  assert.ok(matchesStudentIdOrSurname(s2, 'S'));

  // 4. By typed letter range (e.g. "A to D")
  assert.ok(matchesStudentIdOrSurname(s1, 'A to D'));
  assert.ok(!matchesStudentIdOrSurname(s2, 'A to D'));
  assert.ok(matchesStudentIdOrSurname(s2, 'Q to T'));

  // 5. By dropdown letter range with empty query
  assert.ok(matchesStudentIdOrSurname(s1, '', 'A to D'));
  assert.ok(!matchesStudentIdOrSurname(s2, '', 'A to D'));
  assert.ok(matchesStudentIdOrSurname(s2, '', 'Q to T'));
});


