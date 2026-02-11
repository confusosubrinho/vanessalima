import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Appmax API endpoints
const APPMAX_PRODUCTION_URL = "https://admin.appmax.com.br/api/v3";
const APPMAX_SANDBOX_URL = "https://homolog.sandboxappmax.com.br/api/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Appmax credentials from store_settings
    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("appmax_access_token, appmax_environment, max_installments, installments_without_interest, installment_interest_rate, min_installment_value, pix_discount, cash_discount")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error(`Settings error: ${settingsError.message}`);

    const accessToken = settings?.appmax_access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Credenciais da Appmax não configuradas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    const isProduction = settings?.appmax_environment === "production";
    const baseUrl = isProduction ? APPMAX_PRODUCTION_URL : APPMAX_SANDBOX_URL;

    // Helper to make Appmax API calls
    async function appmaxFetch(endpoint: string, body: Record<string, unknown>) {
      const response = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, "access-token": accessToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.text || data.message || `Appmax API error [${response.status}]`);
      }
      return data;
    }

    // ─── Action: create_transaction (full flow: customer → order → payment) ───
    if (action === "create_transaction") {
      const {
        order_id,
        amount,
        installments = 1,
        card_number,
        card_holder,
        expiration_month,
        expiration_year,
        security_code,
        customer_name,
        customer_email,
        customer_phone,
        customer_cpf,
        shipping_zip,
        shipping_address,
        shipping_number,
        shipping_complement,
        shipping_neighborhood,
        shipping_city,
        shipping_state,
        payment_method = "credit-card", // credit-card | pix | boleto
        products = [],
      } = payload;

      console.log("Appmax transaction for order:", order_id, "method:", payment_method);

      // Step 1: Create customer
      const nameParts = (customer_name || "Cliente").split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || firstName;

      const customerData = await appmaxFetch("customer", {
        firstname: firstName,
        lastname: lastName,
        email: customer_email || "cliente@loja.com",
        telephone: (customer_phone || "").replace(/\D/g, ""),
        ip: "0.0.0.0",
        postcode: (shipping_zip || "").replace(/\D/g, ""),
        address_street: shipping_address || "",
        address_street_number: shipping_number || "0",
        address_street_complement: shipping_complement || "",
        address_street_district: shipping_neighborhood || "",
        address_city: shipping_city || "",
        address_state: shipping_state || "",
      });

      const customerId = customerData.data?.id;
      if (!customerId) throw new Error("Falha ao criar cliente na Appmax");

      console.log("Appmax customer created:", customerId);

      // Step 2: Create order
      const orderProducts = products.length > 0 ? products.map((p: any) => ({
        sku: p.sku || p.product_id || "SKU001",
        name: p.name || "Produto",
        qty: p.quantity || 1,
        price: p.price || 0,
      })) : [{ sku: "ORDER", name: "Pedido", qty: 1, price: amount }];

      const orderData = await appmaxFetch("order", {
        customer_id: customerId,
        total: amount,
        products: orderProducts,
      });

      const appmaxOrderId = orderData.data?.id;
      if (!appmaxOrderId) throw new Error("Falha ao criar pedido na Appmax");

      console.log("Appmax order created:", appmaxOrderId);

      // Step 3: Process payment based on method
      let paymentEndpoint: string;
      let paymentBody: Record<string, unknown> = {
        cart: { order_id: appmaxOrderId },
        customer: { customer_id: customerId },
      };

      if (payment_method === "pix") {
        paymentEndpoint = "payment/pix";
        paymentBody.payment = {
          pix: {
            document_number: (customer_cpf || "").replace(/\D/g, ""),
          },
        };
      } else if (payment_method === "boleto") {
        paymentEndpoint = "payment/Boleto";
        paymentBody.payment = {
          Boleto: {
            document_number: (customer_cpf || "").replace(/\D/g, ""),
          },
        };
      } else {
        // credit-card
        paymentEndpoint = "payment/CreditCard";
        paymentBody.payment = {
          CreditCard: {
            number: (card_number || "").replace(/\s/g, ""),
            cvv: security_code || "",
            month: parseInt(expiration_month) || 1,
            year: parseInt(expiration_year) || 2025,
            name: card_holder || customer_name || "",
            document_number: (customer_cpf || "").replace(/\D/g, ""),
            installments: installments,
            soft_descriptor: "VANESSALIMA",
          },
        };
      }

      console.log("Appmax payment endpoint:", paymentEndpoint);

      const paymentData = await appmaxFetch(paymentEndpoint, paymentBody);

      console.log("Appmax payment response:", JSON.stringify(paymentData));

      // Update order status on success
      if (order_id) {
        await supabase
          .from("orders")
          .update({
            status: "processing",
            notes: `Appmax Order: ${appmaxOrderId} | Ref: ${paymentData.data?.pay_reference || "N/A"}`,
          })
          .eq("id", order_id);
      }

      // Build response based on payment type
      const result: Record<string, unknown> = {
        success: true,
        appmax_order_id: appmaxOrderId,
        pay_reference: paymentData.data?.pay_reference,
      };

      if (payment_method === "pix" && paymentData.data) {
        result.pix_qrcode = paymentData.data.pix_qrcode;
        result.pix_emv = paymentData.data.pix_emv;
        result.pix_expiration_date = paymentData.data.pix_expiration_date;
      }

      if (payment_method === "boleto" && paymentData.data) {
        result.boleto_url = paymentData.data.pdf;
        result.boleto_digitable_line = paymentData.data.digitable_line;
        result.boleto_due_date = paymentData.data.due_date;
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: get_payment_config ───
    if (action === "get_payment_config") {
      return new Response(
        JSON.stringify({
          max_installments: settings?.max_installments || 6,
          installments_without_interest: settings?.installments_without_interest || 3,
          installment_interest_rate: settings?.installment_interest_rate || 0,
          min_installment_value: settings?.min_installment_value || 30,
          pix_discount: settings?.pix_discount || 0,
          cash_discount: settings?.cash_discount || 0,
          gateway_configured: true,
          gateway: "appmax",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: tokenize_card ───
    if (action === "tokenize_card") {
      const { card_number, card_cvv, card_month, card_year, card_name } = payload;
      const tokenData = await appmaxFetch("tokenize/card", {
        number: (card_number || "").replace(/\s/g, ""),
        cvv: card_cvv,
        month: parseInt(card_month),
        year: parseInt(card_year),
        name: card_name,
      });
      return new Response(JSON.stringify({ success: true, token: tokenData.data?.token }), {
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
