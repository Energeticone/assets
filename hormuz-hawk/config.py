import os
from dotenv import load_dotenv

load_dotenv()

# eToro
ETORO_API_KEY = os.getenv("ETORO_API_KEY", "")
ETORO_USER_KEY = os.getenv("ETORO_USER_KEY", "")
ETORO_BASE_URL = os.getenv("ETORO_BASE_URL", "https://public-api.etoro.com/api/v1")

# Dashboard
DASHBOARD_HOST = os.getenv("DASHBOARD_HOST", "127.0.0.1")
DASHBOARD_PORT = int(os.getenv("DASHBOARD_PORT", "5000"))
DASHBOARD_SECRET_KEY = os.getenv("DASHBOARD_SECRET_KEY", "change-me")

# Scan
SCAN_INTERVAL_MINUTES = int(os.getenv("SCAN_INTERVAL_MINUTES", "15"))

# Instrument search terms
INSTRUMENTS = {
    "tier1": [
        {"name": "Brent Crude Oil", "search": "OIL", "direction": "BUY", "stop_pct": 0.12, "tp_increment": 10},
        {"name": "WTI Crude Oil", "search": "WTI", "direction": "BUY", "stop_pct": 0.12, "tp_increment": 10},
        {"name": "Natural Gas", "search": "NATGAS", "direction": "BUY", "stop_pct": 0.15, "tp_increment_pct": 0.15},
    ],
    "tier2": [
        {"name": "Gold", "search": "GOLD", "direction": "BUY", "stop_pct": 0.08, "tp_increment_pct": 0.05},
        {"name": "iShares Aerospace & Defense ETF", "search": "ITA", "direction": "BUY", "stop_pct": 0.15},
        {"name": "Lockheed Martin", "search": "LMT", "direction": "BUY", "stop_pct": 0.15},
        {"name": "Raytheon", "search": "RTX", "direction": "BUY", "stop_pct": 0.15},
    ],
    "tier3": [
        {"name": "Wheat", "search": "WHEAT", "direction": "BUY", "stop_pct": 0.10},
        {"name": "Silver", "search": "SILVER", "direction": "BUY", "stop_pct": 0.10},
        {"name": "Copper", "search": "COPPER", "direction": "BUY", "stop_pct": 0.10},
    ],
}

# Risk limits
MAX_SINGLE_INSTRUMENT_PCT = 0.25
MAX_LEVERAGE = 3
MIN_CASH_RESERVE_PCT = 0.15
MAX_POSITIONS = 8

# Allocation targets
TIER1_ALLOCATION = (0.60, 0.70)
TIER2_ALLOCATION = (0.20, 0.25)
TIER3_ALLOCATION = (0.05, 0.15)

# OSINT search queries grouped by source
OSINT_QUERIES = {
    "truth_social": [
        "Trump Truth Social Iran Hormuz oil latest",
    ],
    "reddit": [
        "site:reddit.com/r/CombatFootage Hormuz OR Iran OR tanker",
        "site:reddit.com/r/geopolitics Hormuz OR Iran deal OR ceasefire",
        "site:reddit.com/r/energy oil price OR Hormuz OR tanker OR LNG",
    ],
    "twitter": [
        "Strait of Hormuz tanker latest",
        "Iran oil attack latest",
        "CENTCOM statement Iran",
        "TankerTrackers Hormuz",
    ],
    "shipping": [
        "Strait of Hormuz tanker traffic today",
        "MarineTraffic Strait of Hormuz",
        "oil tanker insurance Hormuz war risk premium",
    ],
    "news_wires": [
        "Reuters Iran Hormuz latest",
        "Bloomberg oil Hormuz",
        "Al Jazeera Strait of Hormuz",
    ],
    "military": [
        "Pentagon statement Iran latest",
        "CENTCOM press release",
        "US Navy Fifth Fleet Hormuz",
    ],
    "market_data": [
        "Brent crude oil price today",
        "WTI crude oil price today",
        "natural gas price today",
        "gold price today",
        "VIX index level today",
    ],
    "second_order": [
        "helium shortage 2026",
        "sulphur price Gulf fertilizer",
    ],
}

# Confidence weights by source type
CONFIDENCE_WEIGHTS = {
    "shipping_data": 0.95,
    "military_official": 0.90,
    "verified_video": 0.85,
    "named_official_quote": 0.80,
    "wire_sources_say": 0.50,
    "trump_truth_social": 0.40,
    "reddit_speculation": 0.30,
    "iranian_state_media": 0.25,
}
