import { createClient } from "@supabase/supabase-js";
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

      if (studentId) {
        let studentQuery = supabaseAdmin.from("students").select("id");
        if (isUuid(studentId)) {
          studentQuery = studentQuery.or(`student_number.eq.${studentId},id.eq.${studentId}`);
        } else {
          studentQuery = studentQuery.eq("student_number", studentId);
        }

        const { data: student, error: studentLookupErr } = await studentQuery.maybeSingle();

        if (studentLookupErr) {
          console.error("Student lookup notice in webhook:", studentLookupErr);
        }

        if (student) {
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
              student_id: student.id,
              amount: amountInPesos,
              method: paymentSource,
              provider: "paymongo",
              checkout_session_id: checkoutId,
              status: "paid",
              paid_at: new Date().toISOString()
            });
          }
        }
      }
    }

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return jsonResponse({ error: message }, 500);
  }
});
