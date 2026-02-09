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

// Parse Bling variation name like "Tamanho:34;cor:Marrom" into { size, color, colorHex }
function parseVariationName(nome: string): { size: string; color: string | null } {
  if (!nome) return { size: "Único", color: null };
  
  const parts: Record<string, string> = {};
  // Split by ";" and parse "key:value" pairs
  nome.split(";").forEach(part => {
    const [key, ...valueParts] = part.split(":");
    if (key && valueParts.length) {
      parts[key.trim().toLowerCase()] = valueParts.join(":").trim();
    }
  });

  const size = parts["tamanho"] || parts["tam"] || parts["size"] || parts["numero"] || parts["num"] || null;
  const color = parts["cor"] || parts["color"] || parts["colour"] || null;

  // If no structured parsing worked, use the whole name as size
  if (!size && !color) {
    return { size: nome, color: null };
  }

  return { size: size || "Único", color };
}

// ─── Smart Category Assignment ───
async function findOrCreateCategory(supabase: any, categoryName: string): Promise<string | null> {
  if (!categoryName) return null;

  // 1. Exact match
  let { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("name", categoryName)
    .maybeSingle();
  if (cat) return cat.id;

  // 2. Case-insensitive / partial match
  const normalized = categoryName.toLowerCase().trim();
  const { data: allCats } = await supabase.from("categories").select("id, name");
  if (allCats?.length) {
    const match = allCats.find((c: any) => {
      const n = c.name.toLowerCase().trim();
      return n === normalized || n.includes(normalized) || normalized.includes(n);
    });
    if (match) return match.id;
  }

  // 3. Auto-create
  const catSlug = slugify(categoryName);
  const { data: existingSlug } = await supabase.from("categories").select("id").eq("slug", catSlug).maybeSingle();
  const finalSlug = existingSlug ? `${catSlug}-${Date.now()}` : catSlug;
  const { data: newCat } = await supabase
    .from("categories")
    .insert({ name: categoryName, slug: finalSlug, is_active: true })
    .select("id")
    .single();
  return newCat?.id || null;
}

// ─── Sync Products from Bling ───
async function syncProducts(supabase: any, token: string) {
  const headers = blingHeaders(token);
  let page = 1;
  let totalImported = 0;
  let totalUpdated = 0;
  let totalVariants = 0;
  let hasMore = true;

  // Step 1: Clean up - delete products that were incorrectly created from variations
  // (products whose bling_product_id corresponds to a variation, not a parent product)
  
  // Cache categories to avoid repeated lookups
  const categoryCache = new Map<string, string | null>();
  async function getCategoryId(name: string): Promise<string | null> {
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const id = await findOrCreateCategory(supabase, name);
    categoryCache.set(name, id);
    return id;
  }

  while (hasMore) {
    // tipo=P fetches only parent products (not variations)
    const url = `${BLING_API_URL}/produtos?pagina=${page}&limite=100&tipo=P`;
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
      try {
        // Get full product details
        const detailRes = await fetch(`${BLING_API_URL}/produtos/${bp.id}`, { headers });
        const detailJson = await detailRes.json();
        const detail = detailJson?.data;
        if (!detail) continue;

        // Skip if this is a variation (formato=V), not a parent product
        if (detail.formato === "V") {
          console.log(`Skipping variation ${bp.id} (${detail.nome}) - not a parent product`);
          continue;
        }

        const slug = slugify(detail.nome || `produto-${bp.id}`);
        const basePrice = detail.preco || 0;
        const salePrice = detail.precoPromocional && detail.precoPromocional < basePrice ? detail.precoPromocional : null;

        // Smart category assignment
        const categoryId = await getCategoryId(detail.categoria?.descricao || "");

        // Check if product exists by bling_product_id
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("bling_product_id", bp.id)
          .maybeSingle();

        // Build comprehensive product data from all Bling fields
        const productData: any = {
          name: detail.nome,
          base_price: basePrice,
          sale_price: salePrice,
          sku: detail.codigo || null,
          gtin: detail.gtin || null,
          mpn: detail.codigo || null,
          description: detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null,
          weight: detail.pesoBruto || detail.pesoLiquido || null,
          width: detail.larguraProduto || null,
          height: detail.alturaProduto || null,
          depth: detail.profundidadeProduto || null,
          brand: detail.marca?.nome || detail.marca || null,
          material: detail.tributacao?.ncm || null,
          condition: detail.condicao === 0 ? "new" : detail.condicao === 1 ? "refurbished" : "used",
          is_active: detail.situacao === "A",
          is_new: detail.lancamento === true || detail.lancamento === "S",
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

        // Sync images from parent product
        if (detail.midia?.imagens?.internas?.length) {
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

        // Sync characteristics (product details)
        const characteristics: { name: string; value: string }[] = [];
        if (detail.pesoBruto) characteristics.push({ name: "Peso Bruto", value: `${detail.pesoBruto} kg` });
        if (detail.pesoLiquido) characteristics.push({ name: "Peso Líquido", value: `${detail.pesoLiquido} kg` });
        if (detail.larguraProduto) characteristics.push({ name: "Largura", value: `${detail.larguraProduto} cm` });
        if (detail.alturaProduto) characteristics.push({ name: "Altura", value: `${detail.alturaProduto} cm` });
        if (detail.profundidadeProduto) characteristics.push({ name: "Profundidade", value: `${detail.profundidadeProduto} cm` });
        if (detail.marca?.nome || detail.marca) characteristics.push({ name: "Marca", value: detail.marca?.nome || detail.marca });
        if (detail.gtin) characteristics.push({ name: "GTIN/EAN", value: detail.gtin });
        if (detail.unidade) characteristics.push({ name: "Unidade", value: detail.unidade });

        if (characteristics.length > 0) {
          await supabase.from("product_characteristics").delete().eq("product_id", productId);
          await supabase.from("product_characteristics").insert(
            characteristics.map((c, idx) => ({
              product_id: productId,
              name: c.name,
              value: c.value,
              display_order: idx,
            }))
          );
        }

        // ─── Sync Variants (Variações) ───
        // First, collect existing variant bling_variant_ids to track which to keep
        const existingVariantIds = new Set<string>();

        if (detail.variacoes?.length) {
          // Product has variations - parse each one
          for (const v of detail.variacoes) {
            const parsed = parseVariationName(v.nome);
            
            // Get variation details for stock, price, images
            let varStock = 0;
            let varPrice = basePrice;
            let varSku = v.codigo || null;
            let varGtin = null;
            let varActive = true;
            
            // Fetch full variation details
            try {
              const varDetailRes = await fetch(`${BLING_API_URL}/produtos/${v.id}`, { headers });
              const varDetailJson = await varDetailRes.json();
              const varDetail = varDetailJson?.data;
              if (varDetail) {
                varStock = varDetail.estoque?.saldoVirtualTotal ?? 0;
                if (varDetail.preco && varDetail.preco > 0) varPrice = varDetail.preco;
                varSku = varDetail.codigo || varSku;
                varGtin = varDetail.gtin || null;
                varActive = varDetail.situacao === "A";
                
                // If variation has its own images, add them
                if (varDetail.midia?.imagens?.internas?.length) {
                  const existingImages = await supabase
                    .from("product_images")
                    .select("url")
                    .eq("product_id", productId);
                  const existingUrls = new Set((existingImages.data || []).map((i: any) => i.url));
                  
                  const newImages = varDetail.midia.imagens.internas
                    .filter((img: any) => !existingUrls.has(img.link))
                    .map((img: any, idx: number) => ({
                      product_id: productId,
                      url: img.link,
                      is_primary: false,
                      display_order: 100 + idx,
                      alt_text: `${detail.nome} - ${parsed.size}${parsed.color ? ` ${parsed.color}` : ""}`,
                    }));
                  if (newImages.length) await supabase.from("product_images").insert(newImages);
                }
              }
            } catch (e) {
              console.error(`Error fetching variation detail ${v.id}:`, e);
              // Fallback: try stock endpoint
              try {
                const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${v.id}`, { headers });
                const stockJson = await stockRes.json();
                varStock = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
              } catch (_) { /* ignore */ }
            }

            const priceModifier = varPrice - basePrice;

            const varData: any = {
              product_id: productId,
              size: parsed.size,
              color: parsed.color,
              stock_quantity: varStock,
              sku: varSku,
              is_active: varActive,
              bling_variant_id: v.id,
              price_modifier: priceModifier !== 0 ? priceModifier : 0,
            };

            const { data: existingVar } = await supabase
              .from("product_variants")
              .select("id")
              .eq("bling_variant_id", v.id)
              .maybeSingle();

            if (existingVar) {
              await supabase.from("product_variants").update(varData).eq("id", existingVar.id);
              existingVariantIds.add(existingVar.id);
            } else {
              const { data: newVar } = await supabase.from("product_variants").insert(varData).select("id").single();
              if (newVar) existingVariantIds.add(newVar.id);
            }
            totalVariants++;
          }

          // Clean up orphaned variants for this product (old variants no longer in Bling)
          const { data: allVars } = await supabase
            .from("product_variants")
            .select("id")
            .eq("product_id", productId)
            .not("bling_variant_id", "is", null);
          
          for (const v of (allVars || [])) {
            if (!existingVariantIds.has(v.id)) {
              await supabase.from("product_variants").delete().eq("id", v.id);
            }
          }
        } else {
          // No variations - create/update a default "Único" variant
          let stockQty = 0;
          try {
            const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${bp.id}`, { headers });
            const stockJson = await stockRes.json();
            stockQty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
          } catch (_) { /* ignore */ }

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
          totalVariants++;
        }
      } catch (productError: any) {
        console.error(`Error syncing product ${bp.id}:`, productError.message);
        continue;
      }
    }

    page++;
    if (products.length < 100) hasMore = false;
  }

  // Step 2: Clean up - remove products that were created from variations
  // These are products with bling_product_id that are actually variations in Bling
  const { data: blingProducts } = await supabase
    .from("products")
    .select("id, bling_product_id, name")
    .not("bling_product_id", "is", null);
  
  let cleaned = 0;
  if (blingProducts?.length) {
    for (const prod of blingProducts) {
      try {
        const checkRes = await fetch(`${BLING_API_URL}/produtos/${prod.bling_product_id}`, { headers });
        const checkJson = await checkRes.json();
        if (checkJson?.data?.formato === "V") {
          // This is a variation, not a parent product - remove it
          console.log(`Cleaning up variation-as-product: ${prod.name} (bling_id: ${prod.bling_product_id})`);
          await supabase.from("product_images").delete().eq("product_id", prod.id);
          await supabase.from("product_variants").delete().eq("product_id", prod.id);
          await supabase.from("product_characteristics").delete().eq("product_id", prod.id);
          await supabase.from("products").delete().eq("id", prod.id);
          cleaned++;
        }
      } catch (_) { /* ignore check errors */ }
    }
  }

  return { imported: totalImported, updated: totalUpdated, variants: totalVariants, cleaned };
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
