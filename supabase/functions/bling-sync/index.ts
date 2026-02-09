import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

async function getValidToken(supabase: any): Promise<{ token: string; settingsId: string }> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado. Autorize o aplicativo primeiro nas Integrações.");

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  const isExpired = expiresAt.getTime() - 300000 < Date.now();

  if (isExpired && settings.bling_refresh_token) {
    console.log("Bling token expired, refreshing...");
    const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);

    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: settings.bling_refresh_token,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Falha ao renovar token do Bling. Reconecte nas Integrações.");
    }

    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString();

    await supabase
      .from("store_settings")
      .update({
        bling_access_token: tokenData.access_token,
        bling_refresh_token: tokenData.refresh_token,
        bling_token_expires_at: newExpiresAt,
      } as any)
      .eq("id", settings.id);

    return { token: tokenData.access_token, settingsId: settings.id };
  }

  return { token: settings.bling_access_token, settingsId: settings.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();
    const { token } = await getValidToken(supabase);

    const blingHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    // ─── Create Order in Bling ───
    if (action === "create_order") {
      const { order_id } = payload;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", order_id)
        .maybeSingle();

      if (orderError || !order) {
        throw new Error(`Pedido não encontrado: ${orderError?.message || order_id}`);
      }

      // Extract CPF from notes if available
      const cpfMatch = order.notes?.match(/CPF:\s*([\d.\-]+)/);
      const cpf = cpfMatch ? cpfMatch[1].replace(/\D/g, "") : "";

      const blingOrder = {
        numero: 0, // Bling auto-generates
        data: new Date(order.created_at).toISOString().split("T")[0],
        dataSaida: new Date().toISOString().split("T")[0],
        contato: {
          nome: order.shipping_name,
          tipoPessoa: "F",
          numeroDocumento: cpf,
          contribuinte: 9, // Non-contributor
        },
        itens: (order as any).order_items?.map((item: any) => ({
          descricao: item.product_name,
          quantidade: item.quantity,
          valor: item.unit_price,
          codigo: item.product_id?.substring(0, 8) || "PROD",
        })) || [],
        transporte: {
          fretePorConta: 0,
          frete: order.shipping_cost || 0,
          volumes: [{
            servico: "Transportadora",
          }],
          contato: {
            nome: order.shipping_name,
          },
          etiqueta: {
            nome: order.shipping_name,
            endereco: order.shipping_address,
            municipio: order.shipping_city,
            uf: order.shipping_state,
            cep: order.shipping_zip?.replace(/\D/g, ""),
          },
        },
        parcelas: [{
          valor: order.total_amount,
          dataVencimento: new Date().toISOString().split("T")[0],
          observacao: "Pagamento online",
        }],
        observacoes: `Pedido ${order.order_number} - Loja Online`,
        observacoesInternas: order.notes || "",
        numeroPedidoCompra: order.order_number,
      };

      console.log("Creating Bling order:", JSON.stringify(blingOrder));

      const response = await fetch(`${BLING_API_URL}/pedidos/vendas`, {
        method: "POST",
        headers: blingHeaders,
        body: JSON.stringify(blingOrder),
      });

      const data = await response.json();
      console.log("Bling create order response:", JSON.stringify(data));

      if (!response.ok) {
        throw new Error(`Bling API error [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          bling_order_id: data?.data?.id,
          message: "Pedido criado no Bling",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Generate NF-e from Order ───
    if (action === "generate_nfe") {
      const { bling_order_id } = payload;

      if (!bling_order_id) throw new Error("ID do pedido no Bling é obrigatório");

      const response = await fetch(`${BLING_API_URL}/nfe`, {
        method: "POST",
        headers: blingHeaders,
        body: JSON.stringify({
          tipo: 1, // Saída
          idPedidoVenda: parseInt(bling_order_id),
        }),
      });

      const data = await response.json();
      console.log("Bling NF-e response:", JSON.stringify(data));

      if (!response.ok) {
        throw new Error(`Bling NF-e error [${response.status}]: ${JSON.stringify(data)}`);
      }

      const nfeId = data?.data?.id;

      // Emit NF-e at SEFAZ
      if (nfeId) {
        const emitResponse = await fetch(`${BLING_API_URL}/nfe/${nfeId}/enviar`, {
          method: "POST",
          headers: blingHeaders,
        });
        const emitData = await emitResponse.json();
        console.log("Bling emit NF-e:", JSON.stringify(emitData));

        return new Response(
          JSON.stringify({ success: true, nfe_id: nfeId, message: "NF-e gerada e enviada à SEFAZ" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, nfe_id: nfeId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Full flow ───
    if (action === "order_to_nfe") {
      const { order_id } = payload;

      // Create order
      const createBody = JSON.stringify({ action: "create_order", order_id });
      const orderRes = await fetch(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") || "" },
        body: createBody,
      });
      const orderResult = await orderRes.json();
      if (!orderResult.success) {
        return new Response(JSON.stringify(orderResult), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate NF-e
      const nfeRes = await fetch(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") || "" },
        body: JSON.stringify({ action: "generate_nfe", bling_order_id: orderResult.bling_order_id }),
      });
      const nfeResult = await nfeRes.json();

      return new Response(
        JSON.stringify({
          success: true,
          bling_order_id: orderResult.bling_order_id,
          nfe: nfeResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Bling sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro na integração com Bling" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
