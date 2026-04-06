import { v4 as uuidv4 } from "uuid";

const BASE_URL = "https://public-api.etoro.com/api/v1";

export class EtoroClient {
  constructor({ apiKey, userKey }) {
    if (!apiKey || !userKey) {
      throw new Error("ETORO_API_KEY and ETORO_USER_KEY are required");
    }
    this.apiKey = apiKey;
    this.userKey = userKey;
  }

  headers() {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "x-user-key": this.userKey,
      "x-request-id": uuidv4(),
    };
  }

  async request(method, path, body = null) {
    const url = `${BASE_URL}${path}`;
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`eToro API ${method} ${path} → ${res.status}: ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  // ── Market Data ──

  async searchInstrument(symbol) {
    return this.request("GET", `/market-data/search?internalSymbolFull=${encodeURIComponent(symbol)}`);
  }

  async getInstruments(instrumentIds) {
    const ids = Array.isArray(instrumentIds) ? instrumentIds.join(",") : instrumentIds;
    return this.request("GET", `/market-data/instruments?instrumentIds=${ids}`);
  }

  async getRates(instrumentIds) {
    const ids = Array.isArray(instrumentIds) ? instrumentIds.join(",") : instrumentIds;
    return this.request("GET", `/market-data/instruments/rates?instrumentIds=${ids}`);
  }

  // ── Trading (Real) ──

  async openPosition(amount, instrumentId, isBuy = true) {
    return this.request("POST", "/trading/execution/real/market-open-orders/by-amount", {
      instrumentId,
      amount,
      isBuy,
    });
  }

  async closePosition(positionId) {
    return this.request("POST", `/trading/execution/real/market-close-orders/positions/${positionId}`);
  }

  async getPortfolio() {
    return this.request("GET", "/trading/info/real/pnl");
  }
}
