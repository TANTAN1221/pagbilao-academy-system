import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || "").trim());
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Promise<boolean> {
  if (!webhookSecret) return false;
  if (!signatureHeader) return false;
  try {
    const parts = signatureHeader.split(",").map((p) => p.trim());
    const getVal = (prefix: string) => {
      const match = parts.find((p) => p.startsWith(prefix));
      return match ? match.slice(prefix.length).trim() : "";
    };

    const timestamp = getVal("t=");
    const teSig = getVal("te=");
    const liSig = getVal("li=");
    const candidates = [liSig, teSig].filter(Boolean);

    if (!timestamp || candidates.length === 0) return false;

    const payload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret.trim());

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const payloadBytes = encoder.encode(payload);

    for (const sigHex of candidates) {
      if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length % 2 !== 0) continue;
      const sigBytes = new Uint8Array(
        sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      if (sigBytes.length === 0) continue;
      const verified = await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        sigBytes,
        payloadBytes
      );
      if (verified) return true;
    }

    return false;
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const PAYMONGO_WEBHOOK_SECRET_KEY = Deno.env.get("PAYMONGO_WEBHOOK_SECRET_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase service credentials are not set." }, 503);
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paymongo-signature");

  if (!PAYMONGO_WEBHOOK_SECRET_KEY) {
    return jsonResponse({ error: "PAYMONGO_WEBHOOK_SECRET_KEY is not configured." }, 503);
  }
  const isValid = await verifySignature(rawBody, signatureHeader, PAYMONGO_WEBHOOK_SECRET_KEY);
  if (!isValid) {
    return jsonResponse({ error: "Invalid or missing PayMongo webhook signature" }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type || event?.data?.attributes?.event_type || "unknown";
    const resource = event?.data?.attributes?.data || event?.data;
    const isPaymentResource = resource?.type === "payment";
    const checkoutId = isPaymentResource
      ? (resource?.attributes?.checkout_session_id || resource?.id || null)
      : (resource?.id || resource?.attributes?.checkout_session_id || null);
    const metadata = resource?.attributes?.metadata || {};
    const paymentsArr = resource?.attributes?.payments || [];
    const paymentObj = isPaymentResource ? resource : (paymentsArr[0] || {});
    const paymentAttr = paymentObj?.attributes || {};

    const rawStatus = paymentAttr.status || resource?.attributes?.status || "received";
    const amountInCentavos = Number(
      paymentAttr.amount ||
      resource?.attributes?.amount ||
      resource?.attributes?.line_items?.[0]?.amount ||
      0
    );
    const amountInPesos = amountInCentavos > 0 ? amountInCentavos / 100 : 0;
    const paymentSource = paymentAttr.source?.type || resource?.attributes?.source?.type || "paymongo";
    const providerRef = paymentObj?.id || checkoutId || null;
    const studentDbId = metadata.student_db_id || metadata.studentDbId || null;
    const studentId = metadata.student_id || metadata.studentId || null;
    const studentEmail = metadata.student_email || metadata.email || null;
    const studentName = metadata.student_name || metadata.name || null;

    // Log event into database (best-effort audit log)
    const { error: eventLogErr } = await supabaseAdmin.from("payment_gateway_events").insert({
      provider: "paymongo",
      event_type: eventType,
      checkout_session_id: checkoutId,
      status: String(rawStatus),
      metadata,
      raw_event: event
    });
    if (eventLogErr) {
      console.warn("payment_gateway_events insert notice:", eventLogErr.message);
    }

    // Check if this event indicates a successful payment
    const isPaidEvent =
      ["paid", "succeeded", "completed", "checkout_session.payment.paid", "payment.paid"].includes(String(rawStatus).toLowerCase()) ||
      String(eventType).toLowerCase().includes("paid");

    if (isPaidEvent) {
      if (checkoutId) {
        const { error: updateErr } = await supabaseAdmin
          .from("payments")
          .update({
            status: "paid",
            method: paymentSource,
            provider_reference: providerRef,
            paid_at: new Date().toISOString()
          })
          .eq("checkout_session_id", checkoutId);
        if (updateErr) {
          throw new Error(`Failed updating existing payment: ${updateErr.message}`);
        }
      }

      let student = null;

      if (studentDbId && isUuid(studentDbId)) {
        const { data: foundByDbId } = await supabaseAdmin
          .from("students")
          .select("id, student_number, email")
          .eq("id", String(studentDbId).trim())
          .maybeSingle();
        if (foundByDbId) student = foundByDbId;
      }

      if (!student && studentId) {
        const cleanSid = String(studentId).trim();
        let studentQuery = supabaseAdmin.from("students").select("id, student_number, email");
        if (isUuid(cleanSid)) {
          studentQuery = studentQuery.or(`student_number.eq.${cleanSid},id.eq.${cleanSid},auth_user_id.eq.${cleanSid}`);
        } else {
          studentQuery = studentQuery.eq("student_number", cleanSid);
        }

        const { data: foundStudent, error: studentErr } = await studentQuery.limit(1).maybeSingle();
        if (studentErr) console.warn("Student lookup by studentId error:", studentErr.message);
        if (foundStudent) student = foundStudent;
      }

      if (!student && studentEmail) {
        const { data: foundByEmail, error: emailErr } = await supabaseAdmin
          .from("students")
          .select("id, student_number, email")
          .ilike("email", String(studentEmail).trim())
          .limit(1)
          .maybeSingle();
        if (emailErr) console.warn("Student lookup by email error:", emailErr.message);
        if (foundByEmail) student = foundByEmail;
      }

      // If student not found in students table, check student_registration_requests and auto-sync
      if (!student && (studentId || studentEmail)) {
        let reqQuery = supabaseAdmin.from("student_registration_requests").select("*");
        if (studentEmail) {
          reqQuery = reqQuery.ilike("email", String(studentEmail).trim());
        } else if (isUuid(String(studentId))) {
          reqQuery = reqQuery.or(`student_number.eq.${studentId},auth_user_id.eq.${studentId}`);
        } else {
          reqQuery = reqQuery.eq("student_number", String(studentId).trim());
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
              school_year: metadata.school_year || metadata.schoolYear || "2026-2027",
              status: "active"
            })
            .select("id, student_number, email")
            .maybeSingle();
          if (regSyncErr) console.warn("Auto-sync student from registration error:", regSyncErr.message);
          if (newS) student = newS;
        }
      }

      let existingPayment = null;
      if (checkoutId) {
        const { data: foundPayment } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("checkout_session_id", checkoutId)
          .maybeSingle();
        existingPayment = foundPayment;
      }

      if (!existingPayment && amountInPesos > 0) {
        if (!student) {
          throw new Error(`Unable to match payment to a student record (studentId=${studentId}, email=${studentEmail}).`);
        }

        const basePayload = {
          student_id: student.id,
          amount: amountInPesos,
          method: paymentSource,
          provider: "paymongo",
          provider_reference: providerRef,
          checkout_session_id: checkoutId,
          school_year: metadata.school_year || metadata.schoolYear || "2026-2027",
          status: "paid",
          paid_at: new Date().toISOString()
        };

        let { error: insertErr } = await supabaseAdmin.from("payments").insert(basePayload);
        if (insertErr && /school_year/i.test(insertErr.message || "")) {
          const { school_year: _ignored, ...legacyPayload } = basePayload;
          const retryRes = await supabaseAdmin.from("payments").insert(legacyPayload);
          insertErr = retryRes.error;
        }
        if (insertErr) {
          throw new Error(`Failed inserting payment record: ${insertErr.message}`);
        }
      }
    }

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("PayMongo webhook error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
