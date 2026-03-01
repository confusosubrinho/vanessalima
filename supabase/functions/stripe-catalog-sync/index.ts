/**
 * Sincroniza produtos e variantes do Supabase com o Catálogo do Stripe.
 * Envia apenas produtos e variantes ativos.
 * Inclui: preço, promoção, peso, dimensões, imagens, variantes (tamanho, cor, SKU, estoque), categoria, marca, etc.
 * POST body: { offset?: number, limit?: number }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Stripe package_dimensions: todos os 4 campos obrigatórios (weight em oz, height/width/length em inches)
function toStripeDimensions(weightKg?: number | null, widthCm?: number | null, heightCm?: number | null, depthCm?: number | null): { weight: number; width: number; height: number; length: number } | undefined {
  const w = weightKg != null && Number(weightKg) > 0 ? Math.round(Number(weightKg) * 35.274 * 100) / 100 : null;
  const wd = widthCm != null && Number(widthCm) > 0 ? Math.round((Number(widthCm) / 2.54) * 100) / 100 : null;
  const ht = heightCm != null && Number(heightCm) > 0 ? Math.round((Number(heightCm) / 2.54) * 100) / 100 : null;
  const len = depthCm != null && Number(depthCm) > 0 ? Math.round((Number(depthCm) / 2.54) * 100) / 100 : null;
  if (w == null || wd == null || ht == null || len == null) return undefined;
  return { weight: w, width: wd, height: ht, length: len };
}

function stripMetadata(obj: Record<string, string | number | boolean | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const s = typeof v === "string" ? v : String(v);
    if (s.length > 500) out[k] = s.slice(0, 500);
    else out[k] = s;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: stripeProvider } = await supabase
    .from("integrations_checkout_providers")
    .select("config")
    .eq("provider", "stripe")
    .maybeSingle();
  const stripeConfig = (stripeProvider?.config || {}) as Record<string, unknown>;
  const secretKey = (stripeConfig.secret_key as string)?.trim() || Deno.env.get("STRIPE_SECRET_KEY") || "";

  if (!secretKey) {
    return new Response(
      JSON.stringify({ error: "Chave secreta Stripe não configurada (admin ou STRIPE_SECRET_KEY)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });

  try {
    const body = await req.json().catch(() => ({}));
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        description,
        base_price,
        sale_price,
        sku,
        cost,
        weight,
        width,
        height,
        depth,
        brand,
        gtin,
        mpn,
        condition,
        material,
        pattern,
        stripe_product_id,
        category_id,
        seo_title,
        seo_description,
        is_featured,
        is_new,
        categories!products_category_id_fkey ( name )
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (productsError) {
      return new Response(
        JSON.stringify({ error: productsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const productList = products || [];
    let created_products = 0;
    let created_prices = 0;
    let updated_products = 0;
    const errors: Array<{ product_id: string; variant_id?: string; message: string }> = [];

    for (const product of productList) {
      const productId = product.id as string;
      const productName = (product.name as string) || "Produto sem nome";
      const productDesc = (product.description as string) || productName;
      const productBase = Number(product.base_price) || 0;
      const productSale = product.sale_price != null ? Number(product.sale_price) : null;
      const category = product.categories as { name?: string } | null;
      const categoryName = category?.name ?? "";

      // Imagens do produto (até 8 URLs)
      const { data: images } = await supabase
        .from("product_images")
        .select("url, media_type")
        .eq("product_id", productId)
        .order("is_primary", { ascending: false })
        .order("display_order", { ascending: true })
        .limit(8);
      const imageUrls = (images || [])
        .filter((img) => (img.media_type as string) !== "video")
        .map((img) => (img.url as string).startsWith("http") ? img.url : String(img.url))
        .slice(0, 8);

      const packageDimensions = toStripeDimensions(
        product.weight,
        product.width,
        product.height,
        product.depth
      );
      const hasDimensions = packageDimensions != null;

      const productMetadata = stripMetadata({
        supabase_product_id: productId,
        slug: product.slug,
        sku: product.sku,
        base_price: product.base_price,
        sale_price: product.sale_price,
        cost: product.cost,
        brand: product.brand,
        category: categoryName,
        category_id: product.category_id,
        gtin: product.gtin,
        mpn: product.mpn,
        condition: product.condition,
        material: product.material,
        pattern: product.pattern,
        seo_title: product.seo_title,
        seo_description: product.seo_description,
        is_featured: product.is_featured,
        is_new: product.is_new,
        weight_kg: product.weight,
        width_cm: product.width,
        height_cm: product.height,
        depth_cm: product.depth,
      });

      let stripeProductId = (product.stripe_product_id as string) || null;

      if (!stripeProductId) {
        try {
          const createParams: Stripe.ProductCreateParams = {
            name: productName.slice(0, 250),
            description: productDesc.slice(0, 500) || undefined,
            metadata: productMetadata,
            shippable: hasDimensions ? true : undefined,
            ...(imageUrls.length > 0 && { images: imageUrls }),
            ...(hasDimensions && packageDimensions && {
              package_dimensions: packageDimensions,
            }),
          };
          const prod = await stripe.products.create(createParams);
          stripeProductId = prod.id;
          await supabase.from("products").update({ stripe_product_id: stripeProductId }).eq("id", productId);
          created_products++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ product_id: productId, message: `Criar produto Stripe: ${msg}` });
          continue;
        }
      } else {
        try {
          const updateParams: Stripe.ProductUpdateParams = {
            name: productName.slice(0, 250),
            description: productDesc.slice(0, 500) || undefined,
            metadata: productMetadata,
            shippable: hasDimensions ? true : undefined,
            ...(imageUrls.length > 0 && { images: imageUrls }),
            ...(hasDimensions && packageDimensions && {
              package_dimensions: packageDimensions,
            }),
          };
          await stripe.products.update(stripeProductId, updateParams);
          updated_products++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ product_id: productId, message: `Atualizar produto Stripe: ${msg}` });
        }
      }

      // Variantes com todos os campos
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, size, color, color_hex, sku, base_price, sale_price, price_modifier, stock_quantity, stripe_price_id")
        .eq("product_id", productId)
        .eq("is_active", true);
      const variantList = variants || [];

      for (const variant of variantList) {
        const variantId = variant.id as string;
        let unitPrice: number;
        const useSalePrice = variant.sale_price != null && Number(variant.sale_price) > 0;
        if (useSalePrice) {
          unitPrice = Number(variant.sale_price);
        } else if (variant.base_price != null && Number(variant.base_price) > 0) {
          unitPrice = Number(variant.base_price);
        } else {
          unitPrice = Number(productSale ?? productBase) + Number(variant.price_modifier || 0);
        }
        const unitAmountCents = Math.round(unitPrice * 100);
        if (unitAmountCents < 1) {
          errors.push({ product_id: productId, variant_id: variantId, message: "Preço inválido ou zero" });
          continue;
        }

        const stripePriceId = (variant.stripe_price_id as string) || null;
        if (stripePriceId) continue;

        const priceMetadata = stripMetadata({
          supabase_variant_id: variantId,
          size: variant.size,
          color: variant.color,
          color_hex: variant.color_hex,
          sku: variant.sku,
          base_price: variant.base_price,
          sale_price: variant.sale_price,
          price_modifier: variant.price_modifier,
          stock_quantity: variant.stock_quantity,
          unit_price_used: unitPrice,
          is_promotion: useSalePrice,
        });

        try {
          const price = await stripe.prices.create({
            product: stripeProductId,
            currency: "brl",
            unit_amount: unitAmountCents,
            metadata: priceMetadata,
          });
          await supabase.from("product_variants").update({ stripe_price_id: price.id }).eq("id", variantId);
          created_prices++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ product_id: productId, variant_id: variantId, message: `Criar preço: ${msg}` });
        }
      }
    }

    const hasMore = productList.length === limit;
    return new Response(
      JSON.stringify({
        created_products,
        created_prices,
        updated_products,
        processed: productList.length,
        offset,
        limit,
        has_more: hasMore,
        errors_count: errors.length,
        errors: errors.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[stripe-catalog-sync]", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
