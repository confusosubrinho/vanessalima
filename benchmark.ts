import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mocking Supabase Client with fake categories data
const mockCategoriesData = Array.from({ length: 50 }, (_, i) => ({
  id: `cat-${i}`,
  name: `Categoria de Teste ${i}`,
  slug: `categoria-de-teste-${i}`,
  is_active: true
}));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

class MockSupabaseClient {
  metrics = { queries: 0 };

  from(table: string) {
    return {
      select: (fields: string) => {
        return {
          eq: (field: string, value: string) => {
            return {
              maybeSingle: async () => {
                this.metrics.queries++;
                await sleep(10); // simulate db latency
                if (table === "categories") {
                  const item = mockCategoriesData.find(c => c[field as keyof typeof c] === value);
                  return { data: item || null };
                }
                return { data: null };
              }
            };
          },
          then: async (cb: any) => {
            this.metrics.queries++;
            await sleep(10);
            if (table === "categories") {
              return cb({ data: mockCategoriesData });
            }
            return cb({ data: [] });
          }
        };
      },
      insert: (data: any) => {
        return {
          select: (fields: string) => {
            return {
              single: async () => {
                this.metrics.queries++;
                await sleep(15);
                const newCat = { id: `new-cat-${Date.now()}`, ...data };
                mockCategoriesData.push(newCat);
                return { data: newCat, error: null };
              }
            };
          }
        };
      }
    };
  }
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ORIGINAL
async function originalFindOrCreateCategory(supabase: any, categoryName: string): Promise<string | null> {
  if (!categoryName) return null;
  let { data: cat } = await supabase.from("categories").select("id").eq("name", categoryName).maybeSingle();
  if (cat) return cat.id;
  const normalized = categoryName.toLowerCase().trim();
  const { data: allCats } = await new Promise<any>((resolve) => {
    supabase.from("categories").select("id, name").then(resolve);
  });
  if (allCats?.length) {
    const match = allCats.find((c: any) => { const n = c.name.toLowerCase().trim(); return n === normalized || n.includes(normalized) || normalized.includes(n); });
    if (match) return match.id;
    const inputWords = normalized.split(/\s+/).filter(w => w.length > 2);
    let bestMatch: any = null, bestScore = 0;
    for (const c of allCats) {
      const catWords = c.name.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length > 2);
      const overlap = inputWords.filter(w => catWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
      const score = overlap / Math.max(inputWords.length, catWords.length);
      if (score > bestScore && score >= 0.5) { bestScore = score; bestMatch = c; }
    }
    if (bestMatch) return bestMatch.id;
  }
  const catSlug = slugify(categoryName);
  const { data: existingSlug } = await supabase.from("categories").select("id").eq("slug", catSlug).maybeSingle();
  const finalSlug = existingSlug ? `${catSlug}-${Date.now()}` : catSlug;
  const { data: newCat } = await supabase.from("categories").insert({ name: categoryName, slug: finalSlug, is_active: true }).select("id").single();
  return newCat?.id || null;
}

// OPTIMIZED
async function optimizedFindOrCreateCategory(
  supabase: any,
  categoryName: string,
  categoriesCache?: { id: string, name: string, slug?: string }[]
): Promise<string | null> {
  if (!categoryName) return null;
  const normalized = categoryName.toLowerCase().trim();

  let allCats = categoriesCache;
  if (!allCats || allCats.length === 0) {
    const { data } = await new Promise<any>((resolve) => {
      supabase.from("categories").select("id, name, slug").then(resolve);
    });
    if (allCats) {
      allCats.push(...(data || []));
    } else {
      allCats = data || [];
    }
  }

  // Exact match
  let exactMatch = allCats!.find((c: any) => c.name.toLowerCase().trim() === normalized);
  if (exactMatch) return exactMatch.id;

  // Partial match
  const match = allCats!.find((c: any) => {
    const n = c.name.toLowerCase().trim();
    return n.includes(normalized) || normalized.includes(n);
  });
  if (match) return match.id;

  // Fuzzy match
  const inputWords = normalized.split(/\s+/).filter((w: string) => w.length > 2);
  let bestMatch: any = null, bestScore = 0;
  for (const c of allCats!) {
    if (!c.name) continue;
    const catWords = c.name.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length > 2);
    const overlap = inputWords.filter((w: string) => catWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
    const score = overlap / Math.max(inputWords.length, catWords.length);
    if (score > bestScore && score >= 0.5) { bestScore = score; bestMatch = c; }
  }
  if (bestMatch) return bestMatch.id;

  // Create new
  const catSlug = slugify(categoryName);
  const existingSlug = allCats!.find(c => c.slug === catSlug);
  const finalSlug = existingSlug ? `${catSlug}-${Date.now()}` : catSlug;

  const { data: newCat } = await supabase.from("categories").insert({ name: categoryName, slug: finalSlug, is_active: true }).select("id").single();
  if (newCat) {
    allCats!.push(newCat);
    return newCat.id;
  }
  return null;
}

async function runBenchmark() {
  console.log("Starting benchmark...");

  const categoriesToTest = [
    "Categoria de Teste 10", // Exact match (existing)
    "Categoria de Teste 20", // Exact match (existing)
    "Teste 30",              // Partial match
    "Nova Categoria 1",      // New
    "Nova Categoria 2",      // New
    "Categoria de Teste 10", // Repeated exact match
    "Nova Categoria 1",      // Repeated new
  ];

  // Run Original
  const originalClient = new MockSupabaseClient();
  const originalStart = performance.now();
  for (const cat of categoriesToTest) {
    await originalFindOrCreateCategory(originalClient, cat);
  }
  const originalTime = performance.now() - originalStart;

  // Run Optimized
  const optimizedClient = new MockSupabaseClient();
  const cache: any[] = [];
  const optimizedStart = performance.now();
  for (const cat of categoriesToTest) {
    await optimizedFindOrCreateCategory(optimizedClient, cat, cache);
  }
  const optimizedTime = performance.now() - optimizedStart;

  console.log(`\nOriginal:`);
  console.log(`- Time: ${originalTime.toFixed(2)}ms`);
  console.log(`- DB Queries: ${originalClient.metrics.queries}`);

  console.log(`\nOptimized:`);
  console.log(`- Time: ${optimizedTime.toFixed(2)}ms`);
  console.log(`- DB Queries: ${optimizedClient.metrics.queries}`);
  console.log(`- Time Improvement: ${((originalTime - optimizedTime) / originalTime * 100).toFixed(2)}%`);
  console.log(`- Query Reduction: ${originalClient.metrics.queries - optimizedClient.metrics.queries} queries`);
}

runBenchmark();
