const fs = require('fs');

function searchFile(filename, keywords) {
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.split('\n');
  console.log(`=== ${filename} ===`);
  lines.forEach((line, idx) => {
    const match = keywords.some(k => line.toLowerCase().includes(k.toLowerCase()));
    if (match) {
      if (line.includes('function ') || line.includes('id=') || line.includes('appData.settings') || line.includes('clearanceOpen') || line.includes('renderClearance')) {
        console.log(`${idx + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
  });
}

searchFile('admin-dashboard.html', ['clearance', 'settings', 'saveData']);
searchFile('student-dashboard.html', ['notification', 'clearance', 'reminders']);
searchFile('clearance-dashboard.html', ['clearance', 'settings', 'approve']);
