"""Zero-config provisioning so the app 'just works' over HTTPS with push.

- ensure_cert(): generates a self-signed TLS cert/key the first time. HTTPS is
  required because browsers only allow service workers / PWA install / Web Push
  on a secure origin (or localhost). On a phone hitting a LAN IP, that means TLS.
- ensure_vapid(): generates VAPID keys the first time so background Web Push
  works without any manual setup. Keys persist in vapid.json.

Both are no-ops if files already exist or values are already provided via env.
"""
import base64
import json
import os
import subprocess

import config


def ensure_cert():
    """Return (cert_path, key_path), generating a self-signed pair if needed."""
    cert, key = config.CERT_FILE, config.KEY_FILE
    if os.path.isfile(cert) and os.path.isfile(key):
        return cert, key
    os.makedirs(os.path.dirname(cert), exist_ok=True)
    # SAN includes localhost + any configured host so the cert is broadly usable.
    san = "subjectAltName=DNS:localhost,IP:127.0.0.1"
    if config.PUBLIC_HOST:
        san += f",DNS:{config.PUBLIC_HOST}"
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", key, "-out", cert, "-days", "3650",
            "-subj", "/CN=ios-on-huawei",
            "-addext", san,
        ],
        check=True, capture_output=True,
    )
    return cert, key


def ensure_vapid():
    """Return (public_key_b64url, private_pem_str) for Web Push.

    Honors env (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY); otherwise generates and
    persists a keypair. Returns (None, None) if the crypto libs are missing.
    """
    if config.VAPID_PUBLIC_KEY and config.VAPID_PRIVATE_KEY:
        return config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY
    try:
        from py_vapid import Vapid01 as Vapid
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        return None, None

    path = config.VAPID_FILE
    if os.path.isfile(path):
        with open(path) as f:
            data = json.load(f)
        return data["public"], data["private"]

    v = Vapid()
    v.generate_keys()
    private_pem = v.private_pem()
    if isinstance(private_pem, bytes):
        private_pem = private_pem.decode()
    raw = v.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    with open(path, "w") as f:
        json.dump({"public": public_b64, "private": private_pem}, f)
    os.chmod(path, 0o600)
    return public_b64, private_pem
