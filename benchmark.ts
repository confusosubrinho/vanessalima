import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { performance } from "node:perf_hooks";

// Mock implementation of the old and new logic
async function runBenchmark() {
  const NUM_ORDERS = 50;
  const ITEMS_PER_ORDER = 3;

  // Mock data
  const mockOrders = Array.from({ length: NUM_ORDERS }, (_, i) => ({
    id: `order-${i}`,
    provider: "manual",
    transaction_id: null,
  }));

  const mockItems = mockOrders.flatMap((order) =>
    Array.from({ length: ITEMS_PER_ORDER }, (_, i) => ({
      order_id: order.id,
      product_variant_id: `variant-${i}`,
      quantity: 1,
    }))
  );

  // Mock Supabase client
  const mockSupabaseOld = {
    from: (table: string) => ({
      select: () => ({
        eq: async (col: string, val: string) => {
          if (table === "order_items") {
            // simulate network delay
            await new Promise((r) => setTimeout(r, 2));
            return { data: mockItems.filter((i) => i.order_id === val) };
          }
          return { data: [] };
        },
      }),
      update: () => ({
        eq: async () => {
          await new Promise((r) => setTimeout(r, 2));
          return { data: null };
        }
      })
    }),
    rpc: async () => {
      await new Promise((r) => setTimeout(r, 2));
      return { data: null };
    },
  };

  const startOld = performance.now();
  for (const order of mockOrders) {
    const { data: items } = await mockSupabaseOld.from("order_items").select("product_variant_id, quantity").eq("order_id", order.id);
    for (const item of items || []) {
      if (item.product_variant_id && item.quantity) {
        await mockSupabaseOld.rpc("increment_stock", { p_variant_id: item.product_variant_id, p_quantity: item.quantity });
      }
    }
    await mockSupabaseOld.from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", order.id);
  }
  const endOld = performance.now();
  console.log(`Old Approach: ${(endOld - startOld).toFixed(2)}ms`);

  const mockSupabaseNew = {
    from: (table: string) => ({
      select: () => ({
        in: async (col: string, vals: string[]) => {
          if (table === "order_items") {
            await new Promise((r) => setTimeout(r, 2));
            return { data: mockItems.filter((i) => vals.includes(i.order_id)) };
          }
          return { data: [] };
        },
      }),
      update: () => ({
        in: async () => {
          await new Promise((r) => setTimeout(r, 2));
          return { data: null };
        }
      })
    }),
    rpc: async () => {
      await new Promise((r) => setTimeout(r, 2));
      return { data: null };
    },
  };

  const startNew = performance.now();

  const orderIds = mockOrders.map(o => o.id);
  const itemsByOrder = new Map<string, any[]>();

  if (orderIds.length > 0) {
    const { data: allItems } = await mockSupabaseNew.from("order_items")
      .select("order_id, product_variant_id, quantity")
      .in("order_id", orderIds);

    for (const item of allItems || []) {
      const items = itemsByOrder.get(item.order_id) || [];
      items.push(item);
      itemsByOrder.set(item.order_id, items);
    }

    // Instead of doing individual RPCs, we can use Promise.all to parallelize,
    // or batch reads. Since we can't easily change the RPC signature without a migration,
    // we'll parallelize the RPC calls.
    const rpcPromises = (allItems || []).map(item => {
      if (item.product_variant_id && item.quantity) {
         return mockSupabaseNew.rpc("increment_stock", { p_variant_id: item.product_variant_id, p_quantity: item.quantity });
      }
      return Promise.resolve();
    });

    // Process RPCs in chunks to avoid overwhelming the connection
    const chunkSize = 50;
    for (let i = 0; i < rpcPromises.length; i += chunkSize) {
      await Promise.all(rpcPromises.slice(i, i + chunkSize));
    }

    // Batch update orders
    await mockSupabaseNew.from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).in("id", orderIds);
  }

  const endNew = performance.now();
  console.log(`New Approach: ${(endNew - startNew).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
