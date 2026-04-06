// Hormuz Hawk instrument universe
// eToro symbol names are resolved at startup via market-data/search

export const INSTRUMENTS = [
  {
    id: "brent",
    symbol: "OIL",         // eToro symbol for Brent Crude
    name: "BRENT CRUDE",
    weight: 0.35,
    impact: "EXTREME",
  },
  {
    id: "wti",
    symbol: "WTI",         // eToro symbol for WTI Crude
    name: "WTI CRUDE",
    weight: 0.25,
    impact: "EXTREME",
  },
  {
    id: "natgas",
    symbol: "NATGAS",      // eToro symbol for Natural Gas
    name: "NATURAL GAS",
    weight: 0.10,
    impact: "HIGH",
  },
  {
    id: "gold",
    symbol: "GOLD",        // eToro symbol for Gold
    name: "GOLD",
    weight: 0.15,
    impact: "MODERATE",
  },
  {
    id: "ita",
    symbol: "ITA.US",      // iShares U.S. Aerospace & Defense ETF
    name: "DEFENSE (ITA)",
    weight: 0.15,
    impact: "HIGH",
  },
];

export async function resolveInstruments(client) {
  const resolved = [];

  for (const inst of INSTRUMENTS) {
    try {
      const result = await client.searchInstrument(inst.symbol);
      const match = result?.instruments?.[0] || result?.[0];
      if (!match) {
        console.error(`[RESOLVE] ✗ ${inst.symbol} — not found on eToro`);
        continue;
      }
      resolved.push({
        ...inst,
        instrumentId: match.instrumentId || match.InstrumentID,
        displayName: match.instrumentDisplayName || match.InstrumentDisplayName || inst.name,
      });
      console.log(`[RESOLVE] ✓ ${inst.symbol} → ID ${resolved[resolved.length - 1].instrumentId}`);
    } catch (err) {
      console.error(`[RESOLVE] ✗ ${inst.symbol} — ${err.message}`);
    }
  }

  return resolved;
}

export async function fetchRates(client, instruments) {
  const ids = instruments.map((i) => i.instrumentId);
  if (ids.length === 0) return new Map();

  const data = await client.getRates(ids);
  const rates = new Map();

  for (const rate of data?.rates || data || []) {
    const id = rate.instrumentId || rate.InstrumentID;
    rates.set(id, {
      ask: rate.ask || rate.Ask,
      bid: rate.bid || rate.Bid,
      last: rate.lastExecution || rate.LastExecution,
    });
  }
  return rates;
}
