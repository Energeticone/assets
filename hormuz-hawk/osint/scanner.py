"""OSINT scanner — fetches intelligence from web sources and classifies signals."""

import re
import time
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import requests

import config

logger = logging.getLogger(__name__)


class SignalState(str, Enum):
    ESCALATION = "ESCALATION"
    STEADY_BURN = "STEADY_BURN"
    FAKE_DE_ESCALATION = "FAKE_DE_ESCALATION"
    REAL_DE_ESCALATION = "REAL_DE_ESCALATION"
    BLACK_SWAN = "BLACK_SWAN"
    UNKNOWN = "UNKNOWN"


@dataclass
class IntelReport:
    """Single piece of intelligence from a source."""
    source_category: str
    query: str
    headline: str
    snippet: str
    url: str
    timestamp: str
    confidence: float = 0.30
    tags: list[str] = field(default_factory=list)


@dataclass
class MarketSnapshot:
    brent: Optional[float] = None
    wti: Optional[float] = None
    natgas: Optional[float] = None
    gold: Optional[float] = None
    vix: Optional[float] = None


@dataclass
class CycleResult:
    cycle_number: int
    timestamp: str
    intel_reports: list[IntelReport]
    market_snapshot: MarketSnapshot
    signal: SignalState
    confidence_score: float
    corroborating_sources: int
    escalation_indicators: list[str]
    deescalation_indicators: list[str]
    raw_summary: dict[str, str]


# ---------------------------------------------------------------------------
# Web search helper — uses DuckDuckGo HTML (no API key needed)
# ---------------------------------------------------------------------------

