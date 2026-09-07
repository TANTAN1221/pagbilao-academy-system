import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const adminRoles = ["super_admin", "accounting_admin", "registrar"];
const staffRoles = [...adminRoles, "teacher_clearance_head", "guidance_head", "prefect_head", "librarian_head", "principal"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return jsonResponse({ error: "Supabase service credentials are not set." }, 503);
    const admin = createClient(url, serviceKey);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller.user) return jsonResponse({ error: "Please sign in as an administrator." }, 401);
    const { data: callerProfile, error: callerError } = await admin.from("profiles")
      .select("role,status").eq("auth_user_id", caller.user.id).maybeSingle();
    if (callerError) throw callerError;
    if (!callerProfile || !adminRoles.includes(callerProfile.role) || callerProfile.status !== "active") {
      return jsonResponse({ error: "Only active admin, accounting, or registrar accounts can save staff accounts." }, 403);
    }
    const body = await req.json();
    const action = body.action || "create";
    if (!["create", "update"].includes(action)) return jsonResponse({ error: "Invalid account action." }, 400);
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "");
    if (!fullName || !email || !staffRoles.includes(role)) {
      return jsonResponse({ error: "A name, email, and valid staff role are required." }, 400);
    }
    const schoolYear = String(body.school_year || "2026-2027");
    const assignments = body.assignments === undefined ? null : body.assignments;
    if (assignments !== null && !Array.isArray(assignments)) return jsonResponse({ error: "Assignments must be a list." }, 400);
    let userId: string | null = null;
    let createdUser = false;
    let existingEmail = email;
    if (action === "update") {
      const { data: profile, error } = await admin.from("profiles")
        .select("id,auth_user_id,email").eq("id", body.profile_id).single();
      if (error || !profile) return jsonResponse({ error: "Account profile not found. Reload accounts and try again." }, 404);
      userId = profile.auth_user_id;
      existingEmail = profile.email;
    }
    // Recover partial creation using the real Auth identity, never a browser-generated ID.
    if (!userId) {
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        const existing = data.users.find(user => user.email?.toLowerCase() === existingEmail.toLowerCase());
        if (existing) { userId = existing.id; break; }
        if (data.users.length < 100) break;
      }
    }
    if (action === "create" && userId) {
      const { data: linked, error } = await admin.from("profiles").select("id")
        .eq("auth_user_id", userId).maybeSingle();
      if (error) throw error;
      if (linked) return jsonResponse({ error: "This account already exists. Reload Accounts and edit it to update assignments." }, 409);
    }
    if (action === "update" && existingEmail.toLowerCase() !== email) {
      return jsonResponse({ error: "Keep the existing sign-in email when editing assignments or account details." }, 400);
    }
    let temporaryPassword: string | undefined;
    if (!userId) {
      temporaryPassword = body.temporary_password || crypto.randomUUID().slice(0, 12) + "Pa!";
      const { data, error } = await admin.auth.admin.createUser({
        email, password: temporaryPassword, email_confirm: true,
        user_metadata: { full_name: fullName, role }
      });
      if (error || !data.user) throw error || new Error("Failed to create authentication account.");
      userId = data.user.id;
      createdUser = true;
    } else if (body.temporary_password && action === "update") {
      return jsonResponse({ error: "Leave Temporary Password blank when editing. Use the password reset flow to change credentials." }, 400);
    }
    const { data: profileId, error: saveError } = await admin.rpc("save_school_account_links", {
      p_auth_user_id: userId, p_full_name: fullName, p_email: email, p_role: role,
      p_status: body.active === false ? "inactive" : "active", p_school_year: schoolYear,
      p_assignments: assignments, p_created_by: caller.user.id
    });
    if (saveError || !profileId) {
      // Only a definite database rejection is safe to clean up. A transport
      // failure can occur after commit; preserve that identity for a retry.
      if (createdUser && saveError?.code) await admin.auth.admin.deleteUser(userId);
      throw saveError || new Error("Account links were not saved.");
    }
    return jsonResponse({
      user_id: userId, profile_id: profileId, email, temporary_password: temporaryPassword,
      recovered: action === "create" && !createdUser,
      message: createdUser ? "Account and assignments created." : "Account and assignments saved. Existing password unchanged."
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message :
      (error as { message?: string })?.message || "Account save failed";
    return jsonResponse({ error: message }, 500);
  }
});
