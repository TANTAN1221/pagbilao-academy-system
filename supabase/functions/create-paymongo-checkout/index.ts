import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
  const envSuccessUrl = Deno.env.get("PAYMONGO_SUCCESS_URL");
  const envFailedUrl = Deno.env.get("PAYMONGO_FAILED_URL");

  if (!PAYMONGO_SECRET_KEY) {
    return jsonResponse({
      error: "PAYMONGO_SECRET_KEY is not set yet.",
      setup_needed: true
    }, 503);
  }

  try {
    const body = await req.json();
    const amount = Math.round(Number(body.amount));
    const rawDescription = String(body.description || "Pagbilao Academy Payment").trim();
    const description = rawDescription.slice(0, 255);
    const studentId = body.studentId || body.student_id || "unknown";
    const studentDbId = body.studentDbId || body.student_db_id || "";
    const studentEmail = body.email || body.studentEmail || body.student_email || "";
    const studentName = body.studentName || body.student_name || body.name || "";
    const schoolYear = body.schoolYear || body.school_year || "2026-2027";
    const feeBreakdown = Array.isArray(body.feeBreakdown)
      ? body.feeBreakdown.join(", ").slice(0, 255)
      : String(body.fee_breakdown || "");

    if (!Number.isFinite(amount) || amount < 100) {
      return jsonResponse({ error: "Amount must be in centavos and at least 100 (PHP 1.00)." }, 400);
    }

    let callerOrigin = "";
    try {
      callerOrigin = req.headers.get("origin") || (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : "");
    } catch (_) {}

    const fallbackSuccess = callerOrigin ? `${callerOrigin}/student-dashboard.html?payment=success` : (envSuccessUrl || "http://localhost:5500/student-dashboard.html?payment=success");
    const fallbackFailed = callerOrigin ? `${callerOrigin}/student-dashboard.html?payment=failed` : (envFailedUrl || "http://localhost:5500/student-dashboard.html?payment=failed");

    const successUrl = body.success_url || body.successUrl || fallbackSuccess;
    const cancelUrl = body.cancel_url || body.cancelUrl || fallbackFailed;

    const configuredMethods = (Deno.env.get("PAYMONGO_PAYMENT_METHODS") || "")
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean);
    const paymentMethodTypes = configuredMethods.length > 0
      ? configuredMethods
      : ["qrph", "gcash", "paymaya", "card"];

    const auth = btoa(`${PAYMONGO_SECRET_KEY}:`);

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                currency: "PHP",
                amount,
                name: description,
                quantity: 1
              }
            ],
            payment_method_types: paymentMethodTypes,
            success_url: successUrl,
            cancel_url: cancelUrl,
            description,
            metadata: {
              student_id: String(studentId),
              student_db_id: String(studentDbId),
              student_email: String(studentEmail),
              student_name: String(studentName),
              school_year: String(schoolYear),
              fee_breakdown: feeBreakdown,
              source: "pagbilao_academy_payment_clearance_system"
            }
          }
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      const apiDetail = result?.errors?.[0]?.detail || result?.errors?.[0]?.code || "PayMongo checkout creation failed";
      return jsonResponse({ error: apiDetail, details: result }, response.status);
    }

    return jsonResponse({
      checkout_session_id: result.data?.id,
      checkout_url: result.data?.attributes?.checkout_url,
      raw: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected checkout error";
    return jsonResponse({ error: message }, 500);
  }
});
