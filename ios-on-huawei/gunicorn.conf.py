"""Gunicorn configuration for iOS-on-Huawei (production WSGI).

    gunicorn -c gunicorn.conf.py server:app

Why gevent + a single worker:
  * Server-Sent Events hold one long-lived HTTP response per connected client.
    Sync workers would each block on a single client, so we use the gevent
    worker — greenlets handle thousands of concurrent SSE streams in one process
    (gunicorn monkey-patches the stdlib, so the broker's queue.Queue.get() yields
    cooperatively instead of blocking).
  * The realtime broker in server.py is in-process. With multiple workers, a
    message published in worker A would not reach an SSE client attached to
    worker B. One worker keeps delivery correct. To scale horizontally you'd
    move the broker onto a shared bus (e.g. Redis pub/sub) and raise workers.

Note: gunicorn reads every module-level name as a setting, so helper imports are
underscore-aliased and deleted at the end — only real gunicorn settings remain.
"""
import os as _os

import config as _config
import security as _security

bind = f"{_config.HOST}:{_config.PORT}"

# Single worker on purpose (in-process broker). Override only with a shared bus.
workers = int(_os.getenv("IOS_HUAWEI_WORKERS", "1"))
worker_class = "gevent"
worker_connections = int(_os.getenv("IOS_HUAWEI_WORKER_CONNECTIONS", "2000"))

# SSE connections are long-lived; the gevent worker heartbeats independently of
# individual requests, so a generous timeout is safe and avoids worker churn.
timeout = int(_os.getenv("IOS_HUAWEI_TIMEOUT", "120"))
graceful_timeout = 30
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = _os.getenv("IOS_HUAWEI_LOGLEVEL", "info")

# Auto self-signed TLS unless the user supplied their own cert or disabled TLS.
# Browsers require HTTPS for PWA install / service workers / push on a LAN IP.
if _config.USE_TLS:
    try:
        certfile, keyfile = _security.ensure_cert()
    except Exception as _exc:  # pragma: no cover - defensive
        print(f"[gunicorn.conf] TLS setup failed: {_exc}; serving plain HTTP")

# Remove non-setting names so gunicorn doesn't try to interpret them.
del _os, _config, _security
