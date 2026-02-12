import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, description, category, brand, material } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `Você é um especialista em SEO para e-commerce de calçados femininos no Brasil.
Dado o seguinte produto, gere:
1. Um título SEO otimizado (máx 60 caracteres)
2. Uma meta description otimizada (máx 155 caracteres) 
3. 8-12 palavras-chave relevantes separadas por vírgula

Produto: ${name}
${description ? `Descrição: ${description}` : ''}
${category ? `Categoria: ${category}` : ''}
${brand ? `Marca: ${brand}` : ''}
${material ? `Material: ${material}` : ''}

Foque em termos que mulheres brasileiras buscariam no Google ao procurar este tipo de calçado.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Responda APENAS em JSON válido no formato: {\"seo_title\": \"...\", \"seo_description\": \"...\", \"seo_keywords\": \"palavra1, palavra2, ...\"}" },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_seo",
              description: "Generate SEO metadata for a product",
              parameters: {
                type: "object",
                properties: {
                  seo_title: { type: "string", description: "SEO title, max 60 chars" },
                  seo_description: { type: "string", description: "Meta description, max 155 chars" },
                  seo_keywords: { type: "string", description: "Comma-separated keywords" },
                },
                required: ["seo_title", "seo_description", "seo_keywords"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_seo" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    
    // Extract from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const seo = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(seo), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try parsing content as JSON
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const seo = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify(seo), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Could not parse AI response");
  } catch (e) {
    console.error("generate-seo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
