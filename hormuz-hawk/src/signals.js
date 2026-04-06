// Hormuz Hawk — Signal evaluator & rules engine
// Each rule returns { active, reason } based on current market state

export const RULES = [
  {
    id: "oil_long",
    name: "OIL LONG",
    instruments: ["brent", "wti"],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      if (!brent) return { active: false, reason: "No Brent price" };
      // Trigger: Brent > $95 (strait closure is assumed active per thesis)
      if (brent.ask > 95) {
        return { active: true, reason: `Brent at $${brent.ask.toFixed(2)} > $95 threshold` };
      }
      return { active: false, reason: `Brent at $${brent.ask.toFixed(2)} < $95` };
    },
  },
  {
    id: "safe_haven",
    name: "SAFE HAVEN",
    instruments: ["gold"],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      // Proxy for escalation: Brent > $100 signals elevated geopolitical risk
      if (brent && brent.ask > 100) {
        return { active: true, reason: `Escalation signal — Brent $${brent.ask.toFixed(2)} > $100` };
      }
      return { active: false, reason: "No escalation signal" };
    },
  },
  {
    id: "defense_rotation",
    name: "DEFENSE ROTATION",
    instruments: ["ita"],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      // Proxy for military action: Brent > $115 implies kinetic escalation
      if (brent && brent.ask > 115) {
        return { active: true, reason: `Military escalation proxy — Brent $${brent.ask.toFixed(2)} > $115` };
      }
      return { active: false, reason: "No military escalation signal" };
    },
  },
  {
    id: "gas_proxy",
    name: "GAS PROXY",
    instruments: ["natgas"],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      // Qatar LNG disruption proxy: Brent > $105 suggests broader energy disruption
      if (brent && brent.ask > 105) {
        return { active: true, reason: `Energy disruption proxy — Brent $${brent.ask.toFixed(2)} > $105` };
      }
      return { active: false, reason: "No LNG disruption signal" };
    },
  },
  {
    id: "stop_loss",
    name: "STOP LOSS — CEASEFIRE",
    instruments: [],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      // Ceasefire proxy: Brent drops below $80 implies diplomatic resolution
      if (brent && brent.ask < 80) {
        return { active: true, reason: `Ceasefire signal — Brent $${brent.ask.toFixed(2)} < $80, EXIT ALL` };
      }
      return { active: false, reason: "No ceasefire signal" };
    },
  },
  {
    id: "take_profit",
    name: "TAKE PROFIT",
    instruments: [],
    evaluate(prices, portfolio) {
      const brent = prices.get("brent");
      if (brent && brent.ask > 130) {
        return { active: true, reason: `Brent $${brent.ask.toFixed(2)} > $130 — scale out 50%` };
      }
      if (portfolio && portfolio.returnPct > 40) {
        return { active: true, reason: `Portfolio +${portfolio.returnPct.toFixed(1)}% > 40% — scale out 50%` };
      }
      return { active: false, reason: "Targets not hit" };
    },
  },
];

export function evaluateSignals(pricesBySymbol, portfolio) {
  const results = [];
  for (const rule of RULES) {
    const signal = rule.evaluate(pricesBySymbol, portfolio);
    results.push({ ...rule, signal });
    const icon = signal.active ? "🔴" : "⚪";
    console.log(`  ${icon} ${rule.name}: ${signal.reason}`);
  }
  return results;
}
