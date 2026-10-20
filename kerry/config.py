"""Configuration for Kerry. Environment overrides keep secrets and choices out of code."""

from __future__ import annotations

import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional; the loop runs fully offline without it.
    pass

# Which generalist to run on by default. One of the names in models.default_registry():
#   "echo", "paraphrase" (offline, no key needed) or "anthropic" (needs ANTHROPIC_API_KEY).
DEFAULT_GENERALIST = os.getenv("KERRY_GENERALIST", "echo")

# The generalist to swap to when demonstrating the sovereignty test.
SWAP_GENERALIST = os.getenv("KERRY_SWAP_GENERALIST", "paraphrase")

# How many times to run the full task set when climbing the hill.
CYCLES = int(os.getenv("KERRY_CYCLES", "4"))

# Frontier-model settings (only used by the Anthropic generalist).
ANTHROPIC_MODEL = os.getenv("KERRY_ANTHROPIC_MODEL", "claude-opus-4-8")
