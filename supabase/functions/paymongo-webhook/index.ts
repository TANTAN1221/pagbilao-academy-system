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
  if (!webhookSecret) return true;
  if (!signatureHeader) return false;
  try {
    const parts = signatureHeader.split(",");
    const tPart = parts.find((p) => p.startsWith("t="));
    const tePart = parts.find((p) => p.startsWith("te="));
    const liPart = parts.find((p) => p.startsWith("li="));

    const timestamp = tPart ? tPart.split("=")[1] : "";
    const signature = tePart
      ? tePart.split("=")[1]
      : liPart
      ? liPart.split("=")[1]
      : "";

    if (!timestamp || !signature) return false;

    const payload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify", "sign"]
    );

    const sigHex = signature.trim();
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      sigBytes,
      encoder.encode(payload)
    );
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

  if (PAYMONGO_WEBHOOK_SECRET_KEY) {
    const isValid = await verifySignature(rawBody, signatureHeader, PAYMONGO_WEBHOOK_SECRET_KEY);
    if (!isValid) {
      return jsonResponse({ error: "Invalid or missing PayMongo webhook signature" }, 401);
    }
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type || event?.data?.attributes?.event_type || "unknown";
    const sessionData = event?.data?.attributes?.data || event?.data;
    const checkoutId = sessionData?.id || sessionData?.attributes?.checkout_session_id || null;
    const metadata = sessionData?.attributes?.metadata || {};
    const paymentsArr = sessionData?.attributes?.payments || [];
    const paymentObj = paymentsArr[0] || {};
    const paymentAttr = paymentObj.attributes || {};

    const rawStatus = paymentAttr.status || sessionData?.attributes?.status || "received";
    const amountInCentavos = Number(paymentAttr.amount || sessionData?.attributes?.line_items?.[0]?.amount || 0);
    const amountInPesos = amountInCentavos > 0 ? amountInCentavos / 100 : 0;
    const paymentSource = paymentAttr.source?.type || "paymongo";
    const studentId = metadata.student_id || metadata.studentId || null;
    const studentEmail = metadata.student_email || metadata.email || null;
    const studentName = metadata.student_name || metadata.name || null;

    // Log event into database
    await supabaseAdmin.from("payment_gateway_events").insert({
      provider: "paymongo",
      event_type: eventType,
      checkout_session_id: checkoutId,
      status: String(rawStatus),
      metadata,
      raw_event: event
    });

    // Check if this event indicates a successful payment
    if (["paid", "succeeded", "completed", "checkout_session.payment.paid"].includes(String(rawStatus).toLowerCase()) || String(eventType).includes("paid")) {
      if (checkoutId) {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "paid",
            method: paymentSource,
            paid_at: new Date().toISOString()
          })
          .eq("checkout_session_id", checkoutId);
      }

      let student = null;

      if (studentId) {
        let studentQuery = supabaseAdmin.from("students").select("id, student_number, email");
        if (isUuid(studentId)) {
          studentQuery = studentQuery.or(`student_number.eq.${studentId},id.eq.${studentId},auth_user_id.eq.${studentId}`);
        } else {
          studentQuery = studentQuery.or(`student_number.eq.${studentId},id.eq.${studentId}`);
        }

        const { data: foundStudent } = await studentQuery.maybeSingle();
        if (foundStudent) student = foundStudent;
      }

      if (!student && studentEmail) {
        const { data: foundByEmail } = await supabaseAdmin
          .from("students")
          .select("id, student_number, email")
          .eq("email", studentEmail)
          .maybeSingle();
        if (foundByEmail) student = foundByEmail;
      }

      // If student not found in students table, check student_registration_requests and auto-sync
      if (!student && (studentId || studentEmail)) {
        let reqQuery = supabaseAdmin.from("student_registration_requests").select("*");
        if (studentEmail) {
          reqQuery = reqQuery.eq("email", studentEmail);
        } else if (isUuid(studentId)) {
          reqQuery = reqQuery.or(`student_number.eq.${studentId},auth_user_id.eq.${studentId}`);
        } else {
          reqQuery = reqQuery.eq("student_number", studentId);
        }

        const { data: regReq } = await reqQuery.maybeSingle();
        if (regReq) {
          const { data: newS } = await supabaseAdmin
            .from("students")
            .insert({
              student_number: regReq.student_number || `STU-${Date.now()}`,
              auth_user_id: regReq.auth_user_id || null,
              first_name: regReq.first_name || (studentName ? studentName.split(' ')[0] : 'Student'),
              last_name: regReq.last_name || (studentName ? studentName.split(' ').slice(1).join(' ') : 'Account'),
              email: regReq.email || studentEmail || `${regReq.student_number || 'stu'}@pagbilao.edu.ph`,
              education_level: regReq.education_level || "SHS",
              grade_level: regReq.grade_level || "Grade 11",
              section_name: regReq.section_name || "Humility",
              strand: regReq.strand || "GAS",
              school_year: "2026-2027",
              status: "active"
            })
            .select("id, student_number, email")
            .maybeSingle();
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
        await supabaseAdmin.from("payments").insert({
          student_id: student ? student.id : null,
          amount: amountInPesos,
          method: paymentSource,
          provider: "paymongo",
          checkout_session_id: checkoutId,
          status: "paid",
          paid_at: new Date().toISOString()
        });
      }
    }

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return jsonResponse({ error: message }, 500);
  }
});
