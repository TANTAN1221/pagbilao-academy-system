import { createClient } from "@supabase/supabase-js";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";



Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase service credentials are not set in Edge Function secrets." }, 503);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: caller, error: userError } = await userClient.auth.getUser();
    if (userError || !caller?.user) {
      return jsonResponse({ error: "Unauthorized: " + (userError?.message || "Invalid authentication token") }, 401);
    }
    const callerUser = caller.user;

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("auth_user_id", callerUser.id)
      .maybeSingle();

    const effectiveRole = callerProfile?.role || callerUser.user_metadata?.role;
    if (!["super_admin", "accounting_admin", "registrar"].includes(effectiveRole)) {
      return jsonResponse({ error: "Only admin, accounting, or registrar can create school accounts." }, 403);
    }

    const body = await req.json();
    const fullName = body.full_name;
    const email = body.email;
    const role = body.role;
    const department = body.department || null;
    const temporaryPassword = body.temporary_password || crypto.randomUUID().slice(0, 12) + "Pa!";
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const schoolYear = body.school_year || "2026-2027";

    if (!fullName || !email || !role) {
      return jsonResponse({ error: "full_name, email, and role are required." }, 400);
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });
    if (createError || !created?.user) {
      throw createError || new Error("Failed to create auth user.");
    }
    const newUser = created.user;

    try {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          auth_user_id: newUser.id,
          full_name: fullName,
          email,
          role,
          status: "active",
          created_by: callerUser.id
        }, { onConflict: "email" })
        .select("id")
        .single();

      if (profileError || !profile) throw profileError || new Error("Failed to insert profile record.");

      const scopeType = role === "teacher_clearance_head" ? "subject_section_multiple" :
        ["guidance_head", "prefect_head", "librarian_head"].includes(role) ? "all_students" :
        role === "principal" ? "principal_level" :
        ["accounting_admin", "registrar"].includes(role) ? "final_accounting" : "system_wide";

      const { error: staffError } = await supabaseAdmin.from("staff_accounts").upsert({
        auth_user_id: newUser.id,
        profile_id: profile.id,
        full_name: fullName,
        email,
        role,
        department,
        scope_type: scopeType,
        status: "active"
      }, { onConflict: "email" });

      if (staffError) throw staffError;

      if (role === "teacher_clearance_head" && assignments.length > 0) {
        const rows = assignments.map((item: Record<string, string>) => ({
          teacher_profile_id: profile.id,
          subject_name: item.subject_name || item.subject || "Subject",
          education_level: item.education_level || (String(item.grade_level || item.grade || "").includes("11") || String(item.grade_level || item.grade || "").includes("12") ? "SHS" : "JHS"),
          grade_level: item.grade_level || item.grade,
          section_name: item.section_name || item.section || "N/A",
          strand: item.strand || "N/A",
          school_year: item.school_year || schoolYear
        }));

        const { error: assignmentError } = await supabaseAdmin.from("teacher_assignments").insert(rows);
        if (assignmentError) throw assignmentError;
      }

      return jsonResponse({
        user_id: newUser.id,
        profile_id: profile.id,
        email,
        temporary_password: temporaryPassword,
        message: "Account created. Share the temporary password securely or use a password reset email."
      });
    } catch (dbError) {
      // Rollback created Auth user if database record creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      throw dbError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Account creation failed";
    return jsonResponse({ error: message }, 500);
  }
});

