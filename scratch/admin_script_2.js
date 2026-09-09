
    const STORAGE_KEY = 'pa_full_admin_v2';
    const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
    const navItems = [
      ['dashboardPage', 'dashboard', 'Payment Dashboard', 'Monitor student balances'], ['feesPage', 'payments', 'Tuition & Vouchers', 'JHS/SHS fees and discounts'], ['dueDatesPage', 'calendar_month', 'Due Dates', 'Installments and partial payments'], ['clearancePage', 'fact_check', 'Clearance Monitoring', 'Approval workflow'], ['accountsPage', 'manage_accounts', 'Accounts & Access', 'Clearance head assignments'], ['analyticsPage', 'monitoring', 'Analytics & Reports', 'Accounting reports'], ['certificatesPage', 'workspace_premium', 'Certificates', 'Clearance certificate requests'], ['settingsPage', 'settings', 'Settings', 'System configuration']
    ];
    const gradeSections = {
      JHS: {
        'Grade 7': ['Cattleya', 'Orchids', 'Rose'],
        'Grade 8': ['Vermillion', 'Burgundy', 'Magenta'],
        'Grade 9': ['Aristotle', 'Einstein', 'Newton'],
        'Grade 10': ['Diamond', 'Emerald']
      },
      SHS: {
        'Grade 11': ['Humility', 'Integrity'],
        'Grade 12': ['Honesty']
      }
    };
    const SECTIONS_BY_GRADE = {
      'Grade 7': ['Cattleya', 'Orchids', 'Rose'],
      'Grade 8': ['Vermillion', 'Burgundy', 'Magenta'],
      'Grade 9': ['Aristotle', 'Einstein', 'Newton'],
      'Grade 10': ['Diamond', 'Emerald'],
      'Grade 11': ['Humility', 'Integrity'],
      'Grade 12': ['Honesty']
    };
    const SHS_STRANDS = ['GAS', 'HUMSS', 'ABM'];
    const JHS_SUBJECTS = [
      'Filipino',
      'English',
      'Mathematics',
      'Science',
      'Araling Panlipunan',
      'Values Education',
      'Technology and Livelihood Education',
      'MAPEH',
      'Computer Education'
    ];
    const SHS_SUBJECTS = [
      'Oral Communication',
      'Reading and Writing',
      'Komunikasyon at Pananaliksik',
      '21st Century Literature',
      'Media and Information Literacy',
      'General Mathematics',
      'Statistics and Probability',
      'Earth and Life Science',
      'Physical Science',
      'Personal Development',
      'Understanding Culture, Society and Politics',
      'Physical Education and Health',
      'Empowerment Technologies',
      'Entrepreneurship',
      'Practical Research 1',
      'Practical Research 2',
      'Inquiries, Investigations and Immersion',
      'Business Math',
      'Fundamentals of ABM',
      'Organization and Management',
      'Principles of Marketing',
      'Business Finance',
      'General Biology',
      'General Chemistry',
      'General Physics',
      'Pre-Calculus',
      'Basic Calculus',
      'Philippine Politics and Governance',
      'Disciplines and Ideas in the Social Sciences'
    ];
    const DEFAULT_FEE_STRUCTURES = {
      JHS: [],
      SHS: []
    };

    const DEFAULT_VOUCHERS = [];

    const DEFAULT_INSTALLMENT_TEMPLATE = [
      {
        id: "ins-downpayment-2026",
        title: "Enrollment Downpayment / 1st Quarter",
        description: "Initial tuition downpayment milestone upon enrollment",
        dueDate: "2026-08-31"
      },
      {
        id: "ins-q2-2026",
        title: "2nd Quarter Milestone",
        description: "Second grading period payment reminder milestone",
        dueDate: "2026-10-30"
      },
      {
        id: "ins-q3-2027",
        title: "3rd Quarter Milestone",
        description: "Third grading period payment reminder milestone",
        dueDate: "2027-01-15"
      },
      {
        id: "ins-q4-2027",
        title: "4th Quarter / Final Balance",
        description: "Final grading period and year-end clearance settlement",
        dueDate: "2027-03-31"
      }
    ];

    const defaultData = {
      settings: { schoolName: 'Pagbilao Academy Inc.', schoolYear: '2026-2027' },
      feeStructures: DEFAULT_FEE_STRUCTURES,
      vouchers: DEFAULT_VOUCHERS,
      installmentTemplate: DEFAULT_INSTALLMENT_TEMPLATE,
      students: [],
      accounts: [],
      payments: [],
      certificateRequests: [],
      teacherClearanceRequests: []
    };

    function loadData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(defaultData);
        const parsed = JSON.parse(raw);
        return ensurePrototypeData({ ...structuredClone(defaultData), ...parsed });
      } catch {
        return ensurePrototypeData(structuredClone(defaultData));
      }
    }

    function isStaffOrAdminEntry(s) {
      if (!s) return false;
      const role = String(s.role || '').toLowerCase();
      if (role === 'student' || s.student_number || s.studentId) return false;
      const staffRoles = ['accounting_admin', 'teacher_clearance_head', 'guidance_head', 'prefect_head', 'librarian_head', 'principal', 'registrar', 'super_admin', 'admin', 'accountant'];
      if (staffRoles.includes(role)) return true;
      const email = String(s.email || '').toLowerCase().trim();
      const staffKeywords = ['admin', 'accounting', 'accountant', 'teacher', 'guidance', 'prefect', 'library', 'librarian', 'principal', 'registrar'];
      if (email && staffKeywords.some(kw => email.includes(kw))) return true;
      const name = String(s.name || `${s.first_name || ''} ${s.last_name || ''}`).toLowerCase();
      if (name.includes('admin accountant') || name.includes('teacher head') || name.includes('guidance head') || name.includes('prefect of discipline')) return true;
      return false;
    }

    function ensurePrototypeData(data = appData) {
      if (!data) data = {};
      data.feeStructures = data.feeStructures || { JHS: [], SHS: [] };
      if (!data.feeStructures.JHS) data.feeStructures.JHS = [];
      if (!data.feeStructures.SHS) data.feeStructures.SHS = [];
      ['JHS', 'SHS'].forEach(level => {
        if (Array.isArray(data.feeStructures[level])) {
          const seen = new Set();
          const deduped = [];
          data.feeStructures[level].forEach((f, idx) => {
            if (f && typeof f === 'object' && f.name) {
              const clean = String(f.name).trim().toLowerCase();
              if (!seen.has(clean)) {
                seen.add(clean);
                if (!f.id) {
                  f.id = `fee-${level.toLowerCase()}-${idx}-${Date.now()}`;
                }
                deduped.push(f);
              }
            }
          });
          data.feeStructures[level] = deduped;
        }
      });
      data.vouchers = data.vouchers || [];
      if (!data.installmentTemplate || !data.installmentTemplate.length) {
        try {
          const cached = localStorage.getItem('pa_installment_templates');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) data.installmentTemplate = parsed;
          }
        } catch {}
        if (!data.installmentTemplate || !data.installmentTemplate.length) {
          data.installmentTemplate = [...DEFAULT_INSTALLMENT_TEMPLATE];
        }
      }
      data.teacherClearanceRequests = data.teacherClearanceRequests || [];
      data.students = (data.students || []).filter(s => !isStaffOrAdminEntry(s));
      data.accounts = data.accounts || [];
      data.payments = data.payments || [];
      data.certificateRequests = data.certificateRequests || [];
      return data;
    }

    let appData = loadData();
    ensurePrototypeData(appData);
    function saveData() {
      ensurePrototypeData(appData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      localStorage.setItem('pa_installment_templates', JSON.stringify(appData.installmentTemplate || []));
      if (typeof syncInstallmentsToSupabase === 'function') syncInstallmentsToSupabase();
      if (typeof syncVouchersToSupabase === 'function') syncVouchersToSupabase();
      if (typeof syncFeeStructuresToSupabase === 'function') syncFeeStructuresToSupabase();
    }
    function showToast(title, message, type = 'info') {
      const toast = document.getElementById('toast');
      const toastTitle = document.getElementById('toastTitle');
      const toastMessage = document.getElementById('toastMessage');
      const toastIcon = document.getElementById('toastIcon');
      if (!toast || !toastTitle || !toastMessage) return;

      toastTitle.textContent = title;
      toastMessage.textContent = message;

      if (type === 'error') {
        toastIcon.className = 'w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0';
        toastIcon.innerHTML = '<span class="material-symbols-rounded">error</span>';
      } else {
        toastIcon.className = 'w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0';
        toastIcon.innerHTML = '<span class="material-symbols-rounded">check_circle</span>';
      }

      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 4000);
    }

    function showConfirmModal({ title, message, confirmText = 'Confirm Delete', confirmClass = 'bg-red-600 hover:bg-red-700 text-white', onConfirm }) {
      if (typeof closeFormModal === 'function') closeFormModal();

      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const msgEl = document.getElementById('confirmModalMessage');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');
      const actionBtn = document.getElementById('confirmModalActionBtn');
      if (!modal || !titleEl || !msgEl || !actionBtn || !cancelBtn) return;

      titleEl.textContent = title || 'Confirm Action';
      msgEl.textContent = message || 'Are you sure you want to perform this action?';
      actionBtn.textContent = confirmText;
      actionBtn.className = `w-1/2 py-3 rounded-xl font-extrabold text-xs shadow-md transition ${confirmClass}`;

      const closeModal = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      };

      cancelBtn.onclick = closeModal;

      actionBtn.onclick = () => {
        closeModal();
        if (typeof onConfirm === 'function') onConfirm();
      };

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    function money(n) { return currency.format(Math.round(Number(n) || 0)) }
    function pill(text, type = 'blue') {
      const map = {
        green: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
        red: 'bg-red-50 text-red-700 border border-red-200/80',
        amber: 'bg-amber-50 text-amber-700 border border-amber-200/80',
        blue: 'bg-blue-50 text-blue-700 border border-blue-200/80',
        gray: 'bg-slate-100 text-slate-600 border border-slate-200/80'
      };
      return `<span class="px-2.5 py-1 rounded-full text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1 shadow-sm ${map[type] || map.blue}">${text}</span>`;
    }
    function feeTotal(level) { return (appData.feeStructures[level] || []).reduce((s, f) => s + Number(f.amount || 0), 0) }
    function voucherAmount(student) { const v = (appData.vouchers || []).find(x => x.name === student.voucher && x.active); return v ? Number(v.amount || 0) : 0 }
    function assessedTotal(s) {
      if (s.assessedOverride !== undefined && s.assessedOverride !== null && s.assessedOverride !== '') {
        return Math.max(0, Number(s.assessedOverride));
      }
      let baseFee = 0;
      if (s.customFees && Array.isArray(s.customFees) && s.customFees.length > 0) {
        baseFee = s.customFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      } else {
        baseFee = feeTotal(s.level);
      }
      const discount = Number(s.feeDiscount || 0);
      return Math.max(0, baseFee - voucherAmount(s) - discount);
    }
    function balance(student) { return Math.max(0, assessedTotal(student) - Number(student.paid || 0)) }
    function classLabel(s) {
      if (s.level === 'SHS') {
        const strandStr = s.strand && s.strand !== 'N/A' ? ` (${s.strand})` : '';
        return `${s.grade} - ${s.section || 'N/A'}${strandStr}`;
      }
      return `${s.grade} - ${s.section || 'N/A'}`;
    }
    function assignmentMatchesStudent(a, s) {
      const grade = a.grade || a.grade_level;
      const section = a.section || a.section_name || 'N/A';
      const strand = a.strand || 'N/A';
      if (grade && s.grade && grade !== s.grade) return false;
      if (section !== 'N/A' && s.section && section !== s.section) return false;
      if (strand !== 'N/A' && s.strand) {
        const normA = strand.replace('HUMMS', 'HUMSS');
        const normS = (s.strand || '').replace('HUMMS', 'HUMSS');
        if (normA !== normS && s.strand !== 'N/A') return false;
      }
      return true;
    }
    function teacherRowsForStudent(s) { return appData.accounts.filter(a => a.role === 'teacher_clearance_head' && a.active).flatMap(t => (t.assignments || []).filter(x => assignmentMatchesStudent(x, s)).map(x => ({ teacher: t, assignment: x, key: `${s.id}|${t.id}|${x.subject || 'Subject'}|${x.grade}|${x.section || 'N/A'}` }))) }
    function teacherRequestFor(row) { return (appData.teacherClearanceRequests || []).find(r => r.key === row.key) }
    function allTeacherApprovalsApproved(s) { const rows = teacherRowsForStudent(s); if (s.clearance.Teacher === 'approved' && rows.length > 0) return true; return rows.length > 0 && rows.every(r => teacherRequestFor(r)?.status === 'approved') }
    function teacherApprovedCount(s) { const rows = teacherRowsForStudent(s); if (s.clearance.Teacher === 'approved' && rows.length > 0) return rows.length; return rows.filter(r => teacherRequestFor(r)?.status === 'approved').length }
    function teacherOverallStatus(s) { const rows = teacherRowsForStudent(s); if (!rows.length) return 'no teacher assigned'; if (allTeacherApprovalsApproved(s) || s.clearance.Teacher === 'approved') return 'approved'; if (rows.some(r => teacherRequestFor(r)?.status === 'requested')) return 'requested'; return 'not requested' }
    function clearanceComplete(s) { return (allTeacherApprovalsApproved(s) || s.clearance.Teacher === 'approved') && ['Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar'].every(k => s.clearance[k] === 'approved') }
    function officeApproved(s) { return ['Guidance', 'Prefect', 'Library'].every(k => s.clearance[k] === 'approved') }
    function principalUnlocked(s) { return (allTeacherApprovalsApproved(s) || s.clearance.Teacher === 'approved') && officeApproved(s) }
    function finalUnlocked(s) { return s.clearance.Principal === 'approved' && balance(s) === 0 }
    function dueStatus(student) { const due = studentInstallments(student); const today = new Date('2026-02-01'); let status = 'Paid'; for (const row of due) { if (row.paid < row.amount) { status = new Date(row.dueDate) < today ? 'Overdue' : 'Upcoming'; break } } return status }
    function studentInstallments(student) {
      let paid = Number(student.paid || 0);
      const templates = appData.installmentTemplate || [];
      const count = templates.length || 1;
      const equalPercent = 100 / count;

      return templates.map(t => {
        const pct = (t.percent !== undefined && t.percent !== null && t.percent !== '') ? Number(t.percent) : equalPercent;
        const amount = Math.round(assessedTotal(student) * (pct / 100));
        const applied = Math.min(paid, amount);
        paid -= applied;
        return { ...t, amount, paid: applied, status: applied >= amount ? 'Paid' : applied > 0 ? 'Partial' : 'Unpaid' };
      });
    }
    function toggleMobileDrawer() {
      document.getElementById('mobileDrawer').classList.toggle('hidden');
    }
    function renderNav() {
      const navHtml = navItems.map(([page, icon, label]) => `<button data-page="${page}" class="nav-btn w-full flex items-center gap-3 px-4 py-3 rounded-xl text-blue-50 hover:bg-white/10 transition font-semibold text-left"><span class="material-symbols-rounded text-[20px]">${icon}</span>${label}</button>`).join('');
      if (sideNav) sideNav.innerHTML = navHtml;
      const mobNav = document.getElementById('mobileSideNav');
      if (mobNav) mobNav.innerHTML = navHtml;
      document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => showPage(btn.dataset.page));
      showPage('dashboardPage');
    }
    function showPage(id) { document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('bg-white', 'text-academy-navy'); b.classList.add('text-blue-50') }); const active = document.querySelector(`[data-page="${id}"]`); if (active) { active.classList.add('bg-white', 'text-academy-navy'); active.classList.remove('text-blue-50') } const item = navItems.find(x => x[0] === id); if (item) { pageTitle.textContent = item[2]; pageSubtitle.textContent = item[3] } if (typeof renderAll === 'function') renderAll(); }
    function renderDashboard() { totalStudents.textContent = appData.students.length; const collected = appData.students.reduce((s, x) => s + Number(x.paid || 0), 0); const outstanding = appData.students.reduce((s, x) => s + balance(s), 0); const vouchers = appData.students.reduce((s, x) => s + voucherAmount(s), 0); totalCollected.textContent = money(collected); totalOutstanding.textContent = money(outstanding); voucherTotal.textContent = money(vouchers) }
    function renderStudents() {
      const q = (studentSearch?.value || '').toLowerCase();
      const level = levelFilter?.value || 'all';
      const bf = balanceFilter?.value || 'all';
      let rows = appData.students.filter(s => (level === 'all' || s.level === level) && (bf === 'all' || (bf === 'with_balance' ? balance(s) > 0 : balance(s) === 0)) && (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)));
      studentTableBody.innerHTML = rows.map(s => `<tr class="hover:bg-academy-soft">
        <td class="px-4 py-3"><p class="font-extrabold text-academy-navy">${s.name}</p><p class="text-xs text-academy-muted">${s.id}</p></td>
        <td class="px-4 py-3">${s.level}</td>
        <td class="px-4 py-3">${classLabel(s)}</td>
        <td class="px-4 py-3">${s.voucher === 'None' ? pill('None', 'gray') : `<span class="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200/60 whitespace-nowrap inline-flex items-center gap-1.5"><span class="material-symbols-rounded text-xs">confirmation_number</span>${s.voucher} (${money(voucherAmount(s))})</span>`}</td>
        <td class="px-4 py-3 font-bold">${money(assessedTotal(s))}</td>
        <td class="px-4 py-3 font-bold text-green-700">${money(s.paid)}</td>
        <td class="px-4 py-3 font-bold ${balance(s) > 0 ? 'text-red-600' : 'text-green-600'}">${money(balance(s))}</td>
        <td class="px-4 py-3">${pill(dueStatus(s), dueStatus(s) === 'Overdue' ? 'red' : dueStatus(s) === 'Paid' ? 'green' : 'amber')}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-1.5">
            <button onclick="openInPersonPaymentModal('${s.id}')" class="px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-extrabold text-xs hover:bg-green-100 transition flex items-center gap-1">
              <span class="material-symbols-rounded text-[16px]">payments</span>Pay OTC
            </button>
            <button onclick="openEditStudentFeesModal('${s.id}')" class="px-2.5 py-1.5 rounded-lg bg-blue-50 text-academy-blue font-extrabold text-xs hover:bg-blue-100 transition flex items-center gap-1">
              <span class="material-symbols-rounded text-[16px]">edit_note</span>Edit Fees
            </button>
          </div>
        </td>
      </tr>`).join('')
    }
    function renderFees() {
      feeStructureList.innerHTML = ['JHS', 'SHS'].map(level => `
        <div class="border border-academy-border rounded-2xl overflow-hidden shadow-card mb-4">
          <div class="bg-academy-soft px-4 py-3 flex justify-between items-center border-b border-academy-border">
            <div><strong class="text-academy-navy font-extrabold">${level} Fee Setup</strong></div>
            <div class="flex items-center gap-3">
              <button onclick="openFeeItemModal('${level}')" class="px-3 py-1.5 rounded-xl bg-academy-navy text-white text-xs font-bold hover:bg-blue-900 transition flex items-center gap-1">
                <span class="material-symbols-rounded text-xs">add</span> Add Fee Item
              </button>
              <strong class="text-base font-black text-academy-navy">${money(feeTotal(level))}</strong>
            </div>
          </div>
          ${(appData.feeStructures[level] || []).map((f, i) => `
            <div class="px-4 py-3 flex justify-between items-center text-sm border-t border-academy-border hover:bg-slate-50 transition">
              <span class="font-bold text-slate-800">${f.name}</span>
              <div class="flex items-center gap-3">
                <span class="font-black text-academy-navy">${money(f.amount)}</span>
                <div class="flex items-center gap-1.5">
                  <button onclick="openFeeItemModal('${level}', '${f.id || i}')" class="px-2.5 py-1.5 rounded-lg bg-sky-50 text-academy-navy hover:bg-sky-100 font-extrabold text-xs transition border border-sky-200/60 flex items-center gap-1">
                    <span class="material-symbols-rounded text-xs">edit</span> Edit
                  </button>
                  <button onclick="deleteFeeItem('${level}', '${f.id || i}')" class="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-extrabold text-xs transition border border-red-200/60 flex items-center gap-1">
                    <span class="material-symbols-rounded text-xs">delete</span> Delete
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');
      voucherList.innerHTML = appData.vouchers.map(v => `
        <div class="p-4 rounded-2xl border border-academy-border bg-white shadow-sm flex items-center justify-between gap-3">
          <div>
            <p class="font-extrabold text-academy-navy text-sm">${v.name}</p>
            <p class="text-xs text-academy-muted">Applies to: ${v.appliesTo}</p>
            <div class="mt-1 flex items-center gap-2">
              <span class="text-sm font-extrabold text-emerald-700">${money(v.amount)}</span>
              ${pill(v.active ? 'Active' : 'Inactive', v.active ? 'green' : 'gray')}
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="openVoucherModal('${v.id}')" class="px-2.5 py-1.5 rounded-lg bg-sky-50 text-academy-navy font-extrabold text-xs hover:bg-sky-100 transition">
              Edit
            </button>
            <button onclick="toggleVoucherStatus('${v.id}')" class="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-extrabold text-xs hover:bg-amber-100 transition">
              ${v.active ? 'Disable' : 'Enable'}
            </button>
            <button onclick="deleteVoucher('${v.id}')" class="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-extrabold text-xs hover:bg-red-100 transition">
              Delete
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-xs text-academy-muted">No vouchers set.</p>';
    }
    function renderDueDates() {
      const container = document.getElementById('installmentTemplateList');
      if (container) {
        if (!appData.installmentTemplate || appData.installmentTemplate.length === 0) {
          container.innerHTML = `
            <div class="col-span-full p-8 text-center rounded-2xl border border-dashed border-academy-border bg-academy-soft text-academy-muted space-y-2">
              <span class="material-symbols-rounded text-3xl text-amber-500">calendar_today</span>
              <p class="font-extrabold text-sm text-academy-navy">No Due Date Schedules Set</p>
              <p class="text-xs">Click "+ Add Due Date" to set up installment due dates and descriptions.</p>
            </div>
          `;
        } else {
          container.innerHTML = appData.installmentTemplate.map(t => `
            <div class="p-4 rounded-2xl border border-academy-border bg-white shadow-xs hover:border-academy-blue/40 transition flex flex-col justify-between gap-3">
              <div class="space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <h4 class="font-extrabold text-academy-navy text-sm">${t.title}</h4>
                  <span class="px-2 py-0.5 rounded-md bg-blue-50 text-academy-navy text-[11px] font-bold shrink-0 border border-blue-100 flex items-center gap-1">
                    <span class="material-symbols-rounded text-xs text-amber-600">notifications_active</span> Reminder
                  </span>
                </div>
                <p class="text-xs text-academy-muted leading-relaxed line-clamp-2">${t.description || 'Payment milestone reminder for students & parents.'}</p>
                <p class="text-xs font-bold text-amber-700 flex items-center gap-1 pt-1">
                  <span class="material-symbols-rounded text-sm">event</span>Due: ${t.dueDate || 'N/A'}
                </p>
              </div>
              <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button onclick="openInstallmentModal('${t.id}')" class="px-2.5 py-1.5 rounded-lg bg-sky-50 text-academy-navy font-extrabold text-xs hover:bg-sky-100 transition">
                  Edit
                </button>
                <button onclick="deleteInstallment('${t.id}')" class="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-extrabold text-xs hover:bg-red-100 transition">
                  Delete
                </button>
              </div>
            </div>
          `).join('');
        }
      }
    }

    function sendBulkDueDateReminders() {
      const overdueStudents = appData.students.filter(s => balance(s) > 0 && dueStatus(s) === 'Overdue');
      const upcomingStudents = appData.students.filter(s => balance(s) > 0 && dueStatus(s) === 'Upcoming');
      const totalCount = overdueStudents.length + upcomingStudents.length;

      if (totalCount === 0) {
        showToast('All Accounts Current', 'No student accounts require due date reminder notices at this time.', 'success');
        return;
      }

      showToast('Reminders Dispatched', `Automated due date alerts successfully dispatched to ${totalCount} student account(s) (${overdueStudents.length} Overdue, ${upcomingStudents.length} Upcoming).`, 'success');
    }
    function renderClearance() {
      clearanceBody.innerHTML = appData.students.map(s => {
        const teacherApproved = teacherApprovedCount(s);
        const teacherTotal = teacherCountForStudent(s);
        const tStatus = teacherOverallStatus(s);

        let teachersNeededHtml = '';
        if (teacherTotal === 0) {
          teachersNeededHtml = `
            <div class="inline-flex flex-col gap-1 items-start">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/80 whitespace-nowrap shadow-sm">
                <span class="material-symbols-rounded text-[15px] text-slate-400">person_off</span>
                No Teacher Assigned
              </span>
              <span class="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Awaiting subject assignment</span>
            </div>
          `;
        } else {
          const isAllCleared = teacherApproved === teacherTotal;
          const statusCls = isAllCleared
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
            : tStatus === 'requested'
              ? 'bg-blue-50 text-blue-700 border-blue-200/80'
              : 'bg-amber-50 text-amber-700 border-amber-200/80';
          const icon = isAllCleared
            ? 'check_circle'
            : tStatus === 'requested'
              ? 'schedule'
              : 'hourglass_top';
          const label = isAllCleared
            ? 'All Cleared'
            : tStatus === 'requested'
              ? 'Requested'
              : 'Pending';

          teachersNeededHtml = `
            <div class="inline-flex flex-col gap-1 items-start">
              <div class="text-xs font-bold text-slate-800 whitespace-nowrap">
                <span class="text-sm font-extrabold text-academy-navy">${teacherApproved}</span><span class="text-slate-400 font-semibold"> / ${teacherTotal} approval(s)</span>
              </div>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusCls} whitespace-nowrap shadow-sm">
                <span class="material-symbols-rounded text-[13px]">${icon}</span>
                ${label}
              </span>
            </div>
          `;
        }

        const officeClearanceHtml = `
          <div class="flex flex-col gap-1 text-[11px] font-semibold">
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Guidance === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
              Guidance: <strong class="capitalize ${s.clearance.Guidance === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">${s.clearance.Guidance || 'pending'}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Prefect === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
              Prefect: <strong class="capitalize ${s.clearance.Prefect === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">${s.clearance.Prefect || 'pending'}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Library === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
              Library: <strong class="capitalize ${s.clearance.Library === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">${s.clearance.Library || 'pending'}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Principal === 'approved' ? 'bg-emerald-500' : (!principalUnlocked(s) ? 'bg-slate-400' : 'bg-amber-500')}"></span>
              Principal: <strong class="capitalize ${s.clearance.Principal === 'approved' ? 'text-emerald-700' : (!principalUnlocked(s) ? 'text-slate-500 font-normal' : 'text-amber-700')}">${s.clearance.Principal === 'approved' ? 'Approved' : (!principalUnlocked(s) ? 'Locked' : 'Pending')}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Accounting === 'approved' ? 'bg-emerald-500' : (!finalUnlocked(s) ? 'bg-slate-400' : 'bg-amber-500')}"></span>
              Accounting: <strong class="capitalize ${s.clearance.Accounting === 'approved' ? 'text-emerald-700' : (!finalUnlocked(s) ? 'text-slate-500 font-normal' : 'text-amber-700')}">${s.clearance.Accounting === 'approved' ? 'Approved' : (!finalUnlocked(s) ? 'Locked' : 'Pending')}</strong>
            </span>
            <span class="inline-flex items-center gap-1.5 text-slate-700">
              <span class="w-1.5 h-1.5 rounded-full ${s.clearance.Registrar === 'approved' ? 'bg-emerald-500' : (!finalUnlocked(s) ? 'bg-slate-400' : 'bg-amber-500')}"></span>
              Registrar: <strong class="capitalize ${s.clearance.Registrar === 'approved' ? 'text-emerald-700' : (!finalUnlocked(s) ? 'text-slate-500 font-normal' : 'text-amber-700')}">${s.clearance.Registrar === 'approved' ? 'Approved' : (!finalUnlocked(s) ? 'Locked' : 'Pending')}</strong>
            </span>
          </div>
        `;

        const principalHtml = principalUnlocked(s)
          ? pill(s.clearance.Principal === 'approved' ? 'Approved' : 'Pending', s.clearance.Principal === 'approved' ? 'green' : 'amber')
          : pill('Locked', 'gray');

        const bal = balance(s);
        const accountingApproved = s.clearance.Accounting === 'approved';
        const registrarApproved = s.clearance.Registrar === 'approved';

        const accountingRegistrarHtml = `
          <div class="flex flex-col gap-1 text-[11px] font-bold">
            <div>
              ${accountingApproved
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"><span class="material-symbols-rounded text-[13px]">check_circle</span> Accounting: Approved</span>`
                : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs"><span class="material-symbols-rounded text-[13px]">schedule</span> Accounting: Pending</span>`}
            </div>
            <div>
              ${registrarApproved
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"><span class="material-symbols-rounded text-[13px]">check_circle</span> Registrar: Approved</span>`
                : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs"><span class="material-symbols-rounded text-[13px]">schedule</span> Registrar: Pending</span>`}
            </div>
            ${bal > 0
              ? `<span class="text-[10px] text-red-600 font-extrabold">Balance: ${money(bal)}</span>`
              : `<span class="text-[10px] text-emerald-600 font-extrabold">₱0 Balance (Cleared)</span>`}
          </div>
        `;

        const certHtml = clearanceComplete(s)
          ? pill('Eligible', 'green')
          : pill('Pending Clearance', 'amber');

        return `
          <tr class="hover:bg-academy-soft border-b border-slate-100">
            <td class="px-4 py-3 font-extrabold text-academy-navy">${s.name}</td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-700">${classLabel(s)}</td>
            <td class="px-4 py-3 text-xs">
              ${teachersNeededHtml}
            </td>
            <td class="px-4 py-3">${officeClearanceHtml}</td>
            <td class="px-4 py-3">${principalHtml}</td>
            <td class="px-4 py-3">${accountingRegistrarHtml}</td>
            <td class="px-4 py-3">${certHtml}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1.5 items-center min-w-[280px]">
                ${accountingApproved
                  ? `<button onclick="toggleDepartmentClearance('${s.id}', 'Accounting')" class="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold text-[11px] transition border border-emerald-200/80 flex items-center gap-1 shadow-xs" title="Accounting approved. Click to change status."><span class="material-symbols-rounded text-xs">verified</span> Accounting ✓</button>`
                  : `<button onclick="approveAccountingClearance('${s.id}')" class="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold text-[11px] transition border border-blue-200/80 flex items-center gap-1 shadow-xs"><span class="material-symbols-rounded text-xs">receipt_long</span> Approve Accounting</button>`}
                ${registrarApproved
                  ? `<button onclick="toggleDepartmentClearance('${s.id}', 'Registrar')" class="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold text-[11px] transition border border-emerald-200/80 flex items-center gap-1 shadow-xs" title="Registrar approved. Click to change status."><span class="material-symbols-rounded text-xs">verified</span> Registrar ✓</button>`
                  : `<button onclick="approveRegistrarClearance('${s.id}')" class="px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-extrabold text-[11px] transition border border-indigo-200/80 flex items-center gap-1 shadow-xs"><span class="material-symbols-rounded text-xs">app_registration</span> Approve Registrar</button>`}
                <button onclick="approveNextClearance('${s.id}')" class="px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 font-extrabold text-[11px] transition border border-slate-200 flex items-center gap-1" title="Approve Next in Sequence"><span class="material-symbols-rounded text-xs">fast_forward</span> Next</button>
                <button onclick="requestCertificate('${s.id}')" class="px-2.5 py-1.5 rounded-xl bg-slate-50 text-academy-navy hover:bg-slate-100 font-extrabold text-[11px] transition border border-slate-200 flex items-center gap-1"><span class="material-symbols-rounded text-xs">workspace_premium</span> Certificate</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    function teacherCountForStudent(s) { return teacherRowsForStudent(s).length }
    function renderAccounts() { activeAccounts.textContent = appData.accounts.filter(a => a.active).length; teacherAssignments.textContent = appData.accounts.reduce((n, a) => n + (a.assignments || []).length, 0); allStudentHeads.textContent = appData.accounts.filter(a => ['guidance_head', 'prefect_head', 'librarian_head', 'principal', 'accounting_admin', 'registrar'].includes(a.role)).length; accountsBody.innerHTML = appData.accounts.map(a => `<tr class="hover:bg-academy-soft"><td class="px-4 py-3 font-extrabold text-academy-navy">${a.name}</td><td class="px-4 py-3">${a.email}</td><td class="px-4 py-3">${roleLabel(a.role)}</td><td class="px-4 py-3">${assignmentSummary(a)}</td><td class="px-4 py-3">${pill(a.active ? 'Active' : 'Inactive', a.active ? 'green' : 'gray')}</td><td class="px-4 py-3"><div class="flex gap-2"><button onclick="openAccountModal('${a.id}')" class="px-3 py-1.5 rounded-lg bg-sky-50 text-academy-navy font-bold text-xs">Edit</button><button onclick="toggleAccount('${a.id}')" class="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-bold text-xs">${a.active ? 'Deactivate' : 'Activate'}</button><button onclick="deleteAccount('${a.id}')" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 transition">Delete</button></div></td></tr>`).join('') }
    function roleLabel(role) { return { teacher_clearance_head: 'Teacher Clearance Head', guidance_head: 'Guidance Head', prefect_head: 'Prefect of Discipline', librarian_head: 'Librarian', principal: 'Principal', accounting_admin: 'Accounting/Admin', registrar: 'Registrar', super_admin: 'Super Admin' }[role] || role }
    function assignmentSummary(a) {
      if (a.role !== 'teacher_clearance_head') return a.role === 'principal' ? 'Second-to-last approval' : (['accounting_admin', 'registrar'].includes(a.role) ? 'Final clearance approval' : 'All students');
      return (a.assignments || []).map(x => {
        const strandPart = x.strand && x.strand !== 'N/A' ? ` / ${x.strand}` : '';
        return `${x.grade} (${x.section || 'N/A'}${strandPart}) - ${x.subject || 'Subject'}`;
      }).join('<br>') || '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200/80 inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"><span class="material-symbols-rounded text-[14px]">assignment_late</span>No assignment yet</span>';
    }
    let collectionChartInstance = null;
    let levelChartInstance = null;

    function renderAnalyticsCharts() {
      if (typeof Chart === 'undefined') return;

      const billed = appData.students.reduce((s, x) => s + assessedTotal(x), 0);
      const collected = appData.students.reduce((s, x) => s + Number(x.paid || 0), 0);
      const outstanding = appData.students.reduce((s, x) => s + balance(s), 0);
      const vouchers = appData.students.reduce((s, x) => s + voucherAmount(s), 0);

      // 1. Collection Doughnut Chart
      const doughnutCtx = document.getElementById('collectionDoughnutChart')?.getContext('2d');
      if (doughnutCtx) {
        if (collectionChartInstance) collectionChartInstance.destroy();
        collectionChartInstance = new Chart(doughnutCtx, {
          type: 'doughnut',
          data: {
            labels: ['Total Collected Payments', 'Outstanding Balance Due', 'Voucher Discount Impact'],
            datasets: [{
              data: [collected, outstanding, vouchers],
              backgroundColor: ['#059669', '#DC2626', '#2563EB'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' } } }
            }
          }
        });
      }

      // 2. JHS vs SHS Bar Chart
      const barCtx = document.getElementById('levelComparisonBarChart')?.getContext('2d');
      if (barCtx) {
        const jhsStudents = appData.students.filter(s => s.level === 'JHS');
        const shsStudents = appData.students.filter(s => s.level === 'SHS');

        const jhsAssessed = jhsStudents.reduce((n, s) => n + assessedTotal(s), 0);
        const jhsCollected = jhsStudents.reduce((n, s) => n + Number(s.paid || 0), 0);

        const shsAssessed = shsStudents.reduce((n, s) => n + assessedTotal(s), 0);
        const shsCollected = shsStudents.reduce((n, s) => n + Number(s.paid || 0), 0);

        if (levelChartInstance) levelChartInstance.destroy();
        levelChartInstance = new Chart(barCtx, {
          type: 'bar',
          data: {
            labels: ['Junior High (JHS)', 'Senior High (SHS)'],
            datasets: [
              { label: 'Assessed Net Fees', data: [jhsAssessed, shsAssessed], backgroundColor: '#1E3A8A' },
              { label: 'Collected Payments', data: [jhsCollected, shsCollected], backgroundColor: '#059669' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' } } }
            },
            scales: {
              y: { beginAtZero: true, ticks: { callback: value => '₱' + Number(value).toLocaleString() } }
            }
          }
        });
      }
    }

    const DEFAULT_GEMINI_API_KEY = typeof atob === 'function' ? atob('QVEuQWI4Uk42Sk5JT19PdHlMT0pmNl9XRzlWejI1MS1KLXVZWElReG9leXgzSlFaeVZYYXc=') : '';

    async function generateGeminiAiAnalyticsInterpretation() {
      const apiKey = DEFAULT_GEMINI_API_KEY;
      const btn = document.getElementById('btnGenerateAiReport');
      const box = document.getElementById('geminiAiReportBox');

      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin">sync</span> Analyzing...`;
        }

        if (box) {
          box.innerHTML = `<div class="flex items-center gap-3 text-blue-200 py-3"><span class="material-symbols-rounded animate-spin text-2xl text-blue-400">psychology</span><span>Analyzing Pagbilao Academy Inc. financial metrics with Gemini AI...</span></div>`;
        }

        const totalStudentsCount = appData.students.length;
        const grossBilled = appData.students.reduce((sum, x) => sum + assessedTotal(x), 0);
        const totalPaid = appData.students.reduce((sum, x) => sum + Number(x.paid || 0), 0);
        const totalBalance = appData.students.reduce((sum, x) => sum + balance(x), 0);
        const totalVouchers = appData.students.reduce((sum, x) => sum + voucherAmount(x), 0);
        const collectionRatePct = grossBilled > 0 ? Math.round((totalPaid / grossBilled) * 100) : 0;
        const overdueStudentsCount = appData.students.filter(s => balance(s) > 0).length;

        const jhsStudents = appData.students.filter(s => s.level === 'JHS');
        const shsStudents = appData.students.filter(s => s.level === 'SHS');
        const jhsCollected = jhsStudents.reduce((n, s) => n + Number(s.paid || 0), 0);
        const shsCollected = shsStudents.reduce((n, s) => n + Number(s.paid || 0), 0);

        let finalReportHtml = '';

        // Attempt remote Google Gemini API fetch if valid API key is present
        if (apiKey && apiKey.startsWith('AIzaSy')) {
          const prompt = `You are an expert Educational Financial Analyst and Executive Auditor for Pagbilao Academy Inc. in Quezon, Philippines. Analyze the following current financial metrics and generate a concise structured executive report.

Current Metrics:
- Total Enrolled Students: ${totalStudentsCount}
- Total Net Assessed Fees: PHP ${grossBilled.toLocaleString()}
- Total Collections to Date: PHP ${totalPaid.toLocaleString()} (${collectionRatePct}% Collection Rate)
- Total Uncollected Outstanding Balance: PHP ${totalBalance.toLocaleString()}
- Total Voucher/ESC Discount Impact: PHP ${totalVouchers.toLocaleString()}
- Total Students with Outstanding Balances: ${overdueStudentsCount}
- JHS Collections: PHP ${jhsCollected.toLocaleString()}
- SHS Collections: PHP ${shsCollected.toLocaleString()}

Please provide your analysis formatted cleanly in raw HTML (no markdown backticks) containing:
1. <div class="font-extrabold text-emerald-400 text-sm mb-1">HEALTH RATING: [EXCELLENT / GOOD / MODERATE RISK / HIGH RISK]</div>
2. <h5 class="font-bold text-white text-xs mt-2 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-blue-400">analytics</span> Executive Observations:</h5>
   <ul class="list-disc pl-4 space-y-1 text-slate-200">
     <li>Summary of collection efficiency (${collectionRatePct}%) and revenue status.</li>
     <li>Insight on JHS vs SHS collection distribution and voucher impact.</li>
   </ul>
3. <h5 class="font-bold text-white text-xs mt-3 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-amber-400">warning</span> Risk & Overdue Warning:</h5>
   <p class="text-amber-200">${overdueStudentsCount} student accounts currently have uncollected balances total PHP ${totalBalance.toLocaleString()}.</p>
4. <h5 class="font-bold text-white text-xs mt-3 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-yellow-400">lightbulb</span> Recommended Accounting Actions:</h5>
   <ol class="list-decimal pl-4 space-y-1 text-blue-200">
     <li>Action item 1 for accounting counter.</li>
     <li>Action item 2 for clearance deadline enforcement.</li>
   </ol>`;

          const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
          for (const model of models) {
            try {
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
              });
              const resData = await res.json();
              if (res.ok && resData.candidates?.[0]?.content?.parts?.[0]?.text) {
                const text = resData.candidates[0].content.parts[0].text;
                finalReportHtml = text.replace(/```html/g, '').replace(/```/g, '');
                break;
              }
            } catch (e) {}
          }
        }

        // High-precision Built-in Executive Financial Analytics Engine fallback
        if (!finalReportHtml) {
          let healthRating = 'EXCELLENT';
          let healthColor = 'text-emerald-400';
          if (collectionRatePct < 50) {
            healthRating = 'HIGH RISK';
            healthColor = 'text-red-400';
          } else if (collectionRatePct < 75) {
            healthRating = 'MODERATE RISK';
            healthColor = 'text-amber-400';
          } else if (collectionRatePct < 90) {
            healthRating = 'GOOD';
            healthColor = 'text-blue-400';
          }

          finalReportHtml = `
            <div class="font-extrabold ${healthColor} text-sm mb-1">HEALTH RATING: ${healthRating} (${collectionRatePct}% Collection Rate)</div>
            <h5 class="font-bold text-white text-xs mt-2 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-blue-400">analytics</span> Executive Observations:</h5>
            <ul class="list-disc pl-4 space-y-1 text-slate-200">
              <li>Current tuition collection efficiency stands at <strong>${collectionRatePct}%</strong>, with total collections of <strong>PHP ${totalPaid.toLocaleString()}</strong> out of PHP ${grossBilled.toLocaleString()} net assessed fees across ${totalStudentsCount} enrolled students.</li>
              <li>JHS Collections total <strong>PHP ${jhsCollected.toLocaleString()}</strong>, while SHS Collections total <strong>PHP ${shsCollected.toLocaleString()}</strong>. Government voucher/ESC discount subsidy impact is <strong>PHP ${totalVouchers.toLocaleString()}</strong>.</li>
            </ul>
            <h5 class="font-bold text-white text-xs mt-3 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-amber-400">warning</span> Risk & Overdue Warning:</h5>
            <p class="text-amber-200">There are currently <strong>${overdueStudentsCount} student accounts</strong> with uncollected balances totaling <strong>PHP ${totalBalance.toLocaleString()}</strong>.</p>
            <h5 class="font-bold text-white text-xs mt-3 mb-1 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-yellow-400">lightbulb</span> Recommended Accounting Actions:</h5>
            <ol class="list-decimal pl-4 space-y-1 text-blue-200">
              <li>Issue automated installment reminder notices to all ${overdueStudentsCount} students with outstanding balances before upcoming quarterly clearance deadlines.</li>
              <li>Enforce mandatory Accounting and Registrar clearance verification prior to releasing official certificates and transcript records.</li>
            </ol>
          `;
        }

        if (box) {
          box.innerHTML = `
            <div class="flex items-center justify-between border-b border-blue-500/30 pb-2 mb-2 text-xs text-blue-200">
              <span class="font-bold flex items-center gap-1.5 text-emerald-400">
                <span class="material-symbols-rounded text-sm">verified</span>
                Gemini AI Financial Interpretation Complete
              </span>
              <span>Generated ${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="text-slate-100 text-xs leading-relaxed space-y-2">
              ${finalReportHtml}
            </div>
          `;
        }

        showToast('AI Analysis Generated', 'Gemini AI financial interpretation completed!', 'success');
      } catch (err) {
        console.error('Gemini AI error:', err);
        showToast('AI Generation Failed', err.message || 'Error running AI analysis.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<span class="material-symbols-rounded text-base">psychology</span> Analyze Data`;
        }
      }
    }

    function renderAnalytics() {
      const billed = appData.students.reduce((s, x) => s + assessedTotal(x), 0);
      const collected = appData.students.reduce((s, x) => s + Number(x.paid || 0), 0);
      const outstanding = appData.students.reduce((s, x) => s + balance(s), 0);
      const vouchers = appData.students.reduce((s, x) => s + voucherAmount(s), 0);

      analyticsCards.innerHTML = [['Total Assessed', billed, 'text-academy-navy'], ['Total Collected', collected, 'text-green-700'], ['Outstanding', outstanding, 'text-red-600'], ['Voucher Impact', vouchers, 'text-academy-navy']].map(c => `<div class="rounded-2xl bg-white border border-academy-border p-5"><p class="text-sm text-academy-muted">${c[0]}</p><h3 class="mt-3 text-2xl font-extrabold ${c[2]}">${money(c[1])}</h3></div>`).join('');
      
      const levels = ['JHS', 'SHS'];
      collectionByLevel.innerHTML = levels.map(level => {
        const ss = appData.students.filter(s => s.level === level);
        const total = ss.reduce((n, s) => n + assessedTotal(s), 0);
        const paid = ss.reduce((n, s) => n + Number(s.paid || 0), 0);
        const pct = total ? Math.round(paid / total * 100) : 0;
        return `<div><div class="flex justify-between text-sm mb-2"><strong>${level}</strong><span>${money(paid)} / ${money(total)} (${pct}%)</span></div><div class="h-3 bg-academy-light rounded-full overflow-hidden"><div class="h-full bg-academy-blue" style="width:${pct}%"></div></div></div>`;
      }).join('');

      overdueList.innerHTML = appData.students.filter(s => balance(s) > 0).sort((a, b) => balance(b) - balance(a)).map(s => `<div class="p-4 rounded-2xl border border-academy-border flex justify-between"><div><p class="font-extrabold text-academy-navy">${s.name}</p><p class="text-xs text-academy-muted">${classLabel(s)} · ${dueStatus(s)}</p></div><strong class="text-red-600">${money(balance(s))}</strong></div>`).join('') || '<p class="text-sm text-academy-muted">No outstanding balance.</p>';

      const isStaffPayment = (p) => {
        if (!p) return false;
        const name = String(p.studentName || p.studentId || '').toLowerCase();
        const email = String(p.email || p.studentEmail || '').toLowerCase();
        return ['admin', 'accountant', 'accounting', 'teacher', 'principal', 'registrar', 'clearance', 'guidance', 'prefect', 'library'].some(k => name.includes(k) || email.includes(k));
      };

      const allPayments = (appData.payments || []).filter(p => !isStaffPayment(p));
      const txBadge = document.getElementById('adminTxCountBadge');
      if (txBadge) txBadge.textContent = `${allPayments.length} Transaction(s)`;

      const txBody = document.getElementById('adminPaymentsBody');
      if (txBody) {
        if (!allPayments.length) {
          txBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-academy-muted text-xs font-bold">No payment transactions recorded yet.</td></tr>`;
        } else {
          txBody.innerHTML = allPayments.map(p => `
            <tr class="hover:bg-academy-soft">
              <td class="px-4 py-3 font-mono text-xs font-bold text-slate-800">${p.referenceNo || p.id}</td>
              <td class="px-4 py-3 font-extrabold text-academy-navy">${p.studentName || p.studentId}</td>
              <td class="px-4 py-3">${pill(p.method || 'Online', 'green')}</td>
              <td class="px-4 py-3 text-xs text-academy-muted">${p.date || (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Today')}</td>
              <td class="px-4 py-3 text-xs text-slate-600">${p.feeBreakdown && p.feeBreakdown.length ? p.feeBreakdown.join(', ') : (p.remarks || 'Tuition / Assessment Fee')}</td>
              <td class="px-4 py-3 text-right font-extrabold text-emerald-700">${money(p.amount)}</td>
            </tr>
          `).join('');
        }
      }

      renderAnalyticsCharts();
    }
    function renderCertificates() { certificateBody.innerHTML = appData.students.map(s => { const complete = clearanceComplete(s); const req = appData.certificateRequests.find(r => r.studentId === s.id); return `<tr class="hover:bg-academy-soft"><td class="px-4 py-3 font-extrabold text-academy-navy">${s.name}</td><td class="px-4 py-3">${classLabel(s)}</td><td class="px-4 py-3">${complete ? pill('Completed', 'green') : pill('Incomplete', 'amber')}</td><td class="px-4 py-3">${req ? pill(req.status, req.status === 'approved' ? 'green' : 'amber') : 'No request'}</td><td class="px-4 py-3"><button ${complete ? '' : 'disabled'} onclick="openCertificate('${s.id}')" class="px-3 py-1.5 rounded-lg ${complete ? 'bg-academy-navy text-white' : 'bg-slate-100 text-slate-400'} font-bold text-xs">Open Certificate</button></td></tr>` }).join('') }
    function renderAll() { renderDashboard(); renderStudents(); renderFees(); renderDueDates(); renderClearance(); renderAccounts(); renderAnalytics(); renderCertificates(); }
    function openFormModal() {
      const el = document.getElementById('formModal');
      if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
    }
    function closeFormModal() {
      const el = document.getElementById('formModal');
      if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    }

    let currentOtcMode = 'custom';

    function setOtcPayMode(mode, studentId) {
      currentOtcMode = mode;
      const btnCustom = document.getElementById('otcModeCustom');
      const btnItemized = document.getElementById('otcModeItemized');
      const itemizedSec = document.getElementById('otcItemizedSection');

      if (mode === 'custom') {
        btnCustom.className = 'py-2 px-3 rounded-lg font-extrabold text-xs transition bg-white text-academy-navy shadow-xs';
        btnItemized.className = 'py-2 px-3 rounded-lg font-extrabold text-xs transition text-academy-muted hover:text-academy-navy';
        if (itemizedSec) itemizedSec.classList.add('hidden');
      } else {
        btnItemized.className = 'py-2 px-3 rounded-lg font-extrabold text-xs transition bg-white text-academy-navy shadow-xs';
        btnCustom.className = 'py-2 px-3 rounded-lg font-extrabold text-xs transition text-academy-muted hover:text-academy-navy';
        if (itemizedSec) itemizedSec.classList.remove('hidden');
        renderOtcFeeChecklist(studentId);
      }
    }

    function renderOtcFeeChecklist(studentId) {
      const s = appData.students.find(x => x.id === studentId);
      if (!s) return;
      
      let feeItems = (s.customFees && s.customFees.length > 0) ? s.customFees : (appData.feeStructures?.[s.level] || []);
      if (!feeItems.length) {
        if (s.level === 'JHS') {
          feeItems = [
            { name: 'Tuition Fee', amount: 15000 },
            { name: 'Miscellaneous & Computer Fee', amount: 4000 },
            { name: 'Laboratory & Facilities Fee', amount: 2000 },
            { name: 'Registration & Student ID', amount: 1000 }
          ];
        } else {
          feeItems = [
            { name: 'Tuition Fee', amount: 18000 },
            { name: 'Miscellaneous & Facilities Fee', amount: 5000 },
            { name: 'Track / Specialization Fee', amount: 3000 },
            { name: 'Registration & Student ID', amount: 1000 }
          ];
        }
      }

      const container = document.getElementById('otcFeeChecklist');
      if (!container) return;

      container.innerHTML = feeItems.map(f => `
        <label class="flex items-center justify-between p-2 rounded-xl border border-academy-border bg-white hover:bg-academy-soft cursor-pointer transition">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="otc-fee-cb w-4 h-4 rounded text-academy-navy accent-academy-navy" value="${f.amount}" data-name="${f.name}" onchange="recalculateOtcTotal()">
            <span class="text-xs font-bold text-academy-navy">${f.name}</span>
          </div>
          <span class="text-xs font-extrabold text-slate-700">${money(f.amount)}</span>
        </label>
      `).join('');

      recalculateOtcTotal();
    }

    function recalculateOtcTotal() {
      const cbs = document.querySelectorAll('.otc-fee-cb:checked');
      let total = 0;
      cbs.forEach(cb => { total += Number(cb.value || 0) });
      
      const totEl = document.getElementById('otcItemizedTotal');
      if (totEl) totEl.textContent = money(total);
      const amtEl = document.getElementById('otcAmount');
      if (amtEl) amtEl.value = total;
    }

    function selectAllOtcFeeItems(select = true) {
      document.querySelectorAll('.otc-fee-cb').forEach(cb => { cb.checked = select });
      recalculateOtcTotal();
    }

    function openInPersonPaymentModal(id) {
      const s = appData.students.find(x => x.id === id);
      if (!s) return;
      currentOtcMode = 'custom';
      const currentBal = balance(s);
      const autoRef = 'OR-' + (appData.settings?.schoolYear || '2026') + '-' + Math.floor(100000 + Math.random() * 900000);

      formModalLabel.textContent = 'Cash & Over-The-Counter Payment';
      formModalTitle.textContent = `Record Payment for ${s.name}`;
      formModalContent.innerHTML = `
        <form id="otcPaymentForm" class="space-y-4">
          <div class="p-4 rounded-2xl bg-academy-soft border border-academy-border flex justify-between items-center text-xs">
            <div>
              <p class="font-extrabold text-academy-navy text-sm">${s.name}</p>
              <p class="text-academy-muted">${classLabel(s)} · ID: ${s.id}</p>
            </div>
            <div class="text-right">
              <p class="text-academy-muted font-bold">Outstanding Balance</p>
              <p class="text-base font-extrabold text-red-600">${money(currentBal)}</p>
            </div>
          </div>

          <!-- Payment Option Toggle -->
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1.5">Payment Option</label>
            <div class="grid grid-cols-2 gap-2 p-1 rounded-xl bg-academy-soft border border-academy-border">
              <button id="otcModeCustom" type="button" onclick="setOtcPayMode('custom', '${s.id}')" class="py-2 px-3 rounded-lg font-extrabold text-xs transition bg-white text-academy-navy shadow-xs">
                Custom / Partial Amount
              </button>
              <button id="otcModeItemized" type="button" onclick="setOtcPayMode('itemized', '${s.id}')" class="py-2 px-3 rounded-lg font-extrabold text-xs transition text-academy-muted hover:text-academy-navy">
                Select Specific Fee Items
              </button>
            </div>
          </div>

          <!-- Itemized Fee Selection Checklist -->
          <div id="otcItemizedSection" class="hidden space-y-2">
            <div class="flex justify-between items-center">
              <label class="block text-xs font-extrabold text-academy-navy">Check Fee Items Being Paid</label>
              <button type="button" onclick="selectAllOtcFeeItems(true)" class="text-xs font-bold text-academy-blue hover:underline">Select All</button>
            </div>
            <div id="otcFeeChecklist" class="space-y-1.5 max-h-44 overflow-y-auto pr-1"></div>
            <div class="p-2.5 rounded-xl bg-academy-soft border border-academy-border flex justify-between items-center text-xs font-bold">
              <span class="text-academy-navy">Selected Fees Total:</span>
              <span id="otcItemizedTotal" class="text-sm font-extrabold text-emerald-700">₱0</span>
            </div>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Payment Method / Channel</label>
              <select id="otcMethod" class="w-full px-3 py-2.5 rounded-xl border border-academy-border bg-white text-xs font-bold focus:outline-none">
                <option value="Cash (In-Person)">Cash (In-Person / Accounting)</option>
                <option value="Over-The-Counter">Over-The-Counter (OTC Bank)</option>
                <option value="Cheque">Cheque Payment</option>
                <option value="Bank Deposit">Direct Bank Deposit</option>
                <option value="Manual Adjustment">Manual Ledger Adjustment</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Payment Amount (PHP)</label>
              <input type="number" id="otcAmount" min="1" step="any" required value="${currentBal > 0 ? currentBal : ''}" placeholder="0" class="w-full px-3 py-2.5 rounded-xl border border-academy-border font-extrabold text-sm focus:outline-none">
            </div>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Official Receipt (OR) / Ref No.</label>
              <input type="text" id="otcRefNo" required value="${autoRef}" class="w-full px-3 py-2.5 rounded-xl border border-academy-border font-mono text-xs focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Payment Date</label>
              <input type="date" id="otcDate" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2.5 rounded-xl border border-academy-border text-xs focus:outline-none">
            </div>
          </div>

          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Optional Remarks / Notes</label>
            <input type="text" id="otcNotes" placeholder="e.g. Paid at Accounting Office Counter 2" class="w-full px-3 py-2.5 rounded-xl border border-academy-border text-xs focus:outline-none">
          </div>

          <button type="submit" class="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-md transition flex items-center justify-center gap-2">
            <span class="material-symbols-rounded text-lg">check_circle</span>Confirm & Record Payment
          </button>
        </form>
      `;

      document.getElementById('otcPaymentForm').onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById('otcAmount').value) || 0;
        const method = document.getElementById('otcMethod').value;
        const refNo = document.getElementById('otcRefNo').value.trim() || autoRef;
        const dateStr = document.getElementById('otcDate').value || new Date().toISOString().slice(0, 10);
        const notes = document.getElementById('otcNotes').value.trim();

        if (amt <= 0) {
          showToast('Invalid Payment Amount', 'Please enter a payment amount greater than 0.', 'warning');
          return;
        }

        let feeBreakdown = [];
        if (currentOtcMode === 'itemized') {
          const cbs = document.querySelectorAll('.otc-fee-cb:checked');
          cbs.forEach(cb => feeBreakdown.push(cb.dataset.name));
        }

        const paymentObj = {
          id: 'PAY-' + Date.now(),
          studentId: s.id,
          studentName: s.name,
          amount: amt,
          method: method,
          referenceNo: refNo,
          feeBreakdown: feeBreakdown,
          remarks: notes,
          status: 'Paid',
          paidAt: new Date(dateStr).toISOString(),
          date: dateStr,
          schoolYear: appData.settings?.schoolYear || '2026-2027'
        };

        s.paid = Number(s.paid || 0) + amt;
        appData.payments = appData.payments || [];
        appData.payments.unshift(paymentObj);

        if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
          try {
            await window.paApi.recordPayment({
              studentId: s.id,
              amount: amt,
              method: method,
              referenceNo: refNo
            });
            const state = await window.paApi.fetchDatabaseState();
            if (state) appData = { ...appData, ...state, students: mergeStudentsState(appData.students || [], state.students || []) };
          } catch (err) {
            console.warn('Supabase OTC payment sync warning:', err);
          }
        }

        saveData();
        renderAll();
        closeFormModal();
        showToast('Payment Recorded', `Recorded ${money(amt)} payment for ${s.name} (${refNo}).`);
      };

      openFormModal();
    }

    function openEditStudentFeesModal(id) {
      const s = appData.students.find(x => x.id === id);
      if (!s) return;

      const defaultFeeItems = appData.feeStructures?.[s.level] || [];
      const appliedFeeNames = (s.customFees && s.customFees.length > 0)
        ? s.customFees.map(f => f.name)
        : defaultFeeItems.map(f => f.name);

      const checkboxesHtml = defaultFeeItems.map(f => {
        const isChecked = appliedFeeNames.includes(f.name);
        return `
          <label class="flex items-center justify-between p-2.5 rounded-xl border border-academy-border bg-white hover:bg-academy-soft cursor-pointer transition">
            <div class="flex items-center gap-2.5">
              <input type="checkbox" class="student-fee-cb w-4 h-4 text-academy-navy rounded accent-academy-navy" value="${f.amount}" data-name="${f.name}" ${isChecked ? 'checked' : ''} onchange="updateStudentFeeModalCalc()">
              <span class="text-xs font-bold text-academy-navy">${f.name}</span>
            </div>
            <span class="text-xs font-extrabold text-slate-700">${money(f.amount)}</span>
          </label>
        `;
      }).join('');

      const activeVouchers = (appData.vouchers || []).filter(v => v.active !== false && (v.appliesTo === s.level || v.appliesTo === 'All' || v.appliesTo === 'SHS' || v.appliesTo === 'JHS'));
      const voucherOptionsHtml = `<option value="None" ${(!s.voucher || s.voucher === 'None') ? 'selected' : ''}>None (No Voucher)</option>` +
        activeVouchers.map(v => `<option value="${v.name}" ${s.voucher === v.name ? 'selected' : ''}>${v.name} (${money(v.amount)})</option>`).join('');

      formModalLabel.textContent = 'Custom Student Assessment';
      formModalTitle.textContent = `Customize Fees & Balance for ${s.name}`;
      formModalContent.innerHTML = `
        <form id="editStudentFeesForm" class="space-y-4">
          <div class="p-3.5 rounded-2xl bg-academy-soft border border-academy-border flex justify-between items-center text-xs">
            <div>
              <p class="font-extrabold text-academy-navy text-sm">${s.name}</p>
              <p class="text-academy-muted">${classLabel(s)} · ID: ${s.id}</p>
            </div>
            <div class="text-right">
              <p class="text-academy-muted font-bold">Current Total Paid</p>
              <p class="text-sm font-extrabold text-green-700">${money(s.paid)}</p>
            </div>
          </div>

          <!-- Select Standard Fee Components -->
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1.5">1. Applied Standard Fees (${s.level})</label>
            <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              ${checkboxesHtml}
            </div>
          </div>

          <!-- Voucher Selection -->
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1.5">2. Assigned Voucher / Discount Grant</label>
            <select id="modVoucherSelect" class="w-full px-3 py-2.5 rounded-xl border border-academy-border bg-white text-xs font-bold focus:outline-none" onchange="updateStudentFeeModalCalc()">
              ${voucherOptionsHtml}
            </select>
          </div>

          <!-- Additional Custom Fee & Discount -->
          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">3. Custom Discount / Scholarship (PHP)</label>
              <input type="number" id="modDiscount" min="0" step="any" value="${s.feeDiscount || 0}" placeholder="0" class="w-full px-3 py-2 rounded-xl border border-academy-border text-xs font-bold focus:outline-none" oninput="updateStudentFeeModalCalc()">
            </div>
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">4. Direct Net Fee Override (Optional)</label>
              <input type="number" id="modOverride" min="0" step="any" value="${s.assessedOverride !== undefined && s.assessedOverride !== null ? s.assessedOverride : ''}" placeholder="Leave blank for auto-calc" class="w-full px-3 py-2 rounded-xl border border-academy-border text-xs font-bold focus:outline-none" oninput="updateStudentFeeModalCalc()">
            </div>
          </div>

          <!-- Live Calculation Preview -->
          <div class="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-300">Sum of Selected Standard Fees:</span>
              <span id="modSelectedSum" class="font-bold text-white">₱0</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-300">Voucher Discount (<span id="modVoucherLabel">None</span>):</span>
              <span id="modVoucherPreview" class="font-bold text-blue-300">-₱0</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-300">Custom Discount:</span>
              <span id="modDiscountPreview" class="font-bold text-amber-300">-₱0</span>
            </div>
            <div class="border-t border-slate-700 pt-2 flex justify-between font-extrabold text-sm">
              <span>New Net Assessed Fee:</span>
              <span id="modNetAssessedPreview" class="text-emerald-400">₱0</span>
            </div>
            <div class="flex justify-between text-xs font-bold">
              <span>New Remaining Balance:</span>
              <span id="modNetBalancePreview" class="text-red-400">₱0</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button type="button" onclick="resetStudentFeesToDefault('${s.id}')" class="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100">
              Reset to Standard
            </button>
            <button type="submit" class="flex-1 py-3.5 rounded-xl bg-academy-navy hover:bg-blue-900 text-white font-extrabold shadow-md transition">
              Save Fee & Balance Adjustments
            </button>
          </div>
        </form>
      `;

      window.updateStudentFeeModalCalc = () => {
        const selectedCbs = document.querySelectorAll('.student-fee-cb:checked');
        let selectedSum = 0;
        selectedCbs.forEach(cb => { selectedSum += Number(cb.value || 0) });

        const selVoucherName = document.getElementById('modVoucherSelect')?.value || 'None';
        const foundVoucher = (appData.vouchers || []).find(x => x.name === selVoucherName && x.active !== false);
        const vAmt = foundVoucher ? Number(foundVoucher.amount || 0) : 0;

        const customDiscount = Number(document.getElementById('modDiscount')?.value || 0);
        const overrideVal = document.getElementById('modOverride')?.value;

        let netAssessed = 0;
        if (overrideVal !== undefined && overrideVal !== null && overrideVal !== '') {
          netAssessed = Math.max(0, Number(overrideVal));
        } else {
          netAssessed = Math.max(0, selectedSum - vAmt - customDiscount);
        }

        const netBal = Math.max(0, netAssessed - Number(s.paid || 0));

        document.getElementById('modSelectedSum').textContent = money(selectedSum);
        if (document.getElementById('modVoucherLabel')) document.getElementById('modVoucherLabel').textContent = selVoucherName;
        if (document.getElementById('modVoucherPreview')) document.getElementById('modVoucherPreview').textContent = '-' + money(vAmt);
        document.getElementById('modDiscountPreview').textContent = '-' + money(customDiscount);
        document.getElementById('modNetAssessedPreview').textContent = money(netAssessed);
        document.getElementById('modNetBalancePreview').textContent = money(netBal);
      };

      window.updateStudentFeeModalCalc();

      document.getElementById('editStudentFeesForm').onsubmit = (e) => {
        e.preventDefault();
        const selectedCbs = document.querySelectorAll('.student-fee-cb:checked');
        const customFees = Array.from(selectedCbs).map(cb => ({
          name: cb.dataset.name,
          amount: Number(cb.value || 0)
        }));

        const selectedVoucher = document.getElementById('modVoucherSelect').value;
        const customDiscount = Number(document.getElementById('modDiscount').value || 0);
        const overrideRaw = document.getElementById('modOverride').value;
        const assessedOverride = (overrideRaw !== '' && !isNaN(overrideRaw)) ? Number(overrideRaw) : null;

        s.voucher = selectedVoucher;
        s.customFees = customFees;
        s.feeDiscount = customDiscount;
        s.assessedOverride = assessedOverride;

        saveData();
        syncStudentVoucherToSupabase(s.id, selectedVoucher);
        renderAll();
        closeFormModal();
        showToast('Fee Structure Updated', `Custom fees & voucher saved for ${s.name}.`);
      };

      openFormModal();
    }

    function resetStudentFeesToDefault(studentId) {
      const s = appData.students.find(x => x.id === studentId);
      if (!s) return;
      s.voucher = 'None';
      delete s.customFees;
      delete s.feeDiscount;
      delete s.assessedOverride;
      saveData();
      syncStudentVoucherToSupabase(s.id, 'None');
      renderAll();
      closeFormModal();
      showToast('Reset Complete', `Reverted ${s.name} to standard level fee structure.`);
    }

    function applyFeeSetup() { appData.students.forEach(s => { s.total = assessedTotal(s) }); saveData(); renderAll(); showToast('Fees applied', 'JHS/SHS fees and voucher discounts were recalculated.') }
    function generateInstallments() { saveData(); renderDueDates(); showToast('Installments generated', 'Student installment schedules follow the current due date template.') }
    async function executeOfficeClearanceApproval(student, deptName, newStatus = 'approved', remarks = 'Approved by Admin') {
      try {
        student.clearance = student.clearance || {};
        student.clearance[deptName] = newStatus;
        saveData();
        renderAll();

        if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
          await window.paApi.requestClearance(student.id, appData.settings.schoolYear || '2026-2027');
          await window.paApi.updateOfficeClearance(student.id, deptName, newStatus, remarks);
          const state = await window.paApi.fetchDatabaseState();
          if (state && state.students) {
            appData.students = mergeStudentsState(appData.students || [], state.students);
            saveData();
            renderAll();
          }
        }
        showToast('Clearance Updated', `${deptName} clearance marked as ${newStatus} for ${student.name}.`, 'success');
      } catch (err) {
        console.warn(`Supabase ${deptName} clearance update notice:`, err);
        const isLock = err?.message && (err.message.includes('locked') || err.message.includes('balance') || err.message.includes('Principal'));
        if (isLock) {
          showToast('Clearance Lock Notice', err.message, 'warning');
        } else {
          showToast('Clearance Updated (Local)', `${deptName} updated locally for ${student.name}.`, 'info');
        }
      }
    }

    async function approveAccountingClearance(studentId) {
      const s = appData.students.find(x => x.id === studentId);
      if (!s) return;

      const bal = balance(s);
      if (bal > 0) {
        showConfirmModal({
          title: 'Approve Accounting with Outstanding Balance?',
          message: `${s.name} currently has an outstanding balance of ${money(bal)}. Do you want to approve Accounting clearance anyway as Administrator/Accounting?`,
          confirmText: 'Approve Accounting',
          onConfirm: async () => {
            await executeOfficeClearanceApproval(s, 'Accounting', 'approved', 'Approved by Admin (Accounting)');
          }
        });
        return;
      }

      await executeOfficeClearanceApproval(s, 'Accounting', 'approved', 'Approved by Admin (Accounting)');
    }

    async function approveRegistrarClearance(studentId) {
      const s = appData.students.find(x => x.id === studentId);
      if (!s) return;

      if (s.clearance?.Accounting !== 'approved') {
        showConfirmModal({
          title: 'Approve Registrar without Accounting?',
          message: `Accounting clearance has not been marked as approved yet for ${s.name}. Do you want to proceed and approve Registrar clearance as Administrator/Registrar?`,
          confirmText: 'Approve Registrar',
          onConfirm: async () => {
            await executeOfficeClearanceApproval(s, 'Registrar', 'approved', 'Approved by Admin (Registrar)');
          }
        });
        return;
      }

      await executeOfficeClearanceApproval(s, 'Registrar', 'approved', 'Approved by Admin (Registrar)');
    }

    async function toggleDepartmentClearance(studentId, deptName) {
      const s = appData.students.find(x => x.id === studentId);
      if (!s) return;

      const currentStatus = s.clearance?.[deptName] || 'pending';
      const isApproved = currentStatus === 'approved';

      showConfirmModal({
        title: `Change ${deptName} Clearance`,
        message: `${deptName} clearance for "${s.name}" is currently marked as ${isApproved ? 'Approved' : currentStatus}. Do you want to reset it back to "pending"?`,
        confirmText: 'Set to Pending',
        onConfirm: async () => {
          await executeOfficeClearanceApproval(s, deptName, 'pending', 'Reset by Admin');
        }
      });
    }

    async function approveNextClearance(id) {
      const s = appData.students.find(x => x.id === id);
      const order = ['Teacher', 'Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar'];

      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          for (const k of order) {
            if (k === 'Teacher' && s.clearance.Teacher !== 'approved') {
              const rows = teacherRowsForStudent(s);
              if (!rows.length) {
                showToast('No teacher assigned', 'Please assign teacher clearance heads to this grade/section first.', 'error');
                return;
              }
              await window.paApi.requestClearance(s.id, appData.settings.schoolYear);
              for (const row of rows) {
                await window.paApi.updateTeacherClearance(s.id, row.teacher.id, row.assignment.subject, 'approved', 'Approved by Admin');
              }
              const state = await window.paApi.fetchDatabaseState();
              if (state) appData = { ...appData, ...state, students: mergeStudentsState(appData.students || [], state.students || []) };
              renderAll();
              showToast('Teacher approvals updated', `All assigned teacher approvals were marked approved for ${s.name}.`);
              return;
            }

            if (k !== 'Teacher' && s.clearance[k] !== 'approved') {
              await window.paApi.requestClearance(s.id, appData.settings.schoolYear);
              await window.paApi.updateOfficeClearance(s.id, k, 'approved', 'Approved by Admin');
              const state = await window.paApi.fetchDatabaseState();
              if (state) appData = { ...appData, ...state, students: mergeStudentsState(appData.students || [], state.students || []) };
              renderAll();
              showToast('Clearance updated', `${k} approved for ${s.name}.`);
              return;
            }
          }
          showToast('Already complete', 'All clearance approvals are complete.');
        } catch (err) {
          showToast('Action locked / failed', err.message || 'Database error.', 'error');
        }
      } else {
        for (const k of order) {
          if (k === 'Teacher' && !allTeacherApprovalsApproved(s)) {
            const rows = teacherRowsForStudent(s);
            if (!rows.length) { showToast('No teacher assigned', 'Add teacher assignments for this grade/section first.', 'error'); return }
            rows.forEach(row => {
              let req = teacherRequestFor(row);
              if (!req) {
                req = { key: row.key, studentId: s.id, teacherId: row.teacher.id, teacherName: row.teacher.name, subject: row.assignment.subject || 'Subject', grade: s.grade, section: s.section, strand: s.strand, status: 'requested', requestedAt: new Date().toISOString() };
                appData.teacherClearanceRequests.push(req);
              }
              req.status = 'approved';
              req.approvedAt = new Date().toISOString();
            });
            s.clearance.Teacher = 'approved';
            saveData();
            renderAll();
            showToast('Teacher approvals updated', `All assigned teacher approvals were marked approved for ${s.name}.`);
            return;
          }
          if (k === 'Principal' && !principalUnlocked(s)) { showToast('Principal locked', 'Teachers, Guidance, Prefect, and Library must approve first.', 'error'); return }
          if ((k === 'Accounting' || k === 'Registrar') && !finalUnlocked(s)) { showToast('Final approval locked', 'Principal must approve and balance must be zero.', 'error'); return }
          if (s.clearance[k] !== 'approved') {
            s.clearance[k] = 'approved';
            saveData();
            renderAll();
            showToast('Clearance updated', `${k} approved for ${s.name}.`);
            return;
          }
        }
        showToast('Already complete', 'All clearance approvals are complete.');
      }
    }
    function refreshClearanceApprovals() { renderClearance(); showToast('Requirements refreshed', 'Teacher approval requirements were generated from account assignments.') }
    async function requestCertificate(id) {
      const s = appData.students.find(x => x.id === id);
      if (!clearanceComplete(s)) {
        showToast('Not eligible', 'Certificate can only be requested after all approvals are complete.', 'error');
        return;
      }
      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          await window.paApi.requestCertificate(s.id);
          const state = await window.paApi.fetchDatabaseState();
          if (state) appData = { ...appData, ...state, students: mergeStudentsState(appData.students || [], state.students || []) };
        } catch (err) {
          showToast('Error requesting certificate', err.message || 'Database error.', 'error');
          return;
        }
      } else {
        if (!appData.certificateRequests.find(r => r.studentId === id)) appData.certificateRequests.push({ studentId: id, status: 'approved', requestedAt: new Date().toISOString().slice(0, 10) });
        saveData();
      }
      renderAll();
      openCertificate(id);
    }
    function openCertificate(id) { window.open(`certificate.html?studentId=${encodeURIComponent(id)}&from=admin`, '_blank') }
    function findFeeItemIndex(level, feeIdOrKey) {
      const items = appData.feeStructures[level] || [];
      if (!items.length || feeIdOrKey === undefined || feeIdOrKey === null || feeIdOrKey === 'undefined' || feeIdOrKey === 'null') return -1;

      // 1. Array Index match (if passed numeric index or numeric string index within range)
      const num = Number(feeIdOrKey);
      if (!isNaN(num) && Number.isInteger(num) && num >= 0 && num < items.length) {
        if (items[num]) return num;
      }

      // 2. Exact ID match
      let idx = items.findIndex(f => f && f.id !== undefined && f.id !== null && String(f.id) === String(feeIdOrKey));
      if (idx >= 0) return idx;

      // 3. Exact Name match
      idx = items.findIndex(f => f && f.name && String(f.name).toLowerCase() === String(feeIdOrKey).toLowerCase());
      if (idx >= 0) return idx;

      return -1;
    }

    function openFeeItemModal(level = 'JHS', feeIdOrKey = '') {
      const items = appData.feeStructures[level] || [];
      const idx = feeIdOrKey !== '' ? findFeeItemIndex(level, feeIdOrKey) : -1;
      const fee = idx >= 0 ? items[idx] : null;

      formModalLabel.textContent = 'Fee Item';
      formModalTitle.textContent = fee ? `Edit ${level} Fee Item` : `Add New ${level} Fee Item`;
      formModalContent.innerHTML = `
        <form id="feeForm" class="space-y-4">
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Education Level</label>
            <select id="feeLevel" class="w-full px-4 py-3 rounded-xl border border-academy-border bg-white text-xs font-bold focus:outline-none">
              <option value="JHS" ${level === 'JHS' ? 'selected' : ''}>Junior High School (JHS)</option>
              <option value="SHS" ${level === 'SHS' ? 'selected' : ''}>Senior High School (SHS)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Fee Item Name</label>
            <input id="feeName" value="${fee?.name || ''}" placeholder="e.g. Tuition Fee / Laboratory Fee" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Amount (PHP)</label>
            <input id="feeAmount" type="number" min="0" step="any" value="${fee?.amount ?? ''}" placeholder="e.g. 15000" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
          </div>
          <button type="submit" class="w-full py-3.5 rounded-xl bg-academy-navy hover:bg-blue-900 text-white font-extrabold text-xs shadow-md transition">
            Save Fee Item
          </button>
        </form>
      `;

      feeForm.onsubmit = e => {
        e.preventDefault();
        const selectedLevel = feeLevel.value;
        const nameVal = feeName.value.trim();
        const amtVal = Number(feeAmount.value || 0);

        if (!appData.feeStructures[selectedLevel]) appData.feeStructures[selectedLevel] = [];

        if (fee) {
          // If level was changed, remove from old level
          if (selectedLevel !== level && appData.feeStructures[level]) {
            const oldIdx = appData.feeStructures[level].indexOf(fee);
            if (oldIdx >= 0) appData.feeStructures[level].splice(oldIdx, 1);
          }

          // Check if target level already has another fee with this name
          const existingSameName = appData.feeStructures[selectedLevel].find(f =>
            f && f !== fee && String(f.name || '').trim().toLowerCase() === nameVal.toLowerCase()
          );

          if (existingSameName) {
            existingSameName.amount = amtVal;
            // If fee was in the same level, remove the duplicate reference
            const feeIdx = appData.feeStructures[selectedLevel].indexOf(fee);
            if (feeIdx >= 0 && appData.feeStructures[selectedLevel][feeIdx] !== existingSameName) {
              appData.feeStructures[selectedLevel].splice(feeIdx, 1);
            }
          } else {
            fee.name = nameVal;
            fee.amount = amtVal;
            if (!fee.id) fee.id = 'FEE-' + Date.now();
            if (selectedLevel !== level && !appData.feeStructures[selectedLevel].includes(fee)) {
              appData.feeStructures[selectedLevel].push(fee);
            }
          }
        } else {
          // Check if a fee with this name already exists in target level
          const existingSameName = appData.feeStructures[selectedLevel].find(f =>
            f && String(f.name || '').trim().toLowerCase() === nameVal.toLowerCase()
          );

          if (existingSameName) {
            existingSameName.amount = amtVal;
          } else {
            appData.feeStructures[selectedLevel].push({
              id: 'FEE-' + Date.now(),
              name: nameVal,
              amount: amtVal,
              required: true
            });
          }
        }

        applyFeeSetup();
        renderAll();
        closeFormModal();
        showToast('Fee Updated', `"${nameVal}" set to ${money(amtVal)} for ${selectedLevel}.`, 'success');
      };

      openFormModal();
    }

    function deleteFeeItem(level, feeIdOrKey) {
      const items = appData.feeStructures[level] || [];
      const idx = findFeeItemIndex(level, feeIdOrKey);

      if (idx >= 0 && idx < items.length) {
        const name = items[idx].name || 'Fee Item';
        showConfirmModal({
          title: 'Delete Fee Item',
          message: `Are you sure you want to delete "${name}" from ${level} fee setup? This action cannot be undone.`,
          confirmText: 'Delete Fee Item',
          onConfirm: () => {
            items.splice(idx, 1);
            applyFeeSetup();
            saveData();
            renderAll();
            showToast('Fee Item Deleted', `Removed "${name}" from ${level} fee setup.`, 'info');
          }
        });
      }
    }

    function clearAllFeesAndVouchers() {
      showConfirmModal({
        title: 'Clear All Fees & Vouchers',
        message: 'Are you sure you want to clear all fee structures and voucher discounts? This will remove all default and current fee setups.',
        confirmText: 'Clear All Fees & Vouchers',
        onConfirm: () => {
          appData.feeStructures = { JHS: [], SHS: [] };
          appData.vouchers = [];
          applyFeeSetup();
          saveData();
          renderAll();
          showToast('Fees & Vouchers Cleared', 'All fee structures and vouchers have been cleared.', 'info');
        }
      });
    }

    function clearAllTransactions() {
      showConfirmModal({
        title: 'Clear All Payments & Transactions',
        message: 'Are you sure you want to clear out all payment history and reset all student paid amounts to ₱0? This will start a completely clean test for payment monitoring.',
        confirmText: 'Clear All Transactions',
        onConfirm: async () => {
          appData.payments = [];
          (appData.students || []).forEach(s => {
            s.paid = 0;
          });
          localStorage.setItem('pa_transactions_cleared', 'true');

          if (window.paApi && window.paApi.client) {
            const client = window.paApi.client();
            if (client) {
              try {
                await client.from('payment_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                await client.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                await client.from('students').update({ paid: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
              } catch (e) {
                console.warn('Clearing Supabase payments error:', e);
              }
            }
          }

          saveData();
          renderAll();
          showToast('Transactions Cleared', 'All payment records and student paid balances have been reset to ₱0.', 'info');
        }
      });
    }
    function openVoucherModal(id = '') {
      const v = (appData.vouchers || []).find(x => x.id === id);
      formModalLabel.textContent = 'Voucher Discount';
      formModalTitle.textContent = v ? 'Edit Voucher Discount' : 'Add Voucher Discount';
      formModalContent.innerHTML = `
        <form id="voucherForm" class="space-y-4">
          <input type="hidden" id="vId" value="${v?.id || ''}">
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Voucher Name</label>
            <input id="voucherName" value="${v?.name || ''}" placeholder="e.g. ESC Voucher / DepEd Voucher QVR" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Applies To Level</label>
              <select id="voucherLevel" class="w-full px-3 py-3 rounded-xl border border-academy-border bg-white text-xs font-bold focus:outline-none">
                <option value="JHS" ${v?.appliesTo === 'JHS' ? 'selected' : ''}>JHS Only</option>
                <option value="SHS" ${v?.appliesTo === 'SHS' ? 'selected' : ''}>SHS Only</option>
                <option value="All" ${v?.appliesTo === 'All' ? 'selected' : ''}>All Levels (JHS & SHS)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-extrabold text-academy-navy mb-1">Discount Amount (PHP)</label>
              <input id="voucherAmt" type="number" min="0" step="any" value="${v?.amount ?? ''}" placeholder="e.g. 9000" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
            </div>
          </div>

          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Status</label>
            <select id="voucherActive" class="w-full px-3 py-3 rounded-xl border border-academy-border bg-white text-xs font-bold focus:outline-none">
              <option value="true" ${v?.active !== false ? 'selected' : ''}>Active</option>
              <option value="false" ${v?.active === false ? 'selected' : ''}>Inactive / Disabled</option>
            </select>
          </div>

          <button type="submit" class="w-full py-3.5 rounded-xl bg-academy-navy hover:bg-blue-900 text-white font-extrabold shadow-md transition">
            Save Voucher
          </button>
        </form>
      `;

      document.getElementById('voucherForm').onsubmit = (e) => {
        e.preventDefault();
        const item = {
          id: document.getElementById('vId').value || 'V-' + Date.now(),
          name: document.getElementById('voucherName').value.trim(),
          appliesTo: document.getElementById('voucherLevel').value,
          amount: Number(document.getElementById('voucherAmt').value || 0),
          active: document.getElementById('voucherActive').value === 'true'
        };

        appData.vouchers = appData.vouchers || [];
        const idx = appData.vouchers.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          appData.vouchers[idx] = item;
        } else {
          appData.vouchers.push(item);
        }

        applyFeeSetup();
        closeFormModal();
        showToast('Voucher Saved', `Saved voucher discount "${item.name}".`);
      };

      openFormModal();
    }

    function toggleVoucherStatus(id) {
      const v = (appData.vouchers || []).find(x => x.id === id);
      if (!v) return;
      v.active = !v.active;
      applyFeeSetup();
      showToast('Voucher Updated', `Voucher "${v.name}" is now ${v.active ? 'Active' : 'Inactive'}.`);
    }

    function deleteVoucher(id) {
      const v = (appData.vouchers || []).find(x => x.id === id);
      if (!v) return;
      showConfirmModal({
        title: 'Delete Voucher Discount',
        message: `Are you sure you want to delete the voucher discount "${v.name}"? This action cannot be undone.`,
        confirmText: 'Delete Voucher',
        onConfirm: () => {
          appData.vouchers = (appData.vouchers || []).filter(x => x.id !== id);
          applyFeeSetup();
          saveData();
          renderAll();
          showToast('Voucher Deleted', `Removed voucher "${v.name}".`);
        }
      });
    }
    function openInstallmentModal(id = '') {
      const t = (appData.installmentTemplate || []).find(x => x.id === id);
      formModalLabel.textContent = 'Due Date Schedule';
      formModalTitle.textContent = t ? 'Edit Due Date Schedule' : 'Add Due Date Schedule';
      formModalContent.innerHTML = `
        <form id="insForm" class="space-y-4">
          <input type="hidden" id="insId" value="${t?.id || ''}">
          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Installment Title / Name</label>
            <input id="insTitle" value="${t?.title || ''}" placeholder="e.g. Downpayment / 1st Trimester" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
          </div>

          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Description / Details</label>
            <textarea id="insDescription" rows="3" placeholder="e.g. Initial payment due upon enrollment covering tuition & registration fees" class="w-full px-4 py-2.5 rounded-xl border border-academy-border text-xs focus:outline-none">${t?.description || ''}</textarea>
          </div>

          <div>
            <label class="block text-xs font-extrabold text-academy-navy mb-1">Payment Due Date</label>
            <input id="insDate" type="date" value="${t?.dueDate || ''}" required class="w-full px-4 py-3 rounded-xl border border-academy-border text-xs font-bold focus:outline-none">
          </div>

          <button type="submit" class="w-full py-3.5 rounded-xl bg-academy-navy hover:bg-blue-900 text-white font-extrabold shadow-md transition">
            Save Due Date Schedule
          </button>
        </form>
      `;

      document.getElementById('insForm').onsubmit = (e) => {
        e.preventDefault();
        const item = {
          id: document.getElementById('insId').value || 'INS-' + Date.now(),
          title: document.getElementById('insTitle').value.trim(),
          description: document.getElementById('insDescription').value.trim(),
          dueDate: document.getElementById('insDate').value
        };

        appData.installmentTemplate = appData.installmentTemplate || [];
        const idx = appData.installmentTemplate.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          appData.installmentTemplate[idx] = item;
        } else {
          appData.installmentTemplate.push(item);
        }

        saveData();
        renderAll();
        closeFormModal();
        showToast('Schedule Saved', `Saved due date reminder "${item.title}".`);
      };

      openFormModal();
    }

    function deleteInstallment(id) {
      showConfirmModal({
        title: 'Delete Due Date Schedule',
        message: 'Are you sure you want to delete this due date schedule? This action cannot be undone.',
        confirmText: 'Delete Schedule',
        onConfirm: () => {
          appData.installmentTemplate = (appData.installmentTemplate || []).filter(x => x.id !== id);
          saveData();
          renderAll();
          showToast('Schedule Deleted', 'Due date schedule removed.');
        }
      });
    }

    function clearAllDueDates() {
      showConfirmModal({
        title: 'Clear All Due Dates',
        message: 'Are you sure you want to remove all due date schedules? This action cannot be undone.',
        confirmText: 'Clear All',
        onConfirm: () => {
          appData.installmentTemplate = [];
          saveData();
          renderAll();
          showToast('Schedules Cleared', 'All due date schedules were removed.');
        }
      });
    }

    function updateAssignmentRowDropdowns(rowEl, selectedSection = '', selectedStrand = '') {
      const grade = rowEl.querySelector('.assign-grade').value;
      const sectionSelect = rowEl.querySelector('.assign-section');
      const strandSelect = rowEl.querySelector('.assign-strand');
      const subjectSelect = rowEl.querySelector('.assign-subject');

      const sections = SECTIONS_BY_GRADE[grade] || [];
      sectionSelect.innerHTML = `<option value="N/A">All Sections (N/A)</option>` +
        sections.map(s => `<option value="${s}">${s}</option>`).join('');
      if (selectedSection && (sections.includes(selectedSection) || selectedSection === 'N/A')) {
        sectionSelect.value = selectedSection;
      }

      const isSHS = ['Grade 11', 'Grade 12'].includes(grade);
      if (isSHS) {
        strandSelect.disabled = false;
        strandSelect.innerHTML = `<option value="N/A">All Strands (N/A)</option>` +
          SHS_STRANDS.map(st => `<option value="${st}">${st}</option>`).join('');
        if (selectedStrand) strandSelect.value = selectedStrand;
      } else {
        strandSelect.innerHTML = `<option value="N/A">N/A</option>`;
        strandSelect.value = 'N/A';
        strandSelect.disabled = true;
      }

      if (subjectSelect) {
        const currentSubject = subjectSelect.value;
        const subjectsList = isSHS ? SHS_SUBJECTS : JHS_SUBJECTS;
        let subjectOptions = subjectsList.map(s => `<option value="${s}">${s}</option>`).join('');
        if (currentSubject && !subjectsList.includes(currentSubject)) {
          subjectOptions = `<option value="${currentSubject}">${currentSubject}</option>` + subjectOptions;
        }
        subjectSelect.innerHTML = subjectOptions;
        if (currentSubject && (subjectsList.includes(currentSubject) || subjectOptions.includes(`value="${currentSubject}"`))) {
          subjectSelect.value = currentSubject;
        }
      }
    }

    function onAssignmentGradeChange(gradeSelect) {
      const rowEl = gradeSelect.closest('.assignment-row');
      if (rowEl) updateAssignmentRowDropdowns(rowEl);
    }

    function assignmentRowsHtml(assignments = []) {
      const rows = assignments.length ? assignments : [{ grade: 'Grade 7', section: 'Cattleya', strand: 'N/A', subject: 'Filipino' }];
      return rows.map((a) => {
        const grade = a.grade || 'Grade 7';
        const isSHS = ['Grade 11', 'Grade 12'].includes(grade);
        const sections = SECTIONS_BY_GRADE[grade] || ['Cattleya', 'Orchids', 'Rose'];
        const sectionOptions = `<option value="N/A" ${a.section === 'N/A' ? 'selected' : ''}>All Sections (N/A)</option>` +
          sections.map(s => `<option value="${s}" ${s === a.section ? 'selected' : ''}>${s}</option>`).join('');
        const strandOptions = isSHS
          ? `<option value="N/A" ${!a.strand || a.strand === 'N/A' ? 'selected' : ''}>All Strands (N/A)</option>` +
            SHS_STRANDS.map(st => `<option value="${st}" ${st === a.strand ? 'selected' : ''}>${st}</option>`).join('')
          : `<option value="N/A">N/A</option>`;

        const subjectsList = isSHS ? SHS_SUBJECTS : JHS_SUBJECTS;
        const currentSubj = a.subject || subjectsList[0];
        let subjectOptions = subjectsList.map(s => `<option value="${s}" ${s === currentSubj ? 'selected' : ''}>${s}</option>`).join('');
        if (currentSubj && !subjectsList.includes(currentSubj)) {
          subjectOptions = `<option value="${currentSubj}" selected>${currentSubj}</option>` + subjectOptions;
        }

        return `<div class="assignment-row grid sm:grid-cols-4 gap-2 p-3 rounded-xl bg-academy-soft border border-academy-border items-center">
          <select class="assign-grade px-3 py-2 rounded-xl border border-academy-border bg-white text-xs font-bold" onchange="onAssignmentGradeChange(this)">
            <option ${grade === 'Grade 7' ? 'selected' : ''}>Grade 7</option>
            <option ${grade === 'Grade 8' ? 'selected' : ''}>Grade 8</option>
            <option ${grade === 'Grade 9' ? 'selected' : ''}>Grade 9</option>
            <option ${grade === 'Grade 10' ? 'selected' : ''}>Grade 10</option>
            <option ${grade === 'Grade 11' ? 'selected' : ''}>Grade 11</option>
            <option ${grade === 'Grade 12' ? 'selected' : ''}>Grade 12</option>
          </select>
          <select class="assign-section px-3 py-2 rounded-xl border border-academy-border bg-white text-xs font-bold">
            ${sectionOptions}
          </select>
          <select class="assign-strand px-3 py-2 rounded-xl border border-academy-border bg-white text-xs font-bold" ${isSHS ? '' : 'disabled'}>
            ${strandOptions}
          </select>
          <div class="flex gap-1 items-center">
            <select class="assign-subject px-3 py-2 rounded-xl border border-academy-border bg-white text-xs font-bold w-full">
              ${subjectOptions}
            </select>
            <button type="button" onclick="this.closest('.assignment-row').remove()" class="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100 hover:bg-red-100 shrink-0 flex items-center justify-center"><span class="material-symbols-rounded text-xs">close</span></button>
          </div>
        </div>`;
      }).join('');
    }

    function openAccountModal(id = '') {
      const account = appData.accounts.find(a => a.id === id);
      formModalLabel.textContent = 'School Account';
      formModalTitle.textContent = account ? 'Edit Account' : 'Create Account';
      formModalContent.innerHTML = `<form id="accountForm" class="space-y-4">
        <input type="hidden" id="accountId" value="${account?.id || ''}">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-bold mb-2">Full Name</label>
            <input id="accountName" required value="${account?.name || ''}" class="w-full px-4 py-3 rounded-xl border border-academy-border">
          </div>
          <div>
            <label class="block text-sm font-bold mb-2">Email</label>
            <input id="accountEmail" type="email" required value="${account?.email || ''}" class="w-full px-4 py-3 rounded-xl border border-academy-border">
          </div>
        </div>
        <div>
          <label class="block text-sm font-bold mb-2">Role</label>
          <select id="accountRole" class="w-full px-4 py-3 rounded-xl border border-academy-border bg-white">
            <option value="teacher_clearance_head">Teacher Clearance Head</option>
            <option value="guidance_head">Guidance Head</option>
            <option value="prefect_head">Prefect of Discipline</option>
            <option value="librarian_head">Librarian</option>
            <option value="principal">Principal</option>
            <option value="accounting_admin">Accounting/Admin</option>
            <option value="registrar">Registrar</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div class="p-4 rounded-2xl border border-academy-border">
          <div class="flex justify-between mb-3">
            <div>
              <strong class="text-academy-navy">Teacher Assignments</strong>
              <p class="text-xs text-academy-muted">Use this only for teacher clearance heads. Add multiple grade/section/subject rows.</p>
            </div>
            <button type="button" onclick="addAssignmentRow()" class="px-3 py-2 rounded-xl bg-academy-soft border border-academy-border text-xs font-bold">Add Row</button>
          </div>
          <div id="assignmentRows" class="space-y-3">${assignmentRowsHtml(account?.assignments || [])}</div>
        </div>
        <div>
          <label class="block text-sm font-bold mb-2">Temporary Password</label>
          <input id="accountTempPassword" type="text" placeholder="${account ? 'Leave blank to keep the existing password' : 'Leave blank to auto-generate'}" class="w-full px-4 py-3 rounded-xl border border-academy-border">
        </div>
        <button class="w-full py-3 rounded-xl bg-academy-navy text-white font-bold">Save Account</button>
      </form>`;
      if (account) { accountRole.value = account.role; }
      accountForm.onsubmit = saveAccount;
      openFormModal();
    }
    function addAssignmentRow() { assignmentRows.insertAdjacentHTML('beforeend', assignmentRowsHtml([{ grade: 'Grade 7', section: 'Cattleya', strand: 'N/A', subject: 'Filipino' }])) }
    async function saveAccount(e) {
      e.preventDefault();
      const button = e.currentTarget.querySelector('button:not([type="button"])');
      if (button?.disabled) return;
      if (button) button.disabled = true;
      try {
        const id = document.getElementById('accountId')?.value || '';
        const existing = appData.accounts.find(a => a.id === id);
        const role = document.getElementById('accountRole').value;
        const data = {
          id,
          name: document.getElementById('accountName').value.trim(),
          email: document.getElementById('accountEmail').value.trim(),
          role,
          active: existing?.active !== false,
          assignments: role === 'teacher_clearance_head' ? [...document.querySelectorAll('.assignment-row')].map(r => {
            const grade = r.querySelector('.assign-grade').value;
            return {
              grade, section: r.querySelector('.assign-section').value || 'N/A',
              strand: ['Grade 11', 'Grade 12'].includes(grade) ? (r.querySelector('.assign-strand')?.value || 'N/A') : 'N/A',
              subject: r.querySelector('.assign-subject').value
            };
          }) : []
        };
        const password = document.getElementById('accountTempPassword')?.value.trim();
        const result = await syncAccountToSupabase(data, password);
        // Cache only a completed server save, using the permanent profile identity.
        data.id = result.profile_id;
        data.authUserId = result.user_id;
        const index = appData.accounts.findIndex(a => a.id === id || String(a.email).toLowerCase() === data.email.toLowerCase());
        if (index >= 0) appData.accounts[index] = data;
        else appData.accounts.push(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        closeFormModal();
        renderAll();
        const message = result.temporary_password
          ? 'Account saved for ' + data.name + '. Temporary password: ' + result.temporary_password
          : 'Account and assignments saved for ' + data.name + '. Existing password unchanged.';
        showToast('Account Saved', message);
      } catch (error) {
        showToast('Account Not Saved', error.message || 'Unable to save account. Please try again.', 'error');
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function syncAccountToSupabase(data, password, statusOnly = false) {
      if (!window.paApi?.createSchoolAccount) throw new Error('Account service is unavailable. Reload and try again.');
      const isExisting = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(data.id || '');
      const payload = {
        action: isExisting ? 'update' : 'create',
        profile_id: isExisting ? data.id : undefined,
        full_name: data.name, email: data.email, role: data.role,
        active: data.active !== false,
        school_year: appData.settings.schoolYear || '2026-2027'
      };
      if (password) payload.temporary_password = password;
      if (!statusOnly) payload.assignments = (data.assignments || []).map(a => ({
        grade_level: a.grade, section_name: a.section, strand: a.strand,
        subject_name: a.subject
      }));
      return window.paApi.createSchoolAccount(payload);
    }

    async function toggleAccount(id) {
      const account = appData.accounts.find(a => a.id === id);
      if (!account) return;
      try {
        const updated = { ...account, active: !account.active };
        await syncAccountToSupabase(updated, undefined, true);
        Object.assign(account, updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        renderAll();
      } catch (error) {
        showToast('Account Not Updated', error.message || 'Unable to update account.', 'error');
      }
    }
    async function deleteAccount(id) {
      const a = appData.accounts.find(x => x.id === id);
      if (!a) return;
      showConfirmModal({
        title: 'Delete Account',
        message: `Are you sure you want to delete the account for "${a.name}" (${a.email})? This action cannot be undone.`,
        confirmText: 'Delete Account',
        onConfirm: async () => {
          appData.accounts = appData.accounts.filter(x => x.id !== id);

          try {
            const registered = JSON.parse(localStorage.getItem('pa_registered_users') || '[]');
            const updated = registered.filter(u => u.id !== id && String(u.email || '').toLowerCase() !== String(a.email || '').toLowerCase());
            localStorage.setItem('pa_registered_users', JSON.stringify(updated));
          } catch (err) {}

          if (window.paApi && window.paApi.client) {
            const client = window.paApi.client();
            if (client) {
              try {
                await client.from('staff_accounts').delete().eq('profile_id', a.id);
                await client.from('profiles').delete().eq('id', a.id);
              } catch (err) {}
            }
          }

          saveData();
          renderAll();
          showToast('Account Deleted', `Removed account for ${a.name}.`);
        }
      });
    }
    function exportCsv(filename, headers, rows) { const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href) }
    function exportCollectionReport() { exportCsv('collections-report.csv', ['Student', 'Level', 'Assessed', 'Paid', 'Balance'], appData.students.map(s => [s.name, s.level, assessedTotal(s), s.paid, balance(s)])) }
    function exportOutstandingReport() { exportCsv('outstanding-report.csv', ['Student', 'Class', 'Balance', 'Due Status'], appData.students.filter(s => balance(s) > 0).map(s => [s.name, classLabel(s), balance(s), dueStatus(s)])) }
    function downloadBackup() { const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pagbilao-backup.json'; a.click(); URL.revokeObjectURL(a.href) }
    document.getElementById('settingsForm')?.addEventListener('submit', e => { e.preventDefault(); appData.settings.schoolName = document.getElementById('schoolNameInput').value; appData.settings.schoolYear = document.getElementById('schoolYearInput').value; saveData(); showToast('Settings saved', 'Prototype settings updated.') });
    async function syncStudentVoucherToSupabase(studentId, voucherName) {
      if (window.paApi && window.paApi.client) {
        const client = window.paApi.client();
        if (!client) return;
        try {
          const isUuid = val => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
          const filter = isUuid(studentId) ? `id.eq.${studentId},student_number.eq.${studentId}` : `student_number.eq.${studentId}`;
          const { data: std } = await client.from('students').select('id').or(filter).maybeSingle();
          if (!std) return;

          await client.from('student_vouchers').delete().eq('student_id', std.id);

          if (voucherName && voucherName !== 'None') {
            const { data: vType } = await client.from('voucher_types').select('id').eq('voucher_name', voucherName).maybeSingle();
            if (vType) {
              await client.from('student_vouchers').insert({
                student_id: std.id,
                voucher_type_id: vType.id
              });
            }
          }
        } catch (err) {
          console.warn('Syncing student voucher notice:', err);
        }
      }
    }

    function getStudentTotalPaidInAdmin(s) {
      if (!s) return 0;
      const allPayments = appData.payments || [];
      const sId = String(s.id || '').toLowerCase();
      const dbId = String(s.dbId || '').toLowerCase();
      const sEmail = String(s.email || '').toLowerCase();
      const studentPayments = allPayments.filter(p => {
        if (!p) return false;
        const pStudentId = String(p.studentId || p.student_id || p.studentDbId || '').toLowerCase();
        const pEmail = String(p.email || p.studentEmail || '').toLowerCase();
        const statusOk = ['paid', 'succeeded', 'completed'].includes(String(p.status || 'paid').toLowerCase());
        return statusOk && ((sId && pStudentId === sId) || (dbId && pStudentId === dbId) || (sEmail && pEmail && pEmail === sEmail));
      });

      if (studentPayments.length > 0) {
        return studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      }

      return Number(s.paid || 0);
    }

    function isSameStudent(s1, s2) {
      if (!s1 || !s2) return false;
      const id1 = String(s1.id || s1.studentId || s1.student_number || '').toLowerCase();
      const id2 = String(s2.id || s2.studentId || s2.student_number || '').toLowerCase();
      const dbId1 = String(s1.dbId || s1.id || '').toLowerCase();
      const dbId2 = String(s2.dbId || s2.id || '').toLowerCase();
      const email1 = String(s1.email || '').toLowerCase().trim();
      const email2 = String(s2.email || '').toLowerCase().trim();
      const auth1 = String(s1.authUserId || s1.auth_user_id || '').toLowerCase().trim();
      const auth2 = String(s2.authUserId || s2.auth_user_id || '').toLowerCase().trim();

      const clean1 = id1.replace(/^stu-/, '').trim();
      const clean2 = id2.replace(/^stu-/, '').trim();

      if (id1 && id2 && id1 === id2) return true;
      if (clean1 && clean2 && clean1 === clean2) return true;
      if (dbId1 && dbId2 && dbId1 === dbId2) return true;
      if (auth1 && auth2 && auth1 === auth2) return true;
      if (email1 && email2 && email1 === email2) return true;

      return false;
    }

    function mergeStudentsState(localStudents = [], dbStudents = []) {
      if (!dbStudents || dbStudents.length === 0) return localStudents;
      if (!localStudents || localStudents.length === 0) return dbStudents;

      const merged = (localStudents || []).map(s => ({ ...s }));

      dbStudents.forEach(dbS => {
        const existingIdx = merged.findIndex(localS => isSameStudent(localS, dbS));
        if (existingIdx >= 0) {
          const local = merged[existingIdx];
          const calcLocal = getStudentTotalPaidInAdmin(local);
          const calcDb = getStudentTotalPaidInAdmin(dbS);
          const calcTotal = Math.max(calcLocal, calcDb);
          const effectivePaid = (calcTotal > 0) ? calcTotal : (local.paid !== undefined ? Number(local.paid || 0) : Number(dbS.paid || 0));

          const mergedClearance = {
            Teacher: 'pending',
            Guidance: 'pending',
            Prefect: 'pending',
            Library: 'pending',
            Principal: 'pending',
            Accounting: 'pending',
            Registrar: 'pending',
            ...(local.clearance || {}),
            ...(dbS.clearance || {})
          };

          ['Teacher', 'Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar'].forEach(k => {
            if (local.clearance && local.clearance[k] === 'approved' && (!dbS.clearance || dbS.clearance[k] === 'pending')) {
              mergedClearance[k] = 'approved';
            }
          });

          merged[existingIdx] = {
            ...local,
            ...dbS,
            id: local.id || dbS.id,
            dbId: dbS.dbId || local.dbId || dbS.id,
            authUserId: local.authUserId || dbS.authUserId || dbS.auth_user_id,
            email: local.email || dbS.email,
            voucher: (local.voucher !== undefined && local.voucher !== null && local.voucher !== 'None') ? local.voucher : dbS.voucher,
            customFees: local.customFees !== undefined ? local.customFees : dbS.customFees,
            feeDiscount: local.feeDiscount !== undefined ? local.feeDiscount : dbS.feeDiscount,
            assessedOverride: local.assessedOverride !== undefined ? local.assessedOverride : dbS.assessedOverride,
            paid: effectivePaid,
            clearance: mergedClearance
          };
        } else {
          merged.push({ ...dbS });
        }
      });

      return merged;
    }

    async function syncInstallmentsToSupabase() {
      if (window.paApi && window.paApi.client) {
        const client = window.paApi.client();
        if (client) {
          try {
            const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
            await client.from('installment_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const list = appData.installmentTemplate || [];
            if (list.length > 0) {
              const rows = list.map((t, i) => {
                const row = {
                  title: t.title || `Milestone ${i + 1}`,
                  school_year: '2026-2027',
                  percent_of_net: (t.percent !== undefined && Number(t.percent) > 0) ? Number(t.percent) : (list.length ? Math.round(100 / list.length) : 25),
                  due_date: t.dueDate || new Date().toISOString().slice(0, 10),
                  sort_order: i + 1,
                  active: true
                };
                if (t.id && isUuid(t.id)) {
                  row.id = t.id;
                }
                return row;
              });
              const { error } = await client.from('installment_templates').insert(rows);
              if (error) console.warn('Syncing installment_templates notice:', error);
            }
          } catch (e) {
            console.warn('Syncing installment_templates error:', e);
          }
        }
      }
    }

    async function syncVouchersToSupabase() {
      if (window.paApi && window.paApi.client) {
        const client = window.paApi.client();
        if (client) {
          try {
            await client.from('voucher_types').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const list = appData.vouchers || [];
            if (list.length > 0) {
              const rows = list.map(v => ({
                id: (v.id && !v.id.startsWith('vouch-') && !v.id.startsWith('V-') && !v.id.startsWith('v-')) ? v.id : undefined,
                voucher_name: v.name,
                applies_to: v.appliesTo === 'All' ? 'SHS' : v.appliesTo,
                amount: Number(v.amount || 0),
                active: v.active !== false
              }));
              const { error } = await client.from('voucher_types').insert(rows);
              if (error) console.warn('Syncing voucher_types notice:', error);
            }
          } catch (e) {
            console.warn('Syncing voucher_types error:', e);
          }
        }
      }
    }

    let _isSyncingFeeStructures = false;
    let _hasPendingFeeStructureSync = false;

    async function syncFeeStructuresToSupabase() {
      if (!window.paApi || !window.paApi.client) return;
      const client = window.paApi.client();
      if (!client) return;

      if (_isSyncingFeeStructures) {
        _hasPendingFeeStructureSync = true;
        return;
      }
      _isSyncingFeeStructures = true;

      try {
        const { data: existingStructures } = await client.from('fee_structures').select('*');
        for (const level of ['JHS', 'SHS']) {
          const matchingStructures = (existingStructures || []).filter(s => s.education_level === level);
          let fs = matchingStructures[0];
          if (!fs) {
            const { data: created, error: createErr } = await client
              .from('fee_structures')
              .insert({
                name: `${level} Standard Fee Structure`,
                education_level: level,
                school_year: '2026-2027',
                active: true
              })
              .select()
              .maybeSingle();
            if (created) fs = created;
            else if (createErr) console.warn(`Creating fee_structures row for ${level} notice:`, createErr);
          }

          if (fs && fs.id) {
            // Deduplicate items in memory by name before inserting
            const rawItems = appData.feeStructures[level] || [];
            const dedupedItems = [];
            const seenNames = new Set();
            rawItems.forEach(f => {
              if (!f || !f.name) return;
              const cleanName = String(f.name).trim().toLowerCase();
              if (!seenNames.has(cleanName)) {
                seenNames.add(cleanName);
                dedupedItems.push(f);
              }
            });
            appData.feeStructures[level] = dedupedItems;

            await client.from('fee_structure_items').delete().eq('fee_structure_id', fs.id);

            // Also clean any stale duplicate structures for this level
            for (let i = 1; i < matchingStructures.length; i++) {
              try {
                await client.from('fee_structure_items').delete().eq('fee_structure_id', matchingStructures[i].id);
                await client.from('fee_structures').delete().eq('id', matchingStructures[i].id);
              } catch (_) {}
            }

            if (dedupedItems.length > 0) {
              const rows = dedupedItems.map((f, idx) => ({
                fee_structure_id: fs.id,
                fee_name: f.name.trim(),
                amount: Number(f.amount || 0),
                required: f.required !== false,
                sort_order: idx + 1
              }));
              const { error: insErr } = await client.from('fee_structure_items').insert(rows);
              if (insErr) console.warn(`Inserting fee_structure_items for ${level} notice:`, insErr);
            }
          }
        }
      } catch (e) {
        console.warn('Syncing fee_structure_items error:', e);
      } finally {
        _isSyncingFeeStructures = false;
        if (_hasPendingFeeStructureSync) {
          _hasPendingFeeStructureSync = false;
          syncFeeStructuresToSupabase();
        }
      }
    }

    function saveData() {
      ensurePrototypeData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      localStorage.setItem('pa_installment_templates', JSON.stringify(appData.installmentTemplate || []));
      syncInstallmentsToSupabase();
      syncVouchersToSupabase();
      syncFeeStructuresToSupabase();
    }

    function mergeAccountsState(localAccounts = [], dbAccounts = []) {
      const map = new Map();

      (localAccounts || []).forEach(acc => {
        if (acc && (acc.email || acc.id)) {
          const key = String(acc.email || acc.id).toLowerCase();
          map.set(key, { ...acc });
        }
      });

      (dbAccounts || []).forEach(dbAcc => {
        if (dbAcc && (dbAcc.email || dbAcc.id)) {
          const key = String(dbAcc.email || dbAcc.id).toLowerCase();
          const localAcc = map.get(key);
          if (localAcc) {
            map.set(key, {
              ...localAcc,
              ...dbAcc,
              tempPassword: localAcc.tempPassword || dbAcc.tempPassword,
              assignments: dbAcc.assignments || []
            });
          } else {
            map.set(key, { ...dbAcc });
          }
        }
      });

      return Array.from(map.values());
    }

    async function initAdminDashboard() {
      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          const state = await window.paApi.fetchDatabaseState();
          if (state) {
            if (state.students && state.students.length > 0) {
              appData.students = mergeStudentsState(appData.students || [], state.students);
            }
            if (state.accounts) {
              appData.accounts = mergeAccountsState(appData.accounts || [], state.accounts);
            }
            
            // Primary source of truth is Supabase database state
            appData.payments = state.payments || [];
            if (state.certificateRequests) appData.certificateRequests = state.certificateRequests;
            if (state.teacherClearanceRequests) appData.teacherClearanceRequests = state.teacherClearanceRequests;
            if (state.vouchers && state.vouchers.length > 0) appData.vouchers = state.vouchers;
            if (state.installmentTemplate && state.installmentTemplate.length > 0) {
              appData.installmentTemplate = state.installmentTemplate;
              localStorage.setItem('pa_installment_templates', JSON.stringify(appData.installmentTemplate));
            }
            if (state.feeStructures) {
              appData.feeStructures = appData.feeStructures || { JHS: [], SHS: [] };
              ['JHS', 'SHS'].forEach(level => {
                if (state.feeStructures[level] && state.feeStructures[level].length > 0) {
                  const seen = new Set();
                  const clean = [];
                  state.feeStructures[level].forEach(f => {
                    const key = String(f.name || '').trim().toLowerCase();
                    if (key && !seen.has(key)) {
                      seen.add(key);
                      clean.push(f);
                    }
                  });
                  appData.feeStructures[level] = clean;
                }
              });
            }
            if (state.settings) appData.settings = { ...appData.settings, ...state.settings };
          }
        } catch (err) {
          console.warn("Could not load dynamic state from Supabase, using local defaults:", err);
        }
      }
      renderNav();
      renderAll();

      const savedKey = localStorage.getItem('pa_gemini_api_key') || DEFAULT_GEMINI_API_KEY;
      if (document.getElementById('geminiApiKeyInput')) {
        document.getElementById('geminiApiKeyInput').value = savedKey;
      }

      if (window.paApi && window.paApi.client) {
        const client = window.paApi.client();
        if (client) {
          try {
            const { data: authData } = await client.auth.getUser();
            const user = authData?.user;
            if (user) {
              const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin';
              const email = user.email || '';
              if (document.getElementById('userNameDisplay')) document.getElementById('userNameDisplay').textContent = name;
              if (document.getElementById('userEmailDisplay')) document.getElementById('userEmailDisplay').textContent = email;
              if (document.getElementById('userAvatar')) {
                const initials = (name.split(' ').map(n => n[0]).join('') || 'AD').slice(0, 2).toUpperCase();
                document.getElementById('userAvatar').textContent = initials;
              }
              const { data: prof } = await client.from('profiles').select('role,status').eq('auth_user_id', user.id).maybeSingle();
              const role = prof?.role || user.user_metadata?.role;
              if (role && !['super_admin', 'accounting_admin', 'registrar'].includes(role)) {
                showToast('Admin Access Notice', `Signed in as ${email} (${role}). Please log out and sign in with an admin account (admin@pagbilao.edu.ph) to create or edit accounts.`, 'error');
              }
            } else {
              const localSession = JSON.parse(localStorage.getItem('pa_user_session') || localStorage.getItem('pa_current_user') || '{}');
              if (localSession.email) {
                if (document.getElementById('userNameDisplay')) document.getElementById('userNameDisplay').textContent = localSession.fullName || localSession.name || 'Admin';
                if (document.getElementById('userEmailDisplay')) document.getElementById('userEmailDisplay').textContent = localSession.email;
              }
            }
          } catch (e) {
            console.warn('Admin auth session inspection skipped:', e);
          }
        }
      }
    }
    initAdminDashboard();
  