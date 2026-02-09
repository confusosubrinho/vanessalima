import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getValidToken(supabase: any): Promise<string> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado. Autorize primeiro nas Integrações.");

  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  const isExpired = expiresAt.getTime() - 300000 < Date.now();

  if (isExpired && settings.bling_refresh_token) {
    console.log("Refreshing Bling token...");
    const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);
    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: settings.bling_refresh_token }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Falha ao renovar token do Bling.");

    await supabase.from("store_settings").update({
      bling_access_token: tokenData.access_token,
      bling_refresh_token: tokenData.refresh_token,
      bling_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
    } as any).eq("id", settings.id);

    return tokenData.access_token;
  }

  return settings.bling_access_token;
}

function blingHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Sync Products from Bling ───
async function syncProducts(supabase: any, token: string) {
  const headers = blingHeaders(token);
  let page = 1;
  let totalImported = 0;
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${BLING_API_URL}/produtos?pagina=${page}&limite=100&criterio=5&tipo=P`;
    console.log(`Fetching Bling products page ${page}...`);
    const res = await fetch(url, { headers });
    const json = await res.json();

    if (!res.ok) {
      console.error("Bling products error:", JSON.stringify(json));
      throw new Error(`Bling API error [${res.status}]: ${JSON.stringify(json)}`);
    }

    const products = json?.data || [];
    if (products.length === 0) { hasMore = false; break; }

    for (const bp of products) {
      // Get full product details
      const detailRes = await fetch(`${BLING_API_URL}/produtos/${bp.id}`, { headers });
      const detailJson = await detailRes.json();
      const detail = detailJson?.data;
      if (!detail) continue;

      const slug = slugify(detail.nome || `produto-${bp.id}`);
      const basePrice = detail.preco || 0;
      const salePrice = detail.precoPromocional && detail.precoPromocional < basePrice ? detail.precoPromocional : null;

      // Smart category assignment
      let categoryId = null;
      const categoryName = detail.categoria?.descricao;
      if (categoryName) {
        // 1. Try exact match
        let { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("name", categoryName)
          .maybeSingle();

        // 2. Try case-insensitive / partial match
        if (!cat) {
          const normalized = categoryName.toLowerCase().trim();
          const { data: allCats } = await supabase.from("categories").select("id, name");
          if (allCats?.length) {
            // Fuzzy: check if any existing category contains or is contained by the bling category name
            const match = allCats.find((c: any) => {
              const n = c.name.toLowerCase().trim();
              return n === normalized || n.includes(normalized) || normalized.includes(n);
            });
            if (match) cat = match;
          }
        }

        if (cat) {
          categoryId = cat.id;
        } else {
          // 3. Auto-create category
          const catSlug = slugify(categoryName);
          const { data: newCat } = await supabase
            .from("categories")
            .insert({ name: categoryName, slug: catSlug, is_active: true })
            .select("id")
            .single();
          if (newCat) categoryId = newCat.id;
        }
      }

      // Check if product exists by bling_product_id
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("bling_product_id", bp.id)
        .maybeSingle();

      const productData: any = {
        name: detail.nome,
        base_price: basePrice,
        sale_price: salePrice,
        sku: detail.codigo || null,
        gtin: detail.gtin || null,
        description: detail.descricaoCurta || detail.observacoes || null,
        weight: detail.pesoBruto || detail.pesoLiquido || null,
        width: detail.larguraProduto || null,
        height: detail.alturaProduto || null,
        depth: detail.profundidadeProduto || null,
        brand: detail.marca || null,
        is_active: detail.situacao === "A",
        category_id: categoryId,
        bling_product_id: bp.id,
      };

      let productId: string;

      if (existing) {
        await supabase.from("products").update(productData).eq("id", existing.id);
        productId = existing.id;
        totalUpdated++;
      } else {
        // Check slug uniqueness
        const { data: slugExists } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
        productData.slug = slugExists ? `${slug}-${bp.id}` : slug;
        const { data: newProd, error: insertErr } = await supabase
          .from("products")
          .insert(productData)
          .select("id")
          .single();
        if (insertErr) { console.error("Insert product error:", insertErr.message); continue; }
        productId = newProd.id;
        totalImported++;
      }

      // Sync images
      if (detail.midia?.imagens?.internas?.length) {
        // Delete existing images for this product to re-sync
        await supabase.from("product_images").delete().eq("product_id", productId);
        const images = detail.midia.imagens.internas.map((img: any, idx: number) => ({
          product_id: productId,
          url: img.link,
          is_primary: idx === 0,
          display_order: idx,
          alt_text: detail.nome,
        }));
        await supabase.from("product_images").insert(images);
      }

      // Sync variants (variações)
      if (detail.variacoes?.length) {
        for (const v of detail.variacoes) {
          const varData: any = {
            product_id: productId,
            size: v.nome || "Único",
            stock_quantity: v.estoque?.saldoVirtualTotal ?? 0,
            sku: v.codigo || null,
            is_active: v.situacao === "A",
            bling_variant_id: v.id,
          };

          const { data: existingVar } = await supabase
            .from("product_variants")
            .select("id")
            .eq("bling_variant_id", v.id)
            .maybeSingle();

          if (existingVar) {
            await supabase.from("product_variants").update(varData).eq("id", existingVar.id);
          } else {
            await supabase.from("product_variants").insert(varData);
          }
        }
      } else {
        // No variations - create a default "Único" variant with stock from the product
        const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${bp.id}`, { headers });
        const stockJson = await stockRes.json();
        const stockQty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;

        const { data: existingDefault } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", productId)
          .eq("size", "Único")
          .maybeSingle();

        if (existingDefault) {
          await supabase.from("product_variants").update({ stock_quantity: stockQty }).eq("id", existingDefault.id);
        } else {
          await supabase.from("product_variants").insert({
            product_id: productId,
            size: "Único",
            stock_quantity: stockQty,
            is_active: true,
          });
        }
      }
    }

    page++;
    if (products.length < 100) hasMore = false;
  }

  return { imported: totalImported, updated: totalUpdated };
}

