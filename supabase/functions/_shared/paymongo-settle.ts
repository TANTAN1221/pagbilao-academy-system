import { createClient } from "npm:@supabase/supabase-js@2";

export function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || "").trim());
}

export interface PaymongoCheckoutSettleInput {
  checkoutId: string | null;
  providerRef?: string | null;
  amountInPesos: number;
  paymentSource?: string;
  metadata?: Record<string, unknown>;
}

export async function settlePaymongoPayment(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: PaymongoCheckoutSettleInput
) {
  const {
    checkoutId,
    providerRef = null,
    amountInPesos,
    paymentSource = "paymongo",
    metadata = {}
  } = input;

  const studentDbId = String(metadata.student_db_id || metadata.studentDbId || "").trim() || null;
  const studentId = String(metadata.student_id || metadata.studentId || "").trim() || null;
  const studentEmail = String(metadata.student_email || metadata.email || "").trim() || null;
  const studentName = String(metadata.student_name || metadata.name || "").trim() || null;
  const schoolYear = String(metadata.school_year || metadata.schoolYear || "2026-2027").trim() || "2026-2027";

  if (checkoutId) {
    const { data: existingPaid } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("checkout_session_id", checkoutId)
      .maybeSingle();

    if (existingPaid && String(existingPaid.status || "").toLowerCase() === "paid") {
      return existingPaid;
    }

    if (existingPaid) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("payments")
        .update({
          status: "paid",
          method: paymentSource,
          provider_reference: providerRef || existingPaid.provider_reference || checkoutId,
          paid_at: new Date().toISOString()
        })
        .eq("checkout_session_id", checkoutId)
        .select("*")
        .maybeSingle();
      if (updateErr) {
        throw new Error(`Failed updating existing payment: ${updateErr.message}`);
      }
      return updated || existingPaid;
    }
  }

  let student: { id: string; student_number: string; email: string | null } | null = null;

  if (studentDbId && isUuid(studentDbId)) {
    const { data: foundByDbId } = await supabaseAdmin
      .from("students")
      .select("id, student_number, email")
      .eq("id", studentDbId)
      .maybeSingle();
    if (foundByDbId) student = foundByDbId;
  }

  if (!student && studentId) {
    let studentQuery = supabaseAdmin.from("students").select("id, student_number, email");
    if (isUuid(studentId)) {
      studentQuery = studentQuery.or(`student_number.eq.${studentId},id.eq.${studentId},auth_user_id.eq.${studentId}`);
    } else {
      studentQuery = studentQuery.eq("student_number", studentId);
    }

    const { data: foundStudent, error: studentErr } = await studentQuery.limit(1).maybeSingle();
    if (studentErr) console.warn("Student lookup by studentId error:", studentErr.message);
    if (foundStudent) student = foundStudent;
  }

  if (!student && studentEmail) {
    const { data: foundByEmail, error: emailErr } = await supabaseAdmin
      .from("students")
      .select("id, student_number, email")
      .ilike("email", studentEmail)
      .limit(1)
      .maybeSingle();
    if (emailErr) console.warn("Student lookup by email error:", emailErr.message);
    if (foundByEmail) student = foundByEmail;
  }

  if (!student && (studentId || studentEmail)) {
    let reqQuery = supabaseAdmin.from("student_registration_requests").select("*");
    if (studentEmail) {
      reqQuery = reqQuery.ilike("email", studentEmail);
    } else if (studentId && isUuid(studentId)) {
      reqQuery = reqQuery.or(`student_number.eq.${studentId},auth_user_id.eq.${studentId}`);
    } else if (studentId) {
      reqQuery = reqQuery.eq("student_number", studentId);
    }

    const { data: regReq } = await reqQuery.limit(1).maybeSingle();
    if (regReq) {
      const { data: newS, error: regSyncErr } = await supabaseAdmin
        .from("students")
        .insert({
          student_number: regReq.student_number || `STU-${Date.now()}`,
          auth_user_id: regReq.auth_user_id || null,
          first_name: regReq.first_name || (studentName ? studentName.split(" ")[0] : "Student"),
          last_name: regReq.last_name || (studentName ? studentName.split(" ").slice(1).join(" ") : "Account"),
          email: regReq.email || studentEmail || `${regReq.student_number || "stu"}@pagbilao.edu.ph`,
          education_level: regReq.education_level || "JHS",
          grade_level: regReq.grade_level || "Grade 7",
          section_name: regReq.section_name || "N/A",
          strand: regReq.strand || "N/A",
          school_year: schoolYear,
          status: "active"
        })
        .select("id, student_number, email")
        .maybeSingle();
      if (regSyncErr) console.warn("Auto-sync student from registration error:", regSyncErr.message);
      if (newS) student = newS;
    }
  }

  if (!student) {
    throw new Error(`Unable to match payment to a student record (studentId=${studentId}, email=${studentEmail}).`);
  }

  if (amountInPesos <= 0) {
    return null;
  }

  const basePayload = {
    student_id: student.id,
    amount: amountInPesos,
    method: paymentSource,
    provider: "paymongo",
    provider_reference: providerRef || checkoutId,
    checkout_session_id: checkoutId,
    school_year: schoolYear,
    status: "paid",
    paid_at: new Date().toISOString()
  };

  let { data: inserted, error: insertErr } = await supabaseAdmin
    .from("payments")
    .insert(basePayload)
    .select("*")
    .maybeSingle();

  if (insertErr && /school_year/i.test(insertErr.message || "")) {
    const { school_year: _ignored, ...legacyPayload } = basePayload;
    const retryRes = await supabaseAdmin
      .from("payments")
      .insert(legacyPayload)
      .select("*")
      .maybeSingle();
    inserted = retryRes.data;
    insertErr = retryRes.error;
  }

  if (insertErr) {
    throw new Error(`Failed inserting payment record: ${insertErr.message}`);
  }

  return inserted;
}

