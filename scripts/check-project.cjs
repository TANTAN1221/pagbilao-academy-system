// Pre-deploy sanity check: parses inline scripts, verifies local asset/link references,
// validates vercel.json, and guards against committed secrets and unsafe settlement code.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'student-dashboard.html', 'admin-dashboard.html', 'clearance-dashboard.html', 'certificate.html'];
let failures = 0;
const fail = (m) => { failures += 1; console.error('FAIL:', m); };

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(m[1])) continue;
    if (!m[2].trim()) continue;
    n += 1;
    try { new vm.Script(m[2], { filename: `${page}#script${n}` }); }
    catch (e) { fail(`${page} inline script ${n}: ${e.message}`); }
  }
  const refRe = /(?:src|href)\s*=\s*["']([^"'#?:]+\.(?:js|css|png|jpg|jpeg|svg|html))["']/gi;
  while ((m = refRe.exec(html))) {
    if (m[1].startsWith('//')) continue;
    if (!fs.existsSync(path.join(root, m[1]))) fail(`${page} references missing file ${m[1]}`);
  }
  if (/atob\(\s*['"][A-Za-z0-9+/=]{30,}['"]\s*\)/.test(html)) fail(`${page} contains an embedded encoded credential`);
  if (/AIza[0-9A-Za-z_-]{30,}|sk_(live|test)_[0-9A-Za-z]{10,}/.test(html)) fail(`${page} contains an API key`);
}

try {
  const v = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  if (v.routes) fail('vercel.json uses legacy "routes", which can shadow static assets');
} catch (e) { fail('vercel.json invalid: ' + e.message); }

const student = fs.readFileSync(path.join(root, 'student-dashboard.html'), 'utf8');
if (/recordPayment\(/.test(student)) fail('student-dashboard.html must not record paid payments from the browser');

const hook = fs.readFileSync(path.join(root, 'supabase/functions/paymongo-webhook/index.ts'), 'utf8');
if (!/if \(!PAYMONGO_WEBHOOK_SECRET_KEY\)/.test(hook)) fail('webhook must require its signing secret');

const cfg = fs.readFileSync(path.join(root, 'js/app-config.js'), 'utf8');
if (/localStorage\.getItem\("pa_registered_users"\)[\s\S]{0,200}u\.password === password/.test(cfg)) fail('app-config.js must not authenticate against localStorage credentials');
if ((cfg.match(/function saveData/g) || []).length > 1) fail('duplicate saveData in app-config.js');
const adminHtml = fs.readFileSync(path.join(root, 'admin-dashboard.html'), 'utf8');
if ((adminHtml.match(/function saveData\(/g) || []).length > 1) fail('duplicate saveData in admin-dashboard.html');

if (failures) { console.error(`${failures} problem(s) found`); process.exit(1); }
console.log('Project check passed');
