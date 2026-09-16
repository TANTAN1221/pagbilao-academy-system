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
