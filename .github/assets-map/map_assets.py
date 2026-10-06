"""Inventory every asset in the repo.

Usage: python3 .github/assets-map/map_assets.py [repo_root]
Writes .github/assets-map/assets-map.json and prints a short summary.
"""
import json, os, sys, collections
root = sys.argv[1] if len(sys.argv) > 1 else "."
B = os.path.join(root, "blockchains")
out = {"chains": [], "totals": collections.Counter(), "types": collections.Counter(), "status": collections.Counter(), "issues": collections.defaultdict(list)}
def load(p):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f)
    except Exception as e: return {"__err": str(e)}
for chain in sorted(os.listdir(B)):
    cp = os.path.join(B, chain)
    if not os.path.isdir(cp): continue
    info = load(os.path.join(cp, "info", "info.json")) if os.path.exists(os.path.join(cp,"info","info.json")) else None
    c = {"id": chain, "name": (info or {}).get("name"), "symbol": (info or {}).get("symbol"), "type": (info or {}).get("type"),
         "decimals": (info or {}).get("decimals"), "status": (info or {}).get("status"), "website": (info or {}).get("website"),
         "has_info": info is not None, "has_logo": os.path.exists(os.path.join(cp,"info","logo.png")),
         "assets": 0, "asset_types": collections.Counter(), "asset_status": collections.Counter(),
         "missing_logo": 0, "missing_info": 0, "validators": 0, "validator_logos": 0,
         "tokenlist": 0, "tokenlist_extended": 0}
    if info and "__err" in info: out["issues"]["bad_chain_info_json"].append(chain)
    if not c["has_info"]: out["issues"]["chain_missing_info"].append(chain)
    if not c["has_logo"]: out["issues"]["chain_missing_logo"].append(chain)
    ap = os.path.join(cp, "assets")
    if os.path.isdir(ap):
        for a in os.listdir(ap):
            d = os.path.join(ap, a)
            if not os.path.isdir(d): continue
            c["assets"] += 1
            ij = os.path.join(d, "info.json")
            if not os.path.exists(os.path.join(d, "logo.png")): c["missing_logo"] += 1; out["issues"]["asset_missing_logo"].append(f"{chain}/{a}")
            if not os.path.exists(ij): c["missing_info"] += 1; out["issues"]["asset_missing_info"].append(f"{chain}/{a}"); continue
            j = load(ij)
            if "__err" in j: out["issues"]["bad_asset_info_json"].append(f"{chain}/{a}"); continue
            t = j.get("type") or "UNKNOWN"; s = j.get("status") or "unset"
            c["asset_types"][t] += 1; c["asset_status"][s] += 1
            out["types"][t] += 1; out["status"][s] += 1
    vl = os.path.join(cp, "validators", "list.json")
    if os.path.exists(vl):
        v = load(vl); c["validators"] = len(v) if isinstance(v, list) else 0
        va = os.path.join(cp, "validators", "assets")
        if os.path.isdir(va): c["validator_logos"] = len(os.listdir(va))
    for k, fn in (("tokenlist","tokenlist.json"),("tokenlist_extended","tokenlist-extended.json")):
        p = os.path.join(cp, fn)
        if os.path.exists(p):
            j = load(p); c[k] = len(j.get("tokens", [])) if isinstance(j, dict) else 0
    for k in ("assets","validators","validator_logos","tokenlist","tokenlist_extended","missing_logo","missing_info"):
        out["totals"][k] += c[k]
    c["asset_types"] = dict(c["asset_types"]); c["asset_status"] = dict(c["asset_status"])
    out["chains"].append(c)
out["totals"]["chains"] = len(out["chains"])
out["totals"]["chains_with_tokens"] = sum(1 for c in out["chains"] if c["assets"])
out["totals"]["chains_with_validators"] = sum(1 for c in out["chains"] if c["validators"])
dp = os.path.join(root, "dapps")
dapps = sorted(f for f in os.listdir(dp))
out["dapps"] = {"count": len(dapps), "files": dapps}
out["totals"] = dict(out["totals"]); out["types"] = dict(out["types"].most_common()); out["status"] = dict(out["status"]); out["issues"] = dict(out["issues"])
dest = os.path.join(root, ".github", "assets-map", "assets-map.json")
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1, sort_keys=False)
    f.write("\n")
print(json.dumps(out["totals"]))
