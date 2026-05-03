"""eToro API client — all trades require explicit approval before execution."""

import uuid
import logging
from dataclasses import dataclass, field

import requests

import config

logger = logging.getLogger(__name__)


@dataclass
class Position:
    position_id: int
    instrument_id: int
    instrument_name: str
    is_buy: bool
    amount: float
    leverage: int
    open_rate: float
    current_rate: float
    stop_loss_rate: float
    take_profit_rate: float
    net_profit: float


@dataclass
class PortfolioState:
    equity: float = 0
    cash: float = 0
    invested: float = 0
    positions: list[Position] = field(default_factory=list)
    high_water_mark: float = 0


class EToroClient:
    """Thin wrapper around eToro public API. All mutating methods are gated."""

    def __init__(self):
        self.base = config.ETORO_BASE_URL.rstrip("/")
        self.api_key = config.ETORO_API_KEY
        self.user_key = config.ETORO_USER_KEY

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "x-user-key": self.user_key,
            "x-request-id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        }

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.base}{path}"
        resp = requests.get(url, headers=self._headers(), params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base}{path}"
        resp = requests.post(url, headers=self._headers(), json=body, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _delete(self, path: str) -> dict:
        url = f"{self.base}{path}"
        resp = requests.delete(url, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        return resp.json()

    # --- Read operations (safe) ---

    def search_instrument(self, query: str) -> list[dict]:
        """Search for instruments by name. Returns list of matches."""
        try:
            data = self._get("/instruments/search", {"query": query})
            return data.get("Instruments", data.get("instruments", []))
        except Exception as e:
            logger.error("Instrument search failed for %r: %s", query, e)
            return []

    def get_portfolio(self) -> PortfolioState:
        """Fetch current portfolio state."""
        state = PortfolioState()
        try:
            balance = self._get("/portfolio/balance")
            state.equity = balance.get("Equity", balance.get("equity", 0))
            state.cash = balance.get("Cash", balance.get("cash", 0))
            state.invested = balance.get("Invested", balance.get("invested", 0))
        except Exception as e:
            logger.error("Failed to fetch balance: %s", e)

        try:
            pos_data = self._get("/portfolio/positions")
            positions = pos_data.get("Positions", pos_data.get("positions", []))
            for p in positions:
                state.positions.append(Position(
                    position_id=p.get("PositionId", p.get("positionId", 0)),
                    instrument_id=p.get("InstrumentId", p.get("instrumentId", 0)),
                    instrument_name=p.get("InstrumentName", p.get("instrumentName", "")),
                    is_buy=p.get("IsBuy", p.get("isBuy", True)),
                    amount=p.get("Amount", p.get("amount", 0)),
                    leverage=p.get("Leverage", p.get("leverage", 1)),
                    open_rate=p.get("OpenRate", p.get("openRate", 0)),
                    current_rate=p.get("CurrentRate", p.get("currentRate", 0)),
                    stop_loss_rate=p.get("StopLossRate", p.get("stopLossRate", 0)),
                    take_profit_rate=p.get("TakeProfitRate", p.get("takeProfitRate", 0)),
                    net_profit=p.get("NetProfit", p.get("netProfit", 0)),
                ))
        except Exception as e:
            logger.error("Failed to fetch positions: %s", e)

        state.high_water_mark = max(state.equity, state.high_water_mark)
        return state

    # --- Write operations (require approval) ---

    def open_position(
        self,
        instrument_id: int,
        is_buy: bool,
        amount: float,
        leverage: int = 1,
        stop_loss_rate: float | None = None,
        take_profit_rate: float | None = None,
    ) -> dict | None:
        """
        Open a position. Returns API response or None on failure.
        CALLER MUST OBTAIN USER APPROVAL BEFORE CALLING THIS.
        """
        body: dict = {
            "InstrumentID": instrument_id,
            "IsBuy": is_buy,
            "Amount": amount,
            "Leverage": leverage,
        }
        if stop_loss_rate is not None:
            body["StopLossRate"] = stop_loss_rate
        if take_profit_rate is not None:
            body["TakeProfitRate"] = take_profit_rate

        try:
            return self._post("/positions", body)
        except Exception as e:
            logger.error("Failed to open position: %s", e)
            return None

    def close_position(self, position_id: int) -> dict | None:
        """
        Close a position by ID.
        CALLER MUST OBTAIN USER APPROVAL BEFORE CALLING THIS.
        """
        try:
            return self._delete(f"/positions/{position_id}")
        except Exception as e:
            logger.error("Failed to close position %d: %s", position_id, e)
            return None

    def update_stop_loss(self, position_id: int, stop_loss_rate: float) -> dict | None:
        """Update stop loss for an open position."""
        try:
            return self._post(f"/positions/{position_id}/stoploss", {
                "StopLossRate": stop_loss_rate,
            })
        except Exception as e:
            logger.error("Failed to update SL for %d: %s", position_id, e)
            return None
