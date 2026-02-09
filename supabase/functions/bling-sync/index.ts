import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bling API v3 base URL
const BLING_API_URL = "https://www.bling.com.br/Api/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();

    // Get Bling API key from store_settings
    // For now we store it in a custom field; in future could be a secret
    const { data: settings } = await supabase
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    // Try to get API key from secrets first, then from integration config
    const blingApiKey = Deno.env.get("BLING_API_KEY");

    if (!blingApiKey) {
      return new Response(JSON.stringify({ error: "API Key do Bling não configurada. Adicione a chave nas integrações." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blingHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${blingApiKey}`,
      Accept: "application/json",
    };

    // ─── Create Order in Bling ───
    if (action === "create_order") {
      const { order_id } = payload;

      // Fetch order with items
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", order_id)
        .maybeSingle();

      if (orderError || !order) {
        throw new Error(`Pedido não encontrado: ${orderError?.message || order_id}`);
      }

      // Build Bling order payload (API v3 format)
      const blingOrder = {
        numero: order.order_number,
        data: new Date(order.created_at).toISOString().split("T")[0],
        dataSaida: new Date().toISOString().split("T")[0],
        loja: 0,
        numeroPedidoCompra: order.order_number,
        observacoes: order.notes || "",
        contato: {
          nome: order.shipping_name,
          tipoPessoa: "F",
          contribuinte: 1,
        },
        itens: (order as any).order_items?.map((item: any) => ({
          descricao: item.product_name,
          quantidade: item.quantity,
          valor: item.unit_price,
          codigo: item.product_id?.substring(0, 8) || "PROD",
        })) || [],
        transporte: {
          fretePorConta: 0, // 0 = remetente
          frete: order.shipping_cost || 0,
          volumes: [
            {
              servico: "SEDEX",
            },
          ],
        },
        parcelas: [
          {
            valor: order.total_amount,
            dataVencimento: new Date().toISOString().split("T")[0],
            observacao: "Pagamento online",
          },
        ],
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

      const blingOrderId = data?.data?.id;

      return new Response(
        JSON.stringify({
          success: true,
          bling_order_id: blingOrderId,
          message: "Pedido criado no Bling com sucesso",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Generate NF-e from Bling Order ───
    if (action === "generate_nfe") {
      const { bling_order_id } = payload;

      if (!bling_order_id) {
        throw new Error("ID do pedido no Bling é obrigatório");
      }

      // First, generate the NF-e from the order
      const response = await fetch(`${BLING_API_URL}/nfe`, {
        method: "POST",
        headers: blingHeaders,
        body: JSON.stringify({
          tipo: 1, // 1 = Saída (venda)
          idPedidoVenda: bling_order_id,
        }),
      });

      const data = await response.json();
      console.log("Bling generate NF-e response:", JSON.stringify(data));

      if (!response.ok) {
        throw new Error(`Bling NF-e error [${response.status}]: ${JSON.stringify(data)}`);
      }

      const nfeId = data?.data?.id;

      // Now emit/authorize the NF-e at SEFAZ
      if (nfeId) {
        const emitResponse = await fetch(`${BLING_API_URL}/nfe/${nfeId}/enviar`, {
          method: "POST",
          headers: blingHeaders,
        });

        const emitData = await emitResponse.json();
        console.log("Bling emit NF-e response:", JSON.stringify(emitData));

        return new Response(
          JSON.stringify({
            success: true,
            nfe_id: nfeId,
            message: "NF-e gerada e enviada à SEFAZ",
            emit_response: emitData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, nfe_id: nfeId, message: "NF-e criada no Bling" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Full flow: Create Order + Generate NF-e ───
    if (action === "order_to_nfe") {
      const { order_id } = payload;

      // Step 1: Create order in Bling
      const orderReq = await fetch(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_order", order_id }),
      });
      const orderResult = await orderReq.json();

      if (!orderResult.success) {
        return new Response(JSON.stringify(orderResult), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: Generate NF-e
      const nfeReq = await fetch(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_nfe", bling_order_id: orderResult.bling_order_id }),
      });
      const nfeResult = await nfeReq.json();

      return new Response(
        JSON.stringify({
          success: true,
          bling_order_id: orderResult.bling_order_id,
          nfe: nfeResult,
          message: "Pedido criado e NF-e gerada no Bling",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Query order status ───
    if (action === "get_order") {
      const { bling_order_id } = payload;
      const response = await fetch(`${BLING_API_URL}/pedidos/vendas/${bling_order_id}`, {
        headers: blingHeaders,
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida. Use: create_order, generate_nfe, order_to_nfe, get_order" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Bling sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro na integração com Bling" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
