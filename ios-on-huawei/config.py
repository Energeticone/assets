"""Configuration for iOS-on-Huawei. Env-driven, like the rest of the repo."""
import os

from dotenv import load_dotenv

load_dotenv()

_HERE = os.path.dirname(__file__)

# --- Server ---
HOST = os.getenv("IOS_HUAWEI_HOST", "0.0.0.0")
PORT = int(os.getenv("IOS_HUAWEI_PORT", "8770"))
SECRET_KEY = os.getenv("IOS_HUAWEI_SECRET", "change-me")
DB_PATH = os.getenv("IOS_HUAWEI_DB", os.path.join(_HERE, "data.db"))
MEDIA_DIR = os.getenv("IOS_HUAWEI_MEDIA", os.path.join(_HERE, "media"))
MAX_UPLOAD_MB = int(os.getenv("IOS_HUAWEI_MAX_UPLOAD_MB", "25"))

# --- TLS (auto self-signed unless you supply your own cert/key) ---
# Browsers require HTTPS for service workers / PWA install / push on a LAN IP.
USE_TLS = os.getenv("IOS_HUAWEI_TLS", "1") not in ("0", "false", "False")
CERT_FILE = os.getenv("IOS_HUAWEI_CERT", os.path.join(_HERE, "certs", "cert.pem"))
KEY_FILE = os.getenv("IOS_HUAWEI_KEY", os.path.join(_HERE, "certs", "key.pem"))
PUBLIC_HOST = os.getenv("IOS_HUAWEI_PUBLIC_HOST", "")  # optional DNS name for the cert SAN
VAPID_FILE = os.getenv("IOS_HUAWEI_VAPID_FILE", os.path.join(_HERE, "vapid.json"))

# --- Bridge selection: "local" (app-to-app) or "imessage_relay" (needs a Mac box) ---
BRIDGE = os.getenv("BRIDGE", "local")

# --- Web Push (optional). Without these, in-app notifications still work. ---
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CONTACT = os.getenv("VAPID_CONTACT", "mailto:admin@example.com")

# --- iMessage relay (BlueBubbles on a Mac). Only used when BRIDGE=imessage_relay ---
BLUEBUBBLES_URL = os.getenv("BLUEBUBBLES_URL", "")          # e.g. http://192.168.1.50:1234
BLUEBUBBLES_PASSWORD = os.getenv("BLUEBUBBLES_PASSWORD", "")
