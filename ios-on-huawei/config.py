"""Configuration for iOS-on-Huawei. Env-driven, like the rest of the repo."""
import os

from dotenv import load_dotenv

load_dotenv()

# --- Server ---
HOST = os.getenv("IOS_HUAWEI_HOST", "0.0.0.0")
PORT = int(os.getenv("IOS_HUAWEI_PORT", "8770"))
SECRET_KEY = os.getenv("IOS_HUAWEI_SECRET", "change-me")
DB_PATH = os.getenv("IOS_HUAWEI_DB", os.path.join(os.path.dirname(__file__), "data.db"))
MEDIA_DIR = os.getenv("IOS_HUAWEI_MEDIA", os.path.join(os.path.dirname(__file__), "media"))
MAX_UPLOAD_MB = int(os.getenv("IOS_HUAWEI_MAX_UPLOAD_MB", "25"))

# --- Bridge selection: "local" (app-to-app) or "imessage_relay" (needs a Mac box) ---
BRIDGE = os.getenv("BRIDGE", "local")

# --- Web Push (optional). Without these, in-app notifications still work. ---
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_CONTACT = os.getenv("VAPID_CONTACT", "mailto:admin@example.com")

# --- iMessage relay (BlueBubbles on a Mac). Only used when BRIDGE=imessage_relay ---
BLUEBUBBLES_URL = os.getenv("BLUEBUBBLES_URL", "")          # e.g. http://192.168.1.50:1234
BLUEBUBBLES_PASSWORD = os.getenv("BLUEBUBBLES_PASSWORD", "")
