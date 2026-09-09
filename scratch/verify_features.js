const fs = require('fs');

console.log('--- Checking HTML and script integrity ---');

const adminHtml = fs.readFileSync('admin-dashboard.html', 'utf8');
const studentHtml = fs.readFileSync('student-dashboard.html', 'utf8');
const clearanceHtml = fs.readFileSync('clearance-dashboard.html', 'utf8');
const configJs = fs.readFileSync('js/app-config.js', 'utf8');

// 1. Admin Dashboard Checks
const adminChecks = [
  { name: 'Clearance period header badge', test: adminHtml.includes('id="clearancePeriodHeaderBadge"') },
  { name: 'Clearance period toggle control card', test: adminHtml.includes('id="clearancePeriodControlCard"') },
  { name: 'Clearance period toggle button', test: adminHtml.includes('id="clearancePeriodToggleBtn"') },
  { name: 'Clearance toggle in settings page', test: adminHtml.includes('id="settingsClearanceToggleBtn"') },
  { name: 'toggleClearancePeriod function', test: adminHtml.includes('function toggleClearancePeriod()') },
  { name: 'isClearancePeriodOpen function', test: adminHtml.includes('function isClearancePeriodOpen()') },
  { name: 'updateClearancePeriodToggleUI function', test: adminHtml.includes('function updateClearancePeriodToggleUI()') },
  { name: 'pa_clearance_period_open in saveData', test: adminHtml.includes("localStorage.setItem('pa_clearance_period_open'") },
  { name: 'Storage listener for clearance open in admin', test: adminHtml.includes("e.key === 'pa_clearance_period_open'") }
];

console.log('\n[Admin Dashboard Checks]');
adminChecks.forEach(c => {
  console.log(`  ${c.test ? '✓' : '✗'} ${c.name}`);
});

// 2. Student Dashboard Checks
const studentChecks = [
  { name: 'Mark all as read in notification dropdown', test: studentHtml.includes('markAllNotificationsRead()') && studentHtml.includes('id="dropdownNotificationSubtext"') },
  { name: 'Clear all in notification dropdown', test: studentHtml.includes('clearAllNotifications()') },
  { name: 'Mark all as read in reminders section', test: studentHtml.includes('markAllNotificationsRead()') && studentHtml.includes('Mark all as read') },
  { name: 'Clear all in reminders section', test: studentHtml.includes('clearAllNotifications()') && studentHtml.includes('Clear all') },
  { name: 'Dismiss single notification function', test: studentHtml.includes('function clearSingleNotification(') },
  { name: 'Mark single notification read function', test: studentHtml.includes('function markNotificationRead(') },
  { name: 'Restore notifications function', test: studentHtml.includes('function restoreAllNotifications()') },
  { name: 'Clearance period closed banner in student', test: studentHtml.includes('id="clearancePeriodClosedBanner"') },
  { name: 'isClearancePeriodOpen function in student', test: studentHtml.includes('function isClearancePeriodOpen()') },
  { name: 'Clearance period locked check in requestTeacherApproval', test: studentHtml.includes('if (!isClearancePeriodOpen())') },
  { name: 'Storage listener for clearance toggle in student', test: studentHtml.includes("e.key === 'pa_clearance_period_open'") }
];

console.log('\n[Student Dashboard Checks]');
studentChecks.forEach(c => {
  console.log(`  ${c.test ? '✓' : '✗'} ${c.name}`);
});

// 3. Clearance Head Dashboard Checks
const clearanceChecks = [
  { name: 'Clearance period closed banner in clearance head portal', test: clearanceHtml.includes('id="clearancePeriodClosedBanner"') },
  { name: 'isClearancePeriodOpen function in clearance portal', test: clearanceHtml.includes('function isClearancePeriodOpen()') },
  { name: 'Clearance period check in approve()', test: clearanceHtml.includes('if (!isClearancePeriodOpen())') },
  { name: 'Clearance period closed disabled button in table row', test: clearanceHtml.includes('Period Closed') },
  { name: 'Storage listener for clearance toggle in clearance portal', test: clearanceHtml.includes("e.key === 'pa_clearance_period_open'") }
];

console.log('\n[Clearance Head Dashboard Checks]');
clearanceChecks.forEach(c => {
  console.log(`  ${c.test ? '✓' : '✗'} ${c.name}`);
});

// 4. Config Checks
const configChecks = [
  { name: 'storedClearanceOpen in fetchDatabaseState', test: configJs.includes('storedClearanceOpen') && configJs.includes("localStorage.getItem('pa_clearance_period_open')") }
];

console.log('\n[App Config Checks]');
configChecks.forEach(c => {
  console.log(`  ${c.test ? '✓' : '✗'} ${c.name}`);
});

const allPassed = [...adminChecks, ...studentChecks, ...clearanceChecks, ...configChecks].every(c => c.test);
console.log(`\nAll feature checks passed: ${allPassed ? 'YES' : 'NO'}`);