// ─── Sync Stock from Bling ───
async function syncStock(supabase: any, token: string) {
  const headers = blingHeaders(token);

  // Get all products with bling_product_id
  const { data: products } = await supabase
    .from("products")
    .select("id, bling_product_id")
    .not("bling_product_id", "is", null);

  if (!products?.length) return { updated: 0 };

  let updated = 0;

  // Process in batches of 50
  for (let i = 0; i < products.length; i += 50) {
    const batch = products.slice(i, i + 50);
    const ids = batch.map((p: any) => p.bling_product_id);
    const idsParam = ids.map((id: number) => `idsProdutos[]=${id}`).join("&");

    const res = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
    const json = await res.json();

    if (!res.ok) {
      console.error("Stock sync error:", JSON.stringify(json));
      continue;
    }

    const stockData = json?.data || [];
    for (const stock of stockData) {
      const product = batch.find((p: any) => p.bling_product_id === stock.produto?.id);
      if (!product) continue;

      // Update all variants for this product
      const qty = stock.saldoVirtualTotal ?? 0;
      await supabase
        .from("product_variants")
        .update({ stock_quantity: qty })
        .eq("product_id", product.id);

      updated++;
    }
  }

  return { updated };
}

// ─── Create Order in Bling ───
async function createOrder(supabase: any, token: string, orderId: string) {
  const headers = blingHeaders(token);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) throw new Error(`Pedido não encontrado: ${orderError?.message || orderId}`);

  const cpfMatch = order.notes?.match(/CPF:\s*([\d.\-]+)/);
  const cpf = cpfMatch ? cpfMatch[1].replace(/\D/g, "") : "";

  // Map order items - use bling product codes if available
  const itens = [];
  for (const item of (order.order_items || [])) {
    let codigo = item.product_id?.substring(0, 8) || "PROD";

    // Try to get the Bling product ID for proper linking
    if (item.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("sku, bling_product_id")
        .eq("id", item.product_id)
        .maybeSingle();
      if (prod?.sku) codigo = prod.sku;
    }

    itens.push({
      descricao: item.product_name,
      quantidade: item.quantity,
      valor: item.unit_price,
      codigo,
    });
  }

  const blingOrder = {
    numero: 0,
    data: new Date(order.created_at).toISOString().split("T")[0],
    dataSaida: new Date().toISOString().split("T")[0],
    contato: {
      nome: order.shipping_name,
      tipoPessoa: "F",
      numeroDocumento: cpf,
      contribuinte: 9,
    },
    itens,
    transporte: {
      fretePorConta: 0,
      frete: order.shipping_cost || 0,
      volumes: [{ servico: "Transportadora" }],
      contato: { nome: order.shipping_name },
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
    headers,
    body: JSON.stringify(blingOrder),
  });

  const data = await response.json();
  console.log("Bling create order response:", JSON.stringify(data));
  if (!response.ok) throw new Error(`Bling API error [${response.status}]: ${JSON.stringify(data)}`);

  return { bling_order_id: data?.data?.id };
}

// ─── Generate NF-e ───
async function generateNfe(token: string, blingOrderId: number) {
  const headers = blingHeaders(token);
  const response = await fetch(`${BLING_API_URL}/nfe`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tipo: 1, idPedidoVenda: blingOrderId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Bling NF-e error [${response.status}]: ${JSON.stringify(data)}`);

  const nfeId = data?.data?.id;
  if (nfeId) {
    await fetch(`${BLING_API_URL}/nfe/${nfeId}/enviar`, { method: "POST", headers });
  }
  return { nfe_id: nfeId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    const { action, ...payload } = await req.json();
    const token = await getValidToken(supabase);

    let result: any;

    switch (action) {
      case "sync_products":
        result = await syncProducts(supabase, token);
        break;

      case "sync_stock":
        result = await syncStock(supabase, token);
        break;

      case "create_order":
        result = await createOrder(supabase, token, payload.order_id);
        break;

      case "generate_nfe":
        if (!payload.bling_order_id) throw new Error("bling_order_id obrigatório");
        result = await generateNfe(token, parseInt(payload.bling_order_id));
        break;

      case "order_to_nfe": {
        const orderResult = await createOrder(supabase, token, payload.order_id);
        const nfeResult = await generateNfe(token, orderResult.bling_order_id);
        result = { ...orderResult, ...nfeResult };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Bling sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro na integração com Bling" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
