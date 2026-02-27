import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TrayProduct {
  codigo: string;
  nome: string;
  descricao: string;
  imagemPrincipal: string;
  imagem2: string;
  imagem3: string;
  imagem4: string;
  imagensAdicionais: string;
  referencia: string;
  sku?: string;
}

function parseSemicolonCSV(text: string): TrayProduct[] {
  // Split lines, handle quoted fields with semicolon delimiter
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const products: TrayProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length < 45) continue;

    const nome = fields[4]?.trim();
    if (!nome) continue;

    products.push({
      codigo: fields[0]?.trim() || '',
      nome,
      descricao: fields[5]?.trim() || '',
      imagemPrincipal: cleanUrl(fields[6]),
      imagem2: cleanUrl(fields[7]),
      imagem3: cleanUrl(fields[8]),
      imagem4: cleanUrl(fields[9]),
      imagensAdicionais: fields[44]?.trim() || '',
      referencia: fields[25]?.trim() || '',
    });
  }

  return products;
}

function cleanUrl(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\\:/g, ':').replace(/\\\./g, '.').replace(/\\\//g, '/');
}

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function downloadAndConvertToWebP(
  imageUrl: string,
  supabaseAdmin: any,
  productSlug: string,
  index: number
): Promise<string | null> {
  try {
    // Clean the URL
    let url = imageUrl.replace(/\\\:/g, ':').replace(/\\\./g, '.').replace(/\\\//g, '/');
    if (!url.startsWith('http')) return null;

    console.log(`Downloading image: ${url}`);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error(`Failed to download ${url}: ${response.status}`);
      return null;
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Upload as-is (original format) - the filename will indicate webp intent
    // Since Deno doesn't have native WebP conversion, we upload the original
    // and let the frontend handle display optimization
    const ext = url.includes('.png') ? 'png' : 'jpg';
    const fileName = `tray-import/${productSlug}/${productSlug}-${index}-${Date.now()}.${ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from('product-media')
      .upload(fileName, uint8, {
        contentType: blob.type || `image/${ext === 'png' ? 'png' : 'jpeg'}`,
        upsert: true,
      });

    if (error) {
      console.error(`Upload error: ${error.message}`);
      return null;
    }

    const { data: publicUrl } = supabaseAdmin.storage
      .from('product-media')
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  } catch (err) {
    console.error(`Error processing image: ${err}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { csvData } = await req.json();
    if (!csvData) {
      return new Response(JSON.stringify({ error: "CSV não fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Parsing Tray CSV...");
    const trayProducts = parseSemicolonCSV(csvData);
    console.log(`Parsed ${trayProducts.length} products from Tray CSV`);

    // Fetch all existing products with images
    const { data: existingProducts, error: fetchErr } = await supabaseAdmin
      .from('products')
      .select('id, name, slug, sku, bling_product_id, description');
    
    if (fetchErr) throw fetchErr;

    const results = {
      matched: 0,
      updated: 0,
      notFound: [] as string[],
      errors: [] as string[],
      imagesUploaded: 0,
    };

    for (const trayProd of trayProducts) {
      try {
        // Try to match by name (normalized fuzzy)
        const trayNameNorm = normalizeForMatch(trayProd.nome);
        const trayRefNorm = trayProd.referencia ? normalizeForMatch(trayProd.referencia) : '';

        let matchedProduct = existingProducts?.find(p => {
          const nameNorm = normalizeForMatch(p.name);
          // Exact normalized name match
          if (nameNorm === trayNameNorm) return true;
          // Name contains or is contained
          if (trayNameNorm.length > 5 && (nameNorm.includes(trayNameNorm) || trayNameNorm.includes(nameNorm))) return true;
          // SKU / reference match
          if (trayRefNorm && p.sku && normalizeForMatch(p.sku) === trayRefNorm) return true;
          return false;
        });

        if (!matchedProduct) {
          results.notFound.push(trayProd.nome);
          continue;
        }

        results.matched++;
        console.log(`Matched: "${trayProd.nome}" -> "${matchedProduct.name}" (${matchedProduct.id})`);

        // Update description if Tray has one
        if (trayProd.descricao) {
          const { error: updateErr } = await supabaseAdmin
            .from('products')
            .update({ description: trayProd.descricao })
            .eq('id', matchedProduct.id);

          if (updateErr) {
            results.errors.push(`Erro ao atualizar descrição de ${matchedProduct.name}: ${updateErr.message}`);
            continue;
          }
        }

        // Collect all image URLs from Tray
        const imageUrls: string[] = [];
        if (trayProd.imagemPrincipal) imageUrls.push(trayProd.imagemPrincipal);
        if (trayProd.imagem2) imageUrls.push(trayProd.imagem2);
        if (trayProd.imagem3) imageUrls.push(trayProd.imagem3);
        if (trayProd.imagem4) imageUrls.push(trayProd.imagem4);

        // Parse additional images (comma-separated)
        if (trayProd.imagensAdicionais) {
          const additional = trayProd.imagensAdicionais
            .split(',')
            .map(u => cleanUrl(u.trim()))
            .filter(u => u.startsWith('http'));
          imageUrls.push(...additional);
        }

        if (imageUrls.length > 0) {
          // Delete existing images for this product
          await supabaseAdmin
            .from('product_images')
            .delete()
            .eq('product_id', matchedProduct.id);

          // Download and upload each image
          for (let idx = 0; idx < imageUrls.length; idx++) {
            const uploadedUrl = await downloadAndConvertToWebP(
              imageUrls[idx],
              supabaseAdmin,
              matchedProduct.slug,
              idx
            );

            if (uploadedUrl) {
              const { error: imgErr } = await supabaseAdmin
                .from('product_images')
                .insert({
                  product_id: matchedProduct.id,
                  url: uploadedUrl,
                  display_order: idx,
                  is_primary: idx === 0,
                  alt_text: matchedProduct.name,
                  media_type: 'image',
                });

              if (imgErr) {
                results.errors.push(`Erro ao salvar imagem ${idx} de ${matchedProduct.name}: ${imgErr.message}`);
              } else {
                results.imagesUploaded++;
              }
            }
          }
        }

        results.updated++;
      } catch (err) {
        results.errors.push(`Erro ao processar ${trayProd.nome}: ${err}`);
      }
    }

    console.log(`Import complete: ${results.matched} matched, ${results.updated} updated, ${results.imagesUploaded} images`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Tray import error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
