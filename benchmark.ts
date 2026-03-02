const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const LATENCY = 10; // 10ms network latency per query
const NUM_ORDERS = 50;

const ordersList = Array.from({ length: NUM_ORDERS }, (_, i) => ({ id: `order_${i}`, transaction_id: `txn_${i}` }));

async function runCurrent() {
  const start = performance.now();
  let reconciled = 0;

  // Simulated initial query
  await delay(LATENCY);
  const orders = ordersList.map(o => ({ id: o.id }));

  for (const o of orders || []) {
    // N+1 Query
    await delay(LATENCY);
    const order = { transaction_id: `txn_${o.id}` };

    if (!order?.transaction_id) continue;

    // Simulate stripe retrieve
    await delay(LATENCY);
    const pi = { status: "succeeded", amount: 1000 };

    if (pi.status === "succeeded") {
      // update order
      await delay(LATENCY);
      // check payments
      await delay(LATENCY);
      // insert payment
      await delay(LATENCY);
      reconciled++;
    }
  }
  const end = performance.now();
  console.log(`Current approach time: ${(end - start).toFixed(2)}ms`);
}

async function runOptimized() {
  const start = performance.now();
  let reconciled = 0;

  // Simulated initial query
  await delay(LATENCY);
  const orders = ordersList.map(o => ({ id: o.id, transaction_id: o.transaction_id }));

  for (const o of orders || []) {
    // N+1 Query REMOVED
    const order = o;

    if (!order?.transaction_id) continue;

    // Simulate stripe retrieve
    await delay(LATENCY);
    const pi = { status: "succeeded", amount: 1000 };

    if (pi.status === "succeeded") {
      // update order
      await delay(LATENCY);
      // check payments
      await delay(LATENCY);
      // insert payment
      await delay(LATENCY);
      reconciled++;
    }
  }
  const end = performance.now();
  console.log(`Optimized approach time: ${(end - start).toFixed(2)}ms`);
}

async function main() {
  console.log(`Benchmarking with ${NUM_ORDERS} orders and ${LATENCY}ms latency...`);
  await runCurrent();
  await runOptimized();
}

main();