_SEARCH_URL = "https://html.duckduckgo.com/html/"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def web_search(query: str, max_results: int = 5) -> list[dict]:
    """Run a DuckDuckGo HTML search and return list of {title, snippet, url}."""
    results = []
    try:
        resp = requests.post(
            _SEARCH_URL,
            data={"q": query},
            headers=_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        html = resp.text

        # Parse result blocks — lightweight regex extraction
        blocks = re.findall(
            r'<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.*?)</a>'
            r'.*?<a class="result__snippet"[^>]*>(.*?)</a>',
            html,
            re.DOTALL,
        )
        for url, title, snippet in blocks[:max_results]:
            clean = lambda s: re.sub(r"<[^>]+>", "", s).strip()
            results.append({
                "title": clean(title),
                "snippet": clean(snippet),
                "url": url,
            })
    except Exception as e:
        logger.warning("Search failed for %r: %s", query, e)
    return results


# ---------------------------------------------------------------------------
# OSINT scanning
# ---------------------------------------------------------------------------

def _assign_confidence(category: str, text: str) -> float:
    """Heuristic confidence based on source category and content cues."""
    text_lower = text.lower()

    if category == "shipping":
        return config.CONFIDENCE_WEIGHTS["shipping_data"]
    if category == "military":
        if any(k in text_lower for k in ("centcom", "pentagon", "dod", "defense.gov")):
            return config.CONFIDENCE_WEIGHTS["military_official"]
        return 0.60
    if category == "news_wires":
        if "sources say" in text_lower or "sources familiar" in text_lower:
            return config.CONFIDENCE_WEIGHTS["wire_sources_say"]
        return config.CONFIDENCE_WEIGHTS["named_official_quote"]
    if category == "truth_social":
        return config.CONFIDENCE_WEIGHTS["trump_truth_social"]
    if category == "reddit":
        if "verified" in text_lower or "confirmed" in text_lower:
            return config.CONFIDENCE_WEIGHTS["verified_video"]
        return config.CONFIDENCE_WEIGHTS["reddit_speculation"]
    if category == "twitter":
        if any(k in text_lower for k in ("tankertracker", "centcom", "reuters", "ap ")):
            return 0.80
        return 0.40
    if category == "market_data":
        return 0.90
    return 0.30


_ESCALATION_KEYWORDS = [
    "tanker attack", "mine", "mine-laying", "casualties", "strike",
    "deployment", "carrier strike group", "fires on", "escort convoy",
    "insurance spike", "war risk premium", "sinks", "explosion",
    "nuclear", "houthi", "red sea", "bab el-mandeb", "aircraft carrier damaged",
]

_DEESCALATION_KEYWORDS = [
    "tanker traffic resumes", "ships transit", "insurance drops",
    "drawdown", "returns to port", "ceasefire signed", "deal signed",
    "agreement reached", "sanctions lifted",
]

_FAKE_DEESC_KEYWORDS = [
    "deal is close", "could happen tomorrow", "agreement in principle",
    "agrees to talks", "sources say deal", "optimistic",
]

_BLACK_SWAN_KEYWORDS = [
    "nuclear facility strike", "vlcc sinks", "carrier damaged",
    "simultaneous", "bab el-mandeb", "oil gaps 15",
]


def _detect_tags(text: str) -> list[str]:
    tags = []
    tl = text.lower()
    for kw in _ESCALATION_KEYWORDS:
        if kw in tl:
            tags.append(f"escalation:{kw}")
    for kw in _DEESCALATION_KEYWORDS:
        if kw in tl:
            tags.append(f"deescalation:{kw}")
    for kw in _FAKE_DEESC_KEYWORDS:
        if kw in tl:
            tags.append(f"fake_deesc:{kw}")
    for kw in _BLACK_SWAN_KEYWORDS:
        if kw in tl:
            tags.append(f"black_swan:{kw}")
    return tags


def scan_all_sources(skip_second_order: bool = False) -> list[IntelReport]:
    """Run all OSINT queries and return intel reports."""
    reports: list[IntelReport] = []
    queries = dict(config.OSINT_QUERIES)
    if skip_second_order:
        queries.pop("second_order", None)

    for category, query_list in queries.items():
        for query in query_list:
            results = web_search(query)
            for r in results:
                combined = f"{r['title']} {r['snippet']}"
                report = IntelReport(
                    source_category=category,
                    query=query,
                    headline=r["title"],
                    snippet=r["snippet"],
                    url=r["url"],
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    confidence=_assign_confidence(category, combined),
                    tags=_detect_tags(combined),
                )
                reports.append(report)
            # Be respectful to search engines
            time.sleep(1.0)

    return reports


def extract_market_snapshot(reports: list[IntelReport]) -> MarketSnapshot:
    """Try to extract price numbers from market_data reports."""
    snap = MarketSnapshot()
    for r in reports:
        if r.source_category != "market_data":
            continue
        text = f"{r.headline} {r.snippet}"
        numbers = re.findall(r"\$?([\d,]+\.?\d*)", text)
        if not numbers:
            continue
        try:
            val = float(numbers[0].replace(",", ""))
        except ValueError:
            continue
        ql = r.query.lower()
        if "brent" in ql:
            snap.brent = val
        elif "wti" in ql:
            snap.wti = val
        elif "natural gas" in ql:
            snap.natgas = val
        elif "gold" in ql:
            snap.gold = val
        elif "vix" in ql:
            snap.vix = val
    return snap


# ---------------------------------------------------------------------------
# Signal classification
# ---------------------------------------------------------------------------

def classify_signal(reports: list[IntelReport]) -> tuple[SignalState, float, int, list[str], list[str]]:
    """
    Classify aggregate intelligence into a signal state.
    Returns (state, confidence_score, corroborating_count, esc_indicators, deesc_indicators).
    """
    esc_indicators: list[str] = []
    deesc_indicators: list[str] = []
    fake_deesc_indicators: list[str] = []
    black_swan_indicators: list[str] = []

    high_confidence_reports = [r for r in reports if r.confidence >= 0.50]

    for r in high_confidence_reports:
        for tag in r.tags:
            if tag.startswith("escalation:"):
                esc_indicators.append(f"[{r.source_category}] {tag} — {r.headline[:80]}")
            elif tag.startswith("deescalation:"):
                deesc_indicators.append(f"[{r.source_category}] {tag} — {r.headline[:80]}")
            elif tag.startswith("fake_deesc:"):
                fake_deesc_indicators.append(f"[{r.source_category}] {tag} — {r.headline[:80]}")
            elif tag.startswith("black_swan:"):
                black_swan_indicators.append(f"[{r.source_category}] {tag} — {r.headline[:80]}")

    # Count unique source categories contributing escalation signals
    esc_sources = len({i.split("]")[0] for i in esc_indicators})
    deesc_sources = len({i.split("]")[0] for i in deesc_indicators})

    # Determine state
    if black_swan_indicators and esc_sources >= 2:
        state = SignalState.BLACK_SWAN
        confidence = min(95.0, 70 + len(black_swan_indicators) * 10)
        corr = esc_sources
    elif len(deesc_indicators) >= 4 and deesc_sources >= 3:
        # Real de-escalation requires multiple independent confirmations
        state = SignalState.REAL_DE_ESCALATION
        confidence = min(90.0, 50 + deesc_sources * 12)
        corr = deesc_sources
    elif fake_deesc_indicators and not deesc_indicators:
        state = SignalState.FAKE_DE_ESCALATION
        confidence = min(80.0, 50 + len(fake_deesc_indicators) * 10)
        corr = len({i.split("]")[0] for i in fake_deesc_indicators})
    elif esc_indicators and esc_sources >= 2:
        state = SignalState.ESCALATION
        confidence = min(90.0, 50 + esc_sources * 12)
        corr = esc_sources
    elif esc_indicators or deesc_indicators:
        # Mixed or weak signals — steady burn
        state = SignalState.STEADY_BURN
        confidence = 60.0
        corr = max(esc_sources, deesc_sources)
    else:
        state = SignalState.STEADY_BURN
        confidence = 50.0
        corr = 0

    return state, confidence, corr, esc_indicators, deesc_indicators


def run_cycle(cycle_number: int, skip_second_order: bool = False) -> CycleResult:
    """Execute a full OSINT scan cycle."""
    logger.info("Cycle %d: scanning sources...", cycle_number)
    reports = scan_all_sources(skip_second_order=skip_second_order)
    market = extract_market_snapshot(reports)
    signal, confidence, corr, esc, deesc = classify_signal(reports)

    # Build per-category summaries
    summary: dict[str, str] = {}
    for cat in config.OSINT_QUERIES:
        cat_reports = [r for r in reports if r.source_category == cat]
        if cat_reports:
            top = max(cat_reports, key=lambda r: r.confidence)
            summary[cat] = f"{top.headline[:120]} (confidence={top.confidence:.0%})"
        else:
            summary[cat] = "No results"

    result = CycleResult(
        cycle_number=cycle_number,
        timestamp=datetime.now(timezone.utc).isoformat(),
        intel_reports=reports,
        market_snapshot=market,
        signal=signal,
        confidence_score=confidence,
        corroborating_sources=corr,
        escalation_indicators=esc,
        deescalation_indicators=deesc,
        raw_summary=summary,
    )
    logger.info("Cycle %d: signal=%s confidence=%.0f%% sources=%d",
                cycle_number, signal.value, confidence, corr)
    return result
