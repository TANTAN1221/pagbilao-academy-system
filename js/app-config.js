/*
  Pagbilao Academy Inc. System Configuration
  ------------------------------------------
  Replace the placeholders below after creating your Supabase project.
  Keep secret keys in Supabase Edge Function secrets only. Never put PayMongo secret keys here.
*/
(function () {
  const config = {
    SUPABASE_URL: "https://wsbmowporxjagetqxtec.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzYm1vd3BvcnhqYWdldHF4dGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDYwOTQsImV4cCI6MjA5ODUyMjA5NH0._Ekxyset3TgM8O6LS30PZO1AD-wfMzT53AuerytCT9M",
    FUNCTIONS_BASE_URL: "https://wsbmowporxjagetqxtec.supabase.co/functions/v1"
  };

  const ADMIN_ROLES = ["accounting_admin", "registrar", "super_admin"];
  const CLEARANCE_ROLES = [
    "teacher_clearance_head",
    "guidance_head",
    "prefect_head",
    "librarian_head",
    "principal"
  ];
  const STUDENT_ROLES = ["student", "parent", "student_parent"];

  let _supabaseClientInstance = null;

  // Unregister any stale Service Worker to prevent Cache API POST errors
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
  }

  function isSupabaseReady() {
    return Boolean(
      window.supabase &&
      config.SUPABASE_URL.includes("supabase.co") &&
      !config.SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
      !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")
    );
  }

  function client() {
    if (!isSupabaseReady()) return null;
    if (!_supabaseClientInstance) {
      _supabaseClientInstance = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    }
    return _supabaseClientInstance;
  }

  function normalizeRole(role) {
    const rawRole = String(role || "").trim().toLowerCase();
    if (rawRole === "student_parent") return "student";
    if (rawRole === "admin" || rawRole === "accountant") return "accounting_admin";
    if (rawRole === "clearance_head") return "teacher_clearance_head";
    return rawRole || "student";
  }

  function dashboardForRole(role) {
    const normalizedRole = normalizeRole(role);
    if (ADMIN_ROLES.includes(normalizedRole)) return "admin-dashboard.html";
    if (CLEARANCE_ROLES.includes(normalizedRole)) return "clearance-dashboard.html";
    if (STUDENT_ROLES.includes(normalizedRole)) return "student-dashboard.html";
    return "student-dashboard.html";
  }

  function sanitizeSession(session) {
    if (!session || typeof session !== "object") return session;
    const clean = { ...session };
    delete clean.password;
    delete clean.tempPassword;
    delete clean.temporary_password;
    return clean;
  }

  function saveSession(session) {
    const cleanSession = sanitizeSession(session);
    localStorage.setItem("pa_user_session", JSON.stringify(cleanSession));
    localStorage.setItem("pa_current_user", JSON.stringify(cleanSession));
    localStorage.setItem("pa_user_role", cleanSession.role || "student");
  }

  function findLocalRegisteredStudent(email) {
    const registeredUsers = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
    return registeredUsers.find((user) => String(user.email || "").toLowerCase() === String(email || "").toLowerCase());
  }

  function inferPrototypeRole(email) {
    const lowerEmail = String(email || "").toLowerCase();

    if (findLocalRegisteredStudent(lowerEmail)) return "student";

    if (
      lowerEmail.includes("admin") ||
      lowerEmail.includes("accounting") ||
      lowerEmail.includes("accountant") ||
      lowerEmail.includes("registrar")
    ) {
      return "accounting_admin";
    }

    if (
      lowerEmail.includes("teacher") ||
      lowerEmail.includes("guidance") ||
      lowerEmail.includes("prefect") ||
      lowerEmail.includes("library") ||
      lowerEmail.includes("librarian") ||
      lowerEmail.includes("principal") ||
      lowerEmail.includes("clearance")
    ) {
      return "teacher_clearance_head";
    }

    return "student";
  }

  async function login(email, password) {
    const supabaseClient = client();

    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        const users = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
        let found = users.find(u => String(u.email || "").toLowerCase() === String(email || "").toLowerCase() && (u.password === password || u.tempPassword === password || !u.password));
        
        if (!found) {
          try {
            const rawAdmin = localStorage.getItem("pa_full_admin_v2");
            const adminData = rawAdmin ? JSON.parse(rawAdmin) : null;
            if (adminData && Array.isArray(adminData.accounts)) {
              const acc = adminData.accounts.find(a => String(a.email || "").toLowerCase() === String(email || "").toLowerCase() && a.active !== false);
              if (acc) {
                const passMatch = acc.tempPassword ? acc.tempPassword === password : acc.password === password;
                if (!passMatch) {
                  throw new Error("Invalid email or password.");
                }
                found = {
                  id: acc.id,
                  email: acc.email,
                  fullName: acc.name,
                  name: acc.name,
                  role: acc.role,
                  assignments: acc.assignments
                };
              }
            }
          } catch (e) {
            if (e.message === "Invalid email or password.") throw e;
          }
        }

        if (found) {
          const session = {
            id: found.id || found.studentId || "USER-" + Date.now(),
            email: found.email,
            fullName: `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.name || found.fullName || email,
            role: normalizeRole(found.role || (email.includes("admin") ? "accounting_admin" : "student")),
            status: "active",
            ...found,
            loginTime: new Date().toISOString(),
            source: "local"
          };
          saveSession(session);
          return { ...session, dashboard: dashboardForRole(session.role) };
        }
        throw new Error(error.message === "Invalid login credentials" ? "Invalid email or password. Please check your credentials or register a new student account." : error.message);
      }

      const authUser = data.user;
      let role = normalizeRole(authUser?.user_metadata?.role);
      let fullName = authUser?.user_metadata?.full_name || email;
      let status = "active";

      try {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("role,status,full_name,email")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (profile) {
          role = normalizeRole(profile.role);
          fullName = profile.full_name || fullName;
          status = profile.status || status;
        }
      } catch (profileError) {
        console.warn("Profile role lookup skipped:", profileError);
      }

      // Student self-registration may only create a student_registration_requests row at first.
      // Load the exact student attached to the signed-in Auth user so the student dashboard
      // does not fall back to the first demo student.
      let studentInfo = {};
      try {
        const { data: studentRow } = await supabaseClient
          .from("students")
          .select("student_number,first_name,last_name,email,education_level,grade_level,section_name,strand,school_year,status")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (studentRow) {
          role = "student";
          status = studentRow.status || status;
          fullName = `${studentRow.first_name || ""} ${studentRow.last_name || ""}`.trim() || fullName;
          studentInfo = {
            studentId: studentRow.student_number,
            firstName: studentRow.first_name,
            lastName: studentRow.last_name,
            educationLevel: studentRow.education_level,
            gradeLevel: studentRow.grade_level,
            section: studentRow.section_name,
            strand: studentRow.strand || "N/A",
            schoolYear: studentRow.school_year,
            studentStatus: studentRow.status || "active"
          };
        }
      } catch (studentRowError) {
        console.warn("Student profile lookup skipped:", studentRowError);
      }

      if (!studentInfo.studentId) {
        try {
          const { data: studentRequest } = await supabaseClient
            .from("student_registration_requests")
            .select("status,first_name,last_name,student_number,education_level,grade_level,section_name,strand,email")
            .eq("auth_user_id", authUser.id)
            .maybeSingle();

          if (studentRequest) {
            role = "student";
            status = studentRequest.status || status;
            fullName = `${studentRequest.first_name || ""} ${studentRequest.last_name || ""}`.trim() || fullName;
            studentInfo = {
              studentId: studentRequest.student_number,
              firstName: studentRequest.first_name,
              lastName: studentRequest.last_name,
              educationLevel: studentRequest.education_level,
              gradeLevel: studentRequest.grade_level,
              section: studentRequest.section_name,
              strand: studentRequest.strand || "N/A",
              studentStatus: studentRequest.status || "pending_verification"
            };
          }
        } catch (studentError) {
          console.warn("Student registration role lookup skipped:", studentError);
        }
      }

      const session = {
        id: authUser.id,
        email,
        fullName,
        role: normalizeRole(role),
        status,
        ...studentInfo,
        loginTime: new Date().toISOString(),
        source: "supabase"
      };

      saveSession(session);
      return { ...session, dashboard: dashboardForRole(session.role) };
    }

    throw new Error("Supabase is not configured yet. Open js/app-config.js and replace SUPABASE_URL and SUPABASE_ANON_KEY first.");
  }

  async function registerStudent(profile) {
    const supabaseClient = client();
    if (!supabaseClient) throw new Error("Supabase is not configured yet.");

    const { data, error } = await supabaseClient.auth.signUp({
      email: profile.email,
      password: profile.password,
      options: { data: { full_name: `${profile.firstName} ${profile.lastName}`, role: "student" } }
    });
    if (error) throw error;

    if (data.user) {
      await supabaseClient.from("profiles").upsert({
        auth_user_id: data.user.id,
        full_name: `${profile.firstName} ${profile.lastName}`,
        email: profile.email,
        role: "student",
        status: "active"
      }, { onConflict: "email" });

      const { error: profileError } = await supabaseClient.from("student_registration_requests").insert({
        auth_user_id: data.user.id,
        first_name: profile.firstName,
        last_name: profile.lastName,
        student_number: profile.studentId,
        education_level: profile.educationLevel,
        grade_level: profile.gradeLevel,
        section_name: profile.section,
        strand: profile.strand,
        email: profile.email,
        status: "pending_verification"
      });
      if (profileError) throw profileError;
    }
    return data;
  }

  async function invokeFunction(functionName, payload) {
    const supabaseClient = client();
    if (!supabaseClient) throw new Error("Supabase is not configured yet.");
    const { data, error } = await supabaseClient.functions.invoke(functionName, { body: payload });
    if (error) throw error;
    return data;
  }

  async function createCheckout(payload) {
    try {
      if (!payload.success_url && !payload.successUrl && typeof window !== "undefined") {
        payload.success_url = window.location.origin + window.location.pathname + "?payment=success";
      }
      if (!payload.cancel_url && !payload.cancelUrl && typeof window !== "undefined") {
        payload.cancel_url = window.location.origin + window.location.pathname + "?payment=failed";
      }
      const data = await invokeFunction("create-paymongo-checkout", payload);
      if (data && data.checkout_url) {
        window.location.href = data.checkout_url;
        return data;
      }
      if (data && data.error) {
        throw new Error(data.error);
      }
      return data;
    } catch (err) {
      console.warn("PayMongo Edge Function invoke failed:", err);
      const msg = err.message || (typeof err === "string" ? err : "Failed to connect to PayMongo Edge Function.");
      throw new Error(msg);
    }
  }

  async function createSchoolAccount(payload) {
    const supabaseClient = client();
    if (supabaseClient) {
      try {
        const result = await invokeFunction("create-school-account", payload);
        if (result && !result.error && !result.message?.includes("Failed to fetch")) return result;
      } catch (edgeError) {
        console.warn("Edge function create-school-account not available, using client auth signUp fallback:", edgeError);
      }

      // Direct Supabase Auth & DB profile creation fallback
      try {
        const tempPassword = payload.temporary_password || payload.tempPassword || "password123";
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
          email: payload.email,
          password: tempPassword,
          options: {
            data: {
              full_name: payload.full_name || payload.name,
              role: payload.role
            }
          }
        });

        if (authError && !authError.message.includes("User already registered")) {
          console.warn("Supabase auth.signUp notice:", authError.message);
        }

        const userId = authData?.user?.id;
        if (userId) {
          await supabaseClient.from("profiles").upsert({
            auth_user_id: userId,
            full_name: payload.full_name || payload.name,
            email: payload.email,
            role: payload.role,
            status: "active"
          }, { onConflict: "email" });
        }

        return { success: true, temporary_password: tempPassword, user: authData?.user };
      } catch (err) {
        console.warn("Supabase client auth signUp fallback warning:", err);
      }
    }
    return { success: true, message: "Created locally" };
  }

  async function logout(redirectTo = "index.html") {
    try {
      const supabaseClient = client();
      if (supabaseClient) await supabaseClient.auth.signOut();
    } catch (error) {
      console.warn("Supabase logout skipped:", error);
    }

    // Clear login/session flags. This does not delete real Supabase records.
    [
      "pa_current_user",
      "pa_logged_in_user",
      "pa_user_role",
      "pa_user_session",
      "pa_demo_session",
      "pa_auth_role"
    ].forEach((key) => localStorage.removeItem(key));

    location.href = redirectTo;
  }

  async function fetchDatabaseState() {
    const supabase = client();
    if (!supabase) return null;

    try {
      const [
        { data: feeStrs },
        { data: feeItems },
        { data: voucherTypes },
        { data: instTemplates },
        { data: profilesList },
        { data: staffList },
        { data: assignmentsList },
        { data: studentsList },
        { data: stdVouchers },
        { data: dbPayments },
        { data: clRequests },
        { data: clApprovals },
        { data: certRequests },
        { data: deptsList }
      ] = await Promise.all([
        supabase.from("fee_structures").select("*"),
        supabase.from("fee_structure_items").select("*"),
        supabase.from("voucher_types").select("*"),
        supabase.from("installment_templates").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("staff_accounts").select("*"),
        supabase.from("teacher_assignments").select("*"),
        supabase.from("students").select("*"),
        supabase.from("student_vouchers").select("*, voucher_types(voucher_name)"),
        supabase.from("payments").select("*"),
        supabase.from("clearance_requests").select("*"),
        supabase.from("clearance_approvals").select("*"),
        supabase.from("clearance_certificate_requests").select("*"),
        supabase.from("departments").select("*")
      ]);

      const DEFAULT_FEE_STRUCTURES = {
        JHS: [
          { id: "jhs-tui", name: "Tuition Fee", amount: 15000, required: true },
          { id: "jhs-misc", name: "Miscellaneous & Registration Fees", amount: 4000, required: true },
          { id: "jhs-lab", name: "Laboratory & Computer Fees", amount: 1500, required: true },
          { id: "jhs-dev", name: "Development & Energy Fees", amount: 1500, required: true }
        ],
        SHS: [
          { id: "shs-tui", name: "Tuition Fee", amount: 18000, required: true },
          { id: "shs-misc", name: "Miscellaneous & Registration Fees", amount: 4500, required: true },
          { id: "shs-lab", name: "Laboratory & Specialized Track Fees", amount: 2500, required: true },
          { id: "shs-dev", name: "Development & Energy Fees", amount: 2000, required: true }
        ]
      };

      const DEFAULT_VOUCHERS = [
        { id: "vouch-esc", name: "ESC Voucher (JHS)", appliesTo: "JHS", amount: 9000, active: true },
        { id: "vouch-shs-priv", name: "SHS Voucher (Private)", appliesTo: "SHS", amount: 14000, active: true },
        { id: "vouch-shs-pub", name: "SHS Voucher (Public)", appliesTo: "SHS", amount: 17500, active: true },
        { id: "vouch-honor", name: "Academic Honors Discount", appliesTo: "ALL", amount: 5000, active: true }
      ];

      const DEFAULT_INSTALLMENT_TEMPLATE = [
        { id: "inst-1", title: "Enrollment / 1st Quarter", percent: 25, dueDate: "2026-08-15" },
        { id: "inst-2", title: "2nd Quarter Installment", percent: 25, dueDate: "2026-11-15" },
        { id: "inst-3", title: "3rd Quarter Installment", percent: 25, dueDate: "2027-01-15" },
        { id: "inst-4", title: "4th Quarter / Final Clearance", percent: 25, dueDate: "2027-03-15" }
      ];

      const state = {
        settings: { schoolName: "Pagbilao Academy Inc.", schoolYear: "2026-2027" },
        feeStructures: { JHS: [], SHS: [] },
        vouchers: [],
        installmentTemplate: [],
        students: [],
        accounts: [],
        payments: [],
        certificateRequests: [],
        teacherClearanceRequests: []
      };

      // 1. Fee Structures
      if (feeStrs && feeStrs.length > 0) {
        feeStrs.forEach(fs => {
          const items = (feeItems || [])
            .filter(fi => fi.fee_structure_id === fs.id)
            .map(fi => ({
              id: fi.id,
              name: fi.fee_name,
              amount: Number(fi.amount),
              required: fi.required
            }));
          state.feeStructures[fs.education_level] = items;
        });
      }

      if (!state.feeStructures.JHS || state.feeStructures.JHS.length === 0) {
        state.feeStructures.JHS = DEFAULT_FEE_STRUCTURES.JHS;
      }
      if (!state.feeStructures.SHS || state.feeStructures.SHS.length === 0) {
        state.feeStructures.SHS = DEFAULT_FEE_STRUCTURES.SHS;
      }

      // 2. Vouchers
      if (voucherTypes && voucherTypes.length > 0) {
        state.vouchers = voucherTypes.map(v => ({
          id: v.id,
          name: v.voucher_name,
          appliesTo: v.applies_to,
          amount: Number(v.amount),
          active: v.active
        }));
      }

      if (!state.vouchers || state.vouchers.length === 0) {
        state.vouchers = DEFAULT_VOUCHERS;
      }

      // 3. Installment Templates
      if (instTemplates && instTemplates.length > 0) {
        state.installmentTemplate = instTemplates
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(i => ({
            id: i.id,
            title: i.title,
            percent: Number(i.percent_of_net),
            dueDate: i.due_date
          }));
      }

      if (!state.installmentTemplate || state.installmentTemplate.length === 0) {
        state.installmentTemplate = DEFAULT_INSTALLMENT_TEMPLATE;
      }

      // 4. Accounts
      if (profilesList) {
        state.accounts = profilesList
          .filter(p => p.role !== "student")
          .map(p => {
            const staff = (staffList || []).find(s => s.profile_id === p.id);
            const teacherAssignments = (assignmentsList || []).filter(ta => ta.teacher_profile_id === p.id);
            return {
              id: p.id,
              name: p.full_name,
              email: p.email,
              role: p.role,
              department: staff?.department || "Admin",
              active: p.status === "active",
              assignments: teacherAssignments.map(ta => ({
                grade: ta.grade_level,
                section: ta.section_name,
                strand: ta.strand || "N/A",
                subject: ta.subject_name
              }))
            };
          });
      }

      // Helper map for department IDs to Names
      const deptMap = {};
      if (deptsList) {
        deptsList.forEach(d => {
          deptMap[d.id] = d.name;
        });
      }

      // 5. Students
      if (studentsList) {
        state.students = studentsList.map(s => {
          // Voucher
          const sv = (stdVouchers || []).find(v => v.student_id === s.id);
          const voucherName = sv?.voucher_types?.voucher_name || "None";

          // Paid payments
          const studentPaid = (dbPayments || [])
            .filter(p => {
              if (!p) return false;
              const isPaid = ["paid", "succeeded", "completed"].includes(String(p.status || "paid").toLowerCase());
              if (!isPaid) return false;
              const pId = String(p.student_id || p.studentId || "").toLowerCase();
              const pCleanId = pId.replace(/^stu-/, "").trim();
              const pEmail = String(p.email || p.studentEmail || "").toLowerCase().trim();

              const sId = String(s.id || "").toLowerCase();
              const sNum = String(s.student_number || "").toLowerCase();
              const sCleanNum = sNum.replace(/^stu-/, "").trim();
              const sAuth = String(s.auth_user_id || "").toLowerCase();
              const sEmail = String(s.email || "").toLowerCase().trim();

              return (
                (sId && pId === sId) ||
                (sNum && pId === sNum) ||
                (sCleanNum && pCleanId === sCleanNum) ||
                (sAuth && pId === sAuth) ||
                (sEmail && pEmail && pEmail === sEmail)
              );
            })
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);

          // Clearance request
          const req = (clRequests || []).find(cr => cr.student_id === s.id);
          const studentClearance = {
            Teacher: "pending",
            Guidance: "pending",
            Prefect: "pending",
            Library: "pending",
            Principal: "pending",
            Accounting: "pending",
            Registrar: "pending"
          };

          if (req) {
            const approvals = (clApprovals || []).filter(ca => ca.clearance_request_id === req.id);
            
            // Office approvals
            approvals.forEach(ca => {
              const deptName = deptMap[ca.department_id];
              if (deptName && deptName !== "Teacher") {
                studentClearance[deptName] = ca.status;
              }
            });

            // Teacher approvals summary
            const teacherApprovals = approvals.filter(ca => deptMap[ca.department_id] === "Teacher");
            if (teacherApprovals.length > 0) {
              const allApproved = teacherApprovals.every(ca => ca.status === "approved");
              const anyRequested = teacherApprovals.some(ca => ca.status === "requested");
              studentClearance.Teacher = allApproved ? "approved" : (anyRequested ? "requested" : "pending");
            }
          }

          return {
            id: s.student_number,
            dbId: s.id,
            authUserId: s.auth_user_id,
            name: `${s.first_name} ${s.last_name}`.trim(),
            email: s.email,
            level: s.education_level,
            grade: s.grade_level,
            section: s.section_name,
            strand: s.strand || "N/A",
            voucher: voucherName,
            paid: studentPaid,
            clearance: studentClearance
          };
        });
      }

      // 6. Teacher Clearance Requests
      if (clApprovals && clRequests && studentsList && profilesList) {
        state.teacherClearanceRequests = (clApprovals || [])
          .filter(ca => ca.teacher_assignment_id !== null)
          .map(ca => {
            const req = (clRequests || []).find(r => r.id === ca.clearance_request_id);
            const student = (studentsList || []).find(s => s.id === req?.student_id);
            const teacher = (profilesList || []).find(p => p.id === ca.approver_profile_id);
            const ta = (assignmentsList || []).find(a => a.id === ca.teacher_assignment_id);

            return {
              key: `${student?.student_number}|${teacher?.id}|${ta?.subject_name || "Subject"}|${ta?.grade_level}|${ta?.section_name}`,
              studentId: student?.student_number,
              teacherId: teacher?.id,
              teacherName: teacher?.full_name,
              subject: ta?.subject_name || "Subject",
              grade: student?.grade_level,
              section: student?.section_name,
              strand: student?.strand || "N/A",
              status: ca.status,
              requestedAt: ca.approved_at || ca.created_at
            };
          });
      }

      // 7. Payments
      if (dbPayments && studentsList) {
        state.payments = dbPayments.map(p => {
          const student = (studentsList || []).find(s => s.id === p.student_id || s.student_number === p.student_id || s.auth_user_id === p.student_id);
          const studentName = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : "Student";
          const refNo = p.provider_reference || p.checkout_session_id || p.id;
          return {
            id: p.id,
            dbId: p.id,
            studentId: student?.student_number || p.student_id,
            studentDbId: p.student_id,
            studentName: studentName,
            date: p.paid_at ? p.paid_at.slice(0, 10) : (p.created_at ? p.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            paidAt: p.paid_at || p.created_at || new Date().toISOString(),
            amount: Number(p.amount),
            method: p.method || "Online",
            referenceNo: refNo,
            status: p.status || "paid"
          };
        });
      }

      // 8. Certificate Requests
      if (certRequests && studentsList) {
        state.certificateRequests = certRequests.map(cr => {
          const student = (studentsList || []).find(s => s.id === cr.student_id);
          return {
            studentId: student?.student_number || cr.student_id,
            status: cr.status,
            requestedAt: cr.requested_at ? cr.requested_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
          };
        });
      }

      return state;
    } catch (err) {
      console.error("fetchDatabaseState failed:", err);
      return null;
    }
  }

  function isUuid(val) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
  }

  function buildStudentOrFilter(val) {
    const cleanVal = String(val || '').trim();
    if (!cleanVal) return 'student_number.eq.none';
    if (isUuid(cleanVal)) {
      return `student_number.eq.${cleanVal},id.eq.${cleanVal},auth_user_id.eq.${cleanVal}`;
    }
    return `student_number.eq.${cleanVal}`;
  }

  function mergePaymentsState(localPayments = [], dbPayments = []) {
    const map = new Map();
    (localPayments || []).forEach(p => {
      if (p) {
        const key = String(p.referenceNo || p.id || '').toLowerCase();
        if (key) map.set(key, { ...p });
      }
    });

    (dbPayments || []).forEach(dbP => {
      if (dbP) {
        const refKey = dbP.referenceNo ? String(dbP.referenceNo).toLowerCase() : null;
        const idKey = dbP.id ? String(dbP.id).toLowerCase() : null;
        const matchKey = (refKey && map.has(refKey)) ? refKey : ((idKey && map.has(idKey)) ? idKey : null);

        if (matchKey) {
          const local = map.get(matchKey);
          map.set(matchKey, { ...dbP, ...local });
        } else {
          const primaryKey = refKey || idKey || `db-${Date.now()}-${Math.random()}`;
          map.set(primaryKey, { ...dbP });
        }
      }
    });

    return Array.from(map.values());
  }

  async function recordPayment(studentNumber, amount, method = "Manual", referenceNo = null) {
    const supabase = client();
    if (!supabase) return null;

    let sNo = studentNumber;
    let amt = amount;
    let mth = method;
    let refNo = referenceNo;

    if (typeof studentNumber === "object" && studentNumber !== null) {
      sNo = studentNumber.studentId || studentNumber.student_id || studentNumber.studentNumber || studentNumber.id;
      amt = studentNumber.amount;
      mth = studentNumber.method || "Manual";
      refNo = studentNumber.referenceNo || studentNumber.reference_no || studentNumber.provider_reference || null;
    }

    if (!sNo) throw new Error("Student ID or Student Number is required to record payment.");

    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("id, student_number")
      .or(buildStudentOrFilter(sNo))
      .maybeSingle();

    if (studentErr) {
      console.error("Error looking up student for payment:", studentErr);
    }

    if (!student) throw new Error(`Student '${sNo}' not found in database.`);

    if (refNo) {
      const { data: existing } = await supabase
        .from("payments")
        .select("*")
        .eq("student_id", student.id)
        .eq("provider_reference", refNo)
        .maybeSingle();
      if (existing) return existing;
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        student_id: student.id,
        amount: Number(amt),
        method: mth || "Manual",
        provider_reference: refNo || null,
        status: "paid",
        paid_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function requestClearance(studentNumber, schoolYear = "2026-2027") {
    const supabase = client();
    if (!supabase) return null;

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .or(buildStudentOrFilter(studentNumber))
      .maybeSingle();

    if (!student) throw new Error("Student not found in database.");

    const { data: existing } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .eq("school_year", schoolYear)
      .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabase
      .from("clearance_requests")
      .insert({
        student_id: student.id,
        school_year: schoolYear,
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateTeacherClearance(studentNumber, teacherProfileId, subjectName, status, remarks = "") {
    const supabase = client();
    if (!supabase) return null;

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .or(buildStudentOrFilter(studentNumber))
      .maybeSingle();
    if (!student) throw new Error("Student not found.");

    const { data: req } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();
    if (!req) throw new Error("Clearance request not found.");

    const { data: approvals, error: fetchErr } = await supabase
      .from("clearance_approvals")
      .select("id, teacher_assignment_id, teacher_assignments(subject_name)")
      .eq("clearance_request_id", req.id)
      .eq("approver_profile_id", teacherProfileId);

    if (fetchErr) throw fetchErr;
    if (!approvals || approvals.length === 0) throw new Error("Clearance approval row not found for this teacher.");

    let targetApproval = approvals[0];
    if (approvals.length > 1 && subjectName) {
      const match = approvals.find(a => a.teacher_assignments?.subject_name === subjectName);
      if (match) targetApproval = match;
    }

    const { data, error } = await supabase
      .from("clearance_approvals")
      .update({
        status: status,
        remarks: remarks || null,
        approved_at: status === "approved" ? new Date().toISOString() : null
      })
      .eq("id", targetApproval.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateOfficeClearance(studentNumber, departmentName, status, remarks = "") {
    const supabase = client();
    if (!supabase) return null;

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .or(buildStudentOrFilter(studentNumber))
      .maybeSingle();
    if (!student) throw new Error("Student not found.");

    const { data: req } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();
    if (!req) throw new Error("Clearance request not found.");

    const { data: dept } = await supabase
      .from("departments")
      .select("id")
      .eq("name", departmentName)
      .maybeSingle();
    if (!dept) throw new Error("Department not found.");

    const { data: approval } = await supabase
      .from("clearance_approvals")
      .select("id")
      .eq("clearance_request_id", req.id)
      .eq("department_id", dept.id)
      .is("teacher_assignment_id", null)
      .maybeSingle();

    if (!approval) throw new Error(`Clearance approval row not found for ${departmentName}.`);

    const { data, error } = await supabase
      .from("clearance_approvals")
      .update({
        status: status,
        remarks: remarks || null,
        approved_at: status === "approved" ? new Date().toISOString() : null
      })
      .eq("id", approval.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function requestCertificate(studentNumber) {
    const supabase = client();
    if (!supabase) return null;

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .or(buildStudentOrFilter(studentNumber))
      .maybeSingle();
    if (!student) throw new Error("Student not found.");

    const { data: req } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();
    if (!req) throw new Error("Clearance request not found.");

    const { data, error } = await supabase
      .from("clearance_certificate_requests")
      .insert({
        clearance_request_id: req.id,
        student_id: student.id,
        status: "approved"
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  function showToast(message, type = "info") {
    if (typeof document === "undefined") return;
    let container = document.getElementById("paToastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "paToastContainer";
      container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;max-width:380px;pointer-events:none;";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.style.cssText = "pointer-events:auto;padding:12px 18px;border-radius:14px;font-family:sans-serif;font-size:13px;font-weight:600;color:#fff;box-shadow:0 10px 25px rgba(0,0,0,0.15);transition:all 0.3s cubic-bezier(0.16,1,0.3,1);transform:translateY(20px);opacity:0;display:flex;align-items:center;gap:10px;";
    
    if (type === "success") {
      toast.style.backgroundColor = "#059669";
    } else if (type === "error") {
      toast.style.backgroundColor = "#DC2626";
    } else if (type === "warning") {
      toast.style.backgroundColor = "#D97706";
    } else {
      toast.style.backgroundColor = "#1E3A8A";
    }

    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = "translateY(0)";
      toast.style.opacity = "1";
    });

    setTimeout(() => {
      toast.style.transform = "translateY(10px)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function subscribeRealtime(table, callback) {
    const supabaseClient = client();
    if (!supabaseClient) return null;
    try {
      const channel = supabaseClient
        .channel(`public:${table}-realtime`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          if (typeof callback === 'function') callback(payload);
        })
        .subscribe();
      return channel;
    } catch (e) {
      console.warn("Realtime subscription notice:", e);
      return null;
    }
  }

  window.PA_CONFIG = config;
  window.paApi = {
    isSupabaseReady,
    client,
    login,
    dashboardForRole,
    normalizeRole,
    registerStudent,
    invokeFunction,
    createCheckout,
    createSchoolAccount,
    logout,
    fetchDatabaseState,
    recordPayment,
    mergePaymentsState,
    requestClearance,
    updateTeacherClearance,
    updateOfficeClearance,
    requestCertificate,
    showToast,
    subscribeRealtime
  };

  window.logoutToIndex = function () {
    return logout("index.html");
  };
})();
