// Hormuz Hawk — Order executor with risk management

export class Executor {
  constructor(client, { allocationUsd, dryRun }) {
    this.client = client;
    this.allocationUsd = allocationUsd;
    this.dryRun = dryRun;
    this.openPositions = new Map(); // instrumentId → positionId
    this.totalInvested = 0;
  }

  async syncPortfolio() {
    try {
      const data = await this.client.getPortfolio();
      const cp = data?.clientPortfolio || data;
      if (!cp) return null;

      const positions = [
        ...(cp.positions || []),
        ...(cp.mirrors || []).flatMap((m) => m.positions || []),
      ];

      // Track open positions
      this.openPositions.clear();
      this.totalInvested = 0;
      for (const pos of positions) {
        const id = pos.instrumentId || pos.InstrumentID;
        const posId = pos.positionId || pos.PositionID;
        this.openPositions.set(id, posId);
        this.totalInvested += pos.amount || pos.Amount || 0;
      }

      const credit = cp.credit || cp.Credit || 0;
      const unrealizedPnl = positions.reduce((sum, p) => {
        const pnl = p.unrealizedPnL?.pnL || p.UnrealizedPnL?.PnL || 0;
        return sum + pnl;
      }, 0);

      const equity = credit + this.totalInvested + unrealizedPnl;
      const returnPct = this.totalInvested > 0 ? (unrealizedPnl / this.totalInvested) * 100 : 0;

      console.log(`[PORTFOLIO] Credit: $${credit.toFixed(2)} | Invested: $${this.totalInvested.toFixed(2)} | PnL: $${unrealizedPnl.toFixed(2)} | Equity: $${equity.toFixed(2)}`);

      return { credit, positions, totalInvested: this.totalInvested, unrealizedPnl, equity, returnPct };
    } catch (err) {
      console.error(`[PORTFOLIO] Failed to sync: ${err.message}`);
      return null;
    }
  }

  async openOrder(instrument, signals) {
    const amount = Math.floor(this.allocationUsd * instrument.weight);
    if (amount < 1) {
      console.log(`[SKIP] ${instrument.name} — allocation $${amount} too small`);
      return;
    }

    // Check if already holding this instrument
    if (this.openPositions.has(instrument.instrumentId)) {
      console.log(`[HOLD] ${instrument.name} — already have open position`);
      return;
    }

    // Check total allocation cap
    if (this.totalInvested + amount > this.allocationUsd) {
      console.log(`[CAP] ${instrument.name} — would exceed $${this.allocationUsd} allocation`);
      return;
    }

    if (this.dryRun) {
      console.log(`[DRY-RUN] Would BUY $${amount} of ${instrument.name} (${instrument.symbol})`);
      return;
    }

    try {
      console.log(`[EXECUTE] BUY $${amount} of ${instrument.name} (ID: ${instrument.instrumentId})`);
      const result = await this.client.openPosition(amount, instrument.instrumentId, true);
      console.log(`[FILLED] ${instrument.name} — order confirmed`, result);
      this.totalInvested += amount;
    } catch (err) {
      console.error(`[ERROR] Failed to open ${instrument.name}: ${err.message}`);
    }
  }

  async closeAll(reason) {
    console.log(`\n[EXIT ALL] ${reason}`);

    if (this.openPositions.size === 0) {
      console.log("[EXIT ALL] No open positions to close");
      return;
    }

    for (const [instrumentId, positionId] of this.openPositions) {
      if (this.dryRun) {
        console.log(`[DRY-RUN] Would CLOSE position ${positionId} (instrument ${instrumentId})`);
        continue;
      }
      try {
        console.log(`[CLOSE] Position ${positionId} (instrument ${instrumentId})`);
        await this.client.closePosition(positionId);
        console.log(`[CLOSED] Position ${positionId}`);
      } catch (err) {
        console.error(`[ERROR] Failed to close position ${positionId}: ${err.message}`);
      }
    }
    this.openPositions.clear();
    this.totalInvested = 0;
  }

  async scaleOut(pct, reason) {
    console.log(`\n[SCALE OUT] ${pct}% — ${reason}`);
    const entries = [...this.openPositions.entries()];
    const toClose = entries.slice(0, Math.ceil(entries.length * (pct / 100)));

    for (const [instrumentId, positionId] of toClose) {
      if (this.dryRun) {
        console.log(`[DRY-RUN] Would CLOSE position ${positionId} (scale out)`);
        continue;
      }
      try {
        console.log(`[CLOSE] Position ${positionId} (scale out)`);
        await this.client.closePosition(positionId);
      } catch (err) {
        console.error(`[ERROR] Failed to close position ${positionId}: ${err.message}`);
      }
    }
  }
}
