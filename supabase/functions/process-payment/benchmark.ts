import { performance } from "node:perf_hooks";

// Mock Supabase client
class MockSupabase {
  public queryCount = 0;

  from(table: string) {
    return {
      select: (fields: string) => {
        return {
          eq: (field: string, value: any) => {
            return {
              single: async () => {
                this.queryCount++;
                // Simulate network latency (e.g., 20ms per query)
                await new Promise(r => setTimeout(r, 20));
                return {
                  data: {
                    id: value,
                    price_modifier: 0,
                    sale_price: 100,
                    base_price: 120,
                    products: {
                      id: "prod_1",
                      category_id: "cat_1",
                      base_price: 120,
                      sale_price: 100,
                      is_active: true
                    }
                  }
                };
              }
            };
          },
          in: (field: string, values: any[]) => {
            return {
              then: async (resolve: any) => {
                this.queryCount++;
                // Simulate network latency (e.g., 25ms per query, slightly more than single query)
                await new Promise(r => setTimeout(r, 25));
                const data = values.map((value: any) => ({
                    id: value,
                    price_modifier: 0,
                    sale_price: 100,
                    base_price: 120,
                    products: {
                      id: "prod_1",
                      category_id: "cat_1",
                      base_price: 120,
                      sale_price: 100,
                      is_active: true
                    }
                }));
                resolve({ data });
              }
            };
          }
        };
      }
    };
  }
}

async function runBaseline(products: any[], supabase: MockSupabase) {
  let serverSubtotal = 0;
  let serverSubtotalFull = 0;
  let serverSubtotalSale = 0;
  const priceErrors: string[] = [];
  const lineItems: { product_id: string; category_id: string | null; lineTotal: number }[] = [];

  for (const product of products) {
    if (!product.variant_id) continue;

    const { data: variantData } = await supabase
      .from("product_variants")
      .select(`
        id, price_modifier, sale_price, base_price,
        products!inner(id, category_id, base_price, sale_price, is_active)
      `)
      .eq("id", product.variant_id)
      .single();

    if (!variantData) {
      priceErrors.push(`Variante ${product.variant_id} não encontrada`);
      continue;
    }
  }
}

async function runOptimized(products: any[], supabase: MockSupabase) {
  let serverSubtotal = 0;
  let serverSubtotalFull = 0;
  let serverSubtotalSale = 0;
  const priceErrors: string[] = [];
  const lineItems: { product_id: string; category_id: string | null; lineTotal: number }[] = [];

  const variantIds = products.map((p: any) => p.variant_id).filter(Boolean);
  let variantsMap = new Map();
  if (variantIds.length > 0) {
    const { data: variantsData } = await supabase
      .from("product_variants")
      .select(`
        id, price_modifier, sale_price, base_price,
        products!inner(id, category_id, base_price, sale_price, is_active)
      `)
      .in("id", variantIds);

    if (variantsData) {
      variantsData.forEach((v: any) => variantsMap.set(v.id, v));
    }
  }

  for (const product of products) {
    if (!product.variant_id) continue;
    const variantData = variantsMap.get(product.variant_id);

    if (!variantData) {
      priceErrors.push(`Variante ${product.variant_id} não encontrada`);
      continue;
    }
  }
}

async function main() {
  const products = Array.from({ length: 50 }, (_, i) => ({ variant_id: `var_${i}`, quantity: 1, name: `Product ${i}` }));

  console.log("Running baseline...");
  let s1 = new MockSupabase();
  const t0 = performance.now();
  await runBaseline(products, s1);
  const t1 = performance.now();
  console.log(`Baseline: ${(t1 - t0).toFixed(2)}ms, Queries: ${s1.queryCount}`);

  console.log("Running optimized...");
  let s2 = new MockSupabase();
  const t2 = performance.now();
  await runOptimized(products, s2);
  const t3 = performance.now();
  console.log(`Optimized: ${(t3 - t2).toFixed(2)}ms, Queries: ${s2.queryCount}`);
}

main().catch(console.error);
