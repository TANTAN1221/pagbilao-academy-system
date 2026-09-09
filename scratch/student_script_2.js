
    const STORAGE_KEY = 'pa_full_admin_v2';
    const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
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

    const fallbackData = {
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
    
    function money(n) { return currency.format(Math.round(Number(n) || 0)) }
    
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
      } else if (type === 'warning') {
        toastIcon.className = 'w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0';
        toastIcon.innerHTML = '<span class="material-symbols-rounded">warning</span>';
      } else {
        toastIcon.className = 'w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0';
        toastIcon.innerHTML = '<span class="material-symbols-rounded">check_circle</span>';
      }

      toast.classList.remove('hidden');
      if (window.toastTimeout) clearTimeout(window.toastTimeout);
      window.toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
    }
    
    function loadData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return ensureData({ ...fallbackData, ...parsed, settings: { ...fallbackData.settings, ...(parsed.settings || {}) } });
      } catch { return ensureData(JSON.parse(JSON.stringify(fallbackData))) }
    }

    function ensureData(data) {
      if (!data) data = {};
      data.feeStructures = data.feeStructures || { JHS: [], SHS: [] };
      if (!data.feeStructures.JHS) data.feeStructures.JHS = [];
      if (!data.feeStructures.SHS) data.feeStructures.SHS = [];
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
      data.students = data.students || [];
      data.accounts = data.accounts || [];
      data.payments = data.payments || [];
      return data;
    }

    let appData = loadData();
    let currentPayMode = 'custom'; // 'custom' or 'itemized'

    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)) }

    function currentSession() {
      try { return JSON.parse(localStorage.getItem('pa_user_session') || localStorage.getItem('pa_current_user') || '{}') } catch { return {} }
    }

    function registeredUser() {
      const session = currentSession();
      const users = JSON.parse(localStorage.getItem('pa_registered_users') || '[]');
      return users.find(u => String(u.email || '').toLowerCase() === String(session.email || '').toLowerCase());
    }

    function inferLevelFromGrade(grade) { return ['Grade 11', 'Grade 12'].includes(String(grade || '')) ? 'SHS' : 'JHS' }

    function normalizeStudentRecord(source, session = {}) {
      const meta = session.user_metadata || {};
      const firstName = source.firstName || source.first_name || meta.first_name || '';
      const lastName = source.lastName || source.last_name || meta.last_name || '';
      const fullName = (source.name || source.fullName || `${firstName} ${lastName}`.trim() || session.fullName || meta.full_name || session.email || 'Student');
      const grade = source.gradeLevel || source.grade_level || source.grade || session.gradeLevel || session.grade || meta.grade_level || meta.gradeLevel || 'Grade 7';
      const level = source.educationLevel || source.education_level || source.level || session.educationLevel || meta.education_level || inferLevelFromGrade(grade);
      const section = source.section || source.section_name || session.section || meta.section_name || (grade === 'Grade 7' ? 'Cattleya' : grade === 'Grade 8' ? 'Vermillion' : grade === 'Grade 9' ? 'Aristotle' : grade === 'Grade 10' ? 'Diamond' : grade === 'Grade 11' ? 'Humility' : 'Honesty');
      const strand = source.strand || session.strand || meta.strand || (level === 'SHS' ? 'GAS' : 'N/A');
      return {
        id: source.studentId || source.student_number || source.id || session.studentId || session.id || meta.student_number || `STU-${Date.now()}`,
        authUserId: source.authUserId || source.auth_user_id || session.id || null,
        name: fullName,
        email: source.email || session.email || '',
        level, grade, section, strand,
        voucher: (source.voucher !== undefined && source.voucher !== null && source.voucher !== '') ? source.voucher : 'None',
        paid: Number(source.paid || 0),
        clearance: source.clearance || { Teacher: 'pending', Guidance: 'pending', Prefect: 'pending', Library: 'pending', Principal: 'pending', Accounting: 'pending', Registrar: 'pending' }
      }
    }

    function upsertCurrentStudent(source) {
      const session = currentSession();
      const student = normalizeStudentRecord(source, session);
      const email = String(student.email || '').toLowerCase();
      const idx = appData.students.findIndex(s => s.id === student.id || (email && String(s.email || '').toLowerCase() === email) || (student.authUserId && s.authUserId === student.authUserId));
      if (idx >= 0) {
        const existingVoucher = appData.students[idx].voucher;
        appData.students[idx] = {
          ...appData.students[idx],
          ...student,
          voucher: (existingVoucher !== undefined && existingVoucher !== null && existingVoucher !== 'None') ? existingVoucher : student.voucher,
          clearance: { ...(appData.students[idx].clearance || {}), ...(student.clearance || {}) }
        }
      } else {
        appData.students.push(student)
      }
      saveData();
      return idx >= 0 ? appData.students[idx] : student;
    }

    function isStaffOrAdminSession(session) {
      if (!session || !session.email) return false;
      const role = String(session.role || '').toLowerCase();
      const staffRoles = ['accounting_admin', 'teacher_clearance_head', 'guidance_head', 'prefect_head', 'librarian_head', 'principal', 'registrar', 'super_admin', 'admin', 'accountant'];
      if (staffRoles.includes(role)) return true;
      const email = String(session.email).toLowerCase();
      return ['admin', 'accounting', 'accountant', 'teacher', 'guidance', 'prefect', 'library', 'librarian', 'principal', 'registrar'].some(k => email.includes(k));
    }

    function currentStudent() {
      const session = currentSession();
      const reg = registeredUser();
      const email = String(session.email || reg?.email || '').toLowerCase();
      let student = appData.students.find(s => (session.studentId && s.id === session.studentId) || (session.id && s.authUserId === session.id) || (email && String(s.email || '').toLowerCase() === email) || (reg?.studentId && s.id === reg.studentId));
      if (!student && (reg || session.email) && !isStaffOrAdminSession(session)) { student = upsertCurrentStudent(reg || session) }
      if (!student) { student = normalizeStudentRecord({ name: 'Student', email: session.email || '', studentId: session.studentId || '' }, session) }
      return student;
    }

    async function hydrateCurrentStudentFromSupabase() {
      if (!window.paApi || !window.paApi.isSupabaseReady || !window.paApi.isSupabaseReady()) return;
      try {
        const supabase = window.paApi.client();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        let session = currentSession();
        if (!session.email) session = { ...session, id: user.id, email: user.email, fullName: user.user_metadata?.full_name || user.email, role: 'student', source: 'supabase' };
        let source = null;
        const { data: studentRow } = await supabase.from('students').select('*').or(`auth_user_id.eq.${user.id},email.eq.${user.email}`).maybeSingle();
        if (studentRow) {
          source = { ...studentRow, authUserId: user.id, studentId: studentRow.student_number, firstName: studentRow.first_name, lastName: studentRow.last_name, educationLevel: studentRow.education_level, gradeLevel: studentRow.grade_level, section: studentRow.section_name, strand: studentRow.strand }
        } else {
          const { data: req } = await supabase.from('student_registration_requests').select('*').or(`auth_user_id.eq.${user.id},email.eq.${user.email}`).maybeSingle();
          if (req) source = { ...req, authUserId: user.id, studentId: req.student_number, firstName: req.first_name, lastName: req.last_name, educationLevel: req.education_level, gradeLevel: req.grade_level, section: req.section_name, strand: req.strand }
        }
        if (!source && user.user_metadata) {
          const meta = user.user_metadata;
          source = {
            authUserId: user.id,
            email: user.email,
            studentId: meta.student_number || meta.studentId,
            firstName: meta.first_name || meta.firstName || "",
            lastName: meta.last_name || meta.lastName || "",
            educationLevel: meta.education_level || meta.educationLevel || (['Grade 11', 'Grade 12'].includes(meta.grade_level) ? 'SHS' : 'JHS'),
            gradeLevel: meta.grade_level || meta.gradeLevel || "Grade 7",
            section: meta.section_name || meta.section || "N/A",
            strand: meta.strand || "N/A",
            status: "active"
          };
        }
        if (source) {
          const student = upsertCurrentStudent(source);
          const updatedSession = { ...session, id: user.id, email: user.email || student.email, fullName: student.name, role: 'student', studentId: student.id, educationLevel: student.level, gradeLevel: student.grade, section: student.section, strand: student.strand, studentStatus: source.status || session.status || 'active', source: 'supabase' };
          localStorage.setItem('pa_user_session', JSON.stringify(updatedSession));
          localStorage.setItem('pa_current_user', JSON.stringify(updatedSession));
          localStorage.setItem('pa_user_role', 'student');
        }
      } catch (error) { console.warn('Student Supabase hydration skipped:', error) }
    }

    function classLabel(s) { if (s.level === 'SHS') { const strandStr = s.strand && s.strand !== 'N/A' ? ` (${s.strand})` : ''; return `${s.grade} - ${s.section || 'N/A'}${strandStr}` } return `${s.grade} - ${s.section || 'N/A'}` }
    function feeTotal(level) {
      const items = (appData.feeStructures && appData.feeStructures[level]) || [];
      return items.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    }
    function voucherAmount(s) { const v = (appData.vouchers || []).find(x => x.name === s.voucher && x.active); return v ? Number(v.amount || 0) : 0 }
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
    function getStudentPayments(s) {
      if (!s) return [];
      const allPayments = appData.payments || [];
      const studentEmail = String(s.email || '').toLowerCase();
      const studentId = String(s.id || '').toLowerCase();
      const dbId = String(s.dbId || '').toLowerCase();
      const cleanStudentId = studentId.replace('stu-', '').trim();
      const authUserId = String(s.authUserId || s.auth_user_id || '').toLowerCase();

      return allPayments.filter(p => {
        if (!p) return false;
        const pStudentId = String(p.studentId || p.student_id || p.studentDbId || '').toLowerCase();
        const pCleanId = pStudentId.replace('stu-', '').trim();
        const pEmail = String(p.email || p.studentEmail || '').toLowerCase();

        return (
          (studentId && pStudentId === studentId) ||
          (dbId && pStudentId === dbId) ||
          (cleanStudentId && pCleanId === cleanStudentId) ||
          (authUserId && pStudentId === authUserId) ||
          (studentEmail && pEmail && pEmail === studentEmail)
        );
      });
    }

    function getStudentTotalPaid(s) {
      if (!s) return 0;
      const recPaid = Number(s.paid || 0);
      const studentPayments = getStudentPayments(s);
      const calcPaid = (studentPayments && studentPayments.length > 0)
        ? studentPayments
            .filter(p => ['paid', 'succeeded', 'completed', 'active'].includes(String(p.status || 'paid').toLowerCase()))
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
        : 0;
      return Math.max(recPaid, calcPaid);
    }

    function balance(s) { return Math.max(0, assessedTotal(s) - getStudentTotalPaid(s)) }
    function initials(name) { return String(name || 'Student').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'ST' }
    
    function assignmentMatchesStudent(a, s) {
      const grade = a.grade || a.grade_level; const section = a.section || a.section_name || 'N/A'; const strand = a.strand || 'N/A';
      if (grade && s.grade && grade !== s.grade) return false;
      if (section !== 'N/A' && s.section && section !== s.section) return false;
      if (strand !== 'N/A' && s.strand) {
        const normA = strand.replace('HUMMS', 'HUMSS');
        const normS = (s.strand || '').replace('HUMMS', 'HUMSS');
        if (normA !== normS && s.strand !== 'N/A') return false
      }
      return true;
    }
    
    function assignedTeacherRows(s) { return (appData.accounts || []).filter(a => a.role === 'teacher_clearance_head' && a.active !== false).flatMap(t => (t.assignments || []).filter(a => assignmentMatchesStudent(a, s)).map(a => ({ teacher: t, assignment: a, key: `${s.id}|${t.id}|${a.subject || 'Subject'}|${a.grade}|${a.section || 'N/A'}` }))) }
    function requestFor(row) { return appData.teacherClearanceRequests.find(r => r.key === row.key) }
    
    function statusBadge(status) {
      const cls = { approved: 'bg-green-50 text-green-700', paid: 'bg-green-50 text-green-700', requested: 'bg-blue-50 text-blue-700', pending: 'bg-amber-50 text-amber-700', on_hold: 'bg-amber-50 text-amber-700', not_requested: 'bg-slate-100 text-slate-600' }[status] || 'bg-slate-100 text-slate-600';
      return `<span class="px-3 py-1 rounded-full text-xs font-extrabold ${cls}">${status.replace('_', ' ')}</span>`;
    }

    // Navigation & Tabs
    const navItems = [
      ['dashboardPage', 'dashboard', 'Dashboard Overview', 'Summary of your fees, clearance, and account status'],
      ['paymentsPage', 'account_balance_wallet', 'Tuition & Billing', 'View gross fees, discounts, net balance, and pay installments'],
      ['transactionsPage', 'receipt_long', 'Payment History', 'View past transactions, payment receipts, and payment references'],
      ['clearancePage', 'fact_check', 'Clearance Status', 'Track subject teacher and school office clearance approvals'],
      ['certificatePage', 'workspace_premium', 'Clearance Certificate', 'Generate and view your official clearance certificate'],
      ['profilePage', 'person', 'Student Profile', 'View your personal, academic, and enrollment information']
    ];

    function renderSideNav() {
      const activePage = document.querySelector('.page-section:not(.hidden)')?.id || 'dashboardPage';
      const navHtml = navItems.map(([id, icon, label]) => {
        const isActive = id === activePage;
        return `<button onclick="showPage('${id}')" class="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition font-bold text-left ${isActive ? 'bg-white text-academy-navy shadow-sm' : 'text-blue-100 hover:bg-white/10'}">
          <span class="material-symbols-rounded text-[20px]">${icon}</span>${label}
        </button>`;
      }).join('');
      
      const sideNav = document.getElementById('sideNav');
      const mobileSideNav = document.getElementById('mobileSideNav');
      if (sideNav) sideNav.innerHTML = navHtml;
      if (mobileSideNav) mobileSideNav.innerHTML = navHtml;
    }

    function showPage(pageId) {
      document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
      const activeEl = document.getElementById(pageId);
      if (activeEl) activeEl.classList.remove('hidden');

      const item = navItems.find(x => x[0] === pageId);
      if (item) {
        document.getElementById('pageTitle').textContent = item[2];
        document.getElementById('pageSubtitle').textContent = item[3];
      }
      renderSideNav();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleMobileDrawer() {
      document.getElementById('mobileDrawer').classList.toggle('hidden');
    }

    function studentInstallments(s) {
      const bal = balance(s);
      const templates = (appData.installmentTemplate && appData.installmentTemplate.length > 0)
        ? appData.installmentTemplate
        : DEFAULT_INSTALLMENT_TEMPLATE;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return templates.map((t, idx) => {
        const dueDateObj = t.dueDate ? new Date(t.dueDate) : null;
        const isPast = dueDateObj && dueDateObj < today;
        const isPaid = bal <= 0;
        const status = isPaid ? 'Paid' : (isPast ? 'Overdue' : 'Upcoming');
        return {
          ...t,
          order: idx + 1,
          status: status,
          isPaid: isPaid
        };
      });
    }

    function renderPayments(s) {
      const gross = feeTotal(s.level), voucher = voucherAmount(s), net = assessedTotal(s), paid = getStudentTotalPaid(s), bal = balance(s), pct = net ? Math.min(100, Math.round(paid / net * 100)) : 0;
      
      netBalance.textContent = money(bal);
      voucherApplied.textContent = money(voucher);
      voucherName.textContent = s.voucher || 'No voucher';
      voucherNote.textContent = s.voucher === 'None' ? 'No voucher applied' : `After ${s.voucher}`;
      grossFees.textContent = money(gross);
      paymentVoucher.textContent = '-' + money(voucher);
      amountPaid.textContent = money(paid);
      paymentBalance.textContent = money(bal);
      paymentProgressBar.style.width = pct + '%';
      paymentPctLabel.textContent = `${pct}% Paid`;

      const insts = studentInstallments(s);

      const banner = document.getElementById('dueDateAlertBanner');
      const titleEl = document.getElementById('dueDateAlertTitle');
      const msgEl = document.getElementById('dueDateAlertMsg');

      if (banner && titleEl && msgEl) {
        if (bal <= 0) {
          banner.classList.add('hidden');
        } else {
          const unpaidInst = (insts || []).find(i => i.status !== 'Paid');
          if (unpaidInst) {
            banner.classList.remove('hidden');
            titleEl.textContent = `Payment Due Reminder: ${unpaidInst.title}`;
            msgEl.textContent = `Payment milestone reminder for ${unpaidInst.title} due on ${unpaidInst.dueDate || 'As scheduled'}. Current account balance: ${money(bal)}. Settle balance to ensure smooth clearance.`;
          } else {
            banner.classList.add('hidden');
          }
        }
      }

      if (!insts || insts.length === 0) {
        installmentBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-academy-muted">
          <p class="font-extrabold text-sm text-academy-navy">No Due Date Schedules Set</p>
          <p class="text-xs mt-1">School administration has not set active payment reminder schedules yet.</p>
        </td></tr>`;
      } else {
        installmentBody.innerHTML = insts.map(i => `<tr>
          <td class="p-4 font-bold text-academy-navy">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${i.status === 'Paid' ? 'bg-emerald-500' : i.status === 'Overdue' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}"></span>
              <span class="text-sm font-extrabold text-academy-navy">${i.title}</span>
            </div>
            ${i.description ? `<p class="text-xs font-normal text-slate-500 mt-1 pl-4.5">${i.description}</p>` : ''}
          </td>
          <td class="p-4 font-bold text-slate-700">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs">
              <span class="material-symbols-rounded text-sm text-amber-600">event</span>${i.dueDate || 'As scheduled'}
            </span>
          </td>
          <td class="p-4 font-extrabold ${bal > 0 ? 'text-red-600' : 'text-emerald-700'}">${bal > 0 ? money(bal) : '₱0 (Fully Settled)'}</td>
          <td class="p-4">
            ${i.status === 'Paid' ? '<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center gap-1"><span class="material-symbols-rounded text-xs">check_circle</span> Settled</span>' :
              i.status === 'Overdue' ? '<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-50 text-red-700 border border-red-200/60 inline-flex items-center gap-1"><span class="material-symbols-rounded text-xs">error</span> Overdue</span>' :
              '<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200/60 inline-flex items-center gap-1"><span class="material-symbols-rounded text-xs">schedule</span> Upcoming</span>'}
          </td>
        </tr>`).join('');
      }
    }

    function renderPaymentsHistory() {
      const s = currentStudent();
      const studentPayments = getStudentPayments(s);
      const totalPaid = getStudentTotalPaid(s);
      
      // Update Summary Cards
      txCount.textContent = studentPayments.length;
      txTotalPaid.textContent = money(totalPaid);
      if (studentPayments.length > 0) {
        const latest = studentPayments[0];
        txLatestDate.textContent = latest.date || new Date(latest.paidAt || Date.now()).toLocaleDateString();
      } else {
        txLatestDate.textContent = 'None';
      }

      // Filter & Search
      const search = (document.getElementById('txSearchInput')?.value || '').toLowerCase();
      const channelFilter = (document.getElementById('txMethodFilter')?.value || 'all').toLowerCase();

      let filtered = studentPayments.filter(p => {
        const matchesSearch = !search || String(p.referenceNo || p.id || '').toLowerCase().includes(search) || String(p.method || '').toLowerCase().includes(search);
        const matchesChannel = channelFilter === 'all' || String(p.method || '').toLowerCase().includes(channelFilter);
        return matchesSearch && matchesChannel;
      });

      const body = document.getElementById('paymentHistoryBody');
      if (!filtered.length) {
        body.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-academy-muted">
          <p class="font-bold">No payment history found</p>
          <p class="text-xs mt-1">Make a payment using QR Ph, GCash, or Card to see your transaction history.</p>
        </td></tr>`;
        return;
      }

      body.innerHTML = filtered.map(p => {
        const ref = p.referenceNo || p.id || 'N/A';
        const dateStr = p.date || (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Today');
        const channel = p.method || 'Online';
        const channelColor = channel.includes('GCash') ? 'bg-emerald-50 text-emerald-700' :
                             channel.includes('Maya') ? 'bg-sky-50 text-sky-700' :
                             channel.includes('PayMongo') || channel.includes('QR') ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700';
        return `<tr class="hover:bg-academy-soft">
          <td class="p-4 font-extrabold text-academy-navy">${ref}</td>
          <td class="p-4 text-xs font-semibold text-academy-muted">${dateStr}</td>
          <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${channelColor}">${channel}</span></td>
          <td class="p-4 font-extrabold text-green-700">${money(p.amount)}</td>
          <td class="p-4">${statusBadge('paid')}</td>
          <td class="p-4">
            <button onclick='showReceiptModal(${JSON.stringify(p).replaceAll("'", "\\'")})' class="px-3 py-1.5 rounded-xl bg-academy-soft border border-academy-border text-academy-navy text-xs font-bold hover:bg-academy-light">
              Receipt
            </button>
          </td>
        </tr>`;
      }).join('');

      // Recent Preview on Overview Tab
      const recentList = document.getElementById('recentTransactionsList');
      if (recentList) {
        if (!studentPayments.length) {
          recentList.innerHTML = `<p class="text-xs text-academy-muted py-3">No payments recorded yet.</p>`;
        } else {
          recentList.innerHTML = studentPayments.slice(0, 3).map(p => `
            <div class="p-3 rounded-xl border border-academy-border flex items-center justify-between">
              <div>
                <p class="font-extrabold text-xs text-academy-navy">${p.referenceNo || p.id}</p>
                <p class="text-[11px] text-academy-muted">${p.method} · ${p.date || 'Today'}</p>
              </div>
              <span class="font-extrabold text-sm text-green-600">${money(p.amount)}</span>
            </div>
          `).join('');
        }
      }
    }

    function renderTeacherClearance(s) {
      const rows = assignedTeacherRows(s);
      teacherClearanceCards.innerHTML = rows.length ? rows.map(row => {
        const req = requestFor(row);
        const status = req?.status || 'not_requested';
        const disabled = status !== 'not_requested';
        return `<div class="border border-academy-border rounded-xl p-4 bg-white"><div class="flex items-start justify-between gap-3"><div><p class="font-extrabold text-sm text-academy-navy">${row.teacher.name}</p><p class="text-xs text-academy-muted mt-1">${row.assignment.subject || 'Subject'} · ${row.assignment.grade} ${row.assignment.section || 'N/A'}</p></div>${statusBadge(status)}</div><button ${disabled ? 'disabled' : ''} onclick="requestTeacherApproval('${row.key.replaceAll("'", "\\'")}')" class="mt-3 w-full px-3 py-2 rounded-xl text-xs font-extrabold ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-academy-navy text-white hover:bg-blue-900'}">${status === 'not_requested' ? 'Request Approval' : 'Request Sent'}</button></div>`
      }).join('') : `<div class="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">No teacher assignment found for ${classLabel(s)}. Ask the admin to add teacher clearance heads for this grade/section.</div>`;

      officeClearanceCards.innerHTML = officeKeys().map(k => `<div class="flex items-center justify-between border border-academy-border rounded-xl p-3 bg-white"><span class="font-bold text-sm text-academy-navy">${k}</span>${statusBadge(s.clearance?.[k] || 'pending')}</div>`).join('');

      // Render Overview Clearance Summary
      const summaryGrid = document.getElementById('clearanceSummaryGrid');
      if (summaryGrid) {
        summaryGrid.innerHTML = [
          ['Subject Teachers', teacherApprovalsApproved(s) ? 'approved' : 'pending'],
          ['Guidance Office', s.clearance?.Guidance || 'pending'],
          ['Prefect of Discipline', s.clearance?.Prefect || 'pending'],
          ['Library Head', s.clearance?.Library || 'pending'],
          ['Principal', s.clearance?.Principal || 'pending'],
          ['Accounting / Final', s.clearance?.Accounting || 'pending']
        ].map(([title, st]) => `
          <div class="p-3 rounded-xl border border-academy-border flex items-center justify-between text-xs">
            <span class="font-bold text-academy-navy">${title}</span>
            ${statusBadge(st)}
          </div>
        `).join('');
      }
    }

    function renderProfile(s) {
      welcomeName.textContent = `Welcome back, ${s.name.split(' ')[0] || 'Student'}`;
      studentMeta.textContent = `${classLabel(s)} · Student ID: ${s.id} · SY ${(appData.settings || {}).schoolYear || '2026-2027'}`;
      profileName.textContent = s.name;
      profileMeta.innerHTML = `Student ID: <strong>${s.id}</strong><br>${classLabel(s)}`;
      avatarInitials.textContent = profileInitials.textContent = initials(s.name);

      const grid = document.getElementById('profileDetailsGrid');
      if (grid) {
        grid.innerHTML = [
          ['Full Name', s.name],
          ['Student Number', s.id],
          ['Email Address', s.email || 'N/A'],
          ['Education Level', s.level],
          ['Grade Level', s.grade],
          ['Section Name', s.section || 'N/A'],
          ['Strand', s.strand || 'N/A'],
          ['Voucher Status', s.voucher || 'None'],
          ['School Year', (appData.settings || {}).schoolYear || '2026-2027']
        ].map(([k, v]) => `
          <div class="p-3.5 rounded-xl border border-academy-border bg-academy-soft">
            <p class="text-xs text-academy-muted font-bold">${k}</p>
            <p class="text-sm font-extrabold text-academy-navy mt-0.5">${v}</p>
          </div>
        `).join('');
      }

      // Certificate Tab Status
      const certBadge = document.getElementById('certificateStatusBadge');
      const certBtn = document.getElementById('openCertificateBtn');
      const c = clearanceCounts(s);
      const studentBal = balance(s);
      const clearancesDone = c.done === c.total && c.total > 0;
      const isEligible = clearancesDone && studentBal <= 0;

      if (certBadge) {
        if (isEligible) {
          certBadge.textContent = 'Completed & Approved';
          certBadge.className = 'text-base font-extrabold mt-1 text-emerald-600';
        } else if (!clearancesDone) {
          const pendingCount = Math.max(1, c.total - c.done);
          certBadge.textContent = `Locked (${pendingCount} clearance approval(s) pending)`;
          certBadge.className = 'text-sm font-extrabold mt-1 text-amber-700';
        } else {
          certBadge.textContent = `Locked (Tuition balance of ${money(studentBal)} remaining)`;
          certBadge.className = 'text-sm font-extrabold mt-1 text-red-600';
        }
      }

      if (certBtn) {
        if (isEligible) {
          certBtn.disabled = false;
          certBtn.className = 'px-8 py-3.5 rounded-2xl bg-academy-navy text-white font-extrabold shadow-lg hover:bg-blue-900 transition cursor-pointer flex items-center justify-center gap-2 mx-auto';
          certBtn.innerHTML = '<span class="material-symbols-rounded text-xl">workspace_premium</span>View & Print Official Certificate';
        } else if (!clearancesDone) {
          certBtn.disabled = true;
          certBtn.className = 'px-8 py-3.5 rounded-2xl bg-slate-200 text-slate-400 font-extrabold cursor-not-allowed flex items-center justify-center gap-2 mx-auto';
          certBtn.innerHTML = '<span class="material-symbols-rounded text-xl">lock</span>Certificate Locked (Clearance Incomplete)';
        } else {
          certBtn.disabled = true;
          certBtn.className = 'px-8 py-3.5 rounded-2xl bg-red-100 text-red-600 font-extrabold cursor-not-allowed flex items-center justify-center gap-2 mx-auto border border-red-200';
          certBtn.innerHTML = `<span class="material-symbols-rounded text-xl">account_balance_wallet</span>Certificate Locked (Balance: ${money(studentBal)})`;
        }
      }
    }

    function officeKeys() { return ['Guidance', 'Prefect', 'Library', 'Principal', 'Accounting', 'Registrar'] }
    
    function clearanceCounts(s) {
      const teacherRows = assignedTeacherRows(s);
      const teacherDone = teacherRows.filter(row => requestFor(row)?.status === 'approved').length;
      const officeDone = officeKeys().filter(k => s.clearance?.[k] === 'approved').length;
      return { done: teacherDone + officeDone, total: teacherRows.length + officeKeys().length }
    }

    function teacherApprovalsApproved(s) { const rows = assignedTeacherRows(s); return rows.length > 0 && rows.every(row => requestFor(row)?.status === 'approved') }

    function toggleNotificationDropdown(forceClose = false) {
      const dd = document.getElementById('notificationDropdown');
      if (!dd) return;
      if (forceClose) {
        dd.classList.add('hidden');
      } else {
        dd.classList.toggle('hidden');
      }
    }

    // Close notification dropdown when clicking outside
    document.addEventListener('click', function(e) {
      const btn = document.getElementById('headerNotificationBtn');
      const dd = document.getElementById('notificationDropdown');
      if (dd && !dd.classList.contains('hidden') && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.add('hidden');
      }
    });

    function scrollToNotificationsSection() {
      toggleNotificationDropdown(true);
      showPage('dashboardPage');
      const sec = document.getElementById('remindersSection');
      if (sec) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        sec.classList.add('ring-2', 'ring-academy-blue', 'ring-offset-2');
        setTimeout(() => sec.classList.remove('ring-2', 'ring-academy-blue', 'ring-offset-2'), 2000);
      }
    }

    function generateStudentNotifications(s) {
      if (!s) return [];
      const notifications = [];

      // 1. PAYMENT & DUE DATE REMINDERS
      const bal = balance(s);
      const insts = studentInstallments(s);
      const unpaidInsts = (insts || []).filter(i => i.status !== 'Paid');

      if (bal <= 0) {
        notifications.push({
          id: 'pay_complete',
          category: 'Payment',
          severity: 'success',
          icon: 'check_circle',
          badgeText: 'Fully Paid',
          title: 'Tuition Balance Satisfied',
          message: 'You have no outstanding tuition balance for the current school year.',
          actionText: 'View SOA',
          actionFn: "showPage('paymentsPage')"
        });
      } else if (unpaidInsts.length > 0) {
        const nextInst = unpaidInsts[0];
        const isOverdue = nextInst.status === 'Overdue';

        notifications.push({
          id: `pay_due_${nextInst.title}`,
          category: 'Due Date',
          severity: isOverdue ? 'danger' : 'warning',
          icon: isOverdue ? 'error' : 'event_upcoming',
          badgeText: isOverdue ? 'Overdue' : 'Payment Due',
          title: isOverdue ? `Overdue Payment Notice: ${nextInst.title}` : `Upcoming Due Date: ${nextInst.title}`,
          message: `Payment reminder for ${nextInst.title} due on ${nextInst.dueDate || 'As scheduled'}. Outstanding balance: ${money(bal)}.`,
          actionText: 'Pay Tuition Now',
          actionFn: "startPayMongoCheckout()"
        });
      } else {
        notifications.push({
          id: 'pay_bal_notice',
          category: 'Payment',
          severity: 'info',
          icon: 'account_balance_wallet',
          badgeText: 'Balance Due',
          title: 'Outstanding Net Balance',
          message: `You have an unbilled or remaining balance of ${money(bal)}. Partial payments can be made anytime.`,
          actionText: 'Pay Tuition Now',
          actionFn: "startPayMongoCheckout()"
        });
      }

      // 2. CLEARANCE PROGRESS REMINDERS
      const c = clearanceCounts(s);
      const teacherRows = assignedTeacherRows(s);
      const pendingTeachers = teacherRows.filter(row => requestFor(row)?.status !== 'approved');
      const approvedTeachersCount = teacherRows.length - pendingTeachers.length;
      const officeDone = officeKeys().filter(k => s.clearance?.[k] === 'approved').length;
      const totalOffice = officeKeys().length;

      if (c.done === c.total && c.total > 0) {
        notifications.push({
          id: 'clearance_complete',
          category: 'Clearance',
          severity: 'success',
          icon: 'workspace_premium',
          badgeText: 'Cleared 100%',
          title: 'Official Clearance Completed!',
          message: `All ${c.total} subject teacher and department office clearances have been approved. Your Official Certificate of Clearance is ready!`,
          actionText: 'View & Download Certificate',
          actionFn: "showPage('certificatePage')"
        });
      } else {
        if (pendingTeachers.length > 0) {
          notifications.push({
            id: 'clearance_teachers_pending',
            category: 'Clearance',
            severity: 'info',
            icon: 'fact_check',
            badgeText: `${approvedTeachersCount}/${teacherRows.length} Teachers`,
            title: 'Subject Teacher Sign-offs Pending',
            message: `${pendingTeachers.length} subject teacher approval(s) pending. Submit digital clearance requests to clear your subjects.`,
            actionText: 'Request Clearance',
            actionFn: "showPage('clearancePage')"
          });
        } else if (teacherRows.length > 0) {
          notifications.push({
            id: 'clearance_teachers_done',
            category: 'Clearance',
            severity: 'success',
            icon: 'task_alt',
            badgeText: 'Teachers Cleared',
            title: 'All Subject Teachers Cleared',
            message: 'All your subject teachers have approved your clearance requests.',
            actionText: 'View Clearance',
            actionFn: "showPage('clearancePage')"
          });
        }

        if (officeDone < totalOffice) {
          const pendingOffices = officeKeys().filter(k => s.clearance?.[k] !== 'approved');
          notifications.push({
            id: 'clearance_office_pending',
            category: 'Clearance',
            severity: 'warning',
            icon: 'domain',
            badgeText: `${officeDone}/${totalOffice} Offices`,
            title: 'Administrative Office Clearance Status',
            message: `${officeDone} of ${totalOffice} offices signed off. Pending: ${pendingOffices.join(', ')}.`,
            actionText: 'Check Office Status',
            actionFn: "showPage('clearancePage')"
          });
        }
      }

      return notifications;
    }

    function renderNotifications(s) {
      const list = generateStudentNotifications(s);
      const activeAlerts = list.filter(n => n.severity !== 'success');
      const activeCount = activeAlerts.length;

      // Update Header Badges
      const headerBadge = document.getElementById('headerNotificationBadge');
      const dropdownBadge = document.getElementById('dropdownNotificationBadge');
      if (headerBadge) {
        if (activeCount > 0) {
          headerBadge.textContent = activeCount;
          headerBadge.classList.remove('hidden');
        } else {
          headerBadge.classList.add('hidden');
        }
      }
      if (dropdownBadge) {
        dropdownBadge.textContent = `${activeCount} Active`;
      }

      // Update Overview Stat Card
      const overviewCountEl = document.getElementById('overviewNotificationCount');
      const overviewNoteEl = document.getElementById('overviewNotificationNote');
      if (overviewCountEl) {
        overviewCountEl.textContent = `${activeCount} Active`;
      }
      if (overviewNoteEl) {
        const payCount = list.filter(n => n.category === 'Payment' || n.category === 'Due Date').length;
        const clrCount = list.filter(n => n.category === 'Clearance').length;
        overviewNoteEl.textContent = `${payCount} payment, ${clrCount} clearance`;
      }

      // Update Center Widget Header Badge
      const centerBadge = document.getElementById('centerNotificationBadge');
      if (centerBadge) {
        centerBadge.textContent = `${activeCount} Action Needed`;
        centerBadge.className = activeCount > 0
          ? "px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold"
          : "px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-extrabold";
      }

      // Render Dropdown List
      const dropdownListEl = document.getElementById('dropdownNotificationList');
      if (dropdownListEl) {
        if (list.length === 0) {
          dropdownListEl.innerHTML = `<div class="p-4 text-center text-academy-muted">No notifications at this time.</div>`;
        } else {
          dropdownListEl.innerHTML = list.map(n => {
            let colorClasses = "bg-blue-50 text-blue-700 border-blue-100";
            if (n.severity === 'danger') colorClasses = "bg-red-50 text-red-700 border-red-100";
            if (n.severity === 'warning') colorClasses = "bg-amber-50 text-amber-800 border-amber-100";
            if (n.severity === 'success') colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-100";

            return `
              <div class="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${colorClasses}">
                  <span class="material-symbols-rounded text-lg">${n.icon}</span>
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-1">
                    <p class="font-extrabold text-academy-navy text-xs truncate">${n.title}</p>
                    <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${colorClasses}">${n.badgeText}</span>
                  </div>
                  <p class="text-[11px] text-slate-600 mt-0.5 leading-tight">${n.message}</p>
                  <button onclick="toggleNotificationDropdown(true); ${n.actionFn}" class="mt-1 text-[11px] font-extrabold text-academy-blue hover:underline inline-flex items-center gap-0.5">
                    <span>${n.actionText}</span> →
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // Render Dashboard Overview Widget Cards
      const overviewListEl = document.getElementById('overviewNotificationsList');
      if (overviewListEl) {
        if (list.length === 0) {
          overviewListEl.innerHTML = `<div class="col-span-2 p-6 text-center text-academy-muted bg-academy-soft rounded-xl">No active reminders right now.</div>`;
        } else {
          overviewListEl.innerHTML = list.map(n => {
            let bgBorder = "bg-blue-50/50 border-blue-200/80 text-blue-900";
            let iconBg = "bg-blue-100 text-blue-700";
            let btnClass = "bg-academy-navy hover:bg-blue-900 text-white";

            if (n.severity === 'danger') {
              bgBorder = "bg-red-50/60 border-red-200 text-red-950";
              iconBg = "bg-red-100 text-red-700";
              btnClass = "bg-red-600 hover:bg-red-700 text-white";
            } else if (n.severity === 'warning') {
              bgBorder = "bg-amber-50/60 border-amber-200 text-amber-950";
              iconBg = "bg-amber-100 text-amber-700";
              btnClass = "bg-amber-600 hover:bg-amber-700 text-white";
            } else if (n.severity === 'success') {
              bgBorder = "bg-emerald-50/60 border-emerald-200 text-emerald-950";
              iconBg = "bg-emerald-100 text-emerald-700";
              btnClass = "bg-emerald-600 hover:bg-emerald-700 text-white";
            }

            return `
              <div class="p-4 rounded-xl border ${bgBorder} shadow-xs flex flex-col justify-between gap-3">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-xs">
                    <span class="material-symbols-rounded text-xl">${n.icon}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-extrabold uppercase tracking-wide opacity-75">${n.category} Alert</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${iconBg}">${n.badgeText}</span>
                    </div>
                    <h4 class="font-extrabold text-sm mt-0.5 leading-snug">${n.title}</h4>
                    <p class="text-xs mt-1 opacity-90 leading-relaxed">${n.message}</p>
                  </div>
                </div>
                <div class="pt-2 border-t border-black/5 flex justify-end">
                  <button onclick="${n.actionFn}" class="px-3.5 py-1.5 rounded-lg text-xs font-extrabold shadow-xs transition flex items-center gap-1 ${btnClass}">
                    <span>${n.actionText}</span>
                    <span class="material-symbols-rounded text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    function renderAll() {
      appData = ensureData(appData);
      const s = currentStudent();
      renderProfile(s);
      renderPayments(s);
      renderOverviewFeeBreakdown(s);
      renderPaymentsHistory();
      renderTeacherClearance(s);
      renderNotifications(s);
      renderSideNav();
      const c = clearanceCounts(s);
      clearanceProgress.textContent = `${c.done}/${c.total}`;
      saveData();
    }

    function renderOverviewFeeBreakdown(s) {
      const feeItems = (s.customFees && Array.isArray(s.customFees) && s.customFees.length > 0)
        ? s.customFees
        : getFeeItemsForStudent(s);

      const grossSum = feeItems.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const voucherAmt = voucherAmount(s);
      const discountAmt = Number(s.feeDiscount || 0);
      const totalDeductions = voucherAmt + discountAmt;
      const netAssessed = assessedTotal(s);
      const paidAmt = getStudentTotalPaid(s);
      const netBal = balance(s);

      const grossEl = document.getElementById('overviewGrossFees');
      const discEl = document.getElementById('overviewDiscounts');
      const paidEl = document.getElementById('overviewTotalPaid');
      const balEl = document.getElementById('overviewBalanceDue');

      if (grossEl) grossEl.textContent = money(grossSum);
      if (discEl) discEl.textContent = totalDeductions > 0 ? '-' + money(totalDeductions) : '₱0';
      if (paidEl) paidEl.textContent = money(paidAmt);
      if (balEl) balEl.textContent = money(netBal);

      const tbody = document.getElementById('overviewFeeBreakdownBody');
      const tfoot = document.getElementById('overviewFeeBreakdownFoot');
      if (!tbody || !tfoot) return;

      const settledMap = getSettledFeeStatusMap(s);

      let rowsHtml = feeItems.map((item, idx) => {
        const itemAmt = Number(item.amount || 0);
        const itemNet = grossSum > 0 ? Math.max(0, itemAmt - Math.round((itemAmt / grossSum) * totalDeductions)) : itemAmt;
        const key = item.name.toLowerCase().trim();
        const isSettled = settledMap[key]?.settled || (netBal <= 0);

        return `<tr class="hover:bg-academy-soft/50 transition">
          <td class="p-3 font-extrabold text-academy-navy flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isSettled ? 'bg-emerald-500' : 'bg-academy-blue'}"></span>
            ${item.name || `Fee Item ${idx + 1}`}
          </td>
          <td class="p-3 text-right font-semibold text-slate-600">${money(itemAmt)}</td>
          <td class="p-3 text-right font-semibold text-slate-400">₱0</td>
          <td class="p-3 text-right font-extrabold text-academy-navy">${money(itemNet)}</td>
          <td class="p-3 text-center">
            ${isSettled ? '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center gap-1"><span class="material-symbols-rounded text-xs">check_circle</span> Settled</span>' :
              paidAmt > 0 ? '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-700">Partial</span>' :
              '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700">Unpaid</span>'}
          </td>
        </tr>`;
      }).join('');

      if (voucherAmt > 0) {
        rowsHtml += `<tr class="bg-blue-50/50">
          <td class="p-3 font-extrabold text-blue-900 flex items-center gap-2">
            <span class="material-symbols-rounded text-sm text-blue-600">confirmation_number</span>
            Voucher Discount (${s.voucher})
          </td>
          <td class="p-3 text-right font-semibold text-slate-400">-</td>
          <td class="p-3 text-right font-extrabold text-blue-700">-${money(voucherAmt)}</td>
          <td class="p-3 text-right font-extrabold text-blue-700">-${money(voucherAmt)}</td>
          <td class="p-3 text-center"><span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800">Applied</span></td>
        </tr>`;
      }

      if (discountAmt > 0) {
        rowsHtml += `<tr class="bg-indigo-50/50">
          <td class="p-3 font-extrabold text-indigo-900 flex items-center gap-2">
            <span class="material-symbols-rounded text-sm text-indigo-600">sell</span>
            Special Fee Discount
          </td>
          <td class="p-3 text-right font-semibold text-slate-400">-</td>
          <td class="p-3 text-right font-extrabold text-indigo-700">-${money(discountAmt)}</td>
          <td class="p-3 text-right font-extrabold text-indigo-700">-${money(discountAmt)}</td>
          <td class="p-3 text-center"><span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-800">Applied</span></td>
        </tr>`;
      }

      tbody.innerHTML = rowsHtml;

      tfoot.innerHTML = `
        <tr class="bg-slate-100 text-slate-800">
          <td class="p-3 text-left">Total Net Assessed Fees</td>
          <td class="p-3 text-right font-bold text-slate-500">${money(grossSum)}</td>
          <td class="p-3 text-right font-bold text-blue-700">-${money(totalDeductions)}</td>
          <td class="p-3 text-right text-sm font-black text-academy-navy" colspan="2">${money(netAssessed)}</td>
        </tr>
        <tr class="bg-emerald-50/70 text-emerald-950">
          <td class="p-3 text-left font-bold">Total Payments Made</td>
          <td class="p-3 text-right font-black text-emerald-700" colspan="4">-${money(paidAmt)}</td>
        </tr>
        <tr class="bg-slate-900 text-white text-sm font-black">
          <td class="p-3.5 text-left uppercase tracking-wide">Net Remaining Balance Due</td>
          <td class="p-3.5 text-right text-red-400 text-base" colspan="4">${money(netBal)}</td>
        </tr>
      `;
    }

    function printFeeBreakdown() {
      const s = currentStudent();
      const feeItems = (s.customFees && Array.isArray(s.customFees) && s.customFees.length > 0)
        ? s.customFees
        : getFeeItemsForStudent(s);

      const grossSum = feeItems.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const voucherAmt = voucherAmount(s);
      const discountAmt = Number(s.feeDiscount || 0);
      const totalDeductions = voucherAmt + discountAmt;
      const netAssessed = assessedTotal(s);
      const paidAmt = getStudentTotalPaid(s);
      const netBal = balance(s);

      document.getElementById('stmtDateStr').textContent = 'Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
      document.getElementById('stmtStudentName').textContent = s.name;
      document.getElementById('stmtStudentId').textContent = s.id;
      document.getElementById('stmtClass').textContent = classLabel(s);
      document.getElementById('stmtLevel').textContent = s.level;
      document.getElementById('stmtVoucher').textContent = s.voucher || 'None';
      document.getElementById('stmtSY').textContent = (appData.settings || {}).schoolYear || '2026-2027';

      const tbody = document.getElementById('stmtFeeTableBody');
      let rowsHtml = feeItems.map(item => `
        <tr>
          <td class="p-2.5 font-bold text-slate-800">${item.name}</td>
          <td class="p-2.5 text-right font-semibold text-slate-600">${money(item.amount)}</td>
          <td class="p-2.5 text-right font-semibold text-slate-400">₱0</td>
          <td class="p-2.5 text-right font-bold text-slate-900">${money(item.amount)}</td>
        </tr>
      `).join('');

      if (voucherAmt > 0) {
        rowsHtml += `
          <tr class="bg-blue-50/60 text-blue-900">
            <td class="p-2.5 font-bold">Voucher Discount (${s.voucher})</td>
            <td class="p-2.5 text-right">-</td>
            <td class="p-2.5 text-right font-bold text-blue-700">-${money(voucherAmt)}</td>
            <td class="p-2.5 text-right font-bold text-blue-700">-${money(voucherAmt)}</td>
          </tr>
        `;
      }
      if (discountAmt > 0) {
        rowsHtml += `
          <tr class="bg-indigo-50/60 text-indigo-900">
            <td class="p-2.5 font-bold">Special Fee Discount</td>
            <td class="p-2.5 text-right">-</td>
            <td class="p-2.5 text-right font-bold text-indigo-700">-${money(discountAmt)}</td>
            <td class="p-2.5 text-right font-bold text-indigo-700">-${money(discountAmt)}</td>
          </tr>
        `;
      }
      tbody.innerHTML = rowsHtml;

      document.getElementById('stmtFeeTableFoot').innerHTML = `
        <tr>
          <td class="p-2.5">Total Net Assessed Tuition & Fees</td>
          <td class="p-2.5 text-right text-slate-500">${money(grossSum)}</td>
          <td class="p-2.5 text-right text-blue-700">-${money(totalDeductions)}</td>
          <td class="p-2.5 text-right text-slate-900 text-sm font-black">${money(netAssessed)}</td>
        </tr>
      `;

      const studentPayments = getStudentPayments(s);
      const pBody = document.getElementById('stmtPaymentsBody');
      if (!studentPayments.length && paidAmt > 0) {
        pBody.innerHTML = `
          <tr>
            <td class="p-2.5 font-extrabold text-slate-900">PAY-ONLINE</td>
            <td class="p-2.5 text-slate-600">${new Date().toLocaleDateString()}</td>
            <td class="p-2.5 font-semibold text-slate-700">Online / QR Ph Payment</td>
            <td class="p-2.5 text-right font-extrabold text-emerald-700">${money(paidAmt)}</td>
          </tr>
        `;
      } else if (!studentPayments.length) {
        pBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">No payments recorded yet.</td></tr>`;
      } else {
        pBody.innerHTML = studentPayments.map(p => `
          <tr>
            <td class="p-2.5 font-extrabold text-slate-900">${p.referenceNo || p.id}</td>
            <td class="p-2.5 text-slate-600">${p.date || (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'N/A')}</td>
            <td class="p-2.5 font-semibold text-slate-700">${p.method || 'Online Payment'}</td>
            <td class="p-2.5 text-right font-extrabold text-emerald-700">${money(p.amount)}</td>
          </tr>
        `).join('');
      }

      document.getElementById('stmtGrossTotal').textContent = money(grossSum);
      document.getElementById('stmtDeductionsTotal').textContent = totalDeductions > 0 ? '-' + money(totalDeductions) : '₱0';
      document.getElementById('stmtNetAssessedTotal').textContent = money(netAssessed);
      document.getElementById('stmtTotalPaid').textContent = '-' + money(paidAmt);
      document.getElementById('stmtNetBalance').textContent = money(netBal);

      document.getElementById('statementPrintModal').classList.remove('hidden');
    }

    function closeStatementPrintModal() {
      document.getElementById('statementPrintModal').classList.add('hidden');
    }

    function openCertificate() {
      const s = currentStudent();
      const c = clearanceCounts(s);
      const studentBal = balance(s);
      const clearancesDone = c.done === c.total && c.total > 0;
      if (!clearancesDone) {
        const pendingCount = Math.max(1, c.total - c.done);
        showToast('Certificate Locked', `Your clearance certificate is locked because ${pendingCount} clearance head approval(s) are still pending.`, 'warning');
        return;
      }
      if (studentBal > 0) {
        showToast('Certificate Locked', `Your clearance certificate is locked because you have an outstanding balance of ${money(studentBal)}. Please settle your balance to unlock.`, 'warning');
        return;
      }
      window.open(`certificate.html?studentId=${encodeURIComponent(s.id)}&from=student`, '_blank');
    }

    async function requestTeacherApproval(key) {
      const student = currentStudent();
      const row = assignedTeacherRows(student).find(r => r.key === key);
      if (!row) return;

      const existingReq = requestFor(row);
      appData.teacherClearanceRequests = appData.teacherClearanceRequests || [];
      if (!existingReq) {
        appData.teacherClearanceRequests.push({
          key: row.key,
          studentId: student.id,
          teacherId: row.teacher.id,
          teacherName: row.teacher.name,
          subject: row.assignment.subject || 'Subject',
          grade: student.grade,
          section: student.section,
          strand: student.strand,
          status: 'requested',
          requestedAt: new Date().toISOString()
        });
      } else {
        existingReq.status = 'requested';
        existingReq.requestedAt = new Date().toISOString();
      }
      saveData();

      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          await window.paApi.requestClearance(student.id, appData.settings.schoolYear);
        } catch (err) {
          console.warn("Supabase request clearance notice:", err);
        }
      }

      renderAll();
      showToast('Clearance Request Sent', 'Clearance approval request sent to ' + row.teacher.name + '.', 'info');
    }

    async function requestAllTeacherApprovals() {
      const student = currentStudent();
      const rows = assignedTeacherRows(student);
      if (!rows.length) { showToast('No Teachers Assigned', 'No assigned teachers found for your grade/section yet. Please contact the admin.', 'warning'); return; }

      appData.teacherClearanceRequests = appData.teacherClearanceRequests || [];
      rows.forEach(row => {
        const existingReq = requestFor(row);
        if (!existingReq) {
          appData.teacherClearanceRequests.push({
            key: row.key,
            studentId: student.id,
            teacherId: row.teacher.id,
            teacherName: row.teacher.name,
            subject: row.assignment.subject || 'Subject',
            grade: student.grade,
            section: student.section,
            strand: student.strand,
            status: 'requested',
            requestedAt: new Date().toISOString()
          });
        } else {
          existingReq.status = 'requested';
          existingReq.requestedAt = new Date().toISOString();
        }
      });
      saveData();

      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          await window.paApi.requestClearance(student.id, appData.settings.schoolYear);
        } catch (err) {
          console.warn("Supabase request clearance notice:", err);
        }
      }

      renderAll();
      showToast('Clearance Submitted', 'Clearance requests were submitted to all assigned teachers.', 'info');
    }

    // ITEMIZE & PARTIAL PAYMENT MODAL LOGIC
    function getFeeItemsForStudent(s) {
      let items = appData.feeStructures?.[s.level] || [];
      if (!items || items.length === 0) {
        if (s.level === 'JHS') {
          items = [
            { id: 'f1', name: 'Tuition Fee', amount: 15000 },
            { id: 'f2', name: 'Miscellaneous & Computer Fee', amount: 4000 },
            { id: 'f3', name: 'Laboratory & Facilities Fee', amount: 2000 },
            { id: 'f4', name: 'Registration & Student ID', amount: 1000 }
          ];
        } else {
          items = [
            { id: 'f1', name: 'Tuition Fee', amount: 18000 },
            { id: 'f2', name: 'Miscellaneous & Facilities Fee', amount: 5000 },
            { id: 'f3', name: 'Track / Specialization Fee', amount: 3000 },
            { id: 'f4', name: 'Registration & Student ID', amount: 1000 }
          ];
        }
      }
      return items;
    }

    function setPaymentMode(mode) {
      currentPayMode = mode;
      const btnCustom = document.getElementById('modeBtnCustom');
      const btnItemized = document.getElementById('modeBtnItemized');
      const secCustom = document.getElementById('modeSectionCustom');
      const secItemized = document.getElementById('modeSectionItemized');

      if (mode === 'custom') {
        btnCustom.className = 'py-2.5 px-3 rounded-xl font-extrabold text-xs transition bg-white text-academy-navy shadow-xs';
        btnItemized.className = 'py-2.5 px-3 rounded-xl font-extrabold text-xs transition text-academy-muted hover:text-academy-navy';
        secCustom.classList.remove('hidden');
        secItemized.classList.add('hidden');
      } else {
        btnItemized.className = 'py-2.5 px-3 rounded-xl font-extrabold text-xs transition bg-white text-academy-navy shadow-xs';
        btnCustom.className = 'py-2.5 px-3 rounded-xl font-extrabold text-xs transition text-academy-muted hover:text-academy-navy';
        secItemized.classList.remove('hidden');
        secCustom.classList.add('hidden');
        renderFeeChecklist();
      }
    }

    // Helper: Determine settlement status for individual fee items
    function getSettledFeeStatusMap(s) {
      const feeItems = (s && s.customFees && Array.isArray(s.customFees) && s.customFees.length > 0)
        ? s.customFees
        : getFeeItemsForStudent(s);
      const totalPaid = getStudentTotalPaid(s);
      const netAssessed = assessedTotal(s);
      const bal = balance(s);
      const studentPayments = getStudentPayments(s);

      const statusMap = {};

      // If student balance is zero or less, all fee items are fully settled!
      if (bal <= 0 && netAssessed > 0) {
        feeItems.forEach(item => {
          statusMap[item.name.toLowerCase().trim()] = {
            settled: true,
            paidAmount: Number(item.amount || 0),
            remainingAmount: 0
          };
        });
        return statusMap;
      }

      // Collect explicitly paid items from payment records (itemized transactions)
      const explicitItemPaid = {};
      let totalExplicitPaid = 0;
      (studentPayments || []).forEach(p => {
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

      // General payment pool (payments not linked to specific item breakdown)
      let generalPaidPool = Math.max(0, totalPaid - totalExplicitPaid);

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

    function renderFeeChecklist() {
      const s = currentStudent();
      const items = (s.customFees && Array.isArray(s.customFees) && s.customFees.length > 0)
        ? s.customFees
        : getFeeItemsForStudent(s);
      const checklist = document.getElementById('feeItemsChecklist');
      if (!checklist) return;

      const settledMap = getSettledFeeStatusMap(s);
      const unsettledCount = items.filter(item => {
        const info = settledMap[item.name.toLowerCase().trim()];
        return !info || !info.settled;
      }).length;

      if (unsettledCount === 0) {
        checklist.innerHTML = `
          <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
            <span class="material-symbols-rounded text-2xl text-emerald-600">verified</span>
            <p class="font-extrabold text-xs text-emerald-900">All Assessed Fees Settled</p>
            <p class="text-[11px] text-emerald-700">All specific fee items have been paid in full.</p>
          </div>
        `;
        document.getElementById('itemizedSelectedTotal').textContent = '₱0';
        document.getElementById('payAmountInput').value = 0;
        return;
      }

      checklist.innerHTML = items.map((item, idx) => {
        const key = item.name.toLowerCase().trim();
        const info = settledMap[key] || { settled: false, paidAmount: 0 };
        const isSettled = info.settled;

        if (isSettled) {
          return `
            <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/80 cursor-not-allowed select-none opacity-75">
              <div class="flex items-center gap-3">
                <input type="checkbox" disabled class="fee-item-cb w-4 h-4 rounded text-slate-300 accent-slate-400 cursor-not-allowed opacity-50" value="${item.amount}" data-name="${item.name}">
                <div class="flex flex-col">
                  <span class="text-xs font-extrabold text-slate-500">${item.name}</span>
                  <span class="text-[11px] font-semibold text-emerald-700 flex items-center gap-0.5">
                    <span class="material-symbols-rounded text-[13px]">check_circle</span> Already Settled / Paid
                  </span>
                </div>
              </div>
              <div class="text-right">
                <span class="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Settled (${money(item.amount)})
                </span>
              </div>
            </div>
          `;
        }

        return `
          <label class="flex items-center justify-between p-3 rounded-xl border border-academy-border bg-white hover:bg-academy-soft cursor-pointer transition">
            <div class="flex items-center gap-3">
              <input type="checkbox" class="fee-item-cb w-4 h-4 rounded text-academy-navy accent-academy-navy focus:ring-0 cursor-pointer" value="${item.amount}" data-name="${item.name}" onchange="recalculateItemizedTotal()">
              <div class="flex flex-col">
                <span class="text-xs font-extrabold text-academy-navy">${item.name}</span>
                <span class="text-[10px] text-amber-700 font-semibold">Pending Payment</span>
              </div>
            </div>
            <span class="text-xs font-extrabold text-slate-800">${money(item.amount)}</span>
          </label>
        `;
      }).join('');

      recalculateItemizedTotal();
    }

    function recalculateItemizedTotal() {
      const cbs = document.querySelectorAll('.fee-item-cb:checked:not(:disabled)');
      let total = 0;
      cbs.forEach(cb => { total += Number(cb.value || 0) });
      
      const totEl = document.getElementById('itemizedSelectedTotal');
      if (totEl) totEl.textContent = money(total);
      const inputEl = document.getElementById('payAmountInput');
      if (inputEl) inputEl.value = total;
    }

    function selectAllFeeItems(select = true) {
      document.querySelectorAll('.fee-item-cb:not(:disabled)').forEach(cb => { cb.checked = select });
      recalculateItemizedTotal();
    }

    function applyPayPreset(preset) {
      const s = currentStudent();
      const bal = balance(s);
      let amt = bal;
      if (preset === 'half') amt = Math.round(bal / 2);
      else if (typeof preset === 'number') amt = Math.min(bal, preset);
      
      document.getElementById('payAmountInput').value = amt;
    }

    function startPayMongoCheckout() {
      const s = currentStudent();
      const bal = balance(s);
      if (bal <= 0) {
        showToast('No Outstanding Balance', 'You have no outstanding balance due!', 'info');
        return;
      }
      setPaymentMode('custom');
      document.getElementById('payAmountInput').value = bal;
      document.getElementById('payAmountHint').textContent = `Current outstanding balance: ${money(bal)}`;
      document.getElementById('paymentModal').classList.remove('hidden');
    }

    function closePaymentModal() {
      document.getElementById('paymentModal').classList.add('hidden');
    }

    function switchPayChannel(channel) {
      document.querySelectorAll('.pay-tab').forEach(b => {
        b.className = 'pay-tab p-3 rounded-2xl border-2 border-slate-200 bg-slate-50 text-slate-700 font-extrabold text-xs flex flex-col items-center gap-1 hover:bg-slate-100 transition';
      });
      document.querySelectorAll('.pay-view').forEach(v => v.classList.add('hidden'));

      if (channel === 'paymongo') {
        document.getElementById('tabPaymongo').className = 'pay-tab p-3 rounded-2xl border-2 border-academy-blue bg-blue-50 text-academy-blue font-extrabold text-xs flex flex-col items-center gap-1 transition';
        document.getElementById('viewPaymongo').classList.remove('hidden');
      } else if (channel === 'gcash') {
        document.getElementById('tabGcash').className = 'pay-tab p-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-extrabold text-xs flex flex-col items-center gap-1 transition';
        document.getElementById('viewGcash').classList.remove('hidden');
      } else if (channel === 'maya') {
        document.getElementById('tabMaya').className = 'pay-tab p-3 rounded-2xl border-2 border-sky-500 bg-sky-50 text-sky-800 font-extrabold text-xs flex flex-col items-center gap-1 transition';
        document.getElementById('viewMaya').classList.remove('hidden');
      } else if (channel === 'instapay') {
        document.getElementById('tabInstapay').className = 'pay-tab p-3 rounded-2xl border-2 border-indigo-500 bg-indigo-50 text-indigo-800 font-extrabold text-xs flex flex-col items-center gap-1 transition';
        document.getElementById('viewInstapay').classList.remove('hidden');
      }
    }

    async function processDirectPayment(method) {
      const s = currentStudent();
      const amountInput = Number(document.getElementById('payAmountInput').value) || 0;
      if (amountInput <= 0) {
        showToast('Invalid Payment Amount', 'Please select at least one fee item or enter a valid payment amount greater than 0.', 'warning');
        return;
      }

      let refNo = '';
      if (method === 'GCash') {
        refNo = 'GC-' + Math.floor(1000000000 + Math.random() * 9000000000);
      } else if (method === 'Maya') {
        refNo = 'MY-' + Math.floor(1000000000 + Math.random() * 9000000000);
      } else {
        refNo = document.getElementById('instapayRef').value.trim() || ('IP-' + Math.floor(1000000000 + Math.random() * 9000000000));
      }

      // Collect fee item names if itemized mode was selected
      let feeBreakdown = [];
      if (currentPayMode === 'itemized') {
        const cbs = document.querySelectorAll('.fee-item-cb:checked:not(:disabled)');
        cbs.forEach(cb => feeBreakdown.push(cb.dataset.name));
      }

      const paymentObj = {
        id: 'PAY-' + Date.now(),
        studentId: s.id,
        studentName: s.name,
        amount: amountInput,
        method: method,
        referenceNo: refNo,
        status: 'Paid',
        feeBreakdown: feeBreakdown,
        paidAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        schoolYear: (appData.settings || {}).schoolYear || '2026-2027'
      };

      appData.payments = appData.payments || [];
      appData.payments.unshift(paymentObj);

      const idx = appData.students.findIndex(x => x.id === s.id);
      if (idx >= 0) {
        appData.students[idx].paid = Number(appData.students[idx].paid || 0) + amountInput;
      }

      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          await window.paApi.recordPayment({
            studentId: s.id,
            amount: amountInput,
            method: method,
            referenceNo: refNo
          });
        } catch (err) {
          console.warn('Supabase payment sync skipped:', err);
        }
      }

      saveData();
      renderAll();
      closePaymentModal();
      showReceiptModal(paymentObj);
    }

    function calculateStudentPaid(studentId, payments = [], student = null) {
      if (student && Number(student.paid || 0) > 0) return Number(student.paid || 0);
      return (payments || [])
        .filter(p => (p.studentId === studentId || p.student_id === studentId) && (String(p.status || '').toLowerCase() === 'paid' || !p.status))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    }

    function showReceiptModal(p) {
      const container = document.getElementById('receiptDetails');
      if (!container) return;
      const s = currentStudent() || (appData.students || []).find(x => x.id === p.studentId || x.dbId === p.studentDbId) || { name: p.studentName || 'Student', id: p.studentId || 'N/A' };
      const dateStr = p.paidAt ? new Date(p.paidAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : (p.date || 'Today');
      
      let feeItemsHtml = '';
      if (p.feeBreakdown && p.feeBreakdown.length > 0) {
        feeItemsHtml = `<div class="flex justify-between text-blue-900 font-bold mt-1"><span>Items Paid:</span><span class="text-right">${p.feeBreakdown.join(', ')}</span></div>`;
      }

      const totalNetAssessed = assessedTotal(s);
      const remainingBal = balance(s);

      container.innerHTML = `
        <div class="border-b border-slate-200 pb-2.5 mb-2.5 space-y-1">
          <div class="flex justify-between text-slate-500"><span>Student Name:</span><span class="font-extrabold text-slate-900 text-sm">${s.name || s.fullName || 'Student'}</span></div>
          <div class="flex justify-between text-slate-500"><span>Student Number:</span><span class="font-bold text-slate-800">${s.id || s.student_number || 'N/A'}</span></div>
          <div class="flex justify-between text-slate-500"><span>Grade & Section:</span><span class="font-semibold text-slate-700">${classLabel(s)}</span></div>
        </div>
        <div class="space-y-1.5">
          <div class="flex justify-between"><span>Reference / Receipt No:</span><span class="font-extrabold text-academy-navy">${p.referenceNo || p.id}</span></div>
          <div class="flex justify-between"><span>Payment Channel:</span><span class="font-bold text-emerald-700">${p.method}</span></div>
          ${feeItemsHtml}
          <div class="flex justify-between"><span>Transaction Date:</span><span>${dateStr}</span></div>
          <div class="flex justify-between"><span>School Year:</span><span>${p.schoolYear || (appData.settings || {}).schoolYear || '2026-2027'}</span></div>
        </div>
        <div class="border-t border-slate-200 pt-2.5 mt-2.5 space-y-1.5">
          <div class="flex justify-between text-xs"><span class="text-slate-600">Total Net Assessed Fees:</span><span class="font-bold text-slate-800">${money(totalNetAssessed)}</span></div>
          <div class="flex justify-between text-sm font-black text-slate-900"><span>Amount Paid Now:</span><span class="text-emerald-600">${money(p.amount)}</span></div>
          <div class="flex justify-between text-xs font-extrabold pt-1.5 border-t border-dashed border-slate-300"><span>Remaining Balance Due:</span><span class="text-red-600 text-sm">${money(remainingBal)}</span></div>
        </div>
      `;
      document.getElementById('receiptModal').classList.remove('hidden');
    }

    function printReceipt() {
      window.print();
    }

    function closeReceiptModal() {
      document.getElementById('receiptModal').classList.add('hidden');
    }

    async function triggerPayMongoLiveFromModal() {
      const s = currentStudent();
      const amountInput = Number(document.getElementById('payAmountInput').value) || balance(s);
      if (amountInput <= 0) {
        showToast('Invalid Amount', 'Please enter a valid payment amount greater than 0.', 'warning');
        return;
      }
      if (!window.paApi || !window.paApi.isSupabaseReady()) {
        showToast('Connection Notice', 'Database connection is initializing. Please try again.', 'warning');
        return;
      }

      let feeBreakdown = [];
      if (currentPayMode === 'itemized') {
        const cbs = document.querySelectorAll('.fee-item-cb:checked:not(:disabled)');
        cbs.forEach(cb => feeBreakdown.push(cb.dataset.name));
      }

      try {
        const currentOrigin = (typeof window !== 'undefined' && window.location.origin)
          ? `${window.location.origin}${window.location.pathname}`
          : (typeof window !== 'undefined' && window.location.href ? window.location.href.split('?')[0].split('#')[0] : 'student-dashboard.html');

        const successUrl = `${currentOrigin}?payment=success&amount=${encodeURIComponent(amountInput)}&studentId=${encodeURIComponent(s.id || s.dbId || '')}`;
        const cancelUrl = `${currentOrigin}?payment=failed&studentId=${encodeURIComponent(s.id || s.dbId || '')}`;

        const pendingData = {
          studentId: s.id || s.dbId,
          studentName: s.name,
          email: s.email,
          amount: amountInput,
          feeBreakdown: feeBreakdown,
          payMode: currentPayMode,
          time: Date.now()
        };

        sessionStorage.setItem('pa_pending_payment', JSON.stringify(pendingData));
        localStorage.setItem('pa_pending_payment', JSON.stringify(pendingData));

        await window.paApi.createCheckout({
          amount: Math.max(100, Math.round(amountInput * 100)),
          description: `Payment for ${s.name}`,
          studentId: s.id || s.dbId,
          studentName: s.name,
          studentEmail: s.email,
          email: s.email,
          success_url: successUrl,
          cancel_url: cancelUrl
        });
      } catch (err) {
        sessionStorage.removeItem('pa_pending_payment');
        localStorage.removeItem('pa_pending_payment');
        showToast('Checkout Failed', err.message || 'PayMongo Edge Function is not deployed yet.', 'error');
        document.getElementById('paymentModal').classList.remove('hidden');
      }
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
          const calcLocal = getStudentTotalPaid(local);
          const calcDb = getStudentTotalPaid(dbS);
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

    function mergeAccountsState(localAccounts = [], dbAccounts = []) {
      if (!dbAccounts || dbAccounts.length === 0) return localAccounts;
      if (!localAccounts || localAccounts.length === 0) return dbAccounts;

      const map = new Map();
      localAccounts.forEach(a => {
        const key = String(a.email || a.id || '').toLowerCase();
        if (key) map.set(key, { ...a });
      });

      dbAccounts.forEach(dbA => {
        const key = String(dbA.email || dbA.id || '').toLowerCase();
        if (key) {
          const local = map.get(key);
          map.set(key, { ...(local || {}), ...dbA });
        }
      });

      return Array.from(map.values());
    }

    function mergeClearanceRequestsState(localReqs = [], dbReqs = []) {
      if (!dbReqs || dbReqs.length === 0) return localReqs;
      if (!localReqs || localReqs.length === 0) return dbReqs;

      const map = new Map();
      localReqs.forEach(r => {
        const key = String(r.id || r.key || '').toLowerCase();
        if (key) map.set(key, { ...r });
      });

      dbReqs.forEach(dbR => {
        const key = String(dbR.id || dbR.key || '').toLowerCase();
        if (key) {
          const local = map.get(key);
          map.set(key, { ...dbR, ...(local || {}) });
        }
      });

      return Array.from(map.values());
    }

    async function initStudentDashboard() {
      const urlParams = new URLSearchParams(window.location.search);
      const isPaymentReturn = Boolean(urlParams.get('payment') || urlParams.get('checkout_session_id') || urlParams.get('session_id'));

      const sess = currentSession();
      if (!isPaymentReturn && isStaffOrAdminSession(sess)) {
        const dest = (window.paApi && window.paApi.dashboardForRole) 
          ? window.paApi.dashboardForRole(sess.role) 
          : (['teacher_clearance_head', 'guidance_head', 'prefect_head', 'librarian_head', 'principal'].includes(sess.role) ? 'clearance-dashboard.html' : 'admin-dashboard.html');
        window.location.href = dest;
        return;
      }

      if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
        try {
          await hydrateCurrentStudentFromSupabase();
          const state = await window.paApi.fetchDatabaseState();
          if (state) {
            const localFeeJHS = appData.feeStructures?.JHS || [];
            const localFeeSHS = appData.feeStructures?.SHS || [];
            const dbFeeJHS = state.feeStructures?.JHS || [];
            const dbFeeSHS = state.feeStructures?.SHS || [];

            const activeVouchers = (state.vouchers && state.vouchers.length > 0) ? state.vouchers : appData.vouchers;
            let activeInstallments = (state.installmentTemplate && state.installmentTemplate.length > 0) ? state.installmentTemplate : (appData.installmentTemplate || []);
            if (!activeInstallments || activeInstallments.length === 0) {
              try {
                const cached = localStorage.getItem('pa_installment_templates');
                if (cached) {
                  const parsed = JSON.parse(cached);
                  if (Array.isArray(parsed) && parsed.length > 0) activeInstallments = parsed;
                }
              } catch {}
            }
            if (!activeInstallments || activeInstallments.length === 0) {
              activeInstallments = [...DEFAULT_INSTALLMENT_TEMPLATE];
            }
            if (activeInstallments && activeInstallments.length > 0) {
              localStorage.setItem('pa_installment_templates', JSON.stringify(activeInstallments));
            }

            const mergedStudents = mergeStudentsState(appData.students || [], state.students || []);
            const mergedAccounts = mergeAccountsState(appData.accounts || [], state.accounts || []);
            const mergedRequests = mergeClearanceRequestsState(appData.teacherClearanceRequests || [], state.teacherClearanceRequests || []);

            appData = {
              ...appData,
              ...state,
              students: mergedStudents,
              accounts: mergedAccounts,
              teacherClearanceRequests: mergedRequests,
              payments: state.payments || [],
              feeStructures: {
                JHS: dbFeeJHS.length ? dbFeeJHS : localFeeJHS,
                SHS: dbFeeSHS.length ? dbFeeSHS : localFeeSHS
              },
              vouchers: activeVouchers,
              installmentTemplate: activeInstallments
            };
          }
        } catch (err) {
          console.warn("Could not load dynamic state from Supabase, using local defaults:", err);
        }
      }

      // Handle return from PayMongo checkout portal
      const paymentParam = (urlParams.get('payment') || '').toLowerCase();
      const checkoutSessionId = urlParams.get('checkout_session_id') || urlParams.get('session_id');

      if (paymentParam === 'success' || paymentParam === 'paid' || checkoutSessionId) {
        let s = currentStudent();
        const targetStudentId = urlParams.get('studentId') || urlParams.get('student_id');
        if (targetStudentId && appData.students && appData.students.length > 0) {
          const matched = appData.students.find(x => x.id === targetStudentId || x.dbId === targetStudentId || x.studentId === targetStudentId);
          if (matched) s = matched;
        }

        let pending = null;
        try {
          const rawPending = sessionStorage.getItem('pa_pending_payment') || localStorage.getItem('pa_pending_payment');
          if (rawPending) pending = JSON.parse(rawPending);
        } catch (e) {}

        sessionStorage.removeItem('pa_pending_payment');
        localStorage.removeItem('pa_pending_payment');

        const urlAmt = Number(urlParams.get('amount') || 0);
        let paidAmt = (pending && Number(pending.amount) > 0) ? Number(pending.amount) : (urlAmt > 0 ? urlAmt : 0);

        if (!s && appData.students && appData.students.length > 0) {
          s = appData.students[0];
        }

        if (paidAmt <= 0 && s) {
          const rem = balance(s);
          paidAmt = rem > 0 ? rem : 1000;
        }

        if (paidAmt > 0 && s) {
          localStorage.removeItem('pa_transactions_cleared');
          const feeBreakdown = pending?.feeBreakdown || [];
          const refNo = checkoutSessionId ? `PM-${checkoutSessionId.slice(-10).toUpperCase()}` : ('PM-' + Math.floor(1000000000 + Math.random() * 9000000000));

          const paymentObj = {
            id: 'PAY-' + Date.now(),
            studentId: s.id,
            studentDbId: s.dbId,
            studentName: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
            amount: paidAmt,
            method: 'QR Ph (PayMongo)',
            referenceNo: refNo,
            status: 'Paid',
            feeBreakdown: feeBreakdown,
            paidAt: new Date().toISOString(),
            date: new Date().toISOString().slice(0, 10),
            schoolYear: (appData.settings || {}).schoolYear || '2026-2027'
          };

          appData.payments = appData.payments || [];
          const existingIdx = appData.payments.findIndex(p => p.referenceNo === refNo || p.id === refNo);
          if (existingIdx < 0) {
            appData.payments.unshift(paymentObj);
          }

          const idx = appData.students.findIndex(x => x.id === s.id || x.dbId === s.dbId);
          if (idx >= 0) {
            appData.students[idx].paid = Number(appData.students[idx].paid || 0) + paidAmt;
          }

          if (window.paApi && window.paApi.isSupabaseReady && window.paApi.isSupabaseReady()) {
            try {
              await window.paApi.recordPayment({
                studentId: s.id || s.dbId,
                studentNumber: s.studentNumber || s.student_number || s.id,
                email: s.email,
                authUserId: s.authUserId || s.auth_user_id,
                amount: paidAmt,
                method: 'QR Ph (PayMongo)',
                referenceNo: refNo
              });
            } catch (err) {
              console.warn('Direct payment sync skipped:', err);
            }
          }
          saveData();
          renderAll();
          showReceiptModal(paymentObj);
          showToast('Payment Successful!', `PHP ${paidAmt.toLocaleString()} payment recorded. Official receipt generated below.`, 'success');
        }

        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (paymentParam === 'failed' || paymentParam === 'declined' || paymentParam === 'cancelled') {
        sessionStorage.removeItem('pa_pending_payment');
        localStorage.removeItem('pa_pending_payment');
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('Payment Declined / Cancelled', 'The PayMongo payment session was cancelled or declined. No charges were made and your balance remains unchanged.', 'warning');
      }

      renderAll();
      autoTriggerStudentWalkthrough();
    }

    /* STUDENT DASHBOARD WALKTHROUGH CONTROLLER */
    const walkthroughSteps = [
      {
        step: 1,
        title: "Welcome to your Student Portal!",
        subtitle: "Quick overview of your dashboard features.",
        icon: "dashboard",
        highlightTitle: "Dashboard Overview",
        highlightText: "View total net fees, voucher discounts, payments made, and clearance status.",
        description: "Welcome to Pagbilao Academy Inc.! Your dashboard homepage gives you real-time visibility into your enrolled level, overall net tuition balance, active voucher discounts, and clearance progress.",
        tip: "You can click on the stat cards or sidebar menu items to jump directly to specific details."
      },
      {
        step: 2,
        title: "Fee Assessment & Vouchers",
        subtitle: "Transparent tuition & fee calculation formula.",
        icon: "receipt_long",
        highlightTitle: "Gross Fees vs. Voucher Discount",
        highlightText: "Net Amount Due = Gross Fees - Voucher Discount",
        description: "In the Fee Breakdown tab, inspect itemized tuition, computer, and laboratory fees. Eligible students automatically receive ESC Vouchers (JHS) or SHS Vouchers (SHS), reducing gross fees down to the Net Amount Due.",
        tip: "Partial payments apply directly to your net amount due, not your gross fee assessment."
      },
      {
        step: 3,
        title: "Reminders & Due Date Alerts",
        subtitle: "Smart payment due date & clearance tracking.",
        icon: "notifications_active",
        highlightTitle: "Real-time Reminders Center",
        highlightText: "Instant alerts for payment due dates & clearance progress.",
        description: "Stay informed with real-time notifications for upcoming installment due dates, remaining balances, pending teacher sign-offs, and office clearance updates right on your header bell and dashboard.",
        tip: "Click the Notification Bell in the header anytime to view active reminders!"
      },
      {
        step: 4,
        title: "Clearance Approvals Workflow",
        subtitle: "Sequential clearance tracking for graduation & certificates.",
        icon: "fact_check",
        highlightTitle: "Subject Teachers & Department Offices",
        highlightText: "Request clearance from assigned subject teachers & office heads.",
        description: "Submit digital clearance requests to your assigned subject teachers. Office sign-offs proceed sequentially: Subject Teachers → Guidance, Prefect & Librarian → Principal → Accounting & Registrar.",
        tip: "Use the 'Request All Teachers' button on the Clearance tab to submit approval requests in bulk!"
      },
      {
        step: 5,
        title: "Online Payments & Certificates",
        subtitle: "PayMongo QR Ph integration & PDF certificate downloads.",
        icon: "workspace_premium",
        highlightTitle: "Pay Online & Print Certificate",
        highlightText: "Pay via GCash/Maya/Cards and view official Certificate when cleared.",
        description: "Click 'Pay Tuition' to settle fees instantly via PayMongo (QR Ph, GCash, Maya, cards). Once all department clearances are approved and your net balance is zero, your official Certificate of Clearance unlocks for PDF viewing and printing!",
        tip: "You can re-open this tour anytime by clicking the 'Portal Tour' button in the top menu bar."
      }
    ];

    let currentWalkthroughIndex = 0;

    function renderWalkthroughStep() {
      const stepData = walkthroughSteps[currentWalkthroughIndex];
      if (!stepData) return;

      document.getElementById("wtStepBadge").textContent = `Step ${stepData.step} of ${walkthroughSteps.length}`;
      document.getElementById("wtTitle").textContent = stepData.title;
      document.getElementById("wtSubtitle").textContent = stepData.subtitle;
      document.getElementById("wtIcon").textContent = stepData.icon;
      document.getElementById("wtHighlightTitle").textContent = stepData.highlightTitle;
      document.getElementById("wtHighlightText").textContent = stepData.highlightText;
      document.getElementById("wtDescription").textContent = stepData.description;
      document.getElementById("wtTipText").textContent = stepData.tip;

      const pct = ((currentWalkthroughIndex + 1) / walkthroughSteps.length) * 100;
      document.getElementById("wtProgressBar").style.width = `${pct}%`;

      const prevBtn = document.getElementById("wtPrevBtn");
      const nextBtn = document.getElementById("wtNextBtn");

      if (currentWalkthroughIndex === 0) {
        prevBtn.classList.add("hidden");
      } else {
        prevBtn.classList.remove("hidden");
      }

      if (currentWalkthroughIndex === walkthroughSteps.length - 1) {
        nextBtn.innerHTML = `<span>Finish</span><span class="material-symbols-rounded text-[18px]">check_circle</span>`;
        nextBtn.className = "px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-md hover:bg-emerald-700 transition flex items-center gap-1";
      } else {
        nextBtn.innerHTML = `<span>Next</span><span class="material-symbols-rounded text-[18px]">chevron_right</span>`;
        nextBtn.className = "px-6 py-2.5 rounded-xl bg-academy-navy text-white font-extrabold text-xs shadow-md hover:bg-blue-900 transition flex items-center gap-1";
      }
    }

    function startStudentWalkthrough() {
      currentWalkthroughIndex = 0;
      renderWalkthroughStep();
      const modal = document.getElementById("walkthroughModal");
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }

    function nextWalkthroughStep() {
      if (currentWalkthroughIndex < walkthroughSteps.length - 1) {
        currentWalkthroughIndex++;
        renderWalkthroughStep();
      } else {
        finishWalkthrough();
      }
    }

    function prevWalkthroughStep() {
      if (currentWalkthroughIndex > 0) {
        currentWalkthroughIndex--;
        renderWalkthroughStep();
      }
    }

    function skipWalkthrough() {
      finishWalkthrough();
    }

    function finishWalkthrough() {
      localStorage.setItem("pa_student_walkthrough_completed", "true");
      const modal = document.getElementById("walkthroughModal");
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }

    function autoTriggerStudentWalkthrough() {
      const isCompleted = localStorage.getItem("pa_student_walkthrough_completed");
      if (!isCompleted) {
        setTimeout(() => {
          startStudentWalkthrough();
        }, 600);
      }
    }

    initStudentDashboard();
  