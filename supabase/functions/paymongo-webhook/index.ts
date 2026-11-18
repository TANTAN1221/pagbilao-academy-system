import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { settlePaymongoPayment } from "../_shared/paymongo-settle.ts";

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
      await settlePaymongoPayment(supabaseAdmin, {
        checkoutId,
        providerRef,
        amountInPesos,
        paymentSource,
        metadata
      });
    }

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("PayMongo webhook error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
