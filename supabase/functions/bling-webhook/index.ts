import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    const payload = await req.json();

    console.log("Bling webhook received:", JSON.stringify(payload));

    // Bling v3 webhook payload structure:
    // { evento: string, dados: { ... } }
    const evento = payload?.evento || payload?.event;
    const dados = payload?.dados || payload?.data;

    if (!evento) {
      return new Response(JSON.stringify({ ok: true, message: "No event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle stock change events
    if (evento === "estoque" || evento.includes("estoque")) {
      const blingProductId = dados?.idProduto || dados?.produto?.id;
      const novoSaldo = dados?.saldoVirtualTotal ?? dados?.quantidade;
      
      if (blingProductId) {
        // Find product in our DB
        const { data: product } = await supabase
          .from("products")
          .select("id")
          .eq("bling_product_id", blingProductId)
          .maybeSingle();

        if (product && novoSaldo !== undefined) {
          await supabase
            .from("product_variants")
            .update({ stock_quantity: novoSaldo })
            .eq("product_id", product.id);
          console.log(`Stock updated for bling_product_id ${blingProductId}: ${novoSaldo}`);
        }

        // Also check if this is a variant
        const { data: variant } = await supabase
          .from("product_variants")
          .select("id")
          .eq("bling_variant_id", blingProductId)
          .maybeSingle();

        if (variant && novoSaldo !== undefined) {
          await supabase
            .from("product_variants")
            .update({ stock_quantity: novoSaldo })
            .eq("id", variant.id);
          console.log(`Variant stock updated for bling_variant_id ${blingProductId}: ${novoSaldo}`);
        }
      }
    }

    // Handle product update events
    if (evento === "produto.alteracao" || evento === "produto.inclusao" || evento.includes("produto")) {
      console.log(`Product event: ${evento} - trigger a manual sync for full update`);
    }

    return new Response(
      JSON.stringify({ ok: true, evento }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
