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
          if (found.active === false || found.status === "disabled" || found.status === "inactive") {
            throw new Error("Your account has been disabled. Please contact the school administration.");
          }
          try {
            const rawAdmin = localStorage.getItem("pa_full_admin_v2");
            if (rawAdmin) {
              const adminData = JSON.parse(rawAdmin);
              const admStudent = (adminData.students || []).find(s => 
                (found.studentId && s.id === found.studentId) || 
                (found.email && String(s.email).toLowerCase() === String(found.email).toLowerCase())
              );
              if (admStudent && (admStudent.status === "disabled" || admStudent.status === "inactive" || admStudent.active === false)) {
                throw new Error("Your student account has been disabled. Please contact the school administration.");
              }
            }
          } catch (e) {
            if (e.message && e.message.includes("disabled")) throw e;
          }

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

      let profileFound = false;
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
          profileFound = true;
        }
      } catch (profileError) {
        console.warn("Profile role lookup skipped:", profileError);
      }

      const inferredRole = inferPrototypeRole(email);
      const isStaffOrAdmin = ADMIN_ROLES.includes(inferredRole) || CLEARANCE_ROLES.includes(inferredRole) || ADMIN_ROLES.includes(role) || CLEARANCE_ROLES.includes(role);

      if (!profileFound || isStaffOrAdmin) {
        if (isStaffOrAdmin) {
          role = (role && (ADMIN_ROLES.includes(role) || CLEARANCE_ROLES.includes(role))) ? role : inferredRole;
        }
        if (!profileFound && isStaffOrAdmin) {
          try {
            await supabaseClient.from("profiles").upsert({
              auth_user_id: authUser.id,
              email: email,
              full_name: fullName || email,
              role: role,
              status: "active"
            }, { onConflict: "auth_user_id" });
          } catch (e) {
            console.warn("Auto-creating admin profile error:", e);
          }
        }
      }

      let studentInfo = {};
      if (!isStaffOrAdmin) {
        try {
          const { data: studentRow } = await supabaseClient
            .from("students")
            .select("student_number,first_name,last_name,email,education_level,grade_level,section_name,strand,school_year,status")
            .or(`auth_user_id.eq.${authUser.id},email.eq.${email}`)
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
              .or(`auth_user_id.eq.${authUser.id},email.eq.${email}`)
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

        if (!studentInfo.studentId && authUser?.user_metadata) {
          const meta = authUser.user_metadata;
          if (meta.student_number || meta.grade_level || meta.gradeLevel) {
            studentInfo = {
              studentId: meta.student_number || meta.studentId,
              firstName: meta.first_name || meta.firstName || "",
              lastName: meta.last_name || meta.lastName || "",
              educationLevel: meta.education_level || meta.educationLevel || (['Grade 11', 'Grade 12'].includes(meta.grade_level || meta.gradeLevel) ? 'SHS' : 'JHS'),
              gradeLevel: meta.grade_level || meta.gradeLevel || "Grade 7",
              section: meta.section_name || meta.section || "N/A",
              strand: meta.strand || "N/A",
              studentStatus: "active"
            };
          }
        }
      }

      if (status === "disabled" || status === "inactive" || (studentInfo && (studentInfo.studentStatus === "disabled" || studentInfo.studentStatus === "inactive"))) {
        try { await supabaseClient.auth.signOut(); } catch {}
        throw new Error("Your account has been disabled. Please contact the school administration.");
      }
      try {
        const rawAdmin = localStorage.getItem("pa_full_admin_v2");
        if (rawAdmin) {
          const adminData = JSON.parse(rawAdmin);
          const admStudent = (adminData.students || []).find(s => 
            (studentInfo && studentInfo.studentId && s.id === studentInfo.studentId) || 
            String(s.email).toLowerCase() === String(email).toLowerCase()
          );
          if (admStudent && (admStudent.status === "disabled" || admStudent.status === "inactive" || admStudent.active === false)) {
            try { await supabaseClient.auth.signOut(); } catch {}
            throw new Error("Your student account has been disabled. Please contact the school administration.");
          }
        }
      } catch (e) {
        if (e.message && e.message.includes("disabled")) throw e;
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
      options: {
        data: {
          full_name: `${profile.firstName} ${profile.lastName}`.trim(),
          first_name: profile.firstName,
          last_name: profile.lastName,
          role: "student",
          student_number: profile.studentId,
          education_level: profile.educationLevel,
          grade_level: profile.gradeLevel,
          section_name: profile.section,
          strand: profile.strand || "N/A"
        }
      }
    });
    if (error) throw error;

    if (data.user) {
      await supabaseClient.from("profiles").upsert({
        auth_user_id: data.user.id,
        full_name: `${profile.firstName} ${profile.lastName}`.trim(),
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
        strand: profile.strand || "N/A",
        email: profile.email,
        status: "pending_verification"
      });
      if (profileError) console.warn("student_registration_requests insert notice:", profileError);

      try {
        await supabaseClient.from("students").upsert({
          auth_user_id: data.user.id,
          first_name: profile.firstName,
          last_name: profile.lastName,
          student_number: profile.studentId,
          education_level: profile.educationLevel,
          grade_level: profile.gradeLevel,
          section_name: profile.section,
          strand: profile.strand || "N/A",
          email: profile.email,
          school_year: "2026-2027",
          status: "active"
        }, { onConflict: "student_number" });
      } catch (e) {
        console.warn("Direct students table insert notice:", e);
      }
    }

    try {
      const regUsers = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
      const fullName = `${profile.firstName} ${profile.lastName}`.trim();
      const existingIdx = regUsers.findIndex(u => String(u.email || "").toLowerCase() === String(profile.email || "").toLowerCase() || u.studentId === profile.studentId);
      const studentObj = {
        id: profile.studentId,
        studentId: profile.studentId,
        authUserId: data?.user?.id,
        email: profile.email,
        password: profile.password,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: fullName,
        name: fullName,
        role: "student",
        level: profile.educationLevel,
        grade: profile.gradeLevel,
        section: profile.section,
        strand: profile.strand || "N/A"
      };
      if (existingIdx >= 0) regUsers[existingIdx] = { ...regUsers[existingIdx], ...studentObj };
      else regUsers.push(studentObj);
      localStorage.setItem("pa_registered_users", JSON.stringify(regUsers));

      const rawAdmin = localStorage.getItem("pa_full_admin_v2");
      if (rawAdmin) {
        const adminData = JSON.parse(rawAdmin);
        adminData.students = adminData.students || [];
        const stdIdx = adminData.students.findIndex(s => s.id === profile.studentId || String(s.email || "").toLowerCase() === String(profile.email || "").toLowerCase());
        const adminStudent = {
          id: profile.studentId,
          dbId: data?.user?.id,
          authUserId: data?.user?.id,
          name: fullName,
          email: profile.email,
          level: profile.educationLevel,
          grade: profile.gradeLevel,
          section: profile.section,
          strand: profile.strand || "N/A",
          voucher: "None",
          paid: 0,
          clearance: {
            Teacher: "pending",
            Guidance: "pending",
            Prefect: "pending",
            Library: "pending",
            Principal: "pending",
            Accounting: "pending",
            Registrar: "pending"
          }
        };
        if (stdIdx >= 0) adminData.students[stdIdx] = { ...adminData.students[stdIdx], ...adminStudent };
        else adminData.students.push(adminStudent);
        localStorage.setItem("pa_full_admin_v2", JSON.stringify(adminData));
      }
    } catch (localErr) {
      console.warn("Local storage student registration fallback notice:", localErr);
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
    if (!client()) throw new Error("Supabase is not configured yet.");
    let result;
    try {
      result = await invokeFunction("create-school-account", payload);
    } catch (error) {
      const details = await error.context?.json?.().catch(() => null);
      throw new Error(details?.error || error.message || "Account could not be saved.");
    }
    if (result?.error) throw new Error(result.error);
    if (!result?.profile_id || !result?.user_id) {
      throw new Error("Account was not saved completely. Deploy the updated create-school-account function and retry.");
    }
    return result;
  }

  async function deleteStudent(studentRef) {
    if (!studentRef) return { success: false, message: "No student specified." };

    const sObj = typeof studentRef === "object" ? studentRef : { id: String(studentRef) };
    const rawId = String(sObj.id || sObj.student_number || sObj.studentId || "").trim();
    const studentNumber = String(sObj.student_number || sObj.studentId || sObj.id || "").trim();
    const email = String(sObj.email || sObj.studentEmail || "").trim().toLowerCase();
    const authUserId = String(sObj.authUserId || sObj.auth_user_id || "").trim();
    const dbId = String(sObj.dbId || (rawId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? rawId : "")).trim();

    const isUuid = val => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());

    const supabaseClient = client();
    if (supabaseClient) {
      try {
        const studentUuids = new Set();
        const studentNumbers = new Set();
        const studentEmails = new Set();
        const authUserIds = new Set();

        if (studentNumber) studentNumbers.add(studentNumber);
        if (email) studentEmails.add(email);
        if (authUserId && isUuid(authUserId)) authUserIds.add(authUserId);
        if (dbId && isUuid(dbId)) studentUuids.add(dbId);
        if (rawId && isUuid(rawId)) studentUuids.add(rawId);

        // Look up matching records in students table
        try {
          const { data: matchedStudents } = await supabaseClient
            .from("students")
            .select("id, auth_user_id, student_number, email");
          if (Array.isArray(matchedStudents)) {
            matchedStudents.forEach(row => {
              const rNum = String(row.student_number || "").trim();
              const rEmail = String(row.email || "").trim().toLowerCase();
              const rAuth = String(row.auth_user_id || "").trim();
              const rId = String(row.id || "").trim();

              const matches = (
                (studentNumbers.size > 0 && studentNumbers.has(rNum)) ||
                (studentEmails.size > 0 && rEmail && studentEmails.has(rEmail)) ||
                (authUserIds.size > 0 && rAuth && authUserIds.has(rAuth)) ||
                (studentUuids.size > 0 && studentUuids.has(rId))
              );

              if (matches) {
                if (rId && isUuid(rId)) studentUuids.add(rId);
                if (rNum) studentNumbers.add(rNum);
                if (rEmail) studentEmails.add(rEmail);
                if (rAuth && isUuid(rAuth)) authUserIds.add(rAuth);
              }
            });
          }
        } catch (e) {
          console.warn("Error querying students table for deletion:", e);
        }

        // Look up matching records in student_registration_requests table
        try {
          const { data: matchedReqs } = await supabaseClient
            .from("student_registration_requests")
            .select("id, auth_user_id, student_number, email");
          if (Array.isArray(matchedReqs)) {
            matchedReqs.forEach(row => {
              const rNum = String(row.student_number || "").trim();
              const rEmail = String(row.email || "").trim().toLowerCase();
              const rAuth = String(row.auth_user_id || "").trim();
              const rId = String(row.id || "").trim();

              const matches = (
                (studentNumbers.size > 0 && studentNumbers.has(rNum)) ||
                (studentEmails.size > 0 && rEmail && studentEmails.has(rEmail)) ||
                (authUserIds.size > 0 && rAuth && authUserIds.has(rAuth)) ||
                (studentUuids.size > 0 && studentUuids.has(rId))
              );

              if (matches) {
                if (rNum) studentNumbers.add(rNum);
                if (rEmail) studentEmails.add(rEmail);
                if (rAuth && isUuid(rAuth)) authUserIds.add(rAuth);
              }
            });
          }
        } catch (e) {
          console.warn("Error querying student_registration_requests for deletion:", e);
        }

        const targetStudentIds = Array.from(studentUuids);
        const targetStudentNumbers = Array.from(studentNumbers);
        const targetEmails = Array.from(studentEmails);
        const targetAuthIds = Array.from(authUserIds);

        // Delete cascade children
        if (targetStudentIds.length > 0) {
          // 1. clearance_certificate_requests
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("clearance_certificate_requests").delete().eq("student_id", sId); } catch (_) {}
          }

          // 2. clearance_approvals via clearance_requests
          try {
            const { data: clReqs } = await supabaseClient.from("clearance_requests").select("id").in("student_id", targetStudentIds);
            if (Array.isArray(clReqs) && clReqs.length > 0) {
              const clReqIds = clReqs.map(r => r.id);
              for (const cId of clReqIds) {
                try { await supabaseClient.from("clearance_approvals").delete().eq("clearance_request_id", cId); } catch (_) {}
              }
            }
          } catch (_) {}

          // 3. clearance_requests
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("clearance_requests").delete().eq("student_id", sId); } catch (_) {}
          }

          // 4. student_vouchers
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("student_vouchers").delete().eq("student_id", sId); } catch (_) {}
          }

          // 5. student_assessments
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("student_assessments").delete().eq("student_id", sId); } catch (_) {}
          }

          // 6. payments and payment_allocations
          try {
            const { data: pymts } = await supabaseClient.from("payments").select("id").in("student_id", targetStudentIds);
            if (Array.isArray(pymts) && pymts.length > 0) {
              const pIds = pymts.map(p => p.id);
              for (const pId of pIds) {
                try { await supabaseClient.from("payment_allocations").delete().eq("payment_id", pId); } catch (_) {}
              }
            }
          } catch (_) {}
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("payments").delete().eq("student_id", sId); } catch (_) {}
          }

          // 7. student_installments and payment_allocations
          try {
            const { data: insts } = await supabaseClient.from("student_installments").select("id").in("student_id", targetStudentIds);
            if (Array.isArray(insts) && insts.length > 0) {
              const instIds = insts.map(i => i.id);
              for (const instId of instIds) {
                try { await supabaseClient.from("payment_allocations").delete().eq("student_installment_id", instId); } catch (_) {}
              }
            }
          } catch (_) {}
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("student_installments").delete().eq("student_id", sId); } catch (_) {}
          }

          // 8. Delete from students table by ID
          for (const sId of targetStudentIds) {
            try { await supabaseClient.from("students").delete().eq("id", sId); } catch (_) {}
          }
        }

        // Delete from students table by student_number or email
        for (const num of targetStudentNumbers) {
          try { await supabaseClient.from("students").delete().eq("student_number", num); } catch (_) {}
        }
        for (const em of targetEmails) {
          try { await supabaseClient.from("students").delete().eq("email", em); } catch (_) {}
        }

        // Delete from student_registration_requests
        for (const num of targetStudentNumbers) {
          try { await supabaseClient.from("student_registration_requests").delete().eq("student_number", num); } catch (_) {}
        }
        for (const em of targetEmails) {
          try { await supabaseClient.from("student_registration_requests").delete().eq("email", em); } catch (_) {}
        }
        for (const aId of targetAuthIds) {
          try { await supabaseClient.from("student_registration_requests").delete().eq("auth_user_id", aId); } catch (_) {}
        }

        // Delete student profile from profiles table
        for (const em of targetEmails) {
          try { await supabaseClient.from("profiles").delete().eq("email", em).eq("role", "student"); } catch (_) {}
        }
        for (const aId of targetAuthIds) {
          try { await supabaseClient.from("profiles").delete().eq("auth_user_id", aId).eq("role", "student"); } catch (_) {}
        }
      } catch (err) {
        console.warn("deleteStudent Supabase sync error:", err);
      }
    }

    // Clean local storage
    try {
      if (typeof localStorage !== "undefined") {
        const checkMatch = u => {
          if (!u) return false;
          const uNum = String(u.studentId || u.student_number || u.id || "").trim();
          const uEmail = String(u.email || "").trim().toLowerCase();
          const uAuth = String(u.authUserId || u.auth_user_id || "").trim();
          const uClean = uNum.replace(/^stu-/i, "");
          const matchNum = studentNumber && (uNum === studentNumber || (uClean && uClean === studentNumber.replace(/^stu-/i, "")));
          const matchEmail = email && uEmail === email;
          const matchAuth = authUserId && uAuth === authUserId;
          const matchRaw = rawId && (u.id === rawId || u.studentId === rawId);
          return matchNum || matchEmail || matchAuth || matchRaw;
        };

        const localReg = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
        if (Array.isArray(localReg)) {
          const updatedReg = localReg.filter(u => !checkMatch(u));
          localStorage.setItem("pa_registered_users", JSON.stringify(updatedReg));
        }

        const rawAdmin = localStorage.getItem("pa_full_admin_v2");
        if (rawAdmin) {
          const parsed = JSON.parse(rawAdmin);
          if (parsed && Array.isArray(parsed.students)) {
            parsed.students = parsed.students.filter(s => !checkMatch(s));
            localStorage.setItem("pa_full_admin_v2", JSON.stringify(parsed));
          }
        }
      }
    } catch (localErr) {
      console.warn("deleteStudent local storage cleaning error:", localErr);
    }

    return { success: true };
  }

  async function deleteStaffAccount(staffRef) {
    if (!staffRef) return { success: false, message: "No staff account specified." };
    const sObj = typeof staffRef === "object" ? staffRef : { id: String(staffRef) };
    const profileId = sObj.id || sObj.profile_id;
    const email = String(sObj.email || "").trim().toLowerCase();
    const authUserId = sObj.authUserId || sObj.auth_user_id;

    const supabaseClient = client();
    if (supabaseClient) {
      try {
        if (profileId) {
          try { await supabaseClient.from("teacher_assignments").delete().eq("teacher_profile_id", profileId); } catch (_) {}
          try { await supabaseClient.from("clearance_heads").delete().eq("profile_id", profileId); } catch (_) {}
          try { await supabaseClient.from("staff_accounts").delete().eq("profile_id", profileId); } catch (_) {}
          try { await supabaseClient.from("profiles").delete().eq("id", profileId); } catch (_) {}
        }
        if (email) {
          try { await supabaseClient.from("staff_accounts").delete().eq("email", email); } catch (_) {}
          try { await supabaseClient.from("profiles").delete().eq("email", email); } catch (_) {}
        }
      } catch (err) {
        console.warn("deleteStaffAccount error:", err);
      }
    }

    try {
      if (typeof localStorage !== "undefined") {
        const localReg = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
        if (Array.isArray(localReg)) {
          const updatedReg = localReg.filter(u => u.id !== profileId && String(u.email || "").toLowerCase() !== email);
          localStorage.setItem("pa_registered_users", JSON.stringify(updatedReg));
        }
      }
    } catch (_) {}

    return { success: true };
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

    if (typeof window !== 'undefined' && window.location) {
      window.location.href = redirectTo;
    } else if (typeof location !== 'undefined') {
      location.href = redirectTo;
    }
  }

  async function fetchDatabaseState() {
    const supabase = client();
    if (!supabase) return null;

    try {
      const safeQuery = async (query) => {
        try {
          const res = await query;
          if (res && res.error) {
            return { data: [] };
          }
          return res || { data: [] };
        } catch {
          return { data: [] };
        }
      };

      const [
        { data: feeStrs },
        { data: feeItems },
        { data: voucherTypes },
        { data: instTemplates },
        { data: profilesList, error: profilesError },
        { data: staffList, error: staffError },
        { data: assignmentsList, error: assignmentsError },
        { data: studentsList },
        { data: stdVouchers },
        { data: dbPayments },
        { data: clRequests },
        { data: clApprovals },
        { data: certRequests },
        { data: deptsList },
        { data: regRequestsList }
      ] = await Promise.all([
        safeQuery(supabase.from("fee_structures").select("*")),
        safeQuery(supabase.from("fee_structure_items").select("*")),
        safeQuery(supabase.from("voucher_types").select("*")),
        safeQuery(supabase.from("installment_templates").select("*")),
        safeQuery(supabase.from("profiles").select("*")),
        safeQuery(supabase.from("staff_accounts").select("*")),
        safeQuery(supabase.from("teacher_assignments").select("*")),
        safeQuery(supabase.from("students").select("*")),
        safeQuery(supabase.from("student_vouchers").select("*, voucher_types(voucher_name)")),
        safeQuery(supabase.from("payments").select("id, student_id, amount, method, provider, provider_reference, checkout_session_id, status, paid_at, created_at")),
        safeQuery(supabase.from("clearance_requests").select("*")),
        safeQuery(supabase.from("clearance_approvals").select("*")),
        safeQuery(supabase.from("clearance_certificate_requests").select("*")),
        safeQuery(supabase.from("departments").select("*")),
        safeQuery(supabase.from("student_registration_requests").select("*"))
      ]);

      if (profilesError || staffError || assignmentsError) {
        throw profilesError || staffError || assignmentsError;
      }

      const DEFAULT_FEE_STRUCTURES = {
        JHS: [],
        SHS: []
      };

      const DEFAULT_VOUCHERS = [];

      const DEFAULT_INSTALLMENT_TEMPLATE = [];

      const storedClearanceOpen = typeof localStorage !== 'undefined' && localStorage.getItem('pa_clearance_period_open') !== null
        ? localStorage.getItem('pa_clearance_period_open') === 'true'
        : true;

      const state = {
        settings: { schoolName: "Pagbilao Academy Inc.", schoolYear: "2026-2027", clearanceOpen: storedClearanceOpen },
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
          if (items.length > 0) {
            const existing = state.feeStructures[fs.education_level] || [];
            const seen = new Set(existing.map(e => String(e.name || "").trim().toLowerCase()));
            const deduped = [...existing];
            items.forEach(it => {
              const key = String(it.name || "").trim().toLowerCase();
              if (key && !seen.has(key)) {
                seen.add(key);
                deduped.push(it);
              }
            });
            state.feeStructures[fs.education_level] = deduped;
          }
        });
      }

      // Check localStorage cache fallback for feeStructures if database returned empty
      if ((!state.feeStructures.JHS || state.feeStructures.JHS.length === 0) &&
          (!state.feeStructures.SHS || state.feeStructures.SHS.length === 0) &&
          typeof localStorage !== 'undefined') {
        try {
          const cachedFees = localStorage.getItem('pa_app_fees_v2');
          if (cachedFees) {
            const parsed = JSON.parse(cachedFees);
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.JHS) && parsed.JHS.length > 0) state.feeStructures.JHS = parsed.JHS;
              if (Array.isArray(parsed.SHS) && parsed.SHS.length > 0) state.feeStructures.SHS = parsed.SHS;
            }
          }
        } catch (_) {}
      } else if (typeof localStorage !== 'undefined' && (state.feeStructures.JHS.length > 0 || state.feeStructures.SHS.length > 0)) {
        try {
          localStorage.setItem('pa_app_fees_v2', JSON.stringify(state.feeStructures));
        } catch (_) {}
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

      // 3. Installment Templates
      const MOCK_TEMPLATE_IDS = ["ins-downpayment-2026", "ins-q2-2026", "ins-q3-2027", "ins-q4-2027"];
      if (instTemplates && instTemplates.length > 0) {
        state.installmentTemplate = instTemplates
          .filter(i => !MOCK_TEMPLATE_IDS.includes(i.id))
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(i => ({
            id: i.id,
            title: i.title,
            percent: Number(i.percent_of_net || 0),
            dueDate: i.due_date,
            description: i.title
          }));
      } else {
        try {
          const cached = localStorage.getItem("pa_installment_templates");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const clean = parsed.filter(p => !MOCK_TEMPLATE_IDS.includes(p.id));
              if (clean.length > 0) {
                state.installmentTemplate = clean;
              } else {
                state.installmentTemplate = [];
                localStorage.setItem("pa_installment_templates", JSON.stringify([]));
              }
            }
          }
        } catch {}
        if (!state.installmentTemplate) {
          state.installmentTemplate = [];
        }
      }

      // 4. Accounts
      if (profilesList) {
        state.accounts = profilesList
          .filter(p => p.role !== "student")
          .map(p => {
            const staff = (staffList || []).find(s => s.profile_id === p.id);
            const teacherAssignments = (assignmentsList || []).filter(ta =>
              ta.teacher_profile_id === p.id && ta.school_year === state.settings.schoolYear);
            return {
              id: p.id,
              authUserId: p.auth_user_id,
              name: p.full_name,
              email: p.email,
              role: p.role,
              department: staff?.department || "Admin",
              active: p.status === "active",
              assignments: teacherAssignments.map(ta => ({
                id: ta.id,
                schoolYear: ta.school_year,
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

      // 5. Combined Students (from students table + student_registration_requests)
      const combinedStudents = [...(studentsList || [])];
      (regRequestsList || []).forEach(req => {
        const alreadyExists = combinedStudents.some(s =>
          (s.student_number && s.student_number === req.student_number) ||
          (s.auth_user_id && req.auth_user_id && s.auth_user_id === req.auth_user_id) ||
          (s.email && req.email && String(s.email).toLowerCase() === String(req.email).toLowerCase())
        );
        if (!alreadyExists) {
          combinedStudents.push({
            id: req.id,
            auth_user_id: req.auth_user_id,
            student_number: req.student_number,
            first_name: req.first_name,
            last_name: req.last_name,
            email: req.email,
            education_level: req.education_level,
            grade_level: req.grade_level,
            section_name: req.section_name,
            strand: req.strand || "N/A",
            school_year: "2026-2027",
            status: req.status || "active"
          });
        }
      });

      try {
        const localReg = JSON.parse(localStorage.getItem("pa_registered_users") || "[]");
        localReg.forEach(lr => {
          if (lr && (lr.role === "student" || lr.studentId)) {
            const alreadyInCombined = combinedStudents.some(s =>
              (s.student_number && (lr.studentId || lr.id) && String(s.student_number).toLowerCase() === String(lr.studentId || lr.id).toLowerCase()) ||
              (s.email && lr.email && String(s.email).toLowerCase() === String(lr.email).toLowerCase())
            );
            if (!alreadyInCombined) {
              combinedStudents.push({
                id: lr.studentId || lr.id || "STU-" + Date.now(),
                auth_user_id: lr.authUserId,
                student_number: lr.studentId || lr.id || "STU-" + Date.now(),
                first_name: lr.firstName || (lr.fullName ? lr.fullName.split(' ')[0] : 'Student'),
                last_name: lr.lastName || (lr.fullName ? lr.fullName.split(' ').slice(1).join(' ') : ''),
                email: lr.email,
                education_level: lr.level || "JHS",
                grade_level: lr.grade || "Grade 7",
                section_name: lr.section || "N/A",
                strand: lr.strand || "N/A",
                school_year: "2026-2027",
                status: "active"
              });
            }
          }
        });
      } catch (e) {
        console.warn("Merging pa_registered_users notice:", e);
      }

      if (combinedStudents.length > 0) {
        state.students = combinedStudents.map(s => {
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
          const studentClearanceRemarks = {};

          if (req) {
            const approvals = (clApprovals || []).filter(ca => ca.clearance_request_id === req.id);
            
            // Office approvals
            approvals.forEach(ca => {
              const deptName = deptMap[ca.department_id];
              if (deptName && deptName !== "Teacher") {
                studentClearance[deptName] = ca.status;
                if (ca.remarks) {
                  studentClearanceRemarks[deptName] = ca.remarks;
                }
              } else if (deptName === "Teacher" || ca.teacher_assignment_id) {
                const ta = (assignmentsList || []).find(a => a.id === ca.teacher_assignment_id);
                if (ta?.subject_name && ca.remarks) {
                  studentClearanceRemarks[ta.subject_name] = ca.remarks;
                }
              }
            });

            // Teacher approvals summary
            const teacherApprovals = approvals.filter(ca => deptMap[ca.department_id] === "Teacher" || ca.teacher_assignment_id);
            if (teacherApprovals.length > 0) {
              const allApproved = teacherApprovals.every(ca => ca.status === "approved");
              const anyRequested = teacherApprovals.some(ca => ca.status === "requested");
              const anyOnHold = teacherApprovals.some(ca => ca.status === "on_hold");
              studentClearance.Teacher = allApproved ? "approved" : (anyOnHold ? "on_hold" : (anyRequested ? "requested" : "pending"));
            }
          }

          return {
            id: s.student_number,
            student_number: s.student_number,
            dbId: s.id,
            authUserId: s.auth_user_id,
            name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.student_number,
            email: s.email,
            level: s.education_level || "JHS",
            grade: s.grade_level || "Grade 7",
            section: s.section_name || "N/A",
            strand: s.strand || "N/A",
            voucher: voucherName,
            paid: studentPaid,
            clearance: studentClearance,
            clearanceRemarks: studentClearanceRemarks
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
              remarks: ca.remarks || "",
              requestedAt: ca.approved_at || ca.created_at
            };
          });
      }

      // 7. Payments
      if (dbPayments) {
        state.payments = dbPayments.map(p => {
          const student = (combinedStudents || []).find(s => 
            (s.id && (s.id === p.student_id || s.id === p.studentId)) || 
            (s.student_number && (s.student_number === p.student_id || s.student_number === p.studentId)) || 
            (s.auth_user_id && (s.auth_user_id === p.student_id || s.auth_user_id === p.auth_user_id)) ||
            (s.email && p.email && s.email.toLowerCase() === p.email.toLowerCase())
          );
          const studentName = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : (p.studentName || p.student_name || "Student");
          const refNo = p.provider_reference || p.checkout_session_id || p.reference_no || p.referenceNo || p.id;
          return {
            id: p.id,
            dbId: p.id,
            studentId: student?.student_number || student?.id || p.student_id,
            student_number: student?.student_number || null,
            studentDbId: p.student_id,
            student_id: p.student_id,
            studentName: studentName,
            date: p.paid_at ? p.paid_at.slice(0, 10) : (p.created_at ? p.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            paidAt: p.paid_at || p.created_at || new Date().toISOString(),
            amount: Number(p.amount),
            method: p.method || "Online",
            referenceNo: refNo,
            feeBreakdown: p.feeBreakdown || p.fee_breakdown || [],
            remarks: p.remarks || p.notes || "",
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
    const cleanNoStu = cleanVal.replace(/^stu-/i, '');
    if (isUuid(cleanVal)) {
      return `student_number.eq.${cleanVal},id.eq.${cleanVal},auth_user_id.eq.${cleanVal}`;
    }
    return `student_number.eq.${cleanVal},student_number.eq.${cleanNoStu},student_number.eq.STU-${cleanNoStu}`;
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

  async function recordPayment(studentObj, amount, method = "Manual", referenceNo = null) {
    const supabase = client();
    if (!supabase) return null;

    let sNo = studentObj;
    let amt = amount;
    let mth = method;
    let refNo = referenceNo;
    let sEmail = null;
    let sAuthId = null;

    if (typeof studentObj === "object" && studentObj !== null) {
      sNo = studentObj.studentId || studentObj.student_id || studentObj.studentNumber || studentObj.student_number || studentObj.id;
      amt = studentObj.amount;
      mth = studentObj.method || "Manual";
      refNo = studentObj.referenceNo || studentObj.reference_no || studentObj.provider_reference || null;
      sEmail = studentObj.email;
      sAuthId = studentObj.authUserId || studentObj.auth_user_id;
    }

    if (!sNo && !sEmail) return null;

    let student = null;

    if (sNo) {
      const filter = buildStudentOrFilter(sNo);
      const { data } = await supabase
        .from("students")
        .select("id, student_number, email")
        .or(filter)
        .maybeSingle();
      if (data) student = data;
    }

    if (!student && sEmail) {
      const { data } = await supabase
        .from("students")
        .select("id, student_number, email")
        .eq("email", sEmail)
        .maybeSingle();
      if (data) student = data;
    }

    if (!student && sAuthId) {
      const { data } = await supabase
        .from("students")
        .select("id, student_number, email")
        .eq("auth_user_id", sAuthId)
        .maybeSingle();
      if (data) student = data;
    }

    if (!student) {
      const isStaffEmail = sEmail && ['admin', 'accounting', 'accountant', 'teacher', 'guidance', 'prefect', 'library', 'librarian', 'principal', 'registrar'].some(kw => String(sEmail).toLowerCase().includes(kw));
      const isStaffRole = studentObj && ['accounting_admin', 'teacher_clearance_head', 'guidance_head', 'prefect_head', 'librarian_head', 'principal', 'registrar', 'super_admin'].includes(String(studentObj.role || '').toLowerCase());

      if (!isStaffEmail && !isStaffRole) {
        const insertNum = String(sNo || `STU-${Date.now()}`);
        const { data: newS } = await supabase
          .from("students")
          .insert({
            student_number: insertNum,
            first_name: studentObj?.firstName || "Student",
            last_name: studentObj?.lastName || "Account",
            email: sEmail || `${insertNum.toLowerCase()}@pagbilao.edu.ph`,
            education_level: "SHS",
            grade_level: "Grade 11",
            section_name: "Humility",
            strand: "GAS",
            school_year: "2026-2027",
            status: "active"
          })
          .select("id, student_number")
          .maybeSingle();
        if (newS) student = newS;
      }
    }

    if (!student) return null;

    if (refNo) {
      const { data: existing } = await supabase
        .from("payments")
        .select("*")
        .eq("student_id", student.id)
        .eq("provider_reference", refNo)
        .maybeSingle();
      if (existing) return existing;
    }

    const { data } = await supabase
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
      .maybeSingle();

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

    let { data: req } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();

    if (!req) {
      try {
        const { data: newReq } = await supabase
          .from("clearance_requests")
          .insert({
            student_id: student.id,
            school_year: "2026-2027",
            status: "pending"
          })
          .select()
          .single();
        req = newReq;
      } catch (e) {
        console.warn("Auto-create clearance request error:", e);
      }
    }
    if (!req) throw new Error("Clearance request not found.");

    const { data: allApprovals, error: fetchErr } = await supabase
      .from("clearance_approvals")
      .select("id, approver_profile_id, teacher_assignment_id, teacher_assignments(subject_name)")
      .eq("clearance_request_id", req.id);

    if (fetchErr) throw fetchErr;

    let targetApproval = null;
    if (allApprovals && allApprovals.length > 0) {
      if (subjectName) {
        targetApproval = allApprovals.find(a => a.teacher_assignments?.subject_name === subjectName);
      }
      if (!targetApproval && teacherProfileId) {
        targetApproval = allApprovals.find(a => a.approver_profile_id === teacherProfileId);
      }
      if (!targetApproval) {
        targetApproval = allApprovals.find(a => a.teacher_assignment_id !== null);
      }
    }

    if (targetApproval) {
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
    } else {
      const { data: dept } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "Teacher")
        .maybeSingle();

      const insertPayload = {
        clearance_request_id: req.id,
        department_id: dept?.id || null,
        approval_order: 1,
        status: status,
        remarks: remarks || null,
        approved_at: status === "approved" ? new Date().toISOString() : null
      };
      if (teacherProfileId && isUuid(teacherProfileId)) {
        insertPayload.approver_profile_id = teacherProfileId;
      }

      const { data, error } = await supabase
        .from("clearance_approvals")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }

  async function updateOfficeClearance(studentNumber, departmentName, status, remarks = "") {
    const supabase = client();
    if (!supabase) return null;

    const effectiveRemarks = remarks || (status === "approved" ? "Approved by Admin" : null);

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .or(buildStudentOrFilter(studentNumber))
      .maybeSingle();
    if (!student) throw new Error("Student not found.");

    // 1. Try atomic RPC function first
    if (typeof supabase.rpc === "function") {
      try {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc("approve_office_clearance", {
          p_student_id: student.id,
          p_department_name: departmentName,
          p_status: status || "approved",
          p_remarks: effectiveRemarks || "Approved by Admin"
        });
        if (!rpcErr && rpcResult?.success) {
          return rpcResult;
        }
        if (rpcErr && rpcErr.message && !rpcErr.message.includes("function") && !rpcErr.message.includes("not found")) {
          console.warn("approve_office_clearance RPC returned:", rpcErr);
        }
      } catch (rpcEx) {
        console.warn("approve_office_clearance RPC call caught:", rpcEx);
      }
    }

    // 2. Direct table fallback
    let { data: req } = await supabase
      .from("clearance_requests")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();

    if (!req) {
      try {
        const { data: newReq } = await supabase
          .from("clearance_requests")
          .insert({
            student_id: student.id,
            school_year: "2026-2027",
            status: "pending"
          })
          .select()
          .single();
        req = newReq;
      } catch (e) {
        console.warn("Auto-create clearance request in updateOfficeClearance error:", e);
      }
    }
    if (!req) throw new Error("Clearance request not found.");

    const { data: dept } = await supabase
      .from("departments")
      .select("id")
      .eq("name", departmentName)
      .maybeSingle();
    if (!dept) throw new Error("Department not found.");

    let approverProfileId = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();
        if (prof?.id) approverProfileId = prof.id;
      }
    } catch (_) {}

    const { data: existingApproval } = await supabase
      .from("clearance_approvals")
      .select("id")
      .eq("clearance_request_id", req.id)
      .eq("department_id", dept.id)
      .maybeSingle();

    let approvalId = existingApproval?.id;
    if (!approvalId) {
      const order = departmentName === "Principal" ? 3 :
                    ["Accounting", "Registrar"].includes(departmentName) ? 4 : 2;
      const insertPayload = {
        clearance_request_id: req.id,
        department_id: dept.id,
        approval_order: order,
        status: status,
        remarks: effectiveRemarks,
        approved_at: status === "approved" ? new Date().toISOString() : null
      };
      if (approverProfileId) insertPayload.approver_profile_id = approverProfileId;

      const { data: newApproval, error: insErr } = await supabase
        .from("clearance_approvals")
        .insert(insertPayload)
        .select()
        .single();
      if (insErr) throw insErr;
      return newApproval;
    }

    const updatePayload = {
      status: status,
      remarks: effectiveRemarks,
      approved_at: status === "approved" ? new Date().toISOString() : null
    };
    if (approverProfileId) updatePayload.approver_profile_id = approverProfileId;

    const { data, error } = await supabase
      .from("clearance_approvals")
      .update(updatePayload)
      .eq("id", approvalId)
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
      const channelId = `realtime_${table}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const channel = supabaseClient
        .channel(channelId)
        .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
          if (typeof callback === 'function') callback(payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Supabase Realtime] Subscribed to ${table}`);
          }
        });
      return channel;
    } catch (e) {
      console.warn("Realtime subscription notice:", e);
      return null;
    }
  }

  function clearLocalStorageData() {
    const dataKeys = [
      "pa_full_admin_v2",
      "pa_app_fees_v2",
      "pa_transactions_v2",
      "pa_students_data",
      "pa_transactions_cleared",
      "pa_registered_users"
    ];
    dataKeys.forEach(k => localStorage.removeItem(k));
  }

  // Do not purge localStorage cache automatically on page load/logout so admin-configured schedules persist
  // If manual purge is ever needed for development, invoke window.paApi.clearLocalStorageData()
  /*
  if (isSupabaseReady()) {
    clearLocalStorageData();
  }
  */

  window.PA_CONFIG = config;
  window.paApi = {
    isSupabaseReady,
    client,
    login,
    dashboardForRole,
    normalizeRole,
    registerStudent,
    deleteStudent,
    deleteStaffAccount,
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
    subscribeRealtime,
    clearLocalStorageData
  };

  window.logoutToIndex = function () {
    return logout("index.html");
  };
})();
