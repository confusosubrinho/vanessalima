import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// e-Rede API endpoints
const EREDE_SANDBOX_URL = "https://api.userede.com.br/desenvolvedores/v1";
const EREDE_PRODUCTION_URL = "https://api.userede.com.br/erede/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Rede credentials from store_settings
    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("rede_merchant_id, rede_merchant_key, rede_environment, max_installments, installments_without_interest, installment_interest_rate, min_installment_value, pix_discount, cash_discount")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error(`Settings error: ${settingsError.message}`);

    const merchantId = settings?.rede_merchant_id;
    const merchantKey = settings?.rede_merchant_key;

    if (!merchantId || !merchantKey) {
      return new Response(JSON.stringify({ error: "Credenciais da Rede não configuradas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    const isProduction = settings?.rede_environment === "production";
    const baseUrl = isProduction ? EREDE_PRODUCTION_URL : EREDE_SANDBOX_URL;

    // Basic Auth: base64(PV:key)
    const authToken = btoa(`${merchantId}:${merchantKey}`);

    if (action === "create_transaction") {
      // Create a credit card transaction
      const {
        order_id,
        amount, // in BRL (e.g., 199.90)
        installments = 1,
        card_number,
        card_holder,
        expiration_month,
        expiration_year,
        security_code,
      } = payload;

      const amountInCents = Math.round(amount * 100);

      const transactionBody: any = {
        capture: true,
        reference: order_id,
        amount: amountInCents,
        installments: installments,
        cardNumber: card_number.replace(/\s/g, ""),
        cardholderName: card_holder,
        expirationMonth: parseInt(expiration_month),
        expirationYear: parseInt(expiration_year),
        securityCode: security_code,
        softDescriptor: "VANESSALIMA",
        kind: "credit",
      };

      console.log("e-Rede transaction request for order:", order_id);

      const response = await fetch(`${baseUrl}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authToken}`,
        },
        body: JSON.stringify(transactionBody),
      });

      const data = await response.json();
      console.log("e-Rede response:", JSON.stringify(data));

      if (!response.ok || data.returnCode !== "00") {
        const errorMsg = data.returnMessage || data.message || "Transação recusada";
        return new Response(
          JSON.stringify({
            success: false,
            error: errorMsg,
            code: data.returnCode,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update order status on successful payment
      if (order_id) {
        await supabase
          .from("orders")
          .update({ status: "processing", notes: `TID: ${data.tid}` })
          .eq("id", order_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          tid: data.tid,
          nsu: data.nsu,
          authorization_code: data.authorizationCode,
          return_code: data.returnCode,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_payment_config") {
      // Return payment configuration for the frontend
      return new Response(
        JSON.stringify({
          max_installments: settings?.max_installments || 6,
          installments_without_interest: settings?.installments_without_interest || 3,
          installment_interest_rate: settings?.installment_interest_rate || 0,
          min_installment_value: settings?.min_installment_value || 30,
          pix_discount: settings?.pix_discount || 0,
          cash_discount: settings?.cash_discount || 0,
          gateway_configured: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "query_transaction") {
      const { tid } = payload;
      const response = await fetch(`${baseUrl}/transactions/${tid}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${authToken}`,
        },
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Payment error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao processar pagamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
