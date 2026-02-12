import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Melhor Envio token from store_settings
    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("melhor_envio_token, melhor_envio_sandbox, free_shipping_threshold, shipping_store_pickup_enabled, shipping_store_pickup_label, shipping_store_pickup_address, shipping_free_enabled, shipping_free_label, shipping_free_min_value, shipping_regions, shipping_allowed_services")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error(`Settings error: ${settingsError.message}`);

    const token = settings?.melhor_envio_token;
    if (!token) {
      return new Response(JSON.stringify({ error: "Token do Melhor Envio não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body_input = await req.json();
    const postal_code_to = typeof body_input?.postal_code_to === "string" 
      ? body_input.postal_code_to.replace(/\D/g, "").slice(0, 8) 
      : null;
    const products = Array.isArray(body_input?.products) ? body_input.products : [];

    if (!postal_code_to || postal_code_to.length !== 8) {
      return new Response(JSON.stringify({ error: "CEP de destino inválido (8 dígitos)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate total weight and dimensions from products
    let totalWeight = 0;
    let maxWidth = 11;
    let maxHeight = 2;
    let maxLength = 16;

    if (products && products.length > 0) {
      for (const p of products) {
        totalWeight += (p.weight || 0.3) * (p.quantity || 1);
        maxWidth = Math.max(maxWidth, p.width || 11);
        maxHeight += (p.height || 2) * (p.quantity || 1);
        maxLength = Math.max(maxLength, p.depth || 16);
      }
    } else {
      totalWeight = 0.3;
    }

    // Ensure minimum dimensions for Melhor Envio
    totalWeight = Math.max(totalWeight, 0.3);
    maxWidth = Math.max(maxWidth, 11);
    maxHeight = Math.max(maxHeight, 2);
    maxLength = Math.max(maxLength, 16);

    const isSandbox = settings?.melhor_envio_sandbox !== false;
    const baseUrl = isSandbox
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br";

    // #10: Dynamic origin CEP from store_settings
    const { data: fullSettings } = await supabase
      .from("store_settings")
      .select("full_address")
      .limit(1)
      .maybeSingle();
    
    // Extract CEP from full_address or fallback to store default
    const originCep = fullSettings?.full_address?.match(/\d{5}-?\d{3}/)?.[0]?.replace(/\D/g, "") || "85010020";

    const body = {
      from: { postal_code: originCep },
      to: { postal_code: postal_code_to.replace(/\D/g, "") },
      package: {
        weight: totalWeight,
        width: maxWidth,
        height: maxHeight,
        length: maxLength,
      },
      options: {
        insurance_value: 0,
        receipt: false,
        own_hand: false,
      },
    };

    console.log("Melhor Envio request:", JSON.stringify(body));

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "VanessaLimaShoes contact@vanessalimashoes.com.br",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log("Melhor Envio response:", JSON.stringify(data));

    if (!response.ok) {
      throw new Error(`Melhor Envio API error [${response.status}]: ${JSON.stringify(data)}`);
    }

    // Filter valid options (no errors) and by allowed services
    const allowedServices = (settings?.shipping_allowed_services as number[]) || [];
    const validOptions = Array.isArray(data)
      ? data
          .filter((opt: any) => !opt.error && opt.price)
          .filter((opt: any) => allowedServices.length === 0 || allowedServices.includes(opt.id))
          .map((opt: any) => ({
            id: opt.id,
            name: opt.name,
            price: parseFloat(opt.price) || 0,
            discount: parseFloat(opt.discount) || 0,
            deadline: `${opt.delivery_time || opt.delivery_range?.min || "?"} a ${opt.delivery_range?.max || opt.delivery_time || "?"} dias úteis`,
            company: opt.company?.name || opt.name,
            company_picture: opt.company?.picture || null,
          }))
      : [];

    // Add custom shipping options from store settings
    const customOptions: any[] = [];

    // Store pickup
    if (settings?.shipping_store_pickup_enabled) {
      customOptions.push({
        id: "store_pickup",
        name: settings.shipping_store_pickup_label || "Retirada na Loja",
        price: 0,
        discount: 0,
        deadline: "Imediato",
        company: "Loja Física",
        company_picture: null,
        address: settings.shipping_store_pickup_address,
      });
    }

    // Manual free shipping
    if (settings?.shipping_free_enabled) {
      customOptions.push({
        id: "free_shipping",
        name: settings.shipping_free_label || "Frete Grátis",
        price: 0,
        discount: 0,
        deadline: "5 a 10 dias úteis",
        company: "Loja",
        company_picture: null,
        min_value: settings.shipping_free_min_value || 0,
      });
    }

    // Regional shipping
    const regions = settings?.shipping_regions as any[] || [];
    const destState = postal_code_to.replace(/\D/g, "").substring(0, 2);
    // Map CEP prefix to state for regional matching
    for (const region of regions) {
      if (region.enabled) {
        customOptions.push({
          id: `region_${region.id}`,
          name: region.name,
          price: region.price,
          discount: 0,
          deadline: `${region.min_days} a ${region.max_days} dias úteis`,
          company: "Frete Regional",
          company_picture: null,
          region_states: region.states,
        });
      }
    }

    return new Response(
      JSON.stringify({
        options: [...validOptions, ...customOptions],
        free_shipping_threshold: settings?.free_shipping_threshold || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Shipping calculation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao calcular frete" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
