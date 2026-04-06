import "dotenv/config";
import { EtoroClient } from "./etoro-client.js";
import { INSTRUMENTS, resolveInstruments, fetchRates } from "./instruments.js";
import { evaluateSignals } from "./signals.js";
import { Executor } from "./executor.js";

// ═══════════════════════════════════════════════════════════════
// HORMUZ HAWK v2.0 — Execution Engine
// Thesis: Strait of Hormuz crisis → long oil/gas/gold/defense
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  apiKey: process.env.ETORO_API_KEY,
  userKey: process.env.ETORO_USER_KEY,
  allocationUsd: Number(process.env.ALLOCATION_USD) || 200,
  dryRun: process.env.DRY_RUN === "true",
  pollIntervalSec: Number(process.env.POLL_INTERVAL_SEC) || 60,
};

function banner() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  HORMUZ HAWK v2.0 — Execution Engine");
  console.log("  Geopolitical Trading Agent · Real Mode");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Allocation:  $${CONFIG.allocationUsd}`);
  console.log(`  Dry Run:     ${CONFIG.dryRun}`);
  console.log(`  Poll:        ${CONFIG.pollIntervalSec}s`);
  console.log("══════════════════════════════════════════════════\n");
}

async function tick(executor, instruments, client) {
  const now = new Date().toISOString();
  console.log(`\n[TICK] ${now}`);

  // 1. Fetch live rates
  const ratesById = await fetchRates(client, instruments);

  // Map rates by our symbol id for the signal evaluator
  const pricesBySymbol = new Map();
  for (const inst of instruments) {
    const rate = ratesById.get(inst.instrumentId);
    if (rate) pricesBySymbol.set(inst.id, rate);
  }

  // 2. Sync portfolio
  const portfolio = await executor.syncPortfolio();

  // 3. Evaluate signals
  console.log("\n[SIGNALS]");
  const signals = evaluateSignals(pricesBySymbol, portfolio);

  // 4. Check exit conditions first
  const stopLoss = signals.find((s) => s.id === "stop_loss" && s.signal.active);
  if (stopLoss) {
    await executor.closeAll(stopLoss.signal.reason);
    console.log("[HAWK] Ceasefire detected — all positions closed. Engine pausing.");
    return "exit";
  }

  const takeProfit = signals.find((s) => s.id === "take_profit" && s.signal.active);
  if (takeProfit) {
    await executor.scaleOut(50, takeProfit.signal.reason);
  }

  // 5. Open positions for active entry signals
  const entryRules = signals.filter(
    (s) => !["stop_loss", "take_profit"].includes(s.id) && s.signal.active
  );

  for (const rule of entryRules) {
    for (const instId of rule.instruments) {
      const inst = instruments.find((i) => i.id === instId);
      if (inst) await executor.openOrder(inst, signals);
    }
  }

  return "continue";
}

async function main() {
  banner();

  if (!CONFIG.apiKey || !CONFIG.userKey) {
    console.error("ERROR: Set ETORO_API_KEY and ETORO_USER_KEY in .env");
    process.exit(1);
  }

  const client = new EtoroClient({
    apiKey: CONFIG.apiKey,
    userKey: CONFIG.userKey,
  });

  // Resolve eToro instrument IDs
  console.log("[STARTUP] Resolving instruments...\n");
  const instruments = await resolveInstruments(client);

  if (instruments.length === 0) {
    console.error("ERROR: No instruments resolved. Check API credentials.");
    process.exit(1);
  }

  console.log(`\n[STARTUP] ${instruments.length}/${INSTRUMENTS.length} instruments resolved`);

  const executor = new Executor(client, {
    allocationUsd: CONFIG.allocationUsd,
    dryRun: CONFIG.dryRun,
  });

  // Initial portfolio sync
  await executor.syncPortfolio();

  // Main loop
  console.log(`\n[HAWK] Engine running — polling every ${CONFIG.pollIntervalSec}s`);
  console.log("[HAWK] Press Ctrl+C to stop\n");

  const run = async () => {
    try {
      const result = await tick(executor, instruments, client);
      if (result === "exit") {
        console.log("[HAWK] Engine stopped after exit signal.");
        process.exit(0);
      }
    } catch (err) {
      console.error(`[ERROR] Tick failed: ${err.message}`);
    }
  };

  // Run immediately, then on interval
  await run();
  setInterval(run, CONFIG.pollIntervalSec * 1000);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[HAWK] Shutting down...");
    console.log("[HAWK] Positions remain open. Use `npm run kill` to close all.");
    process.exit(0);
  });
}

main();
