#!/usr/bin/env python3
"""
Hormuz Hawk — run both the OSINT bot and the dashboard.

Usage:
    python run.py          # Run both bot + dashboard
    python run.py bot      # Run bot only
    python run.py dash     # Run dashboard only
"""

import sys
import threading


def run_bot():
    from bot import main
    main()


def run_dashboard():
    from dashboard.app import main
    main()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"

    if mode == "bot":
        run_bot()
    elif mode == "dash":
        run_dashboard()
    else:
        # Run both in parallel
        bot_thread = threading.Thread(target=run_bot, daemon=True)
        bot_thread.start()
        print("Bot started in background thread.")
        run_dashboard()
