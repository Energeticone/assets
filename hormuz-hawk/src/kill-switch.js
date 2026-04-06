import "dotenv/config";
import { EtoroClient } from "./etoro-client.js";

// ═══════════════════════════════════════════════════════
// KILL SWITCH — Close all open positions immediately
// ═══════════════════════════════════════════════════════

async function killAll() {
  console.log("\n⚠  HORMUZ HAWK — KILL SWITCH ACTIVATED\n");

  const client = new EtoroClient({
    apiKey: process.env.ETORO_API_KEY,
    userKey: process.env.ETORO_USER_KEY,
  });

  const data = await client.getPortfolio();
  const cp = data?.clientPortfolio || data;

  if (!cp) {
    console.log("Could not fetch portfolio.");
    process.exit(1);
  }

  const positions = [
    ...(cp.positions || []),
    ...(cp.mirrors || []).flatMap((m) => m.positions || []),
  ];

  if (positions.length === 0) {
    console.log("No open positions. Nothing to close.");
    process.exit(0);
  }

  console.log(`Found ${positions.length} open positions. Closing all...\n`);

  for (const pos of positions) {
    const posId = pos.positionId || pos.PositionID;
    const instId = pos.instrumentId || pos.InstrumentID;
    try {
      console.log(`  Closing position ${posId} (instrument ${instId})...`);
      await client.closePosition(posId);
      console.log(`  ✓ Closed ${posId}`);
    } catch (err) {
      console.error(`  ✗ Failed to close ${posId}: ${err.message}`);
    }
  }

  console.log("\nKill switch complete.");
}

killAll();
