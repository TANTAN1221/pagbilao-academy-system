import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
  const SUCCESS_URL = Deno.env.get("PAYMONGO_SUCCESS_URL") || "http://localhost:5500/student-dashboard.html?payment=success";
  const FAILED_URL = Deno.env.get("PAYMONGO_FAILED_URL") || "http://localhost:5500/student-dashboard.html?payment=failed";

  if (!PAYMONGO_SECRET_KEY) {
    return jsonResponse({
      error: "PAYMONGO_SECRET_KEY is not set yet.",
      setup_needed: true
    }, 503);
  }

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const description = body.description || "Pagbilao Academy Payment";
    const studentId = body.studentId || "unknown";

    if (!amount || amount < 100) {
      return jsonResponse({ error: "Amount must be in centavos and at least 100." }, 400);
    }

    const successUrl = body.success_url || body.successUrl || SUCCESS_URL;
    const cancelUrl = body.cancel_url || body.cancelUrl || FAILED_URL;

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
            payment_method_types: ["qrph"],
            success_url: successUrl,
            cancel_url: cancelUrl,
            description,
            metadata: {
              student_id: studentId,
              source: "pagbilao_academy_payment_clearance_system"
            }
          }
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return jsonResponse({ error: "PayMongo checkout creation failed", details: result }, response.status);
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